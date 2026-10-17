import type { ConditionData, CreatureData, ItemData } from "../content/types";
import type { CompanionKind } from "../core/character";
import { MODULES } from "../rules";
import type { Panel, SheetController } from "./controller";
import { describeEffects } from "./components";
import { h } from "./h";

const KINDS: CompanionKind[] = ["familiar", "companion", "steed", "summon", "sidekick"];
let condFilter: "all" | "active" | "srd" | "vault" = "all", condQuery = "";

function conditionsPanel(ctl: SheetController, who?: number): HTMLElement {
  const r = ctl.host.registry;
  const conds = who === undefined ? ctl.value.conditions : ctl.character!.companions[who].conditions;
  const entries = r.list<ConditionData>("condition");
  const rows = entries.filter(e => (condFilter === "all" || (condFilter === "active" ? conds[e.id] : e.source === condFilter)) && e.name.toLowerCase().includes(condQuery));
  const set = (id: string, level: number) => ctl.dispatch({ type: "condition", id, level, ...(who !== undefined ? { who: { companion: who } } : {}) });
  const search = h("input", { cls: "fe-search", attrs: { placeholder: "Search conditions", value: condQuery },
    on: { input: (e: Event) => { condQuery = (e.target as HTMLInputElement).value.toLowerCase(); ctl.emit(); } } });
  return h("div", { cls: "fe-cond-panel" }, search,
    h("div", { cls: "fe-filters" }, ...(["all", "active", "srd", "vault"] as const).map(f =>
      h("button", { cls: `fe-btn ${condFilter === f ? "is-on" : ""}`, text: { all: "All", active: "Active", srd: "SRD", vault: "Homebrew" }[f], on: { click: () => { condFilter = f; ctl.emit(); } } }))),
    h("div", { cls: "fe-ctab" }, ...rows.map(e => {
      const lvl = conds[e.id] ?? 0, d = e.data;
      const rules = h("div", { cls: "fe-rules", text: (d.rules ?? "") + (e.path ? `\n\nSource note: ${e.path}` : "") });
      rules.hidden = true;
      return h("div", { cls: `fe-crow ${lvl ? "is-active" : ""}`, data: { cond: e.id } },
        h("div", { cls: "fe-grow", on: { click: () => { rules.hidden = !rules.hidden; } } },
          h("span", { cls: "fe-name", text: e.name }), h("span", { cls: `fe-src ${e.source === "vault" ? "is-hb" : ""}`, text: e.source === "vault" ? "Homebrew" : "SRD" }),
          h("div", { cls: "fe-muted", text: describeEffects(d.levels ? (d.levelEffects?.[Math.max(1, lvl)] ?? {}) : d.effects) }), rules),
        d.levels
          ? h("div", { cls: "fe-lvl" }, h("button", { cls: "fe-btn", text: "-", on: { click: () => set(e.id, lvl - 1) } }), h("span", { text: `Level ${lvl}` }), h("button", { cls: "fe-btn", text: "+", on: { click: () => set(e.id, lvl + 1) } }))
          : h("button", { cls: `fe-switch ${lvl ? "is-on" : ""}`, attrs: { "aria-label": `Toggle ${e.name}` }, on: { click: () => set(e.id, lvl ? 0 : 1) } }));
    })),
    h("div", { cls: "fe-faint", text: "SRD entries ship with the plugin. Homebrew entries are notes in your compendium folder (type: 5e-condition)." }));
}

function restPanel(ctl: SheetController, id: string): HTMLElement {
  const excursion = id === "night";
  const opt = (label: string, key: "samePlace" | "safeHaven") => h("label", { cls: "fe-kv" },
    h("input", { attrs: { type: "checkbox", ...(ctl.restOpts[key] ? { checked: "" } : {}) }, on: { change: (e: Event) => { ctl.restOpts[key] = (e.target as HTMLInputElement).checked; ctl.emit(); } } }), label);
  const st = ctl.stats()!;
  return h("div", {},
    excursion ? opt("Same place as last night", "samePlace") : null, excursion ? opt("Safe haven", "safeHaven") : null,
    h("div", { cls: "fe-muted", text: "This rest will:" }), h("ul", {}, ...ctl.restPreview(id).map(x => h("li", { text: x }))),
    id === "short" || (excursion && !ctl.restPreview(id)[0]?.startsWith("Good Rest"))
      ? h("div", {}, ...st.hitDice.map(d => h("div", { cls: "fe-kv" }, h("span", { text: `${d.die}: ${d.max - d.used} left` }), h("button", { cls: "fe-btn", text: "Spend 1", on: { click: () => ctl.spendHitDie(d.die) } }))))
      : null,
    h("div", { cls: "fe-kv" }, h("button", { cls: "fe-btn", text: "Cancel", on: { click: () => ctl.close() } }), h("button", { cls: "fe-btn mod-cta", text: "Apply", data: { act: "rest-apply" }, on: { click: () => ctl.rest(id) } })));
}

function compendiumPanel(ctl: SheetController): HTMLElement {
  const owned = new Set(ctl.character!.inventory.map(e => e.id));
  return h("div", {}, ...ctl.host.registry.list<ItemData>("item").map(e => h("div", { cls: "fe-inv" },
    h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: e.name }), h("span", { cls: `fe-src ${e.source === "vault" ? "is-hb" : ""}`, text: e.source === "vault" ? "Homebrew" : "SRD" }),
      h("div", { cls: "fe-faint", text: [e.data.rarity, e.data.attunement ? "attunement" : "", e.path ?? ""].filter(Boolean).join(" · ") })),
    owned.has(e.id) ? h("span", { cls: "fe-faint", text: "owned" }) : h("button", { cls: "fe-btn", text: "Add", data: { item: e.id }, on: { click: () => ctl.dispatch({ type: "addItem", id: e.id }) } }))));
}

function addCompanionPanel(ctl: SheetController): HTMLElement {
  let kind: CompanionKind = "familiar";
  const name = h("input", { cls: "fe-search", attrs: { placeholder: "Name (optional)" } });
  const sel = h("select", { on: { change: (e: Event) => { kind = (e.target as HTMLSelectElement).value as CompanionKind; } } }, ...KINDS.map(k => h("option", { text: k, attrs: { value: k } })));
  return h("div", {}, h("div", { cls: "fe-kv" }, name, sel),
    ...ctl.host.registry.list<CreatureData>("creature").map(e => h("div", { cls: "fe-inv" },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: e.name }), h("span", { cls: "fe-faint", text: ` ${e.data.size} ${e.data.ctype}, AC ${e.data.ac}, HP ${e.data.hp.average}` })),
      h("button", { cls: "fe-btn", text: "Add", data: { creature: e.id }, on: { click: () => { ctl.dispatch({ type: "addCompanion", creature: e.id, name: name.value.trim() || e.name, kind }); ctl.close(); } } }))));
}

function customizePanel(ctl: SheetController, features: readonly string[]): HTMLElement {
  const visible = new Set(ctl.visible([...features])), rules = ctl.rules();
  return h("div", {},
    h("div", { cls: "fe-card-title", text: "Rules" }),
    ...MODULES.map(m => h("label", { cls: "fe-kv" }, h("span", { text: m.title }),
      h("button", { cls: `fe-switch ${rules[m.id] ? "is-on" : ""}`, data: { rule: m.id }, on: { click: () => ctl.setRule(m.id, !rules[m.id]) } }))),
    h("div", { cls: "fe-card-title", text: "Sections" }),
    ...features.filter(f => f !== "identity" && f !== "play-edit").map(f => h("label", { cls: "fe-kv" }, h("span", { text: f }),
      h("button", { cls: `fe-switch ${visible.has(f) ? "is-on" : ""}`, data: { section: f }, on: { click: () => ctl.setHidden(f, visible.has(f)) } }))));
}

function logPanel(ctl: SheetController): HTMLElement {
  if (!ctl.host.log.length) return h("div", { cls: "fe-faint", text: "No rolls yet." });
  return h("div", {}, ...ctl.host.log.map(r => h("div", { cls: "fe-log" }, h("div", { text: r.title }), h("b", { text: String(r.total) }), " ", h("span", { cls: "fe-mono", text: r.detail }))));
}

const TITLES: Record<Panel["kind"], string> = { conditions: "Conditions", log: "Roll log", rest: "Rest", compendium: "Item compendium", "add-companion": "Add companion", customize: "Customize sheet" };

export function renderPanel(ctl: SheetController, p: Panel, features: readonly string[]): HTMLElement {
  const body = p.kind === "conditions" ? conditionsPanel(ctl, p.who) : p.kind === "rest" ? restPanel(ctl, p.id) : p.kind === "compendium" ? compendiumPanel(ctl)
    : p.kind === "add-companion" ? addCompanionPanel(ctl) : p.kind === "customize" ? customizePanel(ctl, features) : logPanel(ctl);
  return h("div", { cls: "fe-panel", data: { panel: p.kind } },
    h("div", { cls: "fe-panel-head" }, h("span", { cls: "fe-grow fe-name", text: TITLES[p.kind] }), h("button", { cls: "fe-btn", text: "Close", on: { click: () => ctl.close() } })),
    h("div", { cls: "fe-panel-body" }, body));
}
