import { sourceLabel } from "../content/registry";
import type { SpellData } from "../content/types";
import { castRow, spellRows, type SpellRow } from "../core/spells";
import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { clear, h, sgn } from "./h";
import { sourceBadge } from "./widgets";

const btn = (text: string, onClick: () => void, cls = "", data?: Record<string, string>) =>
  h("button", { cls: `fe-btn ${cls}`.trim(), text, ...(data ? { data } : {}), on: { click: onClick } });
const ABIL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" } as const;
const levelTitle = (n: number) => n === 0 ? "Cantrips" : `Level ${n}`;

function costLabel(src: Extract<SpellRow["source"], { kind: "item" }>): string {
  const c = src.cost;
  return c.kind === "charges" ? `${c.amount} charge${c.amount === 1 ? "" : "s"}` : c.kind === "perDay" ? `${src.usesLeft ?? c.uses}/${c.uses} per day` : "at will";
}

export function rolls(ctl: SheetController, r: SpellRow): (Node | null)[] {
  return [
    r.attack !== undefined ? h("button", { cls: "fe-roll", text: sgn(r.attack), title: "Spell attack", on: { click: (e: MouseEvent) => ctl.roll(`${r.name} attack`, r.attack!, { kind: "attack", range: r.data?.attack }, e) } }) : null,
    r.dc !== undefined && r.data?.save ? h("span", { cls: "fe-faint", text: `DC ${r.dc} ${ABIL[r.data.save.abil]}` }) : null,
    r.damage ? h("button", { cls: "fe-roll", text: r.damage, title: "Damage", on: { click: () => ctl.damage(`${r.name} damage`, r.damage!) } }) : null,
    r.heal ? h("button", { cls: "fe-roll", text: r.heal, title: "Healing", on: { click: () => ctl.damage(`${r.name} healing`, r.heal!) } }) : null,
  ];
}

function nameCell(r: SpellRow): HTMLElement {
  return h("div", { cls: "fe-grow" }, h("span", { cls: `fe-spell-name ${r.known ? "" : "is-missing"}`, text: r.known ? r.name : `${r.id} (missing from compendium)`, ...(r.known ? { data: { ref: `spell:${r.id}` } } : {}) }),
    r.concentration ? h("span", { cls: "fe-src", text: "C" }) : null);
}

/** Key stored in Character.mainSpells: the spell id for own spells, "<item id>/<spell id>" for item spells. */
export function pinKey(ctl: SheetController, r: SpellRow): string {
  return r.source.kind === "item" ? `${ctl.character!.inventory[r.source.itemIndex]?.id ?? r.source.itemIndex}/${r.id}` : r.id;
}
function pinButton(ctl: SheetController, r: SpellRow): HTMLElement {
  const key = pinKey(ctl, r), on = ctl.character!.mainSpells.includes(key);
  const el = btn(on ? "Pinned" : "Pin", () => ctl.dispatch({ type: "pinSpell", key, on: !on }), on ? "is-on" : "", { act: "pin" });
  el.title = on ? "Shown on the main page (click to unpin)" : "Show on the main page";
  return el;
}
export function castButton(ctl: SheetController, r: SpellRow): HTMLElement | null {
  if (!r.known) return null;
  if (r.source.kind === "item") { const idx = r.source.itemIndex; return btn("Cast", () => ctl.cast(r.id, r.castLevel !== r.level ? r.castLevel : undefined, idx), "", { act: "cast" }); }
  return btn("Cast", () => r.level >= 1 ? ctl.open({ kind: "cast", spell: r.id }) : ctl.cast(r.id), "", { act: "cast" });
}

/** Which spell row has its "..." menu open (and whether it is asking "Remove?"). Kept per sheet so a redraw does not close it. */
const menus = new WeakMap<SheetController, { open?: string; confirm?: string }>();
const menuState = (ctl: SheetController) => { let m = menus.get(ctl); if (!m) { m = {}; menus.set(ctl, m); } return m; };
const switchRow = (label: string, on: boolean, onClick: () => void, act: string, disabled = false, hint?: string) => h("div", { cls: "fe-menu-row" },
  h("span", { cls: "fe-grow", text: label }), hint ? h("span", { cls: "fe-faint", text: hint }) : null,
  h("button", { cls: `fe-switch ${on ? "is-on" : ""}`, data: { act }, attrs: { role: "switch", "aria-checked": String(on), "aria-label": label, ...(disabled ? { disabled: "" } : {}) }, on: { click: onClick } }));

function menuButton(ctl: SheetController, key: string, name: string): HTMLElement {
  const m = menuState(ctl), open = m.open === key;
  return h("button", { cls: `fe-btn fe-menu-btn ${open ? "is-on" : ""}`.trim(), text: "...", data: { act: "spell-menu" }, attrs: { "aria-label": `Manage ${name}`, "aria-expanded": String(open) },
    on: { click: () => { m.open = open ? undefined : key; m.confirm = undefined; ctl.emit(); } } });
}

function ownMenu(ctl: SheetController, r: SpellRow, index: number): HTMLElement {
  const m = menuState(ctl), entry = ctl.character!.spells[index];
  const prepared = r.source.kind === "own" && r.source.prepared, always = !!entry?.always;
  const asking = m.confirm === r.id;
  return h("div", { cls: "fe-spell-menu", data: { menu: r.id } },
    r.level >= 1 && r.known ? switchRow("Prepared", prepared, () => ctl.dispatch({ type: "prepare", index, on: !prepared }), "menu-prepare", always, always ? "always" : undefined) : null,
    r.level >= 1 && r.known ? switchRow("Always prepared", always, () => ctl.dispatch({ type: "alwaysPrepared", index, on: !always }), "menu-always") : null,
    ...spellEditItems(ctl, r),
    asking ? h("div", { cls: "fe-menu-row fe-menu-confirm", data: { confirm: r.id } }, h("span", { cls: "fe-grow", text: `Remove ${r.known ? r.name : r.id}?` }),
      btn("Yes", () => { m.confirm = undefined; m.open = undefined; ctl.dispatch({ type: "removeSpell", index }); }, "mod-warning", { act: "remove-yes" }),
      btn("No", () => { m.confirm = undefined; ctl.emit(); }, "", { act: "remove-no" }))
      : h("div", { cls: "fe-menu-row" }, btn("Remove", () => { m.confirm = r.id; ctl.emit(); }, "", { act: "menu-remove" })));
}

function itemMenu(r: SpellRow & { source: Extract<SpellRow["source"], { kind: "item" }> }): HTMLElement {
  return h("div", { cls: "fe-spell-menu", data: { menu: r.id, itemMenu: "" } },
    h("div", { cls: "fe-faint", data: { protected: "" }, text: `${r.known ? r.name : r.id} comes from ${r.source.itemName}. It cannot be removed or edited here: it goes away when you unequip or remove the item.` }));
}

/** Edit / copy / open-note entries of the "..." menu (filled in for spells the player can change). */
function spellEditItems(_ctl: SheetController, _r: SpellRow): (Node | null)[] { return []; }

function ownRow(ctl: SheetController, r: SpellRow, index: number): HTMLElement {
  const always = !!ctl.character!.spells[index]?.always;
  const prepared = r.source.kind === "own" && r.source.prepared;
  const key = `own:${r.id}`;
  const row = h("div", { cls: "fe-inv", data: { spell: r.id } },
    r.level >= 1 && r.known ? h("button", { cls: `fe-dot ${prepared ? "is-prof" : ""}`, title: always ? "Always prepared" : prepared ? "Prepared" : "Not prepared", attrs: { "aria-label": `Prepared: ${r.name}` },
      data: { act: "prepare" }, on: { click: () => { if (!always) ctl.dispatch({ type: "prepare", index, on: !prepared }); } } }) : null,
    nameCell(r), ...rolls(ctl, r), castButton(ctl, r), r.known ? pinButton(ctl, r) : null, menuButton(ctl, key, r.known ? r.name : r.id),
    ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeSpell", index }), "", { act: "remove-spell" }) : null);
  return menuState(ctl).open === key ? h("div", { cls: "fe-spell-wrap" }, row, ownMenu(ctl, r, index)) : row;
}

export function spellsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character!, rows = spellRows(c, st, ctl.ctx());
  const head = h("div", { cls: "fe-kv" }, h("span", { text: st.spellcasting ? `Spell DC ${st.spellcasting.dc} · attack ${sgn(st.spellcasting.attack)} · ${ABIL[st.spellcasting.abil]}` : "No spellcasting" }),
    h("span", { cls: "fe-muted", text: st.slots.map(s => `${s.level === "pact" ? "P" : s.level}: ${s.max - s.used}/${s.max}`).join("  ") }));
  const byLevel = new Map<number, { r: SpellRow; i: number }[]>();
  rows.own.forEach((r, i) => { const l = r.known ? r.level : 0; byLevel.set(l, [...(byLevel.get(l) ?? []), { r, i }]); });
  const own = [...byLevel.keys()].sort((a, b) => a - b).map(l => h("div", { cls: "fe-spell-group", data: { level: String(l) } },
    h("div", { cls: "fe-card-title", text: levelTitle(l) }), ...byLevel.get(l)!.map(x => ownRow(ctl, x.r, x.i))));
  const items = new Map<number, SpellRow[]>();
  for (const r of rows.fromItems) if (r.source.kind === "item") items.set(r.source.itemIndex, [...(items.get(r.source.itemIndex) ?? []), r]);
  const fromItems = [...items.entries()].map(([idx, list]) => h("div", {},
    h("div", { cls: "fe-card-title", text: (list[0].source as { itemName: string }).itemName }),
    ...list.map(r => {
      const key = `item:${pinKey(ctl, r)}`, src = r.source as Extract<SpellRow["source"], { kind: "item" }>;
      const row = h("div", { cls: "fe-inv", data: { spell: r.id } }, nameCell(r), ...rolls(ctl, r), h("span", { cls: "fe-faint", text: costLabel(src) }),
        castButton(ctl, r), r.known ? pinButton(ctl, r) : null, menuButton(ctl, key, r.known ? r.name : r.id));
      return menuState(ctl).open === key ? h("div", { cls: "fe-spell-wrap" }, row, itemMenu({ ...r, source: src })) : row;
    })));
  return h("div", { cls: "fe-card fe-spells" }, btn("+ Add spell", () => ctl.open({ kind: "add-spell" }), "mod-cta fe-spell-add", { act: "add-spell" }), head,
    h("div", { cls: "fe-card-title", text: "Your spells" }),
    ...(own.length ? own : [h("div", { cls: "fe-faint", data: { empty: "" }, text: "No spells yet. Add your first spell with the button above." })]),
    h("div", { data: { fromItems: "" } }, h("div", { cls: "fe-card-title", text: "From items" }),
      ...(fromItems.length ? fromItems : [h("div", { cls: "fe-faint", text: "None from equipped items." })])));
}

/** Compact card of pinned spells for the main page. Pins whose spell or item is gone are skipped. */
export function pinnedSpellsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character!, rows = spellRows(c, st, ctl.ctx());
  const all = [...rows.own, ...rows.fromItems].filter(r => r.known);
  const pinned = c.mainSpells.map(k => all.find(r => pinKey(ctl, r) === k)).filter((r): r is SpellRow => !!r);
  return h("div", { cls: "fe-card" }, h("div", { cls: "fe-card-title", text: "Spells" }),
    ...(pinned.length ? pinned.map(r => h("div", { cls: "fe-attack", data: { spell: r.id } }, nameCell(r), ...rolls(ctl, r),
      r.source.kind === "item" ? h("span", { cls: "fe-faint", text: costLabel(r.source) }) : null, castButton(ctl, r)))
      : [h("div", { cls: "fe-faint", text: "Pin spells on the Spells tab to show them here." })]));
}

export function concentrationFeature(ctl: SheetController): HTMLElement {
  const id = ctl.character?.concentration;
  if (!id) return h("div", { cls: "fe-conc fe-faint", text: "Not concentrating" });
  const sp = ctl.host.registry.get<SpellData>("spell", id), chk = ctl.concentrationCheck;
  return h("div", { cls: "fe-conc" }, h("span", { cls: `fe-chip ${sp ? "" : "is-missing"}`, text: sp ? `Concentrating: ${sp.name}` : `${id} (missing from compendium)`, ...(sp ? { data: { ref: `spell:${id}` } } : {}) }),
    btn("End", () => ctl.dispatch({ type: "endConcentration" }), "", { act: "end-concentration" }),
    chk && chk.spell === id ? h("div", { cls: "fe-conc-check" }, h("div", { text: `Make a Constitution save to keep concentrating (DC ${chk.dc})` }),
      btn("Roll Constitution save", () => ctl.rollConcentration(), "mod-cta", { act: "concentration-roll" }),
      btn("Dismiss", () => ctl.dismissConcentrationCheck(), "", { act: "concentration-dismiss" })) : null);
}

let castLevel: number | undefined;
export function castPanel(ctl: SheetController, spell: string): HTMLElement {
  const sp = ctl.host.registry.get<SpellData>("spell", spell), st = ctl.stats()!;
  if (!sp) return h("div", { cls: "fe-warn", text: "Spell missing from compendium" });
  const levels = [...new Set(st.slots.filter(s => s.used < s.max).map(s => s.level === "pact" ? s.pactLevel! : Number(s.level)).filter(l => l >= sp.data.level))].sort((a, b) => a - b);
  if (castLevel === undefined || !levels.includes(castLevel)) castLevel = levels[0];
  const chosen = castLevel, row = chosen === undefined ? undefined : castRow(ctl.character!, st, ctl.ctx(), spell, chosen);
  return h("div", {}, h("div", { cls: "fe-muted", text: `${sp.name}: choose a slot level` }),
    levels.length ? h("div", { cls: "fe-filters" }, ...levels.map(l => btn(`Level ${l}`, () => { castLevel = l; ctl.emit(); }, chosen === l ? "is-on" : "", { slot: String(l) }))) : h("div", { cls: "fe-warn", text: "No free spell slots." }),
    row ? h("div", { cls: "fe-kv", data: { upcast: String(chosen) } }, ...rolls(ctl, row).filter(n => n && (n as HTMLElement).tagName === "BUTTON" && !(n as HTMLElement).title.startsWith("Spell attack"))) : null,
    h("div", { cls: "fe-kv" }, btn("Cancel", () => ctl.close()),
      btn("Cast", () => { if (chosen !== undefined && ctl.cast(spell, chosen)) { castLevel = undefined; ctl.close(); } }, "mod-cta", { act: "cast-apply" })));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MAX_ROWS = 80;
/** What the add-spell panel remembers: one per opened panel, so a redraw keeps what was typed and reopening starts fresh. */
interface AddState { mode: "pick" | "form" | "import"; query: string; showAll: boolean; focused: boolean }
const addStates = new WeakMap<object, AddState>();
const fallbackPanel = {};

/** Matches for the search: names that start with it first, then names that contain it, each A to Z. */
function matchSpells<T extends { name: string }>(all: readonly T[], q: string): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name), starts: T[] = [], inside: T[] = [];
  for (const e of all) { const n = e.name.toLowerCase(); if (!q) inside.push(e); else if (n.startsWith(q)) starts.push(e); else if (n.includes(q)) inside.push(e); }
  return [...starts.sort(byName), ...inside.sort(byName)];
}

export function addSpellPanel(ctl: SheetController, panel: object = fallbackPanel): HTMLElement {
  let s = addStates.get(panel);
  if (!s) { s = { mode: "pick", query: "", showAll: false, focused: false }; addStates.set(panel, s); }
  const st = s;
  const c = ctl.character!, mine = new Set(c.classes.map(x => x.class)), owned = new Set(c.spells.map(x => x.id));
  const all = ctl.pickers().list<SpellData>("spell");
  const list = h("div", { data: { results: "" } });
  const fill = () => {
    clear(list);
    const q = st.query.trim().toLowerCase();
    const rows = matchSpells(all.filter(e => e.name.toLowerCase().includes(q) && (st.showAll || !mine.size || e.data.classes.some(k => mine.has(k)))), q);
    for (const e of rows.slice(0, MAX_ROWS)) list.append(h("div", { cls: "fe-inv", data: { pick: e.id } },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-spell-name", text: e.name, data: { ref: `spell:${e.id}`, noclick: "" } }), sourceBadge(sourceLabel(e)),
        h("div", { cls: "fe-badges" }, h("span", { cls: "fe-badge", text: levelTitle(e.data.level) === "Cantrips" ? "Cantrip" : `Level ${e.data.level}`, data: { badge: "level" } }),
          h("span", { cls: "fe-badge", text: e.data.school, data: { badge: "school" } }),
          ...e.data.classes.map(k => h("span", { cls: `fe-badge ${mine.has(k) ? "is-mine" : ""}`.trim(), text: cap(k), data: { badge: "class" } })))),
      owned.has(e.id) ? h("button", { cls: "fe-btn", text: "Known", attrs: { disabled: "", "aria-label": `${e.name} is already known` }, data: { known: e.id } })
        : btn("Add", () => { ctl.dispatch({ type: "addSpell", id: e.id }); ctl.host.notify(`Added ${e.name}`); }, "", { add: e.id })));
    if (rows.length > MAX_ROWS) list.append(h("div", { cls: "fe-faint", data: { more: "" }, text: `${rows.length - MAX_ROWS} more: keep typing.` }));
    if (!rows.length) list.append(h("div", { cls: "fe-faint", data: { empty: "" }, text: st.query.trim() ? `No spell called '${st.query.trim()}'.` : "No spells match." }));
  };
  const search = h("input", { cls: "fe-search", attrs: { placeholder: "Search spells", value: st.query, type: "search", "aria-label": "Search spells" },
    on: { input: (e: Event) => { st.query = (e.target as HTMLInputElement).value; fill(); }, focus: () => { st.focused = true; }, blur: () => { st.focused = false; } } });
  fill();
  const sw = h("button", { cls: `fe-switch ${st.showAll ? "is-on" : ""}`, data: { act: "show-all" }, attrs: { role: "switch", "aria-checked": String(st.showAll), "aria-label": "Show all spells" },
    on: { click: () => { st.showAll = !st.showAll; sw.classList.toggle("is-on", st.showAll); sw.setAttribute("aria-checked", String(st.showAll)); fill(); } } });
  const root = h("div", {}, search,
    mine.size ? h("label", { cls: "fe-kv" }, h("span", { text: st.showAll ? "Showing all spells" : `Showing your class spells (${[...mine].map(cap).join(", ")})` }), sw) : null, list);
  // A redraw (after Add) keeps the cursor in the search box; on a phone or tablet the keyboard is not opened by the panel itself.
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
  if (st.focused || !touch) window.setTimeout(() => { if (search.isConnected) { search.focus(); const n = search.value.length; search.setSelectionRange?.(n, n); } }, 0);
  return root;
}
