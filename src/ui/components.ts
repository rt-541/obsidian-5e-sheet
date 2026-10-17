import type { ConditionData, CreatureData, ItemData } from "../content/types";
import type { ActorStats } from "../core/derive";
import { ABILS, type Abil, type Effects } from "../core/types";
import { activeRests } from "../rules";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";
import { concentrationFeature, spellsFeature } from "./spells-ui";

export type Render = (ctl: SheetController, st: ActorStats) => HTMLElement;
const card = (title: string, ...kids: (Node | null | false)[]) => h("div", { cls: "fe-card" }, title ? h("div", { cls: "fe-card-title", text: title }) : null, ...kids);
const stat = (label: string, value: Node | string, title?: string) => h("div", { cls: "fe-stat", ...(title ? { title } : {}) }, h("div", { cls: "fe-stat-v" }, value), h("div", { cls: "fe-stat-l", text: label }));
const btn = (text: string, onClick: (e: MouseEvent) => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text, on: { click: onClick } });
const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export function describeEffects(e: Effects): string {
  const out: string[] = [];
  if (e.adv?.length) out.push("Adv: " + e.adv.join(", "));
  if (e.dis?.length) out.push("Disadv: " + e.dis.join(", "));
  if (e.autofail?.length) out.push("Auto-fail: " + e.autofail.join(", "));
  for (const m of e.modifiers ?? []) out.push(`${m.target} ${typeof m.value === "number" ? sgn(m.value) : m.value}`);
  if (e.resist?.length) out.push("Resist " + e.resist.join(", "));
  if (e.note) out.push(e.note);
  return out.join(" · ");
}

/** Pips: click pip i to set used = i+1, or i if it was the last used one. */
export function pips(max: number, used: number, set: (n: number) => void, cls = "") {
  return h("span", { cls: "fe-pips" }, ...Array.from({ length: max }, (_, i) =>
    h("button", { cls: `fe-pip ${cls} ${i < used ? "is-used" : ""}`, attrs: { "aria-label": `${i + 1} of ${max}` }, on: { click: () => set(used === i + 1 ? i : i + 1) } })));
}

export function rollButton(ctl: SheetController, label: string, title: string, mod: number, target: Parameters<SheetController["roll"]>[2], who?: number) {
  return h("button", { cls: "fe-roll", text: label, on: { click: (e: MouseEvent) => ctl.roll(title, mod, target, e, who) } });
}

function hpBlock(ctl: SheetController, st: ActorStats) {
  const pct = st.hp.max ? Math.round(100 * st.hp.current / st.hp.max) : 0;
  return h("div", { cls: "fe-hp" },
    h("div", { cls: "fe-hp-line" }, h("span", { cls: "fe-hp-n", text: String(st.hp.current) }),
      h("small", { text: ` / ${st.hp.max}${st.hp.maxReduced ? " (halved)" : ""} · temp ${st.hp.temp}` })),
    h("div", { cls: "fe-bar" }, h("div", { cls: "fe-bar-fill", attrs: { style: `width:${pct}%` } })));
}
function hpControls(ctl: SheetController, who?: number) {
  const amt = h("input", { cls: "fe-amt", attrs: { type: "number", min: "1", value: String(ctl.amount), "aria-label": "Amount" },
    on: { input: (e: Event) => { ctl.amount = Math.max(1, +(e.target as HTMLInputElement).value || 1); } } });
  const act = (type: "damage" | "heal" | "temp") => () => ctl.dispatch({ type, amount: ctl.amount, ...(who !== undefined ? { who: { companion: who } } : {}) });
  return h("div", { cls: "fe-hpctl" }, amt, btn("Damage", act("damage")), btn("Heal", act("heal"), "mod-cta"), btn("Temp", act("temp")));
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
      rollButton(ctl, sgn(st.mods[a]), `${ABIL_NAME[a]} check`, st.mods[a], { kind: "check", abil: a }, who),
      ctl.editing && who === undefined && ctl.character
        ? h("input", { cls: "fe-score", attrs: { type: "number", min: "1", max: "30", value: String(st.abilities[a]), "aria-label": `${ABIL_NAME[a]} score` },
            on: { change: (e: Event) => ctl.dispatch({ type: "ability", abil: a, value: +(e.target as HTMLInputElement).value }) } })
        : h("div", { cls: "fe-tile-s", text: String(st.abilities[a]) })))),
    saves: h("div", { cls: "fe-rows" }, ...ABILS.map(a => h("div", { cls: "fe-row" },
      h("span", { cls: `fe-dot ${st.saves[a].prof ? "is-prof" : ""}` }), h("span", { cls: "fe-grow", text: ABIL_NAME[a] }),
      rollButton(ctl, sgn(st.saves[a].mod), `${ABIL_NAME[a]} save`, st.saves[a].mod, { kind: "save", abil: a }, who)))),
    skills: h("div", { cls: "fe-rows" }, ...st.skills.map(k => h("div", { cls: "fe-row" },
      h("span", { cls: `fe-dot ${k.prof ? "is-prof" : ""} ${k.expertise ? "is-expert" : ""}` }),
      h("span", { cls: "fe-grow", text: titleCase(k.id) }), h("span", { cls: "fe-faint", text: ABIL_NAME[k.abil] }),
      rollButton(ctl, sgn(k.mod), titleCase(k.id), k.mod, { kind: "skill", abil: k.abil, skill: k.id }, who)))),
  };
}
function attacksList(ctl: SheetController, st: ActorStats, who?: number) {
  if (!st.attacks.length) return h("div", { cls: "fe-faint", text: "No attacks" });
  return h("div", { cls: "fe-attacks" }, ...st.attacks.map(a => h("div", { cls: "fe-attack" },
    h("span", { cls: "fe-grow", text: a.name }),
    a.toHit !== undefined ? rollButton(ctl, sgn(a.toHit), `${a.name} to hit`, a.toHit, a.target, who) : h("span", { cls: "fe-faint", text: "" }),
    a.save ? h("span", { cls: "fe-faint", text: `DC ${a.save.dc} ${ABIL_NAME[a.save.abil]}` }) : null,
    a.damage ? h("button", { cls: "fe-roll", text: a.damage, on: { click: () => ctl.damage(`${a.name} damage`, a.damage!) } }) : null,
    a.note ? h("div", { cls: "fe-note", text: a.note }) : null)));
}

export const RENDER: Record<string, Render> = {
  identity: (ctl, st) => h("div", { cls: "fe-identity" }, h("span", { cls: "fe-name", text: st.name }), h("span", { cls: "fe-muted", text: st.label })),
  inspiration: ctl => btn("Inspiration", () => ctl.dispatch({ type: "inspiration", on: !ctl.character!.inspiration }), ctl.character?.inspiration ? "is-on" : ""),
  prof: (ctl, st) => h("span", { cls: "fe-kv" }, h("span", { cls: "fe-muted", text: "Prof " }), sgn(st.prof)),
  xp: ctl => h("span", { cls: "fe-kv" }, h("span", { cls: "fe-muted", text: "XP " }), String(ctl.character?.xp ?? 0)),
  ac: (ctl, st) => stat("AC", String(st.ac.value), st.ac.sources.join(", ")),
  initiative: (ctl, st) => stat("Init", rollButton(ctl, sgn(st.initiative), "Initiative", st.initiative, { kind: "initiative", abil: "dex" })),
  speed: (ctl, st) => stat("Speed", `${st.speed.value}${st.speed.sources.length ? "*" : ""}${st.speed.other ? ` (${st.speed.other})` : ""}`, st.speed.sources.join(", ")),
  "passive-perception": (ctl, st) => stat("Pass. Perc", String(st.passivePerception)),
  hp: (ctl, st) => hpBlock(ctl, st),
  "hp-controls": ctl => hpControls(ctl),
  "hit-dice": (ctl, st) => card("Hit Dice", ...st.hitDice.map(d => h("div", { cls: "fe-kv" },
    h("span", { text: `${d.die} ${d.max - d.used} / ${d.max}` }), btn("Spend 1", () => ctl.spendHitDie(d.die))))),
  "death-saves": ctl => { const ds = ctl.character!.deathSaves;
    return h("div", { cls: "fe-kv fe-ds" }, h("span", { text: "Death saves" }),
      h("span", {}, "S ", pips(3, ds.successes, n => ctl.dispatch({ type: "deathSave", which: "successes", value: n }), "is-s"),
        " F ", pips(3, ds.failures, n => ctl.dispatch({ type: "deathSave", which: "failures", value: n }), "is-f"))); },
  conditions: ctl => conditionChips(ctl, ctl.value.conditions),
  concentration: ctl => concentrationFeature(ctl),
  spells: (ctl, st) => spellsFeature(ctl, st),
  "active-effects": (ctl, st) => card("Active effects",
    ...(st.effects.length ? st.effects.map(e => h("div", { cls: "fe-kv" }, h("span", { text: e.source, data: { ref: `effect:${e.source}` } }), h("span", { cls: "fe-muted", text: describeEffects(e.effects) }))) : [h("div", { cls: "fe-faint", text: "None" })]),
    st.missing.length ? h("div", { cls: "fe-warn", text: `Missing from compendium: ${st.missing.join(", ")}` }) : null),
  abilities: (ctl, st) => card("Abilities", checks(ctl, st).abilities),
  saves: (ctl, st) => card("Saving throws", checks(ctl, st).saves),
  skills: (ctl, st) => card("Skills", checks(ctl, st).skills),
  attacks: (ctl, st) => card("Attacks", attacksList(ctl, st)),
  "spell-dc": (ctl, st) => h("div", { cls: "fe-kv" }, st.spellcasting ? `Spell DC ${st.spellcasting.dc} · attack ${sgn(st.spellcasting.attack)}` : "No spellcasting"),
  "spell-slots": (ctl, st) => card("Spell slots", ...st.slots.map(s => h("div", { cls: "fe-kv" },
    h("span", { text: s.level === "pact" ? `Pact (level ${s.pactLevel})` : `Level ${s.level}` }),
    pips(s.max, s.used, n => ctl.dispatch({ type: "slot", level: s.level, used: n }))))),
  resources: ctl => { const c = ctl.character!, r = ctl.host.registry;
    const charged = c.inventory.map((e, i) => ({ e, i, it: e.id ? r.get<ItemData>("item", e.id)?.data : undefined })).filter(x => x.it?.charges && (!x.it.attunement || x.e.attuned));
    return card("Resources and charges",
      ...c.resources.map((res, i) => h("div", { cls: "fe-kv" }, h("span", { text: `${res.name} (${res.reset})` }), pips(res.max, res.used, n => ctl.dispatch({ type: "resource", index: i, used: n })))),
      ...charged.map(x => h("div", { cls: "fe-kv" }, h("span", { text: `${x.it!.name} charges` }), pips(x.it!.charges!.max, x.e.charges?.used ?? 0, n => ctl.dispatch({ type: "charges", index: x.i, used: n }))))); },
  rests: ctl => h("div", { cls: "fe-rests" }, ...activeRests(ctl.rules()).map(r => btn(r.label, () => ctl.open({ kind: "rest", id: r.id })))),
  inventory: (ctl, st) => { const c = ctl.character!, r = ctl.host.registry;
    return card("Inventory", ...c.inventory.map((e, i) => {
      const it = e.id ? r.get<ItemData>("item", e.id) : undefined;
      const name = it ? it.name : e.name ?? `${e.id} (missing from compendium)`;
      return h("div", { cls: `fe-inv ${it || e.name ? "" : "is-missing"}` },
        h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: name, ...(it && e.id ? { data: { ref: `item:${e.id}` } } : {}) }), it?.source === "vault" ? h("span", { cls: "fe-src", text: "Homebrew" }) : null,
          h("div", { cls: "fe-faint", text: [e.qty > 1 ? `x${e.qty}` : "", it?.data.rarity ?? "", it?.data.attunement ? (e.attuned ? "attuned" : "requires attunement") : ""].filter(Boolean).join(" · ") })),
        it && it.data.kind !== "gear" && it.data.kind !== "consumable" ? btn(e.equipped ? "Equipped" : "Equip", () => ctl.dispatch({ type: "equip", index: i, on: !e.equipped }), e.equipped ? "is-on" : "") : null,
        it?.data.attunement ? btn(e.attuned ? "Attuned" : "Attune", () => ctl.dispatch({ type: "attune", index: i, on: !e.attuned }), e.attuned ? "is-on" : "") : null,
        ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeItem", index: i })) : null);
    }),
    h("div", { cls: "fe-kv" }, h("span", { text: Object.entries(c.coins).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(" ") || "No coins" }),
      h("span", { cls: "fe-muted", text: `${st.carry.weight} / ${st.carry.capacity} lb · attuned ${st.attunedCount}/3` })),
    btn("Add from compendium", () => ctl.open({ kind: "compendium" }))); },
  companions: ctl => { const c = ctl.character!, sts = ctl.companionStats(), r = ctl.host.registry;
    return card("Companions", ...c.companions.map((comp, i) => {
      const st = sts[i];
      if (!st) return h("div", { cls: "fe-comp is-missing" }, h("span", { text: `${comp.name}: ${comp.creature} (missing from compendium)` }),
        ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeCompanion", index: i })) : null);
      const ch = checks(ctl, st, i);
      const traits = r.get<CreatureData>("creature", comp.creature)?.data.traits ?? [];
      return h("div", { cls: "fe-comp", data: { companion: String(i) } },
        h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: st.name }), h("span", { cls: "fe-muted", text: st.label })),
        h("div", { cls: "fe-stats" }, stat("AC", String(st.ac.value)), stat("Init", rollButton(ctl, sgn(st.initiative), `${st.name} initiative`, st.initiative, { kind: "initiative", abil: "dex" }, i)),
          stat("Speed", `${st.speed.value}${st.speed.other ? ` (${st.speed.other})` : ""}`)),
        hpBlock(ctl, st), hpControls(ctl, i), conditionChips(ctl, comp.conditions, i), ch.abilities,
        st.skills.length ? ch.skills : null, attacksList(ctl, st, i),
        ...traits.map((t, ti) => h("div", { cls: "fe-note" }, h("b", { text: t.name + ". ", data: { ref: `trait:${comp.creature}:${ti}` } }), t.text)),
        ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeCompanion", index: i })) : null);
    }), btn("Add companion", () => ctl.open({ kind: "add-companion" }))); },
  traits: ctl => { const n = ctl.value.type === "5e-npc" ? ctl.value : undefined;
    const traits = (n && ctl.host.registry.get<CreatureData>("creature", n.creature)?.data.traits) || [];
    return card("Traits", ...traits.map((t, ti) => h("div", { cls: "fe-note" }, h("b", { text: t.name + ". ", data: { ref: `trait:${n!.creature}:${ti}` } }), t.text))); },
  "roll-mode": ctl => h("div", { cls: "fe-seg" }, ...(["dis", "normal", "adv"] as const).map(m =>
    btn({ dis: "Disadv.", normal: "Normal", adv: "Adv." }[m], () => ctl.setMode(m), ctl.mode === m ? "is-on" : ""))),
  "roll-log": ctl => btn(`Roll log${ctl.host.log.length ? ` (${ctl.host.log.length})` : ""}`, () => ctl.open({ kind: "log" })),
  "play-edit": ctl => h("div", { cls: "fe-kv" }, h("div", { cls: "fe-seg" }, btn("Play", () => ctl.setEditing(false), ctl.editing ? "" : "is-on"), btn("Edit", () => ctl.setEditing(true), ctl.editing ? "is-on" : "")),
    ctl.editing ? btn("Customize sheet", () => ctl.open({ kind: "customize" })) : null),
  notes: ctl => { const el = h("div", { cls: "fe-notes" }); if (ctl.host.renderMarkdown && ctl.host.body) ctl.host.renderMarkdown(ctl.host.body, el); else el.textContent = ctl.host.body ?? ""; return el; },
};
