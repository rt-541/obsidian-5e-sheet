import { titleCase } from "../core/words";
import type { ConditionData, CreatureData, ItemData } from "../content/types";
import type { ActorStats } from "../core/derive";
import { ABILS, type Abil, type Effects } from "../core/types";
import { hitDiceRecharge } from "../content/glossary";
import { activeRests } from "../rules";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";
import { slug } from "../content/registry";
import { btn, card, describeEffects, pips, bar, usesPips } from "./widgets";
import { settingsFeature } from "./settings-ui";
import { featuresFeature, levelUpFeature, xpFeature } from "./features-ui";
import { combosFeature, pinnedCombosFeature } from "./combos-ui";
import { pinnedTraits, traitsFeature } from "./traits-ui";
import { resourceUseButtons } from "./resource-use";
import { activeEffectsFeature } from "./effects-ui";
import { togglesFeature } from "./toggles-ui";
import { coinsRow } from "./coins-ui";
import { rationsFeature } from "./rations-ui";
import { inventoryFeature, itemRef, itemState } from "./inventory-ui";
import { rollModeSlider } from "./roll-mode-ui";
import { castsSpells, concentrationFeature, pinnedSpellsFeature, slotRows, spellsFeature } from "./spells-ui";

export { describeEffects, pips };
export type Render = (ctl: SheetController, st: ActorStats) => HTMLElement;
/** A tile. `why` is the breakdown it opens: on the whole tile when nothing inside it is a button, else on the label (the number inside keeps its own hover card). */
const stat = (label: string, value: Node | string, why?: string, interactive = false, gloss?: string) => h("div", { cls: "fe-stat", ...(why && !interactive ? { data: { ref: why } } : {}) },
  h("div", { cls: "fe-stat-v" }, value), h("div", { cls: "fe-stat-l", text: label, ...(gloss ? { data: { ref: `glossary:${gloss}` } } : why && interactive ? { data: { ref: why } } : {}) }));
/** The label of a number: hover or tap gives the plain-words card for the term. The number itself keeps its own breakdown. */
const gl = (key: string): { data: Record<string, string> } => ({ data: { ref: `glossary:${key}` } });
/** The data attribute for a number's breakdown, or nothing when the actor has none (a creature's stat block). */
const whyOf = (st: ActorStats, key: string): string | undefined => (st.why[key] ? `why:${key}` : undefined);
const whyData = (ref?: string, noclick = false): { data: Record<string, string> } | Record<string, never> => (ref ? { data: { ref, ...(noclick ? { noclick: "" } : {}) } } : {});
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

export function rollButton(ctl: SheetController, label: string, title: string, mod: number, target: Parameters<SheetController["roll"]>[2], who?: number, why?: string) {
  return h("button", { cls: "fe-roll", text: label, ...whyData(why, true), on: { click: (e: MouseEvent) => ctl.roll(title, mod, target, e, who) } });
}

function hpBlock(ctl: SheetController, st: ActorStats) {
  const pct = st.hp.max ? Math.round(100 * st.hp.current / st.hp.max) : 0;
  return h("div", { cls: "fe-hp" },
    h("div", { cls: "fe-hp-line" }, h("span", { cls: "fe-hp-n", text: String(st.hp.current) }),
      h("small", { text: ` / ${st.hp.max}${st.hp.maxReduced ? " (halved)" : ""} · temp ${st.hp.temp}`, ...whyData(whyOf(st, "hp")) })),
    h("div", { cls: "fe-bar" }, h("div", { cls: "fe-bar-fill", attrs: { style: `width:${pct}%` } })));
}
function hpControls(ctl: SheetController, who?: number) {
  const amt = h("input", { cls: "fe-amt", attrs: { type: "number", min: "1", value: String(ctl.amount), "aria-label": "Amount" },
    on: { input: (e: Event) => { ctl.amount = Math.max(1, +(e.target as HTMLInputElement).value || 1); } } });
  const act = (type: "damage" | "heal" | "temp") => () => ctl.dispatch({ type, amount: ctl.amount, ...(type === "damage" && ctl.damageType ? { damageType: ctl.damageType } : {}), ...(who !== undefined ? { who: { companion: who } } : {}) });
  const kind = h("select", { cls: "fe-damage-type", attrs: { "aria-label": "Damage type", title: "Resistance, immunity and vulnerability change the damage when the type matches" },
    on: { change: (e: Event) => { ctl.damageType = (e.target as HTMLSelectElement).value; } } },
    h("option", { text: "Any", attrs: { value: "" } }),
    ...DAMAGE_TYPES.map(t => h("option", { text: titleCase(t), attrs: { value: t, ...(ctl.damageType === t ? { selected: "" } : {}) } })));
  return h("div", { cls: "fe-hpctl" }, amt, btn("Damage", act("damage"), "fe-dmg"), btn("Heal", act("heal"), "mod-cta"), btn("Temp HP", act("temp")),
    h("label", { cls: "fe-dtype" }, h("span", { text: "Damage type:" }), kind),
    h("div", { cls: "fe-faint fe-dtype-hint", text: "Change this damage type to match the damage taken." }));
}
function conditionChips(ctl: SheetController, conds: Record<string, number>, who?: number) {
  const r = ctl.host.registry;
  return h("div", { cls: "fe-chips" },
    ...Object.entries(conds).map(([id, lvl]) => {
      const c = r.get<ConditionData>("condition", id);
      return h("button", { cls: `fe-chip ${c ? "" : "is-missing"}`, ...(c ? { data: { ref: `condition:${id}`, noclick: "" } } : {}), text: c ? `${c.name}${c.data.levels ? " " + lvl : ""}` : `${id} (missing from compendium)`,
        on: { click: () => ctl.open({ kind: "conditions", ...(who !== undefined ? { who } : {}) }) } });
    }),
    h("button", { cls: "fe-chip-add", text: "+ Conditions", data: { feature: "conditions-table" }, on: { click: () => ctl.open({ kind: "conditions", ...(who !== undefined ? { who } : {}) }) } }));
}
function checks(ctl: SheetController, st: ActorStats, who?: number) {
  return {
    abilities: h("div", { cls: "fe-abilities" }, ...ABILS.map(a => h("div", { cls: "fe-tile" },
      h("div", { cls: "fe-tile-k", text: ABIL_NAME[a], ...gl(`ability:${a}`) }),
      rollButton(ctl, sgn(st.checks[a]), `${ABIL_NAME[a]} check`, st.checks[a], { kind: "check", abil: a }, who, whyOf(st, `check:${a}`)),
      ctl.editing && who === undefined && ctl.character
        ? h("input", { cls: "fe-score", attrs: { type: "number", min: "1", max: "30", value: String(st.abilities[a]), "aria-label": `${ABIL_NAME[a]} score` },
            on: { change: (e: Event) => ctl.dispatch({ type: "ability", abil: a, value: +(e.target as HTMLInputElement).value }) } })
        : h("div", { cls: "fe-tile-s", text: String(st.abilities[a]) })))),
    saves: h("div", { cls: "fe-rows" }, ...ABILS.map(a => h("div", { cls: "fe-row" },
      h("span", { cls: `fe-dot ${st.saves[a].prof ? "is-prof" : ""}` }), h("span", { cls: "fe-grow", text: ABIL_NAME[a], ...gl(`save:${a}`) }),
      rollButton(ctl, sgn(st.saves[a].mod), `${ABIL_NAME[a]} save`, st.saves[a].mod, { kind: "save", abil: a }, who, whyOf(st, `save:${a}`))))),
    skills: h("div", { cls: "fe-rows" }, ...st.skills.map(k => h("div", { cls: "fe-row" },
      h("span", { cls: `fe-dot ${k.prof ? "is-prof" : ""} ${k.expertise ? "is-expert" : ""}` }),
      h("span", { cls: "fe-grow", text: titleCase(k.id), ...gl(`skill:${k.id}`) }), h("span", { cls: "fe-faint", text: ABIL_NAME[k.abil] }),
      rollButton(ctl, sgn(k.mod), titleCase(k.id), k.mod, { kind: "skill", abil: k.abil, skill: k.id }, who, whyOf(st, `skill:${k.id}`))))),
  };
}
const legend = (text: string) => h("div", { cls: "fe-faint", data: { legend: "" }, text });
function attacksList(ctl: SheetController, st: ActorStats, who?: number) {
  if (!st.attacks.length) return h("div", { cls: "fe-faint", text: "No attacks" });
  return h("div", { cls: "fe-attacks" },
    who === undefined && st.kind === "character" && st.attacksPerAction > 1 ? h("div", { cls: "fe-muted fe-attacks-per", text: `Attacks per action: ${st.attacksPerAction}` }) : null,
    ...st.attacks.map((a, ai) => h("div", { cls: "fe-attack" },
    h("span", { cls: "fe-grow", text: a.name, ...whyData(a.why ? `why:attack:${ai}` : undefined) }),
    a.toHit !== undefined ? rollButton(ctl, sgn(a.toHit), `${a.name} to hit`, a.toHit, a.target, who, a.why?.hit ? `why:attack:${ai}:hit` : undefined) : h("span", { cls: "fe-faint", text: "" }),
    a.save ? h("span", { cls: "fe-faint", text: `DC ${a.save.dc} ${ABIL_NAME[a.save.abil]}` }) : null,
    a.damage ? h("button", { cls: "fe-roll", text: a.damage, ...whyData(a.why?.damage ? `why:attack:${ai}:damage` : undefined, true), on: { click: () => ctl.damage(`${a.name} damage`, a.damage!) } }) : null,
    a.critDamage ? h("button", { cls: "fe-roll fe-crit", text: "Crit", title: `Damage on a critical hit: ${a.critDamage}`, attrs: { "aria-label": `${a.name} critical hit damage` },
      on: { click: () => ctl.damage(`${a.name} critical damage`, a.critDamage!) } }) : null,
    a.note ? h("div", { cls: "fe-note", text: a.note }) : null)));
}

function pinnedItems(ctl: SheetController): { index: number; row: HTMLElement }[] {
  const c = ctl.character!;
  return c.mainPins.filter(k => k.startsWith("item:") || k.startsWith("item-name:")).flatMap(ref => {
    const index = c.inventory.findIndex(e => itemRef(e) === ref); if (index < 0) return [];
    const s = itemState(ctl, index), e = s.e;
    return [{ index, row: h("div", { cls: `fe-kv fe-pinned-item ${s.usedUp ? "is-used-up" : ""}`.trim(), data: { pinnedItem: ref } },
      h("span", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: s.name, ...(s.it && e.id ? { data: { ref: `item:${e.id}` } } : {}) }),
        s.consumable || e.qty > 1 ? h("span", { cls: "fe-faint", text: ` x${e.qty}` }) : null,
        s.upWord ? h("span", { cls: "fe-faint fe-used-up", text: ` · ${s.upWord}` }) : null),
      s.charges ? pips(s.charges.max, e.charges?.used ?? 0, n => ctl.dispatch({ type: "charges", index, used: n })) : null,
      s.useBtn()) }];
  });
}

/**
 * "cleric 5 (Life Domain) / rogue 2 · Hill Dwarf · Acolyte": each class, subclass, race, subrace and background is its own hover/tap target
 * for a card of what it gives you. Class text stays the class id and level, as the plain label always was.
 */
function identityParts(ctl: SheetController): HTMLElement {
  const c = ctl.character!, r = ctl.host.registry;
  // a pick that is missing from the compendium stays plain text, marked so it is not mistaken for a name
  const part = (text: string, ref: string, missing = false) => { const [type, id] = ref.split(":"); return missing ? h("span", { cls: "fe-id-part is-missing", text: `${text} (missing from compendium)` }) : h("span", { cls: "fe-id-part", text, ...(r.get(type, id ?? (type === "race" ? c.race! : type === "subrace" ? c.subrace! : c.background!)) ? { data: { ref: `identity:${ref}` } } : {}) }); };
  const named = (type: string, id: string) => { const e = r.get<{ name: string }>(type, id); return part(e?.name ?? id, `${type}:${id}`, !e); };
  const out: (Node | string)[] = [];
  c.classes.forEach((k, i) => {
    if (i) out.push(" / ");
    out.push(part(`${k.class} ${k.level}`, `class:${k.class}`));
    if (k.subclass) out.push(" (", named("subclass", k.subclass), ")");
  });
  const origin: Node[] = [];
  if (c.race) origin.push((() => { const e = r.get<{ name: string }>("race", c.race!); return part(e?.name ?? c.race!, "race", !e); })());
  if (c.subrace) origin.push((() => { const e = r.get<{ name: string }>("subrace", c.subrace!); return part(e?.name ?? c.subrace!, "subrace", !e); })());
  if (c.background) origin.push((() => { const e = r.get<{ name: string }>("background", c.background!); return part(e?.name ?? c.background!, "background", !e); })());
  origin.forEach(o => out.push(" · ", o));
  return h("span", { cls: "fe-muted fe-identity-label" }, ...out);
}

/** Keeps the element present (layouts count it) but hidden unless `show`. */
function hideUnless(show: boolean, el: HTMLElement): HTMLElement { if (!show) el.hidden = true; return el; }


/** The small "..." button on a companion card. */
function companionMenuButton(ctl: SheetController, index: number, name: string): HTMLElement {
  const open = ctl.companionMenu === index, b = btn("...", () => ctl.toggleCompanionMenu(index), `fe-item-menu-btn ${open ? "is-on" : ""}`.trim());
  b.dataset.act = "companion-menu"; b.setAttribute("aria-label", `Options for ${name}`); b.setAttribute("aria-expanded", String(open)); return b;
}

/** The options under an open companion card: a new name, and Remove with a Yes / No check. */
function companionMenu(ctl: SheetController, index: number, name: string): HTMLElement {
  const box = h("input", { cls: "fe-search", attrs: { type: "text", value: name, "aria-label": `Name of ${name}` }, data: { act: "companion-rename" },
    on: { change: (ev: Event) => { ctl.dispatch({ type: "renameCompanion", index, name: (ev.target as HTMLInputElement).value }); } } });
  return h("div", { cls: "fe-item-menu", data: { companionMenu: String(index) } },
    h("label", { cls: "fe-kv" }, h("span", { text: "Name" }), box),
    ctl.confirmRemove
      ? h("div", { cls: "fe-kv fe-confirm", data: { note: "remove-confirm" } }, h("span", { text: `Remove ${name}?` }),
        h("span", { cls: "fe-lvl" }, ((y) => { y.dataset.act = "remove-yes"; return y; })(btn("Yes", () => ctl.removeCompanionAt(index), "fe-dmg")),
          ((n) => { n.dataset.act = "remove-no"; return n; })(btn("No", () => ctl.askRemove(false)))))
      : ((r) => { r.dataset.act = "companion-remove"; return r; })(btn("Remove", () => ctl.askRemove(true))));
}

export const RENDER: Record<string, Render> = {
  identity: (ctl, st) => h("div", { cls: "fe-identity" }, h("span", { cls: "fe-name", text: st.name }),
    ctl.character && st.kind === "character" ? identityParts(ctl) : h("span", { cls: "fe-muted", text: st.label })),
  inspiration: ctl => btn("Inspiration", () => ctl.dispatch({ type: "inspiration", on: !ctl.character!.inspiration }), ctl.character?.inspiration ? "is-on" : ""),
  prof: (ctl, st) => h("span", { cls: "fe-kv" }, h("span", { cls: "fe-muted", text: "Proficiency bonus ", ...gl("proficiency-bonus") }), sgn(st.prof)),
  xp: ctl => xpFeature(ctl),
  "level-up": ctl => levelUpFeature(ctl),
  features: (ctl, st) => featuresFeature(ctl, st),
  ac: (ctl, st) => stat("AC", String(st.ac.value), whyOf(st, "ac"), false, "armor-class"),
  initiative: (ctl, st) => stat("Initiative", rollButton(ctl, sgn(st.initiative), "Initiative", st.initiative, { kind: "initiative", abil: "dex" }, undefined, whyOf(st, "initiative")), whyOf(st, "initiative"), true, "initiative"),
  speed: (ctl, st) => stat("Speed", `${st.speed.value}${st.speed.sources.length ? "*" : ""}${st.speed.other ? ` (${st.speed.other})` : ""}`, whyOf(st, "speed"), false, "speed"),
  "passive-perception": (ctl, st) => stat("Passive Perception", String(st.passivePerception), whyOf(st, "passive:perception"), false, "passive-perception"),
  hp: (ctl, st) => hpBlock(ctl, st),
  "hp-controls": ctl => hpControls(ctl),
  rations: ctl => rationsFeature(ctl),
  coins: ctl => card("Coins", coinsRow(ctl)),
  "hit-dice": (ctl, st) => {
    const el = card("Hit Dice", ...st.hitDice.map(d => h("div", { cls: "fe-kv" },
      h("span", { text: `${d.die} ${d.max - d.used} / ${d.max}` }), btn("Spend 1", () => ctl.spendHitDie(d.die)))),
      h("div", { cls: "fe-faint fe-hd-recharge", text: hitDiceRecharge(st.hitDice.reduce((n, d) => n + d.max, 0), !!ctl.rules()["rest-excursion"]) }));
    const title = el.querySelector<HTMLElement>(".fe-card-title"); if (title) title.dataset.ref = "glossary:hit-dice";
    return el; },
  "death-saves": ctl => { const ds = ctl.character!.deathSaves;
    return h("div", { cls: "fe-kv fe-ds" }, h("span", { text: "Death saves", ...gl("death-saves") }),
      h("span", {}, "Successes ", pips(3, ds.successes, n => ctl.dispatch({ type: "deathSave", which: "successes", value: n }), "is-s"),
        " Failures ", pips(3, ds.failures, n => ctl.dispatch({ type: "deathSave", which: "failures", value: n }), "is-f"))); },
  conditions: ctl => conditionChips(ctl, ctl.value.conditions),
  concentration: ctl => concentrationFeature(ctl),
  toggles: (ctl, st) => togglesFeature(ctl, st),
  spells: (ctl, st) => spellsFeature(ctl, st),
  "pinned-spells": (ctl, st) => hideUnless(castsSpells(ctl, st), pinnedSpellsFeature(ctl, st)),
  combos: (ctl, st) => combosFeature(ctl, st),
  "pinned-combos": (ctl, st) => pinnedCombosFeature(ctl, st),
  "active-effects": (ctl, st) => activeEffectsFeature(ctl, st),
  abilities: (ctl, st) => card("Abilities", checks(ctl, st).abilities),
  saves: (ctl, st) => card("Saving throws", checks(ctl, st).saves, legend("Filled dot: trained (add your proficiency bonus).")),
  skills: (ctl, st) => card("Skills", checks(ctl, st).skills, legend("Filled dot: trained (add your proficiency bonus).")),
  attacks: (ctl, st) => card("Attacks", attacksList(ctl, st)),
  "spell-dc": (ctl, st) => hideUnless(castsSpells(ctl, st), card("Spellcasting", h("div", { cls: "fe-kv" }, st.spellcasting
    ? h("span", {}, h("span", { text: `Spell save DC ${st.spellcasting.dc}`, ...whyData(whyOf(st, "spell-dc")) }), " · ", h("span", { text: `spell attack ${sgn(st.spellcasting.attack)}`, ...whyData(whyOf(st, "spell-attack")) }))
    : "No spell save DC"))),
  "spell-slots": (ctl, st) => hideUnless(castsSpells(ctl, st), card("Spell slots", ...slotRows(ctl, st))),
  resources: (ctl, st) => { const c = ctl.character!, r = ctl.host.registry;
    const charged = c.inventory.map((e, i) => ({ e, i, it: e.id ? r.get<ItemData>("item", e.id)?.data : undefined })).filter(x => x.it?.charges && (!x.it.attunement || x.e.attuned));
    const pinned = pinnedTraits(ctl, st), derived = st.resources.filter(x => x.derived && !pinned.covered.has(x.id));
    const derivedIds = new Set(st.resources.filter(x => x.derived).map(x => x.id));
    const items = pinnedItems(ctl), itemRows = items.map(x => x.row);
    const el = card("Resources and charges", ...pinned.rows, ...itemRows,
      ...derived.map(x => h("div", { cls: "fe-kv fe-res-row", data: { resource: x.id } }, h("span", { cls: "fe-grow", text: x.unlimited ? x.name : `${x.name}: ${Math.max(0, x.max - x.used)} of ${x.max} left` }),
        h("span", { cls: "fe-res-ctl" }, usesPips(x, n => ctl.dispatch({ type: "uses", id: x.id, used: n })), ...resourceUseButtons(ctl, st, x)))),
      ...c.resources.map((res, i) => {
        if (derivedIds.has(slug(res.name))) return null;   // a hand-tracked twin of a derived resource: shown once, the note keeps its entry
        // `track: progress` (downtime, training, crafting) counts up toward max instead of spending uses down.
        const progress = (res as { track?: string }).track === "progress", setUsed = (n: number) => ctl.dispatch({ type: "resource", index: i, used: n });
        return h("div", { cls: "fe-kv fe-res-row" }, h("span", { cls: "fe-grow", text: progress ? res.name : `${res.name}: ${Math.max(0, res.max - res.used)} of ${res.max} left (${res.reset})` }),
          progress ? bar(res.max, res.used, setUsed, "progress") : pips(res.max, res.used, setUsed));
      }),
      ...charged.filter(x => !items.some(p => p.index === x.i)).map(x => h("div", { cls: "fe-kv fe-res-row" }, h("span", { cls: "fe-grow", text: `${x.it!.name} charges: ${Math.max(0, x.it!.charges!.max - (x.e.charges?.used ?? 0))} of ${x.it!.charges!.max} left` }), pips(x.it!.charges!.max, x.e.charges?.used ?? 0, n => ctl.dispatch({ type: "charges", index: x.i, used: n })))));
    if (!pinned.rows.length && !itemRows.length && !derived.length && !c.resources.some(x => !derivedIds.has(slug(x.name))) && !charged.length) el.hidden = true;
    return el; },
  rests: ctl => {
    // a card on the Main page, under Hit Dice: resting and spending hit dice go together
    return card("Rest", h("div", { cls: "fe-rests-wrap" },
      h("div", { cls: "fe-rests" }, ...activeRests(ctl.rules()).map(r => btn(r.label, () => ctl.open({ kind: "rest", id: r.id }))))));
  },
  settings: ctl => settingsFeature(ctl),
  inventory: (ctl, st) => inventoryFeature(ctl, st),
  companions: ctl => { const c = ctl.character!, sts = ctl.companionStats(), r = ctl.host.registry;
    return card("Companions", ...c.companions.map((comp, i) => {
      const st = sts[i];
      if (!st) return h("div", { cls: "fe-comp is-missing", data: { companion: String(i) } }, h("span", { text: `${comp.name}: ${comp.creature} (missing from compendium)` }),
        companionMenuButton(ctl, i, comp.name), ctl.companionMenu === i ? companionMenu(ctl, i, comp.name) : null);
      const ch = checks(ctl, st, i);
      const traits = r.get<CreatureData>("creature", comp.creature)?.data.traits ?? [];
      return h("div", { cls: "fe-comp", data: { companion: String(i) } },
        h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: st.name }), h("span", { cls: "fe-muted", text: st.label }), companionMenuButton(ctl, i, st.name)),
        ctl.companionMenu === i ? companionMenu(ctl, i, st.name) : null,
        h("div", { cls: "fe-stats" }, stat("AC", String(st.ac.value)), stat("Initiative", rollButton(ctl, sgn(st.initiative), `${st.name} initiative`, st.initiative, { kind: "initiative", abil: "dex" }, i)),
          stat("Speed", `${st.speed.value}${st.speed.other ? ` (${st.speed.other})` : ""}`)),
        hpBlock(ctl, st), hpControls(ctl, i), conditionChips(ctl, comp.conditions, i), ch.abilities,
        st.skills.length ? ch.skills : null, attacksList(ctl, st, i),
        ...traits.map((t, ti) => h("div", { cls: "fe-note" }, h("b", { text: t.name + ". ", data: { ref: `trait:${comp.creature}:${ti}` } }), t.text)));
    }), btn("Add companion", () => ctl.open({ kind: "add-companion" }))); },
  traits: (ctl, st) => { if (ctl.character) return traitsFeature(ctl, st);
    const n = ctl.value.type === "5e-npc" ? ctl.value : undefined;
    const traits = (n && ctl.host.registry.get<CreatureData>("creature", n.creature)?.data.traits) || [];
    return card("Traits", ...traits.map((t, ti) => h("div", { cls: "fe-note" }, h("b", { text: t.name + ". ", data: { ref: `trait:${n!.creature}:${ti}` } }), t.text))); },
  "roll-mode": ctl => rollModeSlider(ctl),
  "roll-log": ctl => btn(`Roll log${ctl.host.log.length ? ` (${ctl.host.log.length})` : ""}`, () => ctl.open({ kind: "log" })),
  "play-edit": ctl => h("div", { cls: "fe-kv" }, h("div", { cls: "fe-seg" }, btn("Play", () => ctl.setEditing(false), ctl.editing ? "" : "is-on"), btn("Edit", () => ctl.setEditing(true), ctl.editing ? "is-on" : "")),
    ctl.editing ? btn("Customize sheet", () => ctl.open({ kind: "customize" })) : null,
    ctl.editing ? h("div", { cls: "fe-edit-bar", text: "Editing: changes save as you type" }) : null),
  notes: ctl => { const el = h("div", { cls: "fe-notes" }); if (ctl.host.renderMarkdown && ctl.host.body) ctl.host.renderMarkdown(ctl.host.body, el); else { el.textContent = ctl.host.body ?? ""; el.style.whiteSpace = "pre-wrap"; } return card("Notes", el); },
};
