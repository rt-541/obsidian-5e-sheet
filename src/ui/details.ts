import { sourceLabel, type Entry, type Registry } from "../content/registry";
import type { ClassData, ConditionData, CreatureData, FeatData, GrantsData, ItemData, Op, SpellData, SubclassData, SubraceData } from "../content/types";
import type { Effects } from "../core/types";
import { comboViews } from "../core/combos";
import { diceAt } from "../core/spells";
import type { SheetController } from "./controller";
import { actionWords, describeEffects, effectParts, sourceBadge, wordsCtx, type WordsCtx } from "./widgets";
import { h, sgn } from "./h";
import { identityCard } from "./identity-cards";
import { ABIL_FULL, glossaryEntry } from "../content/glossary";
import type { Abil } from "../core/types";

const MOD_LABEL: Record<string, string> = { ac: "AC", speed: "speed", hpMax: "max HP", save: "saves", attack: "attack rolls", damage: "damage", spellDC: "spell DC",
  spellAttack: "spell attacks", check: "checks", initiative: "initiative", carry: "carrying capacity" };
const ABIL = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One line per fact: numeric modifiers read "+1 AC", everything else comes from describeEffects. */
function effectLines(e: Effects, ctx?: WordsCtx): string[] {
  const mods = (e.modifiers ?? []).map(m => typeof m.value === "number" ? `${sgn(m.value)} ${MOD_LABEL[m.target] ?? m.target}` : effectParts({ modifiers: [m] }, ctx)[0] ?? "");
  const rest = describeEffects({ ...e, modifiers: [] }, ctx);
  return [...mods, ...(rest ? [rest] : [])];
}

function card(title: string, subtitle: string, lines: string[], rules: string | undefined, path?: string, source?: string): HTMLElement {
  return h("div", { cls: "fe-detail" },
    h("div", { cls: "fe-name", text: title }),
    source ? h("div", { cls: "fe-detail-src" }, sourceBadge(source)) : null,
    subtitle ? h("div", { cls: "fe-muted", text: subtitle }) : null,
    ...lines.filter(Boolean).map(l => h("div", { cls: "fe-detail-line", text: l })),
    rules ? h("div", { cls: "fe-rules", text: rules }) : null,
    path ? h("div", { cls: "fe-faint", text: `Source note: ${path}` }) : null);
}

/** Price in copper pieces as "1 gp 5 sp 3 cp" (ten cp to the sp, ten sp to the gp). */
export function priceText(cp: number): string {
  const gp = Math.floor(cp / 100), sp = Math.floor((cp % 100) / 10), c = cp % 10;
  return [gp ? `${gp} gp` : "", sp ? `${sp} sp` : "", c ? `${c} cp` : ""].filter(Boolean).join(" ") || "0 cp";
}

function itemCard(reg: Registry, e: Entry<ItemData>): HTMLElement {
  const d = e.data, lines: string[] = [];
  if (d.armor) lines.push(`Armor: AC ${d.armor.base}${d.armor.dex === "full" ? " + Dex" : d.armor.dex === "max2" ? " + Dex (max 2)" : ""}${d.armor.stealthDis ? ", disadvantage on Stealth" : ""}`);
  if (d.weapon) lines.push(`Weapon: ${d.weapon.dmg}${d.weapon.bonus ? sgn(d.weapon.bonus) : ""} ${d.weapon.type}${d.weapon.extraDamage ? ` + ${d.weapon.extraDamage}` : ""} (${d.weapon.range})`);
  lines.push(...effectLines(d.effects));
  if (d.heal) lines.push(`Healing: ${d.heal}`);
  if (d.weight) lines.push(`Weight: ${d.weight} lb`);
  if (d.value !== undefined) lines.push(`Value: ${priceText(d.value)}`);
  if (d.charges) lines.push(`Charges: ${d.charges.max}, resets ${d.charges.reset === "none" ? "never" : d.charges.reset}`);
  for (const g of d.grants?.spells ?? []) {
    const sp = reg.get<SpellData>("spell", g.id), c = g.cost;
    lines.push(`Casts ${sp?.name ?? `${g.id} (missing from compendium)`}: ${c.kind === "charges" ? `${c.amount} charge${c.amount === 1 ? "" : "s"}` : c.kind === "perDay" ? `${c.uses} per day` : "at will"}`);
  }
  return card(e.name, [cap(d.kind), d.rarity, d.attunement ? "requires attunement" : ""].filter(Boolean).join(" · "), lines, d.rules, e.source === "vault" ? e.path : undefined, sourceLabel(e));
}

function spellCard(_reg: Registry, e: Entry<SpellData>): HTMLElement {
  const d = e.data, lines: string[] = [];
  lines.push(`Casting time: ${d.castingTime}${d.ritual ? " (ritual)" : ""}`, `Range: ${d.range}`,
    `Components: ${d.components.join(", ")}${d.material ? ` (${d.material})` : ""}`, `Duration: ${d.concentration ? "Concentration, " : ""}${d.duration}`);
  if (d.attack) lines.push(`${cap(d.attack)} spell attack`);
  if (d.save) lines.push(`${ABIL[d.save.abil]} save, ${d.save.onSuccess === "half" ? "half damage on success" : "no effect on success"}`);
  const dmg = d.damage && (diceAt(d.damage.bySlot, Math.max(1, d.level)) ?? diceAt(d.damage.byCharLevel, 1));
  if (d.damage && dmg) lines.push(`Damage: ${dmg} ${d.damage.type}`);
  const heal = diceAt(d.heal?.bySlot, d.level);
  if (heal) lines.push(`Healing: ${heal.replace(/\+MOD/g, " + spellcasting modifier")}`);
  const sub = [d.level === 0 ? `${d.school} cantrip` : `Level ${d.level} ${d.school}`, d.classes.length ? d.classes.map(cap).join(", ") : ""].filter(Boolean).join(" · ");
  return card(e.name, sub, lines, [d.rules, d.higherLevel ? `At higher levels: ${d.higherLevel}` : ""].filter(Boolean).join("\n\n") || undefined, e.source === "vault" ? e.path : undefined, sourceLabel(e));
}

function conditionCard(e: Entry<ConditionData>, active = 0): HTMLElement {
  const d = e.data, lvl = active;
  const eff = d.levels && d.levelEffects ? d.levelEffects[Math.min(Math.max(lvl, 1), d.levels)] ?? {} : d.effects;
  return card(e.name, d.levels ? `${cap(d.category)}, ${d.levels} levels${lvl ? ` (level ${lvl} active)` : ""}` : d.kind === "disease" ? "Disease" : cap(d.category), effectLines(eff), d.rules, e.source === "vault" ? e.path : undefined, sourceLabel(e));
}

function traitCard(creature: string, index: number, ctl: SheetController): HTMLElement | null {
  const e = ctl.host.registry.get<CreatureData>("creature", creature), t = e?.data.traits[index];
  return e && t ? card(t.name, e.name, [], t.text, e.source === "vault" ? e.path : undefined, sourceLabel(e)) : null;
}

function creatureCard(e: Entry<CreatureData>, body?: string): HTMLElement {
  const d = e.data, ab = (["str", "dex", "con", "int", "wis", "cha"] as const).map(a => `${ABIL[a]} ${d.abilities[a]}`).join("  ");
  const sp = [`${d.speed.walk} ft.`, ...(["fly", "swim", "climb"] as const).flatMap(m => d.speed[m] ? [`${m} ${d.speed[m]} ft.`] : [])].join(", ");
  const lines = [`AC ${d.ac}`, `HP ${d.hp.average}${d.hp.formula ? ` (${d.hp.formula})` : ""}`, `Speed ${sp}`, ab,
    ...(Object.keys(d.saves).length ? [`Saves: ${Object.entries(d.saves).map(([a, n]) => `${ABIL[a as keyof typeof ABIL] ?? a} ${sgn(n as number)}`).join(", ")}`] : []),
    ...(Object.keys(d.skills).length ? [`Skills: ${Object.entries(d.skills).map(([k, n]) => `${cap(k)} ${sgn(n)}`).join(", ")}`] : []),
    ...(d.senses ? [`Senses: ${d.senses}`] : []),
    ...(d.environment?.length ? [`Environment: ${d.environment.join(", ")}`] : []),
    ...(d.copiedFrom ? [`Copied from: ${d.copiedFrom}`] : []),
    ...d.attacks.map(a => `${a.name}${a.toHit !== undefined ? `: ${sgn(a.toHit)} to hit` : ""}${a.damage ? `, ${a.damage}${a.note ? ` ${a.note}` : ""}` : ""}${a.save ? `, DC ${a.save.dc} ${ABIL[a.save.abil]} save` : ""}`)];
  const rules = [...d.traits.map(t => `${t.name}. ${t.text}`), d.rules ?? ""].filter(Boolean).join("\n\n") || body || undefined;
  return card(e.name, [`${d.size} ${d.ctype}`, d.cr !== undefined ? `CR ${d.cr}` : ""].filter(Boolean).join(" · "), lines, rules, e.source === "vault" ? e.path : undefined, sourceLabel(e));
}

function featureCard(key: string, ctl: SheetController): HTMLElement | null {
  const f = ctl.stats()?.progress.features.find(x => x.key === key); if (!f) return null;
  const st = ctl.stats()!, wc = wordsCtx(ctl.character, st), a = f.action, lines = effectLines(f.effects, wc);
  if (a) lines.push(`Action: ${[a.name, ...actionWords(a, st)].join(", ")}${a.text ? `. ${a.text}` : ""}`);
  return card(f.name, `${f.source}${f.sourceKind === "option" ? " (option)" : ""}`, lines, f.text);
}

/** Every feature a subclass or feat grants, by level, for the pick lists. */
function opsCard(title: string, sub: string, byLevel: [string, Op[]][], path?: string, source?: string): HTMLElement {
  const lines: string[] = [], text: string[] = [];
  for (const [lvl, ops] of byLevel) for (const op of ops) if (op.op === "feature") { lines.push(lvl ? `Level ${lvl}: ${op.name}` : op.name); if (op.text) text.push(`${op.name}. ${op.text}`); }
  return card(title, sub, lines, text.join("\n\n") || undefined, path, source);
}
function subclassCard(reg: Registry, e: Entry<SubclassData>): HTMLElement {
  return opsCard(e.name, `${reg.get<ClassData>("class", e.data.class)?.name ?? cap(e.data.class)} subclass`, Object.entries(e.data.levels), e.source === "vault" ? e.path : undefined, sourceLabel(e));
}
function featCard(e: Entry<FeatData>): HTMLElement {
  return opsCard(e.name, e.data.prerequisite ? `Prerequisite: ${e.data.prerequisite}` : "Feat", [["", e.data.grants]], e.source === "vault" ? e.path : undefined, sourceLabel(e));
}
function grantsCard(e: Entry<GrantsData | SubraceData>, kind: string, reg: Registry): HTMLElement {
  const race = "race" in e.data ? reg.get<GrantsData>("race", e.data.race)?.name : undefined;
  return opsCard(e.name, race ? `${race} subrace` : kind, [["", e.data.grants]], e.source === "vault" ? e.path : undefined, sourceLabel(e));
}
function classCard(e: Entry<ClassData>): HTMLElement {
  const d = e.data, lines = [`Hit die: d${d.hitDie}`, `Saving throws: ${d.saves.map(a => ABIL[a]).join(", ")}`,
    ...(d.spellcasting ? [`Spellcasting: ${d.spellcasting.progression} caster, ${ABIL[d.spellcasting.abil]}`] : []),
    ...(d.proficiencies?.length ? [`Proficiencies: ${d.proficiencies.join(", ")}`] : []),
    ...(d.skills ? [`Skills: choose ${d.skills.count} from ${d.skills.from.map(cap).join(", ")}`] : [])];
  const text: string[] = [];
  for (const [lvl, ops] of Object.entries(d.levels ?? {})) for (const op of ops) if (op.op === "feature") { lines.push(`Level ${lvl}: ${op.name}`); if (op.text) text.push(`${op.name}. ${op.text}`); }
  return card(e.name, "Class", lines, text.join("\n\n") || undefined, e.source === "vault" ? e.path : undefined, sourceLabel(e));
}

function effectCard(source: string, ctl: SheetController): HTMLElement | null {
  const hit = ctl.stats()?.effects.find(x => x.source === source); if (!hit) return null;
  return card(source, "Active effect", effectLines(hit.effects, wordsCtx(ctl.character, ctl.stats()!)), undefined);
}

/** The card for one compendium entry (any source), for the compendium browser and the sheet. A reference-only library note gets a plain card: the caller supplies its body text. */
export function entryCard(reg: Registry, e: Entry, body?: string): HTMLElement {
  if (e.referenceOnly) return card(e.name, `${cap(e.type)} · reference only`, [`Not usable on the sheet: ${e.referenceOnly}`], body, undefined, sourceLabel(e));
  switch (e.type) {
    case "item": return itemCard(reg, e as Entry<ItemData>);
    case "spell": return spellCard(reg, e as Entry<SpellData>);
    case "condition": case "injury": return conditionCard(e as Entry<ConditionData>);
    case "creature": return creatureCard(e as Entry<CreatureData>, body);
    case "class": return classCard(e as Entry<ClassData>);
    case "subclass": return subclassCard(reg, e as Entry<SubclassData>);
    case "feat": return featCard(e as Entry<FeatData>);
    case "race": return grantsCard(e as Entry<GrantsData>, "Race", reg);
    case "subrace": return grantsCard(e as Entry<SubraceData>, "Subrace", reg);
    case "background": return grantsCard(e as Entry<GrantsData>, "Background", reg);
    default: return card(e.name, cap(e.type), [], body, e.source === "vault" ? e.path : undefined, sourceLabel(e));
  }
}

/** A combo in full: when to use it, every step with its action type, and the notes. */
function comboCard(index: number, ctl: SheetController): HTMLElement | null {
  const st = ctl.stats(), c = ctl.character; if (!st || !c) return null;
  const v = comboViews(c, st, ctl.companionStats(), ctl.ctx())[index]; if (!v) return null;
  const lines = [v.readyText, ...v.steps.map((s, i) => `${i + 1}. ${s.step.action}${s.who ? ` (${s.who})` : ""}: ${s.step.text}`)];
  return card(v.combo.name, v.combo.when ? `When to use it: ${v.combo.when}` : "Combo", lines, v.combo.notes);
}

/** "Where this number comes from": the breakdown sentence of `key` (ac, save:dex, attack:0 for both lines of an attack, attack:0:hit for one). */
function whyCard(key: string, ctl: SheetController): HTMLElement | null {
  const st = ctl.stats(); if (!st) return null;
  const am = /^attack:(\d+)(?::(hit|damage))?$/.exec(key);
  const lines = am ? [am[2] ? st.attacks[+am[1]]?.why?.[am[2] as "hit" | "damage"] : st.attacks[+am[1]]?.why?.hit, am[2] ? undefined : st.attacks[+am[1]]?.why?.damage].filter((x): x is string => !!x)
    : st.why[key] ? [st.why[key]] : [];
  return lines.length ? card("Where this number comes from", am ? st.attacks[+am[1]].name : "", lines, undefined) : null;
}

/** A plain-words card for a glossary term, with this character's own number and its breakdown line when the sheet has one. */
function glossaryCard(key: string, ctl: SheetController): HTMLElement | null {
  const e = glossaryEntry(key, !!ctl.rules()["rest-excursion"]); if (!e) return null;
  const st = ctl.stats(), lines: string[] = [], why = (k: string) => { if (st?.why[k]) lines.push(st.why[k]); };
  const [kind, id] = key.split(":");
  if (st) {
    if (kind === "ability") { const a = id as Abil; lines.push(`Your ${ABIL_FULL[a]}: ${st.abilities[a]} (modifier ${sgn(st.checks[a])})`); why(`check:${a}`); }
    else if (kind === "save") { const a = id as Abil; lines.push(`Your save: ${sgn(st.saves[a].mod)}${st.saves[a].prof ? " (trained)" : ""}`); why(`save:${a}`); }
    else if (kind === "skill") { const k = st.skills.find(x => x.id === id); if (k) { lines.push(`Your bonus: ${sgn(k.mod)}${k.expertise ? " (double training)" : k.prof ? " (trained)" : ""}`); why(`skill:${id}`); } }
    else if (key === "proficiency-bonus") lines.push(`Your proficiency bonus: ${sgn(st.prof)}`);
    else if (key === "passive-perception") { lines.push(`Your passive Perception: ${st.passivePerception}`); why("passive:perception"); }
    else if (key === "initiative") { lines.push(`Your initiative: ${sgn(st.initiative)}`); why("initiative"); }
    else if (key === "armor-class") { lines.push(`Your Armor Class: ${st.ac.value}`); why("ac"); }
    else if (key === "speed") { lines.push(`Your speed: ${st.speed.value} ft.`); why("speed"); }
    else if (key === "hit-points") { lines.push(`Your hit points: ${st.hp.current} of ${st.hp.max}`); why("hp"); }
    else if (key === "temp-hp") lines.push(`Your temporary hit points: ${st.hp.temp}`);
    else if (key === "hit-dice" && st.hitDice.length) lines.push(`Left: ${st.hitDice.map(d => `${d.die} ${d.max - d.used} of ${d.max}`).join(", ")}`);
  }
  return card(e.title, e.kind, [e.text, ...lines], undefined);
}

/** A detail card for `ref` (item:, spell:, condition:, trait:<creature>:<index>, effect:<source>), or null if it is not known. All text goes in as text nodes. */
export function detailCard(ref: string, ctl: SheetController): HTMLElement | null {
  const i = ref.indexOf(":"); if (i < 0) return null;
  const kind = ref.slice(0, i), rest = ref.slice(i + 1), reg = ctl.host.registry;
  switch (kind) {
    case "item": { const e = reg.get<ItemData>("item", rest); return e ? itemCard(reg, e) : null; }
    case "spell": { const e = reg.get<SpellData>("spell", rest); return e ? spellCard(reg, e) : null; }
    case "condition": { const e = reg.get<ConditionData>("condition", rest) ?? reg.get<ConditionData>("injury", rest); return e ? conditionCard(e, ctl.value.conditions[rest] ?? 0) : null; }
    case "why": return whyCard(rest, ctl);
    case "glossary": return glossaryCard(rest, ctl);
    case "identity": return identityCard(rest, ctl);
    case "effect": return effectCard(rest, ctl);
    case "feature": return featureCard(rest, ctl);
    case "combo": return comboCard(Number(rest), ctl);
    case "subclass": { const e = reg.get<SubclassData>("subclass", rest); return e ? subclassCard(reg, e) : null; }
    case "feat": { const e = reg.get<FeatData>("feat", rest); return e ? featCard(e) : null; }
    case "trait": { const j = rest.lastIndexOf(":"); return j < 0 ? null : traitCard(rest.slice(0, j), Number(rest.slice(j + 1)), ctl); }
    default: return null;
  }
}
