import { slug } from "../content/registry";
import type { ItemData, SpellData } from "../content/types";
import type { ActionDef } from "../content/types/ops";
import { COMBO_ACTIONS, type Character, type Combo, type ComboStep, type ComboUse } from "./character";
import type { ActorStats, AttackStat, ResourceRow, ToggleRow } from "./derive";
import { entryItem, entryName } from "./item-entry";
import { itemWorks, type EffectContext } from "./effects";
import { fillDice } from "./formula";
import type { FeatureRow } from "./progression";
import { spellRows, type SpellRow } from "./spells";

/** Say what is wrong with a combo in plain words, or return undefined when it can be saved. */
export function validateCombo(c: Combo): string | undefined {
  if (!c.name.trim()) return "Give the combo a name.";
  if (!c.steps.length) return "Add at least one step.";
  const bad = c.steps.findIndex(s => !s.text.trim() && !s.use);
  if (bad >= 0) return `Step ${bad + 1} is empty: say what happens, or pick something to use.`;
  const badAction = c.steps.findIndex(s => !(COMBO_ACTIONS as readonly string[]).includes(s.action));
  if (badAction >= 0) return `Step ${badAction + 1} needs an action type.`;
  return undefined;
}

/** A blank combo with one empty step, for the form. */
export const blankCombo = (): Combo => ({ name: "", when: "", steps: [{ action: "Action", text: "" }] });

// ---- the picker in the form: one value string per thing a step can use

/** The thing a step uses, as one string: `attack|Quarterstaff`, `spell|fireball`, `feature|<key>`, `item|<id>`, `cattack|<companion>|<name>`. */
export function encodeThing(u: ComboUse | undefined): string {
  if (!u) return "";
  if (u.companion !== undefined && u.attack) return `cattack|${u.companion}|${u.attack}`;
  if (u.attack) return `attack|${u.attack}`;
  if (u.spell) return `spell|${u.spell}`;
  if (u.feature) return `feature|${u.feature}`;
  if (u.item) return `item|${u.item}`;
  return "";
}
/** Put a picked thing into `use`, replacing any earlier pick but keeping the resource, cost, DC and dice. */
export function withThing(prev: ComboUse | undefined, value: string): ComboUse | undefined {
  const { attack: _a, spell: _s, feature: _f, item: _i, companion: _c, ...keep } = prev ?? {};
  const [kind, a, b] = value.split("|");
  const next: ComboUse = { ...keep };
  if (kind === "attack" && a) next.attack = a;
  else if (kind === "spell" && a) next.spell = a;
  else if (kind === "feature" && a) next.feature = a;
  else if (kind === "item" && a) next.item = a;
  else if (kind === "cattack" && a !== undefined && b) { next.companion = Number(a); next.attack = b; }
  return Object.keys(next).length ? next : undefined;
}
/** Set one of the plain fields of `use` (resource, cost, dc, dice); an empty value removes it. */
export function withField(prev: ComboUse | undefined, k: "resource" | "cost" | "dc" | "dice", v: string | number | undefined): ComboUse | undefined {
  const next: ComboUse = { ...(prev ?? {}) };
  if (v === undefined || v === "" || v === 0) delete next[k]; else (next as Record<string, unknown>)[k] = v;
  if (k === "resource" && (v === undefined || v === "")) delete next.cost;
  return Object.keys(next).length ? next : undefined;
}

export interface Choice { value: string; label: string; }
export interface ChoiceGroup { label: string; options: Choice[]; }
/** What the form's "Uses" picker offers: the character's attacks, spells, features, items and its companions' attacks. */
export function comboChoices(c: Character, st: ActorStats, companions: (ActorStats | undefined)[], ctx: EffectContext): ChoiceGroup[] {
  const r = ctx.registry, groups: ChoiceGroup[] = [];
  const add = (label: string, options: Choice[]) => { if (options.length) groups.push({ label, options }); };
  add("Your attacks", st.attacks.map(a => ({ value: `attack|${a.name}`, label: a.name })));
  const rows = spellRows(c, st, ctx);
  add("Your spells", [...rows.own, ...rows.fromItems].filter(x => x.known).map(x => ({ value: `spell|${x.id}`, label: x.source.kind === "item" ? `${x.name} (from ${x.source.itemName})` : x.name })));
  add("Class and race features", st.progress.features.filter(f => f.action || f.toggle).map(f => ({ value: `feature|${f.key}`, label: `${f.name} (${f.source})` })));
  add("Items", c.inventory.flatMap(e => e.id ? [{ value: `item|${e.id}`, label: entryName(e, r) }] : e.name ? [{ value: `item|${e.name}`, label: e.name }] : []));
  c.companions.forEach((comp, i) => add(`${comp.name}'s attacks`, (companions[i]?.attacks ?? []).map(a => ({ value: `cattack|${i}|${a.name}`, label: a.name }))));
  return groups;
}
/** Resources a step can spend, by name, and class save DCs it can show. */
export const resourceChoices = (st: ActorStats): Choice[] => st.resources.map(x => ({ value: x.name, label: x.name }));
export const dcChoices = (st: ActorStats): Choice[] => st.progress.dcs.map(d => ({ value: d.name, label: `${d.name} save DC` }));

// ---- a combo as the sheet shows it

export interface StepView {
  step: ComboStep; index: number; /** Who acts, in words: the step's `who`, else the companion it uses. */ who?: string;
  attack?: AttackStat & { who?: number };
  spell?: SpellRow; spellCastable?: boolean;
  feature?: FeatureRow & { action?: ActionDef }; toggle?: ToggleRow;
  item?: { id: string; name: string; works: boolean; charges?: { left: number; max: number } };
  resource?: { row: ResourceRow; cost: number; left: number; out: boolean };
  dc?: { name: string; dc: number }; dice?: string;
  /** Red on the sheet: something the step needs is used up, missing or not working. */
  out: boolean; problems: string[];
  /** The thing the step points at, for a detail card (`feature:<key>`, `spell:<id>`, `item:<id>`). */
  ref?: string;
}
export interface ComboView { combo: Combo; index: number; ready: boolean; readyText: string; steps: StepView[]; }

const same = (a: string, b: string) => slug(a) === slug(b);

function slotFree(st: ActorStats, level: number): boolean {
  return st.slots.some(s => s.used < s.max && (s.level === "pact" ? (s.pactLevel ?? 0) : Number(s.level)) >= level);
}

export function comboViews(c: Character, st: ActorStats, companions: (ActorStats | undefined)[], ctx: EffectContext): ComboView[] {
  const r = ctx.registry, spells = spellRows(c, st, ctx), allSpells = [...spells.own, ...spells.fromItems];
  const scales = st.progress.scales as Record<string, string | number>;
  return c.combos.map((combo, index) => {
    const pool = new Map<string, number>(), need = new Map<string, number>();   // resource slug -> total cost across the steps
    for (const s of combo.steps) if (s.use?.resource) need.set(slug(s.use.resource), (need.get(slug(s.use.resource)) ?? 0) + (s.use.cost ?? 0));
    const shortages: string[] = [];
    const steps: StepView[] = combo.steps.map((step, i) => {
      const u = step.use ?? {}, problems: string[] = [];
      const v: StepView = { step, index: i, out: false, problems };
      const comp = u.companion !== undefined ? c.companions[u.companion] : undefined;
      const who = step.who ?? comp?.name; if (who) v.who = who;
      if (u.attack) {
        const from = u.companion !== undefined ? companions[u.companion] : st;
        const a = from?.attacks.find(x => same(x.name, u.attack!));
        if (a) v.attack = { ...a, ...(u.companion !== undefined ? { who: u.companion } : {}) }; else problems.push(`${u.attack} is not one of the attacks on this sheet`);
      }
      if (u.spell) {
        const sp = allSpells.find(x => x.id === u.spell || same(x.name, u.spell!));
        if (!sp || !sp.known) problems.push(`${u.spell} is not one of your spells`);
        else {
          v.spell = sp; v.ref = `spell:${sp.id}`;
          const s = sp.source;
          const castable = s.kind === "item" ? (s.cost.kind === "charges" ? (s.chargesLeft ?? 0) >= s.cost.amount : s.cost.kind === "perDay" ? (s.usesLeft ?? 0) > 0 : true)
            : sp.level === 0 || slotFree(st, sp.level);
          v.spellCastable = castable;
          if (!castable) { problems.push(s.kind === "item" ? `${s.itemName} has nothing left for ${sp.name}` : `no spell slot left for ${sp.name}`); shortages.push(s.kind === "item" ? `${sp.name} (${s.itemName} is used up)` : "a spell slot (none left)"); }
        }
      }
      if (u.feature) {
        const f = st.progress.features.find(x => x.key === u.feature) ?? st.progress.features.find(x => same(x.name, u.feature!));
        if (!f) problems.push(`${u.feature} is not a feature of this character`);
        else { v.feature = f; v.ref = `feature:${f.key}`; v.toggle = st.toggles.find(t => t.ref === `feature:${f.key}`); }
      }
      if (u.item) {
        const idx = c.inventory.findIndex(e => e.id === u.item || (e.name && same(e.name, u.item!)));
        const e = c.inventory[idx], it = e ? entryItem(e, r) : undefined;
        if (!e) problems.push(`${u.item} is not in your inventory`);
        else {
          const works = it ? itemWorks(e, it) : true, max = it?.charges?.max;
          v.item = { id: e.id ?? e.name ?? u.item, name: it?.name ?? e.name ?? u.item, works, ...(max !== undefined ? { charges: { max, left: max - (e.charges?.used ?? 0) } } : {}) };
          if (e.id && it) v.ref = `item:${e.id}`;
          if (!works) { problems.push(`${v.item.name} is not equipped${it?.attunement && !e.attuned ? " and attuned" : ""}`); shortages.push(`${v.item.name} (not equipped${it?.attunement && !e.attuned ? " and attuned" : ""})`); }
        }
      }
      if (u.resource) {
        const row = st.resources.find(x => same(x.name, u.resource!) || x.id === u.resource);
        if (!row) { problems.push(`${u.resource} is not on this sheet`); shortages.push(`${u.resource} (not on this sheet)`); }
        else {
          const cost = u.cost ?? 0, left = row.unlimited ? Infinity : row.max - row.used;
          const have = pool.get(row.id) ?? left; pool.set(row.id, have - cost);
          v.resource = { row, cost, left, out: have < cost };
        }
      }
      if (u.dc) {
        const d = st.progress.dcs.find(x => same(x.name, u.dc!) || x.id === slug(u.dc!));
        if (d) v.dc = { name: d.name, dc: d.dc }; else problems.push(`${u.dc} save DC is not on this sheet`);
      }
      if (u.dice) v.dice = fillDice(u.dice, scales).replace(/\s/g, "");
      v.out = problems.length > 0 || !!v.resource?.out;
      return v;
    });
    for (const [key, total] of need) {
      const row = st.resources.find(x => slug(x.name) === key || x.id === key);
      if (row && !row.unlimited && row.max - row.used < total) shortages.push(`${total} ${row.name.toLowerCase()} (${Math.max(0, row.max - row.used)} left)`);
    }
    const dup = [...new Set(shortages)];
    return { combo, index, ready: !dup.length, readyText: dup.length ? `Partly: needs ${dup.join(", ")}` : "Ready", steps };
  });
}
