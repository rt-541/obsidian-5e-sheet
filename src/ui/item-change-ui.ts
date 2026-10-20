import { CHARGE_RESETS, type ChargeReset } from "../content/itemblock";
import { baseChoices } from "../content/item-variant";
import type { ItemData } from "../content/types";
import type { ItemChange } from "../core/character";
import { entryItem, isGear } from "../core/item-entry";
import type { SheetController } from "./controller";
import { clear, h } from "./h";
import { itemStatCard } from "./item-card";

/** The Change form as typed: raw text, so a half-typed number is kept as is. */
export interface ItemChangeForm { index: number; name: string; base: string; bonus: string; chargesMax: string; chargesReset: ChargeReset; notes: string; error?: string }

/** The bonus the plain item already has: on a weapon its own bonus, on armor or a shield the +AC a chosen base brings. */
export function plainBonus(plain: ItemData, based: boolean): number {
  if (plain.weapon) return plain.weapon.bonus ?? 0;
  return based ? (plain.effects.modifiers ?? []).reduce((n, m) => (m.target === "ac" && typeof m.value === "number" ? n + m.value : n), 0) : 0;
}

/**
 * What the form changes about the row. `plain` is the row's item without its change; a field equal to `plain` is left out, and a
 * form that changes nothing gives `null` (the row is back to what its note says). Problems come back in plain words.
 */
export function changeFromForm(f: ItemChangeForm, plain: ItemData): { change: ItemChange | null; base?: string } | { error: string } {
  const name = f.name.trim();
  if (!name) return { error: "Give the item a name." };
  const change: ItemChange = {};
  if (name !== plain.name) change.name = name;
  if (f.bonus.trim() !== "") {
    const n = Number(f.bonus);
    if (!Number.isInteger(n)) return { error: "The bonus must be a whole number, like 1." };
    if (n !== plainBonus(plain, !!f.base)) change.bonus = n;
  }
  if (f.chargesMax.trim() !== "") {
    const n = Number(f.chargesMax);
    if (!Number.isInteger(n) || n < 1) return { error: "Charges must be a whole number, 1 or more (or leave it empty)." };
    if (n !== plain.charges?.max || f.chargesReset !== plain.charges.reset) change.charges = { max: n, reset: f.chargesReset };
  }
  if (f.notes.trim()) change.notes = f.notes.trim();
  return { change: Object.keys(change).length ? change : null, ...(f.base ? { base: f.base } : {}) };
}

const field = (label: string, input: HTMLElement, cls = "") => h("label", { cls: `fe-cf-field ${cls}`.trim() }, h("span", { cls: "fe-muted", text: label }), input);

/** The Change item panel: name, base, bonus, charges and notes for one row, with the card it would have shown live. */
export function itemChangePanel(ctl: SheetController): HTMLElement {
  const f = ctl.itemChange, c = ctl.character, e = f && c?.inventory[f.index];
  if (!f || !e) return h("div", { cls: "fe-faint", text: "Nothing to change." });
  const reg = ctl.host.registry, own = entryItem({ ...e, change: undefined }, reg), gear = !!own && isGear(own);
  const variant = ctl.itemVariantOf(f.index);
  const plain = entryItem({ ...e, base: f.base || undefined, change: undefined }, reg);

  // The card the row would have, repainted in place on every input so the caret stays where it is.
  const card = h("div", { cls: "fe-item-preview", data: { pane: "change-preview" } });
  const paint = () => {
    clear(card);
    const d = ctl.itemChangeCard();
    if (d) card.append(itemStatCard(d.name, d.data, { notes: d.notes }));
  };
  const text = (label: string, key: string, get: () => string, set: (v: string) => void, o: { type?: string; mode?: string; placeholder?: string } = {}) =>
    field(label, h("input", { cls: "fe-input", attrs: { type: o.type ?? "text", ...(o.mode ? { inputmode: o.mode } : {}), ...(o.placeholder ? { placeholder: o.placeholder } : {}), value: get(), "aria-label": label }, data: { field: key, keep: key },
      on: { input: (ev: Event) => { set((ev.target as HTMLInputElement).value); paint(); } } }));
  const select = (label: string, key: string, value: string, options: { id: string; label: string }[], set: (v: string) => void) =>
    field(label, h("select", { cls: "fe-cf-input", attrs: { "aria-label": label }, data: { field: key }, on: { change: (ev: Event) => set((ev.target as HTMLSelectElement).value) } },
      ...options.map(o => h("option", { text: o.label, attrs: { value: o.id, ...(o.id === value ? { selected: "" } : {}) } }))));
  const kind = variant?.base === "armor" ? "armor" : "weapon";
  const choices = variant ? baseChoices(variant, ctl.pickers().list<ItemData>("item")) : [];
  const bt = (label: string, act: string, onClick: () => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text: label, attrs: { type: "button" }, data: { act }, on: { click: onClick } });
  paint();
  return h("div", { cls: "fe-additem-form fe-change-form", data: { form: "item-change" } },
    h("div", { cls: "fe-cf-row" }, text("Name", "change-name", () => f.name, v => { f.name = v; }, { placeholder: plain?.name })),
    variant ? h("div", { cls: "fe-cf-row" }, select(`Based on (which ${kind})`, "change-base", f.base, [{ id: "", label: `Which ${kind}? Choose one` }, ...choices.map(b => ({ id: b.id, label: b.name }))], v => ctl.setChangeBase(v))) : null,
    gear ? h("div", { cls: "fe-cf-row" }, text("Bonus", "change-bonus", () => f.bonus, v => { f.bonus = v; }, { type: "number", mode: "numeric", placeholder: "none" })) : null,
    h("div", { cls: "fe-cf-row" },
      text("Charges", "change-charges", () => f.chargesMax, v => { f.chargesMax = v; }, { type: "number", mode: "numeric", placeholder: "none" }),
      select("Charges come back", "change-charges-reset", f.chargesReset, CHARGE_RESETS.map(r => ({ id: r.id, label: r.label })), v => { f.chargesReset = v as ChargeReset; paint(); })),
    field("Notes", h("textarea", { cls: "fe-cf-input", attrs: { rows: "3", "aria-label": "Notes" }, data: { field: "change-notes" }, text: f.notes,
      on: { input: (ev: Event) => { f.notes = (ev.target as HTMLTextAreaElement).value; paint(); } } }), "fe-cf-grow"),
    card,
    f.error ? h("div", { cls: "fe-warn", text: f.error, data: { note: "change-error" } }) : null,
    h("div", { cls: "fe-cf-row" },
      bt("Save", "change-save", () => ctl.saveItemChange(), "mod-cta"),
      e.change ? bt("Undo my changes", "change-reset", () => ctl.resetItemChange()) : null,
      bt("Cancel", "change-cancel", () => ctl.close())));
}
