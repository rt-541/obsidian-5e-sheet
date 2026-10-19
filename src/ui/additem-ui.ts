import type { SheetController } from "./controller";
import { h } from "./h";

/** A labelled text box whose typing is kept in the controller's form without redrawing (so the caret stays put). */
const field = (label: string, input: HTMLElement, cls = "") => h("label", { cls: `fe-cf-field ${cls}`.trim() }, h("span", { cls: "fe-muted", text: label }), input);

/**
 * The custom item form at the top of the add panel: Name, Quantity, Weight (lb, optional) and "Used up when used".
 * Problems are shown under it in plain words.
 */
export function customItemForm(ctl: SheetController): HTMLElement {
  const f = ctl.customItem;
  const name = h("input", { cls: "fe-input", attrs: { type: "text", placeholder: "For example: Rope, 50 feet", value: f.name, "aria-label": "Item name" }, data: { field: "name" },
    on: { input: (e: Event) => { f.name = (e.target as HTMLInputElement).value; } } });
  const qty = h("input", { cls: "fe-input fe-amt", attrs: { type: "number", inputmode: "numeric", min: "1", step: "1", value: f.qty, "aria-label": "Quantity" }, data: { field: "qty" },
    on: { input: (e: Event) => { f.qty = (e.target as HTMLInputElement).value; } } });
  const weight = h("input", { cls: "fe-input fe-amt", attrs: { type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "optional", value: f.weight, "aria-label": "Weight in pounds" }, data: { field: "weight" },
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
