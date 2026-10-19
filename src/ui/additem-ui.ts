import type { Entry } from "../content/registry";
import { sourceLabel } from "../content/registry";
import type { ItemData } from "../content/types";
import type { SheetController } from "./controller";
import { clear, h } from "./h";
import { sourceBadge } from "./widgets";

/** A labelled text box whose typing is kept in the controller's form without redrawing (so the caret stays put). */
const field = (label: string, input: HTMLElement, cls = "") => h("label", { cls: `fe-cf-field ${cls}`.trim() }, h("span", { cls: "fe-muted", text: label }), input);

/**
 * The custom item form at the top of the add panel: Name, Quantity, Weight (lb, optional) and "Used up when used".
 * Problems are shown under it in plain words.
 */
export function customItemForm(ctl: SheetController): HTMLElement {
  const f = ctl.customItem;
  const name = h("input", { cls: "fe-input", attrs: { type: "text", placeholder: "For example: Rope, 50 feet", value: f.name, "aria-label": "Item name" }, data: { field: "name", keep: "custom-name" },
    on: { input: (e: Event) => { f.name = (e.target as HTMLInputElement).value; } } });
  const qty = h("input", { cls: "fe-input fe-amt", attrs: { type: "number", inputmode: "numeric", min: "1", step: "1", value: f.qty, "aria-label": "Quantity" }, data: { field: "qty", keep: "custom-qty" },
    on: { input: (e: Event) => { f.qty = (e.target as HTMLInputElement).value; } } });
  const weight = h("input", { cls: "fe-input fe-amt", attrs: { type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "optional", value: f.weight, "aria-label": "Weight in pounds" }, data: { field: "weight", keep: "custom-weight" },
    on: { input: (e: Event) => { f.weight = (e.target as HTMLInputElement).value; } } });
  const used = h("button", { cls: `fe-switch ${f.consumable ? "is-on" : ""}`, data: { act: "custom-consumable" }, attrs: { type: "button", role: "switch", "aria-checked": String(f.consumable), "aria-label": "Used up when used (consumable)" },
    on: { click: () => { f.consumable = !f.consumable; ctl.emit(); } } });
  return h("div", { cls: "fe-additem-form", data: { form: "custom-item" } },
    h("div", { cls: "fe-card-title", text: "Custom item" }),
    h("div", { cls: "fe-cf-row" }, field("Name", name, "fe-cf-grow"), field("Quantity", qty), field("Weight (lb)", weight)),
    h("label", { cls: "fe-kv" }, h("span", { text: "Used up when used (consumable)" }), used),
    f.error ? h("div", { cls: "fe-warn", text: f.error, data: { note: "custom-item-error" } }) : null,
    h("button", { cls: "fe-btn mod-cta", text: "Add custom item", data: { act: "add-custom" }, on: { click: () => ctl.submitCustomItem() } }));
}

export type ItemChip = "all" | "consumable" | "weapon" | "armor" | "gear" | "magic";
/** The add panel's search box and kind chip, kept in the controller so they survive redraws. */
export interface ItemSearch { query: string; chip: ItemChip; }
export const blankItemSearch = (): ItemSearch => ({ query: "", chip: "all" });
const CHIPS: { id: ItemChip; label: string }[] = [
  { id: "all", label: "All" }, { id: "consumable", label: "Potions and scrolls" }, { id: "weapon", label: "Weapons" },
  { id: "armor", label: "Armor" }, { id: "gear", label: "Gear" }, { id: "magic", label: "Magic items" },
];
export const ITEM_RESULT_CAP = 50, MIN_QUERY = 2;

const isMagic = (d: ItemData) => d.kind === "wondrous" || d.attunement || (!!d.rarity && !["common", "mundane", "none"].includes(d.rarity.toLowerCase()));
function inChip(chip: ItemChip, d: ItemData): boolean {
  switch (chip) {
    case "all": return true;
    case "consumable": return d.kind === "consumable";
    case "weapon": return d.kind === "weapon";
    case "armor": return d.kind === "armor" || d.kind === "shield";
    case "gear": return d.kind === "gear";
    case "magic": return isMagic(d);
  }
}

/** What the add panel lists now: a hint until two characters or a chip, else name matches (starts-with first), capped. */
export function itemResults(ctl: SheetController): { hint: boolean; rows: Entry<ItemData>[]; more: number } {
  const { query, chip } = ctl.itemSearch, q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY && chip === "all") return { hint: true, rows: [], more: 0 };
  const hits = ctl.pickers().list<ItemData>("item").filter(e => inChip(chip, e.data) && e.name.toLowerCase().includes(q));
  const rank = (e: Entry<ItemData>) => (e.name.toLowerCase().startsWith(q) ? 0 : 1);
  const sorted = hits.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map(x => x.e);
  return { hint: false, rows: sorted.slice(0, ITEM_RESULT_CAP), more: Math.max(0, sorted.length - ITEM_RESULT_CAP) };
}

function resultRow(ctl: SheetController, e: Entry<ItemData>): HTMLElement {
  const owned = ctl.character!.inventory.some(x => x.id === e.id);
  return h("div", { cls: "fe-inv" },
    h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: e.name, data: { ref: `item:${e.id}` } }), sourceBadge(sourceLabel(e)),
      h("div", { cls: "fe-faint", text: [e.data.rarity, e.data.attunement ? "attunement" : "", e.path ?? ""].filter(Boolean).join(" · ") })),
    h("button", { cls: "fe-btn", text: owned ? "+1" : "Add", data: { item: e.id }, on: { click: () => ctl.addItem(e.id) } }));
}

/** The results list: rebuilt in place while typing, so the search box keeps its focus and caret. */
function fillResults(ctl: SheetController, box: HTMLElement) {
  clear(box);
  const res = itemResults(ctl), q = ctl.itemSearch.query.trim();
  if (res.hint) { box.append(h("div", { cls: "fe-faint", text: "Type to search", data: { note: "item-hint" } })); return; }
  box.append(...res.rows.map(e => resultRow(ctl, e)));
  if (res.more) box.append(h("div", { cls: "fe-faint", text: `${res.more} more: keep typing`, data: { note: "item-more" } }));
  if (!res.rows.length) {
    box.append(h("div", { cls: "fe-faint", text: q ? `No item matches "${q}".` : "Nothing in this group yet.", data: { note: "item-none" } }));
    if (q) box.append(h("button", { cls: "fe-btn", text: `Add '${q}' as a custom item`, data: { act: "prefill-custom" },
      on: { click: () => { ctl.customItem.name = q; delete ctl.customItem.error; ctl.focusNext = "custom-name"; ctl.emit(); } } }));
  }
}

/** The "Add item" panel: custom item form, search box, kind chips and results. */
export function addItemPanel(ctl: SheetController): HTMLElement {
  const box = h("div", { cls: "fe-additem-results", data: { pane: "item-results" } });
  const search = h("input", { cls: "fe-search", attrs: { type: "search", placeholder: "Search items by name", value: ctl.itemSearch.query, "aria-label": "Search items" }, data: { keep: "item-search", autofocus: "" },
    on: { input: (e: Event) => { ctl.itemSearch.query = (e.target as HTMLInputElement).value; fillResults(ctl, box); } } });
  fillResults(ctl, box);
  return h("div", { cls: "fe-additem" }, customItemForm(ctl),
    h("div", { cls: "fe-card-title", text: "From the compendium" }), search,
    h("div", { cls: "fe-filters", data: { group: "item-chips" } }, ...CHIPS.map(c =>
      h("button", { cls: `fe-btn ${ctl.itemSearch.chip === c.id ? "is-on" : ""}`.trim(), text: c.label, data: { chip: c.id }, on: { click: () => { ctl.itemSearch.chip = c.id; ctl.emit(); } } }))),
    box);
}
