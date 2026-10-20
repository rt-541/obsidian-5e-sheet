import type { Entry } from "../content/registry";
import { sourceLabel } from "../content/registry";
import type { ItemData } from "../content/types";
import type { SheetController } from "./controller";
import { CHARGE_RESETS, ITEM_KINDS, ITEM_TEMPLATE, RARITIES, type ChargeReset, type ItemKind } from "../content/itemblock";
import { clear, h } from "./h";
import { playBadge } from "./widgets";
import { baseChoices } from "../content/item-variant";
import { draftPreview, itemSummary } from "../content/item-view";
import { MAX_ATTUNED } from "../core/actions";
import { entryItem, isGear } from "../core/item-entry";
import { previewAdd } from "../core/item-preview";
import { itemStatCard } from "./item-card";

/** A labelled text box whose typing is kept in the controller's form without redrawing (so the caret stays put). */
const field = (label: string, input: HTMLElement, cls = "") => h("label", { cls: `fe-cf-field ${cls}`.trim() }, h("span", { cls: "fe-muted", text: label }), input);

const selField = (label: string, value: string, options: { id: string; label: string }[], onChange: (v: string) => void, key: string) =>
  field(label, h("select", { cls: "fe-cf-input", attrs: { "aria-label": label }, data: { field: key }, on: { change: (e: Event) => onChange((e.target as HTMLSelectElement).value) } },
    ...options.map(o => h("option", { text: o.label, attrs: { value: o.id, ...(o.id === value ? { selected: "" } : {}) } }))));
const textField = (label: string, value: string, onInput: (v: string) => void, key: string, o: { type?: string; placeholder?: string; mode?: string } = {}) =>
  field(label, h("input", { cls: "fe-input", attrs: { type: o.type ?? "text", ...(o.mode ? { inputmode: o.mode } : {}), ...(o.placeholder ? { placeholder: o.placeholder } : {}), value, "aria-label": label }, data: { field: key, keep: `custom-${key}` },
    on: { input: (e: Event) => onInput((e.target as HTMLInputElement).value) } }));

/** The extra fields behind "More details": what an item note needs beyond a name, count and weight. */
function moreFields(ctl: SheetController, paint: () => void): HTMLElement {
  const f = ctl.customItem;
  const sel = (label: string, value: string, options: { id: string; label: string }[], onChange: (v: string) => void, key: string) => selField(label, value, options, v => { onChange(v); paint(); }, key);
  const text = (label: string, value: string, onInput: (v: string) => void, key: string, o: { type?: string; placeholder?: string; mode?: string } = {}) => textField(label, value, v => { onInput(v); paint(); }, key, o);
  const attune = h("button", { cls: `fe-switch ${f.attunement ? "is-on" : ""}`, data: { act: "custom-attunement" }, attrs: { type: "button", role: "switch", "aria-checked": String(f.attunement), "aria-label": "Needs attunement" },
    on: { click: () => { f.attunement = !f.attunement; ctl.emit(); } } });
  return h("div", { cls: "fe-item-more", data: { form: "item-details" } },
    h("div", { cls: "fe-cf-row" },
      sel("Kind", f.kind, ITEM_KINDS, v => { f.kind = v as ItemKind; }, "kind"),
      sel("Rarity", f.rarity, RARITIES.map(r => ({ id: r, label: r || "None" })), v => { f.rarity = v; }, "rarity")),
    (f.kind === "weapon" || f.kind === "armor") ? h("div", { cls: "fe-cf-row" }, text("Based on (like longsword or plate)", f.base, v => { f.base = v; }, "base")) : null,
    h("label", { cls: "fe-kv" }, h("span", { text: "Needs attunement" }), attune),
    f.attunement ? h("div", { cls: "fe-cf-row" }, text("Attunement by (optional)", f.attunementNote, v => { f.attunementNote = v; }, "attunement-note", { placeholder: "by a wizard" })) : null,
    h("div", { cls: "fe-cf-row" },
      text("Charges", f.chargesMax, v => { f.chargesMax = v; }, "charges", { type: "number", mode: "numeric", placeholder: "none" }),
      sel("Charges come back", f.chargesReset, CHARGE_RESETS.map(r => ({ id: r.id, label: r.label })), v => { f.chargesReset = v as ChargeReset; }, "charges-reset")),
    h("div", { cls: "fe-cf-row" },
      text("Attack bonus", f.attackBonus, v => { f.attackBonus = v; }, "attack-bonus", { type: "number", mode: "numeric" }),
      text("Damage bonus", f.damageBonus, v => { f.damageBonus = v; }, "damage-bonus", { type: "number", mode: "numeric" }),
      text("Armor Class bonus", f.acBonus, v => { f.acBonus = v; }, "ac-bonus", { type: "number", mode: "numeric" })),
    h("div", { cls: "fe-cf-row" }, text("Healing dice (optional)", f.heal, v => { f.heal = v; }, "heal", { placeholder: "2d4+2" })),
    field("Short description", h("textarea", { cls: "fe-cf-input", attrs: { rows: "4", "aria-label": "Short description" }, data: { field: "description" }, text: f.description,
      on: { input: (e: Event) => { f.description = (e.target as HTMLTextAreaElement).value; paint(); } } }), "fe-cf-grow"));
}

/** The paste-an-item view: paste text, Read, check the form it fills in. */
function importView(ctl: SheetController): HTMLElement {
  const f = ctl.customItem;
  const area = h("textarea", { cls: "fe-cf-input fe-cf-paste", attrs: { rows: "12", placeholder: "Paste an item here: from D&D Beyond, 5e.tools, a PDF, or a ```5e-item block from a note.", "aria-label": "Item text" }, data: { field: "import-text" }, text: f.importText,
    on: { input: (e: Event) => { f.importText = (e.target as HTMLTextAreaElement).value; } } });
  const msg = h("div", { cls: "fe-warn", attrs: { role: "alert" } }); msg.hidden = true;
  const fallback = h("div", {});
  if (f.showTemplate) {
    const box = h("textarea", { cls: "fe-cf-input fe-cf-paste", attrs: { rows: "10", readonly: "", "aria-label": "Item template" }, text: ITEM_TEMPLATE });
    fallback.append(h("div", { cls: "fe-faint", text: "Your device would not copy it for you. Select all of this text and copy it by hand." }), box);
    window.setTimeout(() => { box.focus(); box.select(); }, 0);
  }
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(ITEM_TEMPLATE);
      f.showTemplate = false; ctl.host.notify("Template copied. Paste it into a note and fill it in."); ctl.emit();
    } catch { f.showTemplate = true; ctl.emit(); }
  };
  return h("div", { cls: "fe-additem-import", data: { form: "import-item" } },
    h("div", { cls: "fe-faint", text: "Paste an item and press Read. You can check everything before it is saved." }), area, msg,
    h("div", { cls: "fe-cf-row" },
      h("button", { cls: "fe-btn mod-cta", text: "Read item", attrs: { type: "button" }, data: { act: "read-item" },
        on: { click: () => { if (!f.importText.trim()) { msg.hidden = false; msg.textContent = "Paste an item first."; return; } ctl.readItemText(f.importText); } } }),
      h("button", { cls: "fe-btn", text: "Copy template", attrs: { type: "button" }, data: { act: "copy-item-template" }, on: { click: () => { void copy(); } } }),
      h("button", { cls: "fe-btn", text: "Back", attrs: { type: "button" }, data: { act: "import-back" }, on: { click: () => { f.importing = false; ctl.emit(); } } })), fallback);
}

/**
 * The custom item form at the top of the add panel: Name, Quantity, Weight (lb, optional) and "Used up when used", with More details
 * (kind, rarity, attunement, charges, bonuses, description) and an import from pasted text. Problems are shown under it in plain words.
 */
export function customItemForm(ctl: SheetController): HTMLElement {
  const f = ctl.customItem;
  if (f.importing) return importView(ctl);
  // The card the item would have, repainted in place on every input so the caret stays where it is.
  const preview = h("div", { cls: "fe-item-preview", data: { pane: "item-preview" } });
  const paint = () => {
    clear(preview);
    const p = draftPreview(ctl.itemDraftFromForm(), ctl.pickers());
    preview.append(p ? itemStatCard(p.name, p.data) : h("div", { cls: "fe-faint", text: "Give the item a name to see its card." }));
  };
  const name = h("input", { cls: "fe-input", attrs: { type: "text", placeholder: "For example: Rope, 50 feet", value: f.name, "aria-label": "Item name" }, data: { field: "name", keep: "custom-name" },
    on: { input: (e: Event) => { f.name = (e.target as HTMLInputElement).value; paint(); } } });
  const qty = h("input", { cls: "fe-input fe-amt", attrs: { type: "number", inputmode: "numeric", min: "1", step: "1", value: f.qty, "aria-label": "Quantity" }, data: { field: "qty", keep: "custom-qty" },
    on: { input: (e: Event) => { f.qty = (e.target as HTMLInputElement).value; } } });
  const weight = h("input", { cls: "fe-input fe-amt", attrs: { type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "optional", value: f.weight, "aria-label": "Weight in pounds" }, data: { field: "weight", keep: "custom-weight" },
    on: { input: (e: Event) => { f.weight = (e.target as HTMLInputElement).value; paint(); } } });
  const used = h("button", { cls: `fe-switch ${f.consumable ? "is-on" : ""}`, data: { act: "custom-consumable" }, attrs: { type: "button", role: "switch", "aria-checked": String(f.consumable), "aria-label": "Used up when used (consumable)" },
    on: { click: () => { f.consumable = !f.consumable; ctl.emit(); } } });
  const btn = (label: string, act: string, onClick: () => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text: label, attrs: { type: "button" }, data: { act }, on: { click: onClick } });
  const canSave = !!ctl.host.saveItem;
  if (f.more) paint();
  return h("div", { cls: "fe-additem-form", data: { form: "custom-item" } },
    h("div", { cls: "fe-card-title", text: "Custom item" }),
    h("div", { cls: "fe-cf-row" }, field("Name", name, "fe-cf-grow"), field("Quantity", qty), field("Weight (lb)", weight)),
    h("label", { cls: "fe-kv" }, h("span", { text: "Used up when used (consumable)" }), used),
    f.more ? moreFields(ctl, paint) : null,
    f.more ? preview : null,
    f.unread.length ? h("div", { cls: "fe-muted", data: { unread: "" } }, ...f.unread.map(l => h("div", { text: `Skipped: ${l}` }))) : null,
    f.error ? h("div", { cls: "fe-warn", text: f.error, data: { note: "custom-item-error" } }) : null,
    h("div", { cls: "fe-cf-row" },
      btn("Add custom item", "add-custom", () => ctl.submitCustomItem(), "mod-cta"),
      canSave ? btn("Save to compendium and add", "save-item", () => { void ctl.saveItemToCompendium(); }) : null,
      btn(f.more ? "Fewer details" : "More details", "item-more", () => { f.more = !f.more; ctl.emit(); }),
      btn("Import an item", "import-item", () => { f.importing = true; ctl.emit(); })));
}

export type ItemChip = "all" | "consumable" | "weapon" | "armor" | "gear" | "magic";
/** The add panel's search box and kind chip, kept in the controller so they survive redraws. */
export interface ItemSearch { query: string; chip: ItemChip; /** The result whose card is open. */ selected?: string; }
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
  const owned = ctl.character!.inventory.some(x => x.id === e.id), gear = isGear(e.data) || !!e.data.variant;
  const open = ctl.itemSearch.selected === e.id;
  const label = owned && !gear ? "+1" : "Add";
  return h("div", { cls: "fe-result" },
    h("div", { cls: "fe-inv" },
      h("div", { cls: "fe-grow" },
        h("span", { cls: "fe-inv-name", text: e.name, data: { ref: `item:${e.id}`, noclick: "" }, attrs: { role: "button", tabindex: "0", "aria-expanded": String(open) },
          on: { click: () => { ctl.itemSearch.selected = open ? undefined : e.id; ctl.emit(); } } }),
        playBadge(sourceLabel(e)),
        h("div", { cls: "fe-faint", text: [e.data.rarity, e.data.attunement ? "attunement" : ""].filter(Boolean).join(" · ") }),
        owned && gear ? h("div", { cls: "fe-faint", text: "Owned", data: { note: "owned" } }) : null),
      h("button", { cls: "fe-btn", text: label, data: { item: e.id }, on: { click: () => { void ctl.startAdd(e.id); } } })),
    open ? itemStatCard(e.name, e.data) : null);
}

/** The pick view that replaces the results: "Which armor?" while a generic item has no base, then its card and the equip choice. */
function pickView(ctl: SheetController): HTMLElement {
  const p = ctl.addPick!, reg = ctl.host.registry, c = ctl.character!;
  const plain = { qty: 1, equipped: false, attuned: false };
  const lib = entryItem({ ...plain, id: p.id }, reg);
  const back = h("button", { cls: "fe-btn", text: "Back", attrs: { type: "button" }, data: { act: "add-back" }, on: { click: () => { ctl.addPick = null; ctl.emit(); } } });
  if (!lib) return h("div", { cls: "fe-card", data: { pane: "add-pick" } }, back);
  if (lib.variant && !p.base) {
    const kind = lib.variant.base === "armor" ? "armor" : "weapon";
    const choices = baseChoices(lib.variant, ctl.pickers().list<ItemData>("item"));
    return h("div", { cls: "fe-card fe-base-pick", data: { pane: "base-pick" } },
      h("div", { cls: "fe-card-title", text: `Which ${kind}?` }),
      ...choices.map(b => {
        const d = entryItem({ ...plain, id: p.id, base: b.id }, reg);
        return h("button", { cls: "fe-btn fe-base-choice", text: d ? itemSummary(d.name, d) : b.name, attrs: { type: "button" }, data: { base: b.id }, on: { click: () => ctl.pickBase(b.id) } });
      }),
      choices.length ? null : h("div", { cls: "fe-faint", text: `No ordinary ${kind} in your compendium fits this item.`, data: { note: "no-base" } }),
      back);
  }
  const d = entryItem({ ...plain, id: p.id, ...(p.base ? { base: p.base } : {}) }, reg)!;
  const attuned = c.inventory.filter(x => x.attuned).length, full = attuned >= MAX_ATTUNED;
  const btn = (text: string, act: string, onClick: () => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text, attrs: { type: "button" }, data: { act }, on: { click: onClick } });
  const attune = d.attunement ? btn(`Equip and attune (${Math.min(attuned + 1, MAX_ATTUNED)} of ${MAX_ATTUNED})`, "add-attune", () => ctl.finishAdd("attune")) : null;
  if (attune && full) attune.setAttribute("disabled", "");
  return h("div", { cls: "fe-base-pick", data: { pane: "add-choice" } },
    itemStatCard(d.name, d),
    h("div", { cls: "fe-muted", text: previewAdd(c, ctl.ctx(), { id: p.id, ...(p.base ? { base: p.base } : {}) }), data: { note: "equip-preview" } }),
    attune && full ? h("div", { cls: "fe-warn", text: `Already attuned to ${MAX_ATTUNED} items`, data: { note: "attune-full" } }) : null,
    h("div", { cls: "fe-cf-row" },
      btn("Equip now", "add-equip", () => ctl.finishAdd("equip"), "mod-cta"), attune,
      btn("Just add it", "add-only", () => ctl.finishAdd("add")),
      lib.variant ? btn("Choose another", "add-rebase", () => ctl.pickBase(undefined)) : null, back));
}

/** The results list: rebuilt in place while typing, so the search box keeps its focus and caret. */
function fillResults(ctl: SheetController, box: HTMLElement) {
  clear(box);
  if (ctl.addPick) { box.append(pickView(ctl)); return; }
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
  if (ctl.customItem.importing) return h("div", { cls: "fe-additem" }, customItemForm(ctl));
  const box = h("div", { cls: "fe-additem-results", data: { pane: "item-results" } });
  const search = h("input", { cls: "fe-search", attrs: { type: "search", placeholder: "Search items by name", value: ctl.itemSearch.query, "aria-label": "Search items" }, data: { keep: "item-search", autofocus: "" },
    on: { input: (e: Event) => { ctl.itemSearch.query = (e.target as HTMLInputElement).value; ctl.addPick = null; fillResults(ctl, box); } } });
  fillResults(ctl, box);
  return h("div", { cls: "fe-additem" }, search,
    h("div", { cls: "fe-filters", data: { group: "item-chips" } }, ...CHIPS.map(c =>
      h("button", { cls: `fe-btn ${ctl.itemSearch.chip === c.id ? "is-on" : ""}`.trim(), text: c.label, data: { chip: c.id }, on: { click: () => { ctl.itemSearch.chip = c.id; ctl.addPick = null; ctl.emit(); } } }))),
    box,
    h("div", { cls: "fe-card-title", text: "Not in the list? Make your own" }), customItemForm(ctl));
}
