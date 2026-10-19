import type { ConditionData, CreatureData, ItemData } from "../content/types";
import type { ActorStats } from "../core/derive";
import { ABILS, type Abil, type Effects } from "../core/types";
import { activeRests } from "../rules";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";
import { btn, card, describeEffects, pips, bar, usesPips } from "./widgets";
import { featuresFeature, levelUpFeature, xpFeature } from "./features-ui";
import { combosFeature, pinnedCombosFeature } from "./combos-ui";
import { pinnedTraits, traitsFeature } from "./traits-ui";
import { activeEffectsFeature } from "./effects-ui";
import { togglesFeature } from "./toggles-ui";
import { coinsRow } from "./coins-ui";
import { inventoryFeature, itemRef, itemState } from "./inventory-ui";
import { concentrationFeature, pinnedSpellsFeature, spellsFeature } from "./spells-ui";

export { describeEffects, pips };
export type Render = (ctl: SheetController, st: ActorStats) => HTMLElement;
/** A tile. `why` is the breakdown it opens: on the whole tile when nothing inside it is a button, else on the label (the number inside keeps its own hover card). */
const stat = (label: string, value: Node | string, why?: string, interactive = false) => h("div", { cls: "fe-stat", ...(why && !interactive ? { data: { ref: why } } : {}) },
  h("div", { cls: "fe-stat-v" }, value), h("div", { cls: "fe-stat-l", text: label, ...(why && interactive ? { data: { ref: why } } : {}) }));
/** The data attribute for a number's breakdown, or nothing when the actor has none (a creature's stat block). */
const whyOf = (st: ActorStats, key: string): string | undefined => (st.why[key] ? `why:${key}` : undefined);
const whyData = (ref?: string, noclick = false): { data: Record<string, string> } | Record<string, never> => (ref ? { data: { ref, ...(noclick ? { noclick: "" } : {}) } } : {});
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

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
      h("div", { cls: "fe-tile-k", text: ABIL_NAME[a] }),
      rollButton(ctl, sgn(st.checks[a]), `${ABIL_NAME[a]} check`, st.checks[a], { kind: "check", abil: a }, who, whyOf(st, `check:${a}`)),
      ctl.editing && who === undefined && ctl.character
        ? h("input", { cls: "fe-score", attrs: { type: "number", min: "1", max: "30", value: String(st.abilities[a]), "aria-label": `${ABIL_NAME[a]} score` },
            on: { change: (e: Event) => ctl.dispatch({ type: "ability", abil: a, value: +(e.target as HTMLInputElement).value }) } })
        : h("div", { cls: "fe-tile-s", text: String(st.abilities[a]) })))),
    saves: h("div", { cls: "fe-rows" }, ...ABILS.map(a => h("div", { cls: "fe-row" },
      h("span", { cls: `fe-dot ${st.saves[a].prof ? "is-prof" : ""}` }), h("span", { cls: "fe-grow", text: ABIL_NAME[a], ...whyData(whyOf(st, `save:${a}`)) }),
      rollButton(ctl, sgn(st.saves[a].mod), `${ABIL_NAME[a]} save`, st.saves[a].mod, { kind: "save", abil: a }, who, whyOf(st, `save:${a}`))))),
    skills: h("div", { cls: "fe-rows" }, ...st.skills.map(k => h("div", { cls: "fe-row" },
      h("span", { cls: `fe-dot ${k.prof ? "is-prof" : ""} ${k.expertise ? "is-expert" : ""}` }),
      h("span", { cls: "fe-grow", text: titleCase(k.id), ...whyData(whyOf(st, `skill:${k.id}`)) }), h("span", { cls: "fe-faint", text: ABIL_NAME[k.abil] }),
      rollButton(ctl, sgn(k.mod), titleCase(k.id), k.mod, { kind: "skill", abil: k.abil, skill: k.id }, who, whyOf(st, `skill:${k.id}`))))),
  };
}
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

export const RENDER: Record<string, Render> = {
  identity: (ctl, st) => h("div", { cls: "fe-identity" }, h("span", { cls: "fe-name", text: st.name }), h("span", { cls: "fe-muted", text: st.label })),
  inspiration: ctl => btn("Inspiration", () => ctl.dispatch({ type: "inspiration", on: !ctl.character!.inspiration }), ctl.character?.inspiration ? "is-on" : ""),
  prof: (ctl, st) => h("span", { cls: "fe-kv" }, h("span", { cls: "fe-muted", text: "Proficiency bonus " }), sgn(st.prof)),
  xp: ctl => xpFeature(ctl),
  "level-up": ctl => levelUpFeature(ctl),
  features: (ctl, st) => featuresFeature(ctl, st),
  ac: (ctl, st) => stat("AC", String(st.ac.value), whyOf(st, "ac")),
  initiative: (ctl, st) => stat("Initiative", rollButton(ctl, sgn(st.initiative), "Initiative", st.initiative, { kind: "initiative", abil: "dex" }, undefined, whyOf(st, "initiative")), whyOf(st, "initiative"), true),
  speed: (ctl, st) => stat("Speed", `${st.speed.value}${st.speed.sources.length ? "*" : ""}${st.speed.other ? ` (${st.speed.other})` : ""}`, whyOf(st, "speed")),
  "passive-perception": (ctl, st) => stat("Passive Perception", String(st.passivePerception), whyOf(st, "passive:perception")),
  hp: (ctl, st) => hpBlock(ctl, st),
  "hp-controls": ctl => hpControls(ctl),
  coins: ctl => card("Coins", coinsRow(ctl)),
  "hit-dice": (ctl, st) => card("Hit Dice", ...st.hitDice.map(d => h("div", { cls: "fe-kv" },
    h("span", { text: `${d.die} ${d.max - d.used} / ${d.max}` }), btn("Spend 1", () => ctl.spendHitDie(d.die))))),
  "death-saves": ctl => { const ds = ctl.character!.deathSaves;
    return h("div", { cls: "fe-kv fe-ds" }, h("span", { text: "Death saves" }),
      h("span", {}, "S ", pips(3, ds.successes, n => ctl.dispatch({ type: "deathSave", which: "successes", value: n }), "is-s"),
        " F ", pips(3, ds.failures, n => ctl.dispatch({ type: "deathSave", which: "failures", value: n }), "is-f"))); },
  conditions: ctl => conditionChips(ctl, ctl.value.conditions),
  concentration: ctl => concentrationFeature(ctl),
  toggles: (ctl, st) => togglesFeature(ctl, st),
  spells: (ctl, st) => spellsFeature(ctl, st),
  "pinned-spells": (ctl, st) => pinnedSpellsFeature(ctl, st),
  combos: (ctl, st) => combosFeature(ctl, st),
  "pinned-combos": (ctl, st) => pinnedCombosFeature(ctl, st),
  "active-effects": (ctl, st) => activeEffectsFeature(ctl, st),
  abilities: (ctl, st) => card("Abilities", checks(ctl, st).abilities),
  saves: (ctl, st) => card("Saving throws", checks(ctl, st).saves),
  skills: (ctl, st) => card("Skills", checks(ctl, st).skills),
  attacks: (ctl, st) => card("Attacks", attacksList(ctl, st)),
  "spell-dc": (ctl, st) => h("div", { cls: "fe-kv" }, st.spellcasting
    ? h("span", {}, h("span", { text: `Spell save DC ${st.spellcasting.dc}`, ...whyData(whyOf(st, "spell-dc")) }), " · ", h("span", { text: `spell attack ${sgn(st.spellcasting.attack)}`, ...whyData(whyOf(st, "spell-attack")) }))
    : "No spellcasting"),
  "spell-slots": (ctl, st) => card("Spell slots", ...st.slots.map(s => h("div", { cls: "fe-kv" },
    h("span", { text: s.level === "pact" ? `Pact (level ${s.pactLevel})` : `Level ${s.level}` }),
    pips(s.max, s.used, n => ctl.dispatch({ type: "slot", level: s.level, used: n }))))),
  resources: (ctl, st) => { const c = ctl.character!, r = ctl.host.registry;
    const charged = c.inventory.map((e, i) => ({ e, i, it: e.id ? r.get<ItemData>("item", e.id)?.data : undefined })).filter(x => x.it?.charges && (!x.it.attunement || x.e.attuned));
    const pinned = pinnedTraits(ctl, st), derived = st.resources.filter(x => x.derived && !pinned.covered.has(x.id));
    const items = pinnedItems(ctl), itemRows = items.map(x => x.row);
    const el = card("Resources and charges", ...pinned.rows, ...itemRows,
      ...derived.map(x => h("div", { cls: "fe-kv", data: { resource: x.id } }, h("span", { text: x.unlimited ? x.name : `${x.name}: ${Math.max(0, x.max - x.used)} of ${x.max} left` }),
        usesPips(x, n => ctl.dispatch({ type: "uses", id: x.id, used: n })))),
      ...c.resources.map((res, i) => {
        // `track: progress` (downtime, training, crafting) counts up toward max instead of spending uses down.
        const progress = (res as { track?: string }).track === "progress", setUsed = (n: number) => ctl.dispatch({ type: "resource", index: i, used: n });
        return h("div", { cls: "fe-kv" }, h("span", { text: progress ? res.name : `${res.name} (${res.reset})` }),
          progress ? bar(res.max, res.used, setUsed, "progress") : pips(res.max, res.used, setUsed));
      }),
      ...charged.filter(x => !items.some(p => p.index === x.i)).map(x => h("div", { cls: "fe-kv" }, h("span", { text: `${x.it!.name} charges` }), pips(x.it!.charges!.max, x.e.charges?.used ?? 0, n => ctl.dispatch({ type: "charges", index: x.i, used: n })))));
    if (!pinned.rows.length && !itemRows.length && !derived.length && !c.resources.length && !charged.length) el.hidden = true;
    return el; },
  rests: ctl => h("div", { cls: "fe-rests" }, ...activeRests(ctl.rules()).map(r => btn(r.label, () => ctl.open({ kind: "rest", id: r.id })))),
  inventory: (ctl, st) => inventoryFeature(ctl, st),
  companions: ctl => { const c = ctl.character!, sts = ctl.companionStats(), r = ctl.host.registry;
    return card("Companions", ...c.companions.map((comp, i) => {
      const st = sts[i];
      if (!st) return h("div", { cls: "fe-comp is-missing" }, h("span", { text: `${comp.name}: ${comp.creature} (missing from compendium)` }),
        ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeCompanion", index: i })) : null);
      const ch = checks(ctl, st, i);
      const traits = r.get<CreatureData>("creature", comp.creature)?.data.traits ?? [];
      return h("div", { cls: "fe-comp", data: { companion: String(i) } },
        h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: st.name }), h("span", { cls: "fe-muted", text: st.label })),
        h("div", { cls: "fe-stats" }, stat("AC", String(st.ac.value)), stat("Initiative", rollButton(ctl, sgn(st.initiative), `${st.name} initiative`, st.initiative, { kind: "initiative", abil: "dex" }, i)),
          stat("Speed", `${st.speed.value}${st.speed.other ? ` (${st.speed.other})` : ""}`)),
        hpBlock(ctl, st), hpControls(ctl, i), conditionChips(ctl, comp.conditions, i), ch.abilities,
        st.skills.length ? ch.skills : null, attacksList(ctl, st, i),
        ...traits.map((t, ti) => h("div", { cls: "fe-note" }, h("b", { text: t.name + ". ", data: { ref: `trait:${comp.creature}:${ti}` } }), t.text)),
        ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeCompanion", index: i })) : null);
    }), btn("Add companion", () => ctl.open({ kind: "add-companion" }))); },
  traits: (ctl, st) => { if (ctl.character) return traitsFeature(ctl, st);
    const n = ctl.value.type === "5e-npc" ? ctl.value : undefined;
    const traits = (n && ctl.host.registry.get<CreatureData>("creature", n.creature)?.data.traits) || [];
    return card("Traits", ...traits.map((t, ti) => h("div", { cls: "fe-note" }, h("b", { text: t.name + ". ", data: { ref: `trait:${n!.creature}:${ti}` } }), t.text))); },
  "roll-mode": ctl => h("div", { cls: "fe-seg" }, ...(["dis", "normal", "adv"] as const).map(m =>
    btn({ dis: "Disadvantage", normal: "Normal", adv: "Advantage" }[m], () => ctl.setMode(m), ctl.mode === m ? "is-on" : ""))),
  "roll-log": ctl => btn(`Roll log${ctl.host.log.length ? ` (${ctl.host.log.length})` : ""}`, () => ctl.open({ kind: "log" })),
  "play-edit": ctl => h("div", { cls: "fe-kv" }, h("div", { cls: "fe-seg" }, btn("Play", () => ctl.setEditing(false), ctl.editing ? "" : "is-on"), btn("Edit", () => ctl.setEditing(true), ctl.editing ? "is-on" : "")),
    ctl.editing ? btn("Customize sheet", () => ctl.open({ kind: "customize" })) : null),
  notes: ctl => { const el = h("div", { cls: "fe-notes" }); if (ctl.host.renderMarkdown && ctl.host.body) ctl.host.renderMarkdown(ctl.host.body, el); else el.textContent = ctl.host.body ?? ""; return el; },
};
