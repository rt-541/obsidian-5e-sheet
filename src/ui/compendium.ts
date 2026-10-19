import { sourceLabel, type Entry, type Registry } from "../content/registry";
import { cleanBody } from "../content/library";
import { LIBRARY_SOURCE, SRD_SOURCE, sourceOn, type SourceSwitches } from "../content/sources";
import type { Action } from "../core/actions";
import type { CompanionKind } from "../core/character";
import type { SheetController } from "./controller";
import { entryCard } from "./details";
import { clear, h } from "./h";
import { sourceBadge } from "./widgets";

/** What the Obsidian layer (or a test) provides to the compendium browser. */
export interface CompendiumHost {
  registry: Registry;
  /** Source switches of the campaign of the sheet "Add to character" targets (off sources are dimmed). */
  switches(): SourceSwitches;
  /** The sheet "Add to character" targets (the most recently active character sheet), if any. */
  target(): string | undefined;
  /** Add the entry to that sheet; returns the message to show. */
  add(entry: Entry, opts: { companionKind: CompanionKind }): string;
  openNote(path: string): void;
}

/** Type tabs, in this order. A tab can cover several content types (injuries live with conditions). */
export const BROWSER_TYPES: { id: string; label: string; types: string[] }[] = [
  { id: "class", label: "Classes", types: ["class"] }, { id: "subclass", label: "Subclasses", types: ["subclass"] },
  { id: "race", label: "Races", types: ["race", "subrace"] }, { id: "background", label: "Backgrounds", types: ["background"] },
  { id: "feat", label: "Feats", types: ["feat"] }, { id: "spell", label: "Spells", types: ["spell"] },
  { id: "item", label: "Items", types: ["item"] }, { id: "creature", label: "Creatures", types: ["creature"] },
  { id: "condition", label: "Conditions", types: ["condition", "injury"] },
];
const ADDABLE = new Set(["item", "spell", "creature"]);
const COMPANION_KINDS: CompanionKind[] = ["familiar", "companion", "steed", "summon", "sidekick"];
export const BROWSER_ROWS = 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One line under a row's name, from what the entry's metadata already holds (no note bodies are read). */
function meta(e: Entry): string {
  if (e.referenceOnly) return "reference only";
  const d = e.data as Record<string, unknown>;
  switch (e.type) {
    case "spell": return [d.level === 0 ? "Cantrip" : `Level ${String(d.level)}`, d.school].filter(Boolean).join(" ");
    case "item": return [d.kind, d.rarity, d.attunement ? "attunement" : ""].filter(x => typeof x === "string" && x).map(x => cap(String(x))).join(" · ");
    case "creature": return [d.cr !== undefined ? `CR ${String(d.cr)}` : "", [d.size, d.ctype].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    case "class": return `d${String(d.hitDie)}`;
    case "subclass": return `${cap(String(d.class ?? ""))} subclass`;
    case "feat": return d.prerequisite ? `Prerequisite: ${String(d.prerequisite)}` : "";
    default: return "";
  }
}

interface Ref { type: string; id: string; sourceName: string; path?: string; }

/** Browser state and queries. UI-free so tests (and both layouts) drive the same logic. */
export class CompendiumController {
  source = "all"; type = "class"; query = ""; selected?: Ref; kind: CompanionKind = "familiar"; status = "";
  private subs = new Set<() => void>();
  constructor(public host: CompendiumHost) {}
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  emit() { this.subs.forEach(f => f()); }

  /** Source tabs: All, then WotC (SRD), WotC and the user sources, for the sources that have entries. */
  sources(): string[] {
    const have = this.host.registry.sources();
    const first = [SRD_SOURCE, LIBRARY_SOURCE].filter(s => have.includes(s));
    return ["all", ...first, ...have.filter(s => !first.includes(s))];
  }
  private tab(): { types: string[] } { return BROWSER_TYPES.find(t => t.id === this.type) ?? BROWSER_TYPES[0]; }
  /** Entries of every type, filtered by the source tab only (for the type tab counts). */
  private bySource(): Entry[] {
    return this.host.registry.listAll().filter(e => this.source === "all" || e.sourceName === this.source);
  }
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.bySource()) { const t = BROWSER_TYPES.find(x => x.types.includes(e.type)); if (t) out[t.id] = (out[t.id] ?? 0) + 1; }
    return out;
  }
  /** Everything the current source, type and search select, in name order. */
  matches(): Entry[] {
    const q = this.query.trim().toLowerCase(), types = this.tab().types;
    return this.bySource().filter(e => types.includes(e.type) && (!q || e.name.toLowerCase().includes(q)));
  }
  off(e: Entry): boolean { return !sourceOn(this.host.switches(), e.sourceName); }

  setSource(s: string) { this.source = s; this.emit(); }
  setType(t: string) { this.type = t; this.emit(); }
  setQuery(q: string) { this.query = q; this.emit(); }
  select(e: Entry | undefined) { this.selected = e && { type: e.type, id: e.id, sourceName: e.sourceName, ...(e.path ? { path: e.path } : {}) }; this.status = ""; this.emit(); }
  /** The selected entry, but only while it is still in the list; a filter that hides it also clears the detail pane. */
  visibleSelection(): Entry | undefined {
    const e = this.selectedEntry();
    return e && this.matches().some(m => m.sourceName === e.sourceName && m.type === e.type && m.id === e.id && m.path === e.path) ? e : undefined;
  }
  selectedEntry(): Entry | undefined {
    const s = this.selected; if (!s) return undefined;
    return this.host.registry.getAll(s.type, s.id).find(e => e.sourceName === s.sourceName && e.path === s.path);
  }
  /** Why "Add to character" is unavailable for `e`, or null when it can be used. */
  addBlock(e: Entry): string | null {
    if (!ADDABLE.has(e.type) || e.referenceOnly) return "Not usable on the sheet";
    if (!this.host.target()) return "Open a character sheet first";
    if (this.off(e)) return "Off in this campaign";
    return null;
  }
  add(e: Entry) {
    const why = this.addBlock(e);
    this.status = why ?? this.host.add(e, { companionKind: this.kind });
    this.emit();
  }
}

function rowFor(ctl: CompendiumController, e: Entry): HTMLElement {
  const sel = ctl.selected, on = !!sel && sel.type === e.type && sel.id === e.id && sel.sourceName === e.sourceName && sel.path === e.path;
  const off = ctl.off(e), m = meta(e);
  const b = h("button", { cls: `fe-btn fe-choice fe-crow-btn ${on ? "is-on" : ""} ${off ? "is-off" : ""}`.replace(/\s+/g, " ").trim(),
    data: { id: e.id, type: e.type, source: e.sourceName }, on: { click: () => ctl.select(e) } },
    h("span", { cls: "fe-name", text: e.name }), sourceBadge(sourceLabel(e)),
    (e.data as { kind?: string }).kind === "disease" ? h("span", { cls: "fe-src fe-disease", text: "disease", data: { badge: "disease" } }) : null,
    e.needsReview?.length ? h("span", { cls: "fe-src fe-review", text: "needs review", title: e.needsReview.join("\n"), data: { badge: "review" } }) : null,
    e.referenceOnly ? h("span", { cls: "fe-src fe-reference", text: "reference only", title: e.referenceOnly, data: { badge: "reference" } }) : null,
    off ? h("span", { cls: "fe-faint", text: " off in this campaign", data: { badge: "off" } }) : null,
    m && !e.referenceOnly ? h("div", { cls: "fe-faint", text: m }) : null);
  b.setAttribute("aria-pressed", String(on));
  return b;
}

/** Mount the compendium browser into `root`; redraws on every change (the search box is kept so typing is not interrupted). */
export function mountCompendium(root: HTMLElement, ctl: CompendiumController, mobile: boolean): { destroy(): void; render(): void } {
  const reg = ctl.host.registry;
  const sourceTabs = h("nav", { cls: "fe-tabs fe-src-tabs", data: { feature: "source-tabs" } });
  const typeTabs = h("nav", { cls: "fe-tabs fe-type-tabs", data: { feature: "type-tabs" } });
  const search = h("input", { cls: "fe-search", data: { field: "search" }, attrs: { type: "search", placeholder: "Search by name", "aria-label": "Search the compendium", value: ctl.query },
    on: { input: (e: Event) => ctl.setQuery((e.target as HTMLInputElement).value) } });
  const body = h("div", { cls: "fe-comp-body" });
  root.classList.add("fe-sheet", "fe-compendium", mobile ? "fe-mobile" : "fe-desktop");   // keep Obsidian's .view-content (it scrolls)
  clear(root); root.append(sourceTabs, typeTabs, search, body);
  let token = 0;

  const tab = (label: string, on: boolean, data: Record<string, string>, click: () => void) => {
    const b = h("button", { cls: `fe-tab ${on ? "is-on" : ""}`.trim(), text: label, data, on: { click } }); b.setAttribute("aria-pressed", String(on)); return b;
  };

  const fillDetail = (box: HTMLElement, e: Entry) => {
    const mine = ++token;
    const paint = (card: HTMLElement) => {
      clear(box);
      if (mobile) box.append(h("button", { cls: "fe-btn", text: "Back to list", data: { act: "comp-back" }, on: { click: () => ctl.select(undefined) } }));
      box.append(card);
      const block = ctl.addBlock(e);
      const actions = h("div", { cls: "fe-kv fe-comp-actions" });
      if (e.path) actions.append(h("button", { cls: "fe-btn", text: "Open note", data: { act: "open-note" }, on: { click: () => ctl.host.openNote(e.path!) } }));
      if (ADDABLE.has(e.type) && !e.referenceOnly) {
        if (e.type === "creature") actions.append(h("select", { attrs: { "aria-label": "Companion kind" }, data: { field: "companion-kind" }, on: { change: (ev: Event) => { ctl.kind = (ev.target as HTMLSelectElement).value as CompanionKind; } } },
          ...COMPANION_KINDS.map(k => h("option", { text: k, attrs: { value: k, ...(k === ctl.kind ? { selected: "" } : {}) } }))));
        const add = h("button", { cls: "fe-btn mod-cta", text: e.type === "creature" ? "Add as companion" : "Add to character", data: { act: "add-to-character" }, on: { click: () => ctl.add(e) } });
        if (block) { add.disabled = true; add.title = block; }
        else { const t = ctl.host.target(); if (t) add.title = `Adds to ${t}`; }
        actions.append(add);
      }
      box.append(actions);
      if (block && ADDABLE.has(e.type) && !e.referenceOnly) box.append(h("div", { cls: "fe-faint", text: block, data: { note: "add-blocked" } }));
      if (ctl.status) box.append(h("div", { cls: "fe-muted", text: ctl.status, data: { note: "status" } }));
    };
    paint(entryCard(reg, e));   // at once, from the metadata; the body arrives lazily
    if (!e.library) return;
    void (async () => {
      try {
        await reg.hydrate(e);
        const text = e.referenceOnly || e.type === "creature" ? cleanBody(await reg.bodyOf(e)) : undefined;
        if (mine === token) paint(entryCard(reg, e, text));
      } catch { /* an unreadable note keeps the metadata card */ }
    })();
  };

  const render = () => {
    const counts = ctl.counts();
    clear(sourceTabs); clear(typeTabs); clear(body);
    for (const s of ctl.sources()) sourceTabs.append(tab(s === "all" ? "All" : s, ctl.source === s, { source: s }, () => ctl.setSource(s)));
    for (const t of BROWSER_TYPES) typeTabs.append(tab(`${t.label} (${counts[t.id] ?? 0})`, ctl.type === t.id, { type: t.id }, () => ctl.setType(t.id)));
    if (search.value !== ctl.query) search.value = ctl.query;
    const rows = ctl.matches(), picked = ctl.visibleSelection();
    const detail = h("div", { cls: "fe-comp-detail", data: { pane: "detail" } });
    const list = h("div", { cls: "fe-comp-list", data: { pane: "list" } },
      h("div", { cls: "fe-faint", text: `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`, data: { note: "count" } }),
      ...rows.slice(0, BROWSER_ROWS).map(e => rowFor(ctl, e)),
      rows.length > BROWSER_ROWS ? h("div", { cls: "fe-faint", text: `${rows.length - BROWSER_ROWS} more: narrow the search.` }) : null,
      rows.length ? null : h("div", { cls: "fe-faint", text: "No entries match." }));
    const ref = reg.referenceOnlyCount();
    const foot = ref ? h("div", { cls: "fe-faint", text: `${ref} library note${ref === 1 ? "" : "s"} not usable on the sheet (reference only).`, data: { note: "reference-count" } }) : null;
    if (picked) fillDetail(detail, picked);
    else detail.append(h("div", { cls: "fe-faint", text: "Pick an entry to see its card." }));
    const tail = foot ? [foot] : [];
    if (mobile) body.append(picked ? detail : list, ...tail); else body.append(h("div", { cls: "fe-comp-cols" }, list, detail), ...tail);
  };
  const off = ctl.subscribe(render); render();
  return { render, destroy: () => { off(); token++; clear(root); root.classList.remove("fe-sheet", "fe-compendium", "fe-mobile", "fe-desktop"); } };
}

/** Add `e` to the character on `ctl` (item to the inventory, spell to the spell list, creature as a companion). Returns the message to show. */
export function addToSheet(ctl: SheetController, e: Entry, kind: CompanionKind, who: string): string {
  if (!ctl.character) return "Open a character sheet first";
  const action: Action | null = e.type === "item" ? { type: "addItem", id: e.id } : e.type === "spell" ? { type: "addSpell", id: e.id }
    : e.type === "creature" ? { type: "addCompanion", creature: e.id, name: e.name, kind } : null;
  if (!action) return "Only items, spells and creatures can be added";
  if (!ctl.dispatch(action).ok) return `Could not add ${e.name} to ${who}.`;
  const used = ctl.host.registry.get(e.type, e.id);
  return `Added ${e.name} to ${who}.${used && used.sourceName !== e.sourceName ? ` The sheet uses the ${sourceLabel(used)} version of it.` : ""}`;
}
