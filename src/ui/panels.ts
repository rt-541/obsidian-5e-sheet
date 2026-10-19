import { sourceLabel } from "../content/registry";
import type { ConditionData, CreatureData } from "../content/types";
import { MODULES } from "../rules";
import { isGood } from "../rules/rests";
import type { Panel, SheetController } from "./controller";
import { comboForm } from "./combos-ui";
import { describeEffects, playBadge, restModeControl } from "./widgets";
import { detailCard } from "./details";
import { h } from "./h";
import { levelUpPanel } from "./levelup-ui";
import { addSpellPanel, castPanel } from "./spells-ui";
import { addCompanionPanel } from "./companion-ui";
import { addItemPanel } from "./additem-ui";

let condFilter: "all" | "active" | "srd" | "vault" = "all", condQuery = "";

function conditionsPanel(ctl: SheetController, who?: number): HTMLElement {
  const r = ctl.host.registry;
  const conds = who === undefined ? ctl.value.conditions : ctl.character!.companions[who].conditions;
  const all = r.list<ConditionData>("condition");
  const shown = (e: (typeof all)[number]) => (condFilter === "all" || (condFilter === "active" ? conds[e.id] : e.source === condFilter)) && e.name.toLowerCase().includes(condQuery);
  const rows = all.filter(e => e.data.kind !== "disease" && shown(e)), diseases = all.filter(e => e.data.kind === "disease" && shown(e));
  const set = (id: string, level: number) => ctl.dispatch({ type: "condition", id, level, ...(who !== undefined ? { who: { companion: who } } : {}) });
  const search = h("input", { cls: "fe-search", attrs: { type: "search", placeholder: "Search conditions", value: condQuery },
    on: { input: (e: Event) => { condQuery = (e.target as HTMLInputElement).value.toLowerCase(); ctl.emit(); } } });
  const row = (e: (typeof all)[number]) => {
    const lvl = conds[e.id] ?? 0, d = e.data;
    const rules = h("div", { cls: "fe-rules", text: (d.rules ?? "") + (e.path ? `\n\nSource note: ${e.path}` : "") });
    rules.hidden = true;
    return h("div", { cls: `fe-crow ${lvl ? "is-active" : ""}`, data: { cond: e.id } },
      h("div", { cls: "fe-grow", on: { click: () => { rules.hidden = !rules.hidden; } } },
        h("span", { cls: "fe-name", text: e.name, data: { ref: `condition:${e.id}`, noclick: "" } }), playBadge(sourceLabel(e)),
        h("div", { cls: "fe-muted", text: describeEffects(d.levels ? (d.levelEffects?.[Math.max(1, lvl)] ?? {}) : d.effects) }), rules),
      d.levels
        ? h("div", { cls: "fe-lvl" }, h("button", { cls: "fe-btn", text: "-", on: { click: () => set(e.id, lvl - 1) } }), h("span", { text: `Level ${lvl}` }), h("button", { cls: "fe-btn", text: "+", on: { click: () => set(e.id, lvl + 1) } }))
        : h("button", { cls: `fe-switch ${lvl ? "is-on" : ""}`, attrs: { "aria-label": `Toggle ${e.name}` }, on: { click: () => set(e.id, lvl ? 0 : 1) } }));
  };
  return h("div", { cls: "fe-cond-panel" }, search,
    h("div", { cls: "fe-filters" }, ...(["all", "active", "srd", "vault"] as const).map(f =>
      h("button", { cls: `fe-btn ${condFilter === f ? "is-on" : ""}`, text: { all: "All", active: "Active", srd: "Built in", vault: "Homebrew" }[f], on: { click: () => { condFilter = f; ctl.emit(); } } }))),
    h("div", { cls: "fe-ctab", data: { group: "conditions" } }, ...rows.map(row)),
    diseases.length ? h("div", { cls: "fe-card-title", text: "Diseases" }) : null,
    diseases.length ? h("div", { cls: "fe-ctab", data: { group: "diseases" } }, ...diseases.map(row)) : null,
    h("div", { cls: "fe-faint", text: "Built-in entries come with the plugin. Homebrew entries are notes you add to your compendium folder." }));
}

function restPanel(ctl: SheetController, id: string): HTMLElement {
  const excursion = id === "night";
  const st = ctl.stats()!;
  const haven = h("div", { cls: "fe-safe-haven" },
    h("label", { cls: "fe-kv fe-rest-opt fe-safe-haven-row" }, h("span", { text: "Resting in a safe haven (GM decides)" }),
      h("button", { cls: `fe-switch ${ctl.restOpts.safeHaven ? "is-on" : ""}`.trim(), data: { opt: "safe-haven" }, attrs: { role: "switch", "aria-checked": String(!!ctl.restOpts.safeHaven), "aria-label": "Resting in a safe haven" },
        on: { click: () => { ctl.restOpts.safeHaven = !ctl.restOpts.safeHaven; ctl.emit(); } } })),
    h("div", { cls: "fe-faint", text: "A safe haven turns tonight into a Good Rest: full recovery." }),
    h("div", { cls: "fe-muted", data: { nights: "" }, text: `Night ${isGood(ctl.restCtx(), ctl.restOpts).nights} in this place (3 nights = Good Rest)` }));
  return h("div", {},
    excursion ? h("label", { cls: "fe-kv fe-rest-opt" }, h("span", { text: "Same place as last night" }),
      h("button", { cls: `fe-switch ${ctl.restOpts.samePlace ? "is-on" : ""}`.trim(), data: { opt: "same-place" }, attrs: { role: "switch", "aria-checked": String(!!ctl.restOpts.samePlace), "aria-label": "Same place as last night" },
        on: { click: () => { ctl.restOpts.samePlace = !ctl.restOpts.samePlace; ctl.emit(); } } })) : null, excursion ? haven : null,
    h("div", { cls: "fe-muted", text: "This rest will:" }), h("ul", {}, ...ctl.restPreview(id).map(x => h("li", { text: x }))),
    id === "short" || (excursion && !ctl.restPreview(id)[0]?.startsWith("Good Rest"))
      ? h("div", {}, ...st.hitDice.map(d => h("div", { cls: "fe-kv" }, h("span", { text: `${d.die}: ${d.max - d.used} left` }), h("button", { cls: "fe-btn", text: "Spend 1", on: { click: () => ctl.spendHitDie(d.die) } }))))
      : null,
    h("div", { cls: "fe-kv" }, h("button", { cls: "fe-btn", text: "Cancel", on: { click: () => ctl.close() } }), h("button", { cls: "fe-btn mod-cta", text: "Apply", data: { act: "rest-apply" }, on: { click: () => ctl.rest(id) } })));
}

/** Plain-word names for the sheet sections in Customize, one for every id in CHARACTER_FEATURES except identity and play-edit. */
export const SECTION_LABELS: Record<string, string> = {
  inspiration: "Inspiration", prof: "Proficiency bonus", xp: "Experience points (XP)", "level-up": "Level up button",
  ac: "Armor Class", initiative: "Initiative", speed: "Speed", "passive-perception": "Passive Perception",
  hp: "Hit points", "hp-controls": "Damage and healing buttons", coins: "Coins", "hit-dice": "Hit dice", "death-saves": "Death saves",
  conditions: "Conditions", concentration: "Concentration", toggles: "Switches (Rage, stances and the like)", "active-effects": "Active effects",
  abilities: "Ability scores", saves: "Saving throws", skills: "Skills",
  attacks: "Attacks", "attack-options": "Attack options (focus dice, extra damage)", "pinned-spells": "Pinned spells", "pinned-combos": "Pinned combos", combos: "Combos",
  "spell-dc": "Spell save DC", "spell-slots": "Spell slots", spells: "Spells", resources: "Class resources", rations: "Rations",
  traits: "Features and traits (main page)", rests: "Rest buttons", settings: "Settings (rest mode, Hex / Trad, own dice)", features: "Features page", inventory: "Inventory", companions: "Companions",
  "roll-mode": "Advantage and disadvantage", "roll-log": "Roll log", notes: "Notes",
};
/** The sections as the sheet is laid out. */
export const SECTION_GROUPS: { title: string; ids: string[] }[] = [
  { title: "Header", ids: ["inspiration", "prof", "xp", "level-up", "roll-log"] },
  { title: "Combat", ids: ["ac", "initiative", "speed", "passive-perception", "hp", "hp-controls", "hit-dice", "death-saves", "conditions", "active-effects", "roll-mode", "attacks", "attack-options"] },
  { title: "Resources and rests", ids: ["coins", "resources", "rations", "rests", "settings", "toggles", "traits", "features"] },
  { title: "Checks", ids: ["abilities", "saves", "skills"] },
  { title: "Spells", ids: ["concentration", "spell-dc", "spell-slots", "spells", "pinned-spells"] },
  { title: "Combos", ids: ["combos", "pinned-combos"] },
  { title: "Other", ids: ["inventory", "companions", "notes"] },
];

function customizePanel(ctl: SheetController, features: readonly string[]): HTMLElement {
  const visible = new Set(ctl.visible([...features])), rules = ctl.rules();
  return h("div", {},
    h("div", { cls: "fe-card-title", text: "Resting" }), restModeControl(ctl),
    h("div", { cls: "fe-card-title", text: "Optional rules" }),
    ...MODULES.filter(m => m.id !== "rest-standard" && m.id !== "rest-excursion").map(m => h("label", { cls: "fe-kv" }, h("span", { text: m.title }),
      h("button", { cls: `fe-switch ${rules[m.id] ? "is-on" : ""}`, data: { rule: m.id }, on: { click: () => ctl.setRule(m.id, !rules[m.id]) } }))),
    h("div", { cls: "fe-card-title", text: "Parts of the sheet" }),
    ...SECTION_GROUPS.flatMap(g => {
      const ids = g.ids.filter(f => features.includes(f));
      return ids.length ? [h("div", { cls: "fe-faint", text: g.title }), ...ids.map(f => h("label", { cls: "fe-kv" }, h("span", { text: SECTION_LABELS[f] ?? f }),
        h("button", { cls: `fe-switch ${visible.has(f) ? "is-on" : ""}`, data: { section: f }, on: { click: () => ctl.setHidden(f, visible.has(f)) } })))] : [];
    }));
}

function detailsPanel(ctl: SheetController, ref: string): HTMLElement {
  return detailCard(ref, ctl) ?? h("div", { cls: "fe-faint", text: "No details available." });
}

function logPanel(ctl: SheetController): HTMLElement {
  if (!ctl.host.log.length) return h("div", { cls: "fe-faint", text: "No rolls yet." });
  return h("div", {}, ...ctl.host.log.map(r => h("div", { cls: "fe-log" }, h("div", { text: r.title }), h("b", { text: String(r.total) }), " ", h("span", { cls: "fe-mono", text: r.detail }))));
}

const TITLES: Record<Panel["kind"], string> = { conditions: "Conditions", log: "Roll log", rest: "Rest", compendium: "Add item", "add-companion": "Add companion", customize: "Customize sheet", cast: "Cast spell", "add-spell": "Add spell", details: "Details", "level-up": "Level up", "combo-edit": "Combo" };

export function renderPanel(ctl: SheetController, p: Panel, features: readonly string[]): HTMLElement {
  const body = p.kind === "conditions" ? conditionsPanel(ctl, p.who) : p.kind === "rest" ? restPanel(ctl, p.id) : p.kind === "compendium" ? addItemPanel(ctl)
    : p.kind === "details" ? detailsPanel(ctl, p.ref) : p.kind === "cast" ? castPanel(ctl, p.spell) : p.kind === "add-spell" ? addSpellPanel(ctl, p) : p.kind === "add-companion" ? addCompanionPanel(ctl, p) : p.kind === "customize" ? customizePanel(ctl, features) : p.kind === "level-up" ? levelUpPanel(ctl) : p.kind === "combo-edit" ? comboForm(ctl) : logPanel(ctl);
  const title = p.kind === "add-spell" && p.edit ? (p.edit.mode === "edit" ? "Edit spell" : "Make my own copy") : TITLES[p.kind];
  return h("div", { cls: "fe-panel", data: { panel: p.kind } },
    h("div", { cls: "fe-panel-head" }, h("span", { cls: "fe-grow fe-name", text: title }), h("button", { cls: "fe-btn", text: "Close", on: { click: () => (p.kind === "combo-edit" ? ctl.cancelComboEdit() : ctl.close()) } })),
    h("div", { cls: "fe-panel-body" }, body));
}
