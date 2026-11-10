import { canonRef, refFor, splitRef } from "../content/edition";
import { sourceLabel } from "../content/registry";
import { characterEdition } from "../core/edition";
import type { SpellData } from "../content/types";
import { castRow, spellRows, type SpellRow } from "../core/spells";
import { bringBackButton, bringInButton, chipFor, editionChip } from "./bring-in";
import { otherEdition } from "../core/edition";
import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { clear, h, sgn } from "./h";
import { pips, playBadge } from "./widgets";
import { titleCase } from "../core/words";
import { blankSpellDraft, spellDataToDraft, type SpellDraft } from "../content/spell-note";
import { parseSpellblock, SPELLBLOCK_TEMPLATE } from "../content/spellblock";
import { spellForm } from "./spell-form";

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
    r.damage ? h("button", { cls: "fe-roll", text: r.damage, title: "Damage", on: { click: () => ctl.damage(`${r.name} damage`, r.damage!, r.dc !== undefined && r.data?.save ? { save: { abil: r.data.save.abil, dc: r.dc, half: r.data.save.onSuccess === "half" } } : {}) } }) : null,
    r.heal ? h("button", { cls: "fe-roll", text: r.heal, title: "Healing", on: { click: () => ctl.damage(`${r.name} healing`, r.heal!) } }) : null,
  ];
}

function nameCell(ctl: SheetController, r: SpellRow, lead?: HTMLElement | null): HTMLElement {
  return h("div", { cls: "fe-grow" }, lead ?? null, h("span", { cls: `fe-spell-name ${r.known ? "" : "is-missing"}`, text: r.known ? r.name : `${r.id} (missing from compendium)`, ...(r.known ? { data: { ref: `spell:${r.id}` } } : {}) }),
    r.known ? chipFor(r.id, ctl.character) : null,
    r.concentration ? h("span", { cls: "fe-tag", text: "Concentration", data: { badge: "concentration" } }) : null);
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
function spellEditItems(ctl: SheetController, r: SpellRow): (Node | null)[] {
  const e = r.known ? ctl.host.registry.get<SpellData>("spell", r.id) : undefined;
  if (!e) return [];
  const mine = e.source === "vault" && !e.library && !!e.path;
  const close = () => { menuState(ctl).open = undefined; };
  return [
    mine && ctl.host.updateSpell ? h("div", { cls: "fe-menu-row" }, btn("Edit spell", () => { close(); ctl.open({ kind: "add-spell", edit: { mode: "edit", id: r.id } }); }, "", { act: "menu-edit" })) : null,
    !mine && ctl.host.saveSpell ? h("div", { cls: "fe-menu-row" }, btn("Make my own copy", () => { close(); ctl.open({ kind: "add-spell", edit: { mode: "copy", id: r.id } }); }, "", { act: "menu-copy" }),
      h("span", { cls: "fe-faint", text: "This spell is from a book, so it cannot be changed. Your copy can." })) : null,
    e.path && ctl.host.openNote ? h("div", { cls: "fe-menu-row" }, btn("Open note", () => ctl.host.openNote!(e.path!), "", { act: "menu-open-note" })) : null,
  ];
}

function ownRow(ctl: SheetController, r: SpellRow, index: number): HTMLElement {
  const always = !!ctl.character!.spells[index]?.always;
  const prepared = r.source.kind === "own" && r.source.prepared;
  const key = `own:${r.id}`;
  const row = h("div", { cls: "fe-inv", data: { spell: r.id } },
    nameCell(ctl, r, r.level >= 1 && r.known ? h("button", { cls: `fe-dot ${prepared ? "is-prof" : ""}`, title: always ? "Always prepared" : prepared ? "Prepared" : "Not prepared", attrs: { "aria-label": `Prepared: ${r.name}` },
      data: { act: "prepare" }, on: { click: () => { if (!always) ctl.dispatch({ type: "prepare", index, on: !prepared }); } } }) : null), ...rolls(ctl, r), castButton(ctl, r), r.known ? pinButton(ctl, r) : null, menuButton(ctl, key, r.known ? r.name : r.id),
    ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeSpell", index }), "", { act: "remove-spell" }) : null);
  return menuState(ctl).open === key ? h("div", { cls: "fe-spell-wrap" }, row, ownMenu(ctl, r, index)) : row;
}

/** The highest spell level the character has a slot for (pact level included); 0 with no slots. */
export function maxCastableLevel(st: ActorStats): number {
  return Math.max(0, ...st.slots.filter(s => s.max > 0).map(s => s.level === "pact" ? s.pactLevel ?? 0 : Number(s.level)));
}

/** One row per spell slot level, "Level 1 slots: 3 of 4 left" with boxes, for the slots card and the Spells tab. */
export function slotRows(ctl: SheetController, st: ActorStats): HTMLElement[] {
  return st.slots.map(s => h("div", { cls: "fe-kv fe-res-row", data: { slot: s.level } },
    h("span", { cls: "fe-grow", text: `${s.level === "pact" ? `Pact slots (level ${s.pactLevel})` : `Level ${s.level} slots`}: ${Math.max(0, s.max - s.used)} of ${s.max} left` }),
    h("span", { cls: "fe-res-ctl" }, pips(s.max, s.used, n => ctl.dispatch({ type: "slot", level: s.level, used: n })))));
}

/** True when the character has spellcasting, any spell of their own, or a spell from an equipped item. */
export function castsSpells(ctl: SheetController, st: ActorStats): boolean {
  if (st.spellcasting) return true;
  const rows = spellRows(ctl.character!, st, ctl.ctx());
  return rows.own.length > 0 || rows.fromItems.length > 0;
}

export function spellsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character!, rows = spellRows(c, st, ctl.ctx());
  const casts = castsSpells(ctl, st);
  const head = h("div", {}, casts
    ? h("div", { cls: "fe-kv" }, h("span", { text: st.spellcasting ? `Spell DC ${st.spellcasting.dc} · attack ${sgn(st.spellcasting.attack)} · ${ABIL[st.spellcasting.abil]}` : "No spell save DC" }))
    : h("div", { cls: "fe-faint", data: { noSpells: "" }, text: `${c.name} does not cast spells. Spells from items or feats will show here.` }),
    ...(casts ? slotRows(ctl, st) : []));
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
      const row = h("div", { cls: "fe-inv", data: { spell: r.id } }, nameCell(ctl, r), ...rolls(ctl, r), h("span", { cls: "fe-faint", text: costLabel(src) }),
        castButton(ctl, r), r.known ? pinButton(ctl, r) : null, menuButton(ctl, key, r.known ? r.name : r.id));
      return menuState(ctl).open === key ? h("div", { cls: "fe-spell-wrap" }, row, itemMenu({ ...r, source: src })) : row;
    })));
  return h("div", { cls: "fe-card fe-spells" }, btn("+ Add spell", () => ctl.open({ kind: "add-spell" }), "mod-cta fe-spell-add", { act: "add-spell" }), head,
    casts ? h("div", { cls: "fe-faint", data: { legend: "" }, text: "Filled dot: prepared today." }) : null,
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
    ...(pinned.length ? pinned.map(r => h("div", { cls: "fe-attack", data: { spell: r.id } }, nameCell(ctl, r), ...rolls(ctl, r),
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
  const left = new Map<number, number>();
  for (const sl of st.slots) { const l = sl.level === "pact" ? sl.pactLevel! : Number(sl.level); if (l >= sp.data.level) left.set(l, (left.get(l) ?? 0) + Math.max(0, sl.max - sl.used)); }
  const all = [...left.keys()].sort((x, y) => x - y), levels = all.filter(l => left.get(l)! > 0);
  if (castLevel === undefined || !levels.includes(castLevel)) castLevel = levels[0];
  const chosen = castLevel, row = chosen === undefined ? undefined : castRow(ctl.character!, st, ctl.ctx(), spell, chosen);
  const idx = ctl.character!.spells.findIndex(x => x.id === spell), own = ctl.character!.spells[idx];
  const unprepared = own && !own.prepared && !own.always && sp.data.level >= 1
    ? h("div", { cls: "fe-warn", data: { unprepared: "" } }, h("span", { text: `${sp.name} is not prepared today.` }), " ",
      btn("Prepare it", () => ctl.dispatch({ type: "prepare", index: idx, on: true }), "", { act: "prepare-now" })) : null;
  return h("div", {}, h("div", { cls: "fe-muted", text: `${sp.name}: choose a slot level` }),
    unprepared,
    levels.length ? h("div", { cls: "fe-filters" }, ...all.map(l => {
      const n = left.get(l)!, b = btn(`Level ${l} (${n ? `${n} left` : "none left"})`, () => { castLevel = l; ctl.emit(); }, chosen === l ? "is-on" : "", { slot: String(l) });
      b.disabled = n === 0; return b;
    })) : h("div", { cls: "fe-warn", text: "No free spell slots." }),
    row ? h("div", { cls: "fe-kv", data: { upcast: String(chosen) } }, ...rolls(ctl, row).filter(n => n && (n as HTMLElement).tagName === "BUTTON" && !(n as HTMLElement).title.startsWith("Spell attack"))) : null,
    h("div", { cls: "fe-kv" }, btn("Cancel", () => ctl.close()),
      btn("Cast", () => { if (chosen !== undefined && ctl.cast(spell, chosen)) { castLevel = undefined; ctl.close(); } }, "mod-cta", { act: "cast-apply" })));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MAX_ROWS = 80;
/** What the add-spell panel remembers: one per opened panel, so a redraw keeps what was typed and reopening starts fresh. */
interface AddState { mode: "pick" | "form" | "import"; /** Showing the other edition's spells (not saved). */ other: boolean; query: string; showAll: boolean; higher: boolean; focused: boolean; draft: SpellDraft; unread: string[]; importText: string; showTemplate: boolean }
const addStates = new WeakMap<object, AddState>();
const fallbackPanel = {};
type EditSpec = { mode: "edit" | "copy"; id: string };

/** Matches for the search: names that start with it first, then names that contain it, each A to Z. */
function matchSpells<T extends { name: string }>(all: readonly T[], q: string): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name), starts: T[] = [], inside: T[] = [];
  for (const e of all) { const n = e.name.toLowerCase(); if (!q) inside.push(e); else if (n.startsWith(q)) starts.push(e); else if (n.includes(q)) inside.push(e); }
  return [...starts.sort(byName), ...inside.sort(byName)];
}

function initialAddState(ctl: SheetController, edit: EditSpec | undefined): AddState {
  const s: AddState = { mode: "pick", other: false, query: "", showAll: false, higher: false, focused: false, draft: blankSpellDraft(), unread: [], importText: "", showTemplate: false };
  const e = edit ? ctl.host.registry.get<SpellData>("spell", edit.id) : undefined;
  if (edit && e) {
    s.mode = "form";
    s.draft = spellDataToDraft(e.data, edit.mode === "copy" ? { withoutText: true } : { description: e.body ?? e.data.rules });
    if (edit.mode === "copy") s.draft.name = `${e.data.name} (my version)`;
  }
  return s;
}


export function addSpellPanel(ctl: SheetController, panel: object = fallbackPanel): HTMLElement {
  const edit = (panel as { edit?: EditSpec }).edit;
  let s = addStates.get(panel);
  if (!s) { s = initialAddState(ctl, edit); addStates.set(panel, s); }
  const st = s;
  const c = ctl.character!, own = characterEdition(c), mine = new Set(c.classes.map(x => splitRef(x.class).id)), owned = new Set(c.spells.map(x => canonRef(x.id, own)));
  const canMake = !!ctl.host.saveSpell && !edit;
  const root = h("div", { cls: "fe-add-spell" }), body = h("div", {});
  root.append(body);
  const go = (mode: AddState["mode"]) => { st.mode = mode; draw(); };
  const startForm = () => { st.draft = { ...blankSpellDraft(), name: titleCase(st.query.trim()) }; st.unread = []; go("form"); };

  const makeButtons = () => canMake ? h("div", { cls: "fe-cf-row", data: { make: "" } },
    btn("Create a spell", startForm, "", { act: "create-spell" }),
    btn("Import a spell", () => go("import"), "", { act: "import-spell" })) : null;

  const makeBack = () => h("div", { cls: "fe-cf-row", data: { brought: "" } }, h("span", { cls: "fe-muted", text: `Spells from the ${otherEdition(own)} books` }), bringBackButton(own, () => { st.other = false; draw(); }));

  function drawPick() {
    const all = st.other ? ctl.pickers().listEdition<SpellData>("spell", otherEdition(own)) : ctl.pickers().list<SpellData>("spell");
    const list = h("div", { data: { results: "" } });
    const top = maxCastableLevel(ctl.stats()!);
    const fill = () => {
      clear(list);
      const q = st.query.trim().toLowerCase();
      const inScope = all.filter(e => e.name.toLowerCase().includes(q) && (st.showAll || !mine.size || e.data.classes.some(k => mine.has(k))));
      const rows = matchSpells(inScope.filter(e => st.higher || e.data.level <= top), q);
      const hidden = st.higher ? 0 : inScope.length - rows.length;
      for (const e of rows.slice(0, MAX_ROWS)) { const ref = refFor(e, own); list.append(h("div", { cls: "fe-inv", data: { pick: ref } },
        h("div", { cls: "fe-grow" }, h("span", { cls: "fe-spell-name", text: e.name, data: { ref: `spell:${ref}`, noclick: "" } }), editionChip(ref, own), playBadge(sourceLabel(e)),
          h("div", { cls: "fe-tags" }, h("span", { cls: "fe-tag", text: e.data.level === 0 ? "Cantrip" : `Level ${e.data.level}`, data: { badge: "level" } }),
            h("span", { cls: "fe-tag", text: e.data.school, data: { badge: "school" } }),
            ...e.data.classes.map(k => h("span", { cls: `fe-tag ${mine.has(k) ? "is-mine" : ""}`.trim(), text: cap(k), data: { badge: "class" } })))),
        owned.has(ref) ? h("button", { cls: "fe-btn", text: "Known", attrs: { disabled: "", "aria-label": `${e.name} is already known` }, data: { known: ref } })
          : btn("Add", () => { ctl.dispatch({ type: "addSpell", id: ref }); ctl.host.notify(`Added ${e.name}`); }, "", { add: ref }))); }
      if (rows.length > MAX_ROWS) list.append(h("div", { cls: "fe-faint", data: { more: "" }, text: `${rows.length - MAX_ROWS} more: keep typing.` }));
      if (!rows.length && hidden > 0 && q) {
        list.append(h("div", { cls: "fe-faint", data: { hidden: "" }, text: `${hidden} more ${hidden === 1 ? "spell needs" : "spells need"} higher slots than you have.` }),
          btn("Show higher levels", () => hl.click(), "", { act: "show-hidden" }));
      } else if (!rows.length) {
        list.append(h("div", { cls: "fe-faint", data: { empty: "" }, text: st.query.trim() ? `No spell called '${st.query.trim()}'.` : "No spells match." }));
        if (canMake && st.query.trim() && !st.other) list.append(btn(`Create '${st.query.trim()}' as a new spell`, startForm, "mod-cta", { act: "create-from-query" }));
      }
      if (!st.other) list.append(bringInButton(otherEdition(own), () => { st.other = true; draw(); }));
    };
    const search = h("input", { cls: "fe-search", attrs: { placeholder: "Search spells", value: st.query, type: "text", "aria-label": "Search spells" },
      on: { input: (e: Event) => { st.query = (e.target as HTMLInputElement).value; fill(); }, focus: () => { st.focused = true; }, blur: () => { st.focused = false; } } });
    fill();
    const hl = h("button", { cls: `fe-btn ${st.higher ? "is-on" : ""}`.trim(), text: st.higher ? "Hide higher levels" : "Show higher levels", data: { act: "higher-levels" }, attrs: { type: "button" },
      on: { click: () => { st.higher = !st.higher; hl.classList.toggle("is-on", st.higher); hl.textContent = st.higher ? "Hide higher levels" : "Show higher levels"; fill(); } } });
    const label = h("span", { text: "" }), setLabel = () => { label.textContent = st.showAll ? "Showing all spells" : `Showing your class spells (${[...mine].map(cap).join(", ")})`; };
    setLabel();
    const sw = h("button", { cls: `fe-switch ${st.showAll ? "is-on" : ""}`, data: { act: "show-all" }, attrs: { role: "switch", "aria-checked": String(st.showAll), "aria-label": "Show all spells" },
      on: { click: () => { st.showAll = !st.showAll; sw.classList.toggle("is-on", st.showAll); sw.setAttribute("aria-checked", String(st.showAll)); setLabel(); fill(); } } });
    body.append(...([st.other ? makeBack() : makeButtons(), search as HTMLElement,
      mine.size ? h("label", { cls: "fe-kv fe-menu-row" }, label, sw) : null, hl, list] as (HTMLElement | null)[]).filter((n): n is HTMLElement => !!n));
    // A redraw (after Add) keeps the cursor in the search box; the panel itself does not open the keyboard on a phone or tablet.
    const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
    if (st.focused || !touch) window.setTimeout(() => { if (search.isConnected) { search.focus(); const n = search.value.length; search.setSelectionRange?.(n, n); } }, 0);
  }

  function drawForm() {
    const classOptions = ctl.pickers().list<unknown>("class").map(e => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name));
    body.append(spellForm({
      draft: st.draft, classOptions, unread: st.unread,
      saveLabel: edit?.mode === "edit" ? "Save changes" : edit ? "Save my copy" : "Save spell",
      onCancel: () => { if (edit) ctl.close(); else go(st.unread.length || st.importText ? "import" : "pick"); },
      onSave: async d => {
        if (edit?.mode === "edit") {
          const e = ctl.host.registry.get<SpellData>("spell", edit.id), text = e ? e.body ?? e.data.rules : undefined;
          if (!e?.path || !ctl.host.updateSpell) throw new Error("This spell has no note to change.");
          const r = await ctl.host.updateSpell({ id: e.id, path: e.path, sourceName: e.sourceName, ...(text !== undefined ? { body: text } : {}) }, d);
          ctl.host.notify(`Saved changes to ${r.name}`); ctl.close(); return;
        }
        const r = await ctl.host.saveSpell!(d);
        st.mode = "pick"; st.draft = blankSpellDraft(); st.unread = []; st.importText = ""; st.query = "";
        ctl.host.notify(edit ? `Saved ${r.name} and added it. The original is still on your list.` : `Added ${r.name}`);
        ctl.dispatch({ type: "addSpell", id: r.id });
        if (edit) ctl.close();
      },
    }));
  }

  function drawImport() {
    const area = h("textarea", { cls: "fe-cf-input fe-cf-paste", attrs: { rows: "12", placeholder: "Paste the spell here: from D&D Beyond, 5e.tools, a PDF, or a 5e-spell block from a note.", "aria-label": "Spell text" }, text: st.importText,
      on: { input: (e: Event) => { st.importText = (e.target as HTMLTextAreaElement).value; } } });
    const msg = h("div", { cls: "fe-warn", attrs: { role: "alert" } }); msg.hidden = true;
    const fallback = h("div", {});
    const drawFallback = () => {
      clear(fallback);
      if (!st.showTemplate) return;
      const box = h("textarea", { cls: "fe-cf-input fe-cf-paste", attrs: { rows: "12", readonly: "", "aria-label": "Spell template" }, text: SPELLBLOCK_TEMPLATE });
      fallback.append(h("div", { cls: "fe-faint", text: "Your device would not copy it for you. Select all of this text and copy it by hand." }), box);
      window.setTimeout(() => { box.focus(); box.select(); }, 0);
    };
    drawFallback();
    const copy = async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
        await navigator.clipboard.writeText(SPELLBLOCK_TEMPLATE);
        st.showTemplate = false; drawFallback(); ctl.host.notify("Template copied. Paste it into a note and fill it in.");
      } catch { st.showTemplate = true; drawFallback(); }
    };
    body.append(h("div", { cls: "fe-faint", text: "Paste a spell and press Read. You can check everything before it is saved." }), area, msg,
      h("div", { cls: "fe-cf-row" },
        btn("Read spell", () => {
          if (!st.importText.trim()) { msg.hidden = false; msg.textContent = "Paste a spell first."; return; }
          const r = parseSpellblock(st.importText);
          st.draft = r.draft; st.unread = r.unread; go("form");
        }, "mod-cta", { act: "read-spell" }),
        btn("Copy template", () => { void copy(); }, "", { act: "copy-spell-template" }),
        btn("Back", () => go("pick"), "", { act: "import-back" })), fallback);
  }

  function draw() {
    clear(body);
    if (st.mode === "form") drawForm(); else if (st.mode === "import") drawImport(); else drawPick();
  }
  draw();
  return root;
}
