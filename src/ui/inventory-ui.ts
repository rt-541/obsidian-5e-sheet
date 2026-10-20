import { itemPinRef } from "../core/actions";
import { entryItem, entryRef } from "../core/item-entry";
import type { ItemData } from "../content/types";
import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { coinsRow } from "./coins-ui";
import { customizeButton } from "./customize-ui";
import { h } from "./h";
import { btn, card, pips } from "./widgets";

/** Pin key for an inventory entry: the compendium id, or the name of a custom item. */
export const itemRef = itemPinRef;
export function itemPinButton(ctl: SheetController, ref: string): HTMLElement {
  const on = ctl.character!.mainPins.includes(ref);
  const el = btn(on ? "Pinned" : "Pin", () => ctl.dispatch({ type: "pin", ref, on: !on }), `fe-pin ${on ? "is-on" : ""}`.trim()); el.dataset.act = "pin-item";
  el.title = on ? "Shown under Resources and charges (click to unpin)" : "Show under Resources and charges";
  return el;
}
/**
 * Pinned potions and items for the Resources and charges card: quantity, charges (when attuned, if it needs it) and, for
 * consumables, a Use one button that takes one off the stack. An item that is gone from the inventory is skipped.
 */
/**
 * What the inventory and a pinned copy show for one entry. A used-up item (no potions left, or every charge spent) is never
 * deleted: it stays in the list, greyed out with "none left" / "no charges left", and comes back when restocked or recharged.
 */
export function itemState(ctl: SheetController, index: number) {
  const e = ctl.character!.inventory[index], it = entryItem(e, ctl.host.registry);
  const name = it?.name ?? e.name ?? `${e.id} (missing from compendium)`;
  const charges = it?.charges && (!it.attunement || e.attuned) ? it.charges : undefined;
  const consumable = e.consumable ?? (it?.kind === "consumable");
  const outOfStock = consumable && e.qty <= 0, outOfCharges = !!charges && (e.charges?.used ?? 0) >= charges.max;
  const usedUp = outOfStock || outOfCharges;
  const upWord = outOfStock ? "none left" : outOfCharges ? "no charges left" : "";
  const useBtn = () => {
    if (!consumable) return null;
    const b = btn(e.qty > 0 ? "Use one" : "None left", () => ctl.useItem(index));
    b.dataset.act = "use-item"; (b as HTMLButtonElement).disabled = e.qty <= 0; return b;
  };
  /** One Use button per Use action the row has (from its Customize form), greyed out when its charges are spent. */
  const actionBtns = () => (ctl.stats()?.itemActions ?? []).filter(a => a.index === index).map(a => {
    const cost = a.action.cost, spent = !!cost && "charges" in cost && (e.charges?.used ?? 0) + cost.charges > ctl.limits().chargesMax(index);
    const b = btn(`Use ${a.action.name}`, () => ctl.useAction(a, index));
    b.dataset.act = "use-item-action"; if (spent) { (b as HTMLButtonElement).disabled = true; b.title = "No charges left"; }
    return b;
  });
  return { e, it, name, charges, consumable, usedUp, upWord, useBtn, actionBtns };
}


/** The big button at the top of the Inventory card. */
function addItemButton(ctl: SheetController): HTMLElement {
  const b = btn("+ Add item", () => ctl.open({ kind: "compendium" }), "mod-cta fe-add-item"); b.dataset.act = "add-item"; return b;
}

/** The small "..." button at the end of a row. */
function itemMenuButton(ctl: SheetController, index: number, name: string): HTMLElement {
  const open = ctl.itemMenu === index, b = btn("...", () => ctl.toggleItemMenu(index), `fe-item-menu-btn ${open ? "is-on" : ""}`.trim());
  b.dataset.act = "item-menu"; b.setAttribute("aria-label", `Options for ${name}`); b.setAttribute("aria-expanded", String(open)); return b;
}

/** The options under an open row: the consumable switch and the exact quantity. */
function itemMenu(ctl: SheetController, index: number, s: ReturnType<typeof itemState>): HTMLElement {
  const e = s.e;
  const sw = h("button", { cls: `fe-switch ${s.consumable ? "is-on" : ""}`, data: { act: "item-consumable" }, attrs: { type: "button", role: "switch", "aria-checked": String(s.consumable), "aria-label": "Consumable (used up when used)" },
    on: { click: () => ctl.dispatch({ type: "itemConsumable", index, on: !s.consumable }) } });
  const qty = h("input", { cls: "fe-amt", attrs: { type: "number", inputmode: "numeric", min: "0", step: "1", value: String(e.qty), "aria-label": `Quantity of ${s.name}` }, data: { act: "item-qty-input" },
    on: { change: (ev: Event) => { const n = Number((ev.target as HTMLInputElement).value); ctl.dispatch({ type: "itemQty", index, qty: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : e.qty }); } } });
  return h("div", { cls: "fe-item-menu", data: { menu: String(index) } },
    h("label", { cls: "fe-kv" }, h("span", { text: "Consumable (used up when used)" }), sw),
    h("label", { cls: "fe-kv" }, h("span", { text: "Quantity" }), qty),
    customizeButton(ctl, { kind: "item", index }),
    ctl.confirmRemove
      ? h("div", { cls: "fe-kv fe-confirm", data: { note: "remove-confirm" } }, h("span", { text: `Remove ${s.name}?` }),
        h("span", { cls: "fe-lvl" }, ((y) => { y.dataset.act = "remove-yes"; return y; })(btn("Yes", () => ctl.removeItemAt(index), "fe-dmg")),
          ((n) => { n.dataset.act = "remove-no"; return n; })(btn("No", () => ctl.askRemove(false)))))
      : ((r) => { r.dataset.act = "item-remove"; return r; })(btn("Remove", () => ctl.askRemove(true))));
}

/** A stack of ordinary things (potions, rope, daggers) can be counted up and down; one-of-a-kind gear (armor, attuned or charged items) cannot. */
export function isStackable(ctl: SheetController, index: number): boolean {
  const e = ctl.character!.inventory[index], it = entryItem(e, ctl.host.registry);
  if (!it) return !!e.name;
  return it.kind !== "armor" && it.kind !== "shield" && !it.armor && !it.attunement && !it.charges;
}

/** Minus, the count, plus. Always available, Play mode too. */
export function qtyStepper(ctl: SheetController, index: number, name: string): HTMLElement {
  const qty = ctl.character!.inventory[index].qty;
  const minus = btn("-", () => ctl.dispatch({ type: "itemQty", index, qty: qty - 1 }), "fe-qty-btn"), plus = btn("+", () => ctl.dispatch({ type: "itemQty", index, qty: qty + 1 }), "fe-qty-btn");
  minus.dataset.act = "qty-minus"; plus.dataset.act = "qty-plus";
  minus.setAttribute("aria-label", `One fewer ${name}`); plus.setAttribute("aria-label", `One more ${name}`);
  (minus as HTMLButtonElement).disabled = qty <= 0;
  return h("span", { cls: "fe-qty", data: { qty: String(qty) } }, minus, h("span", { cls: "fe-qty-n", text: String(qty), data: { act: "qty" }, attrs: { "aria-live": "polite" } }), plus);
}

export function inventoryFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character!;
  return card("Inventory", addItemButton(ctl), coinsRow(ctl), ...c.inventory.map((e, i) => {
    const s = itemState(ctl, i), it = s.it, name = s.name, stack = isStackable(ctl, i);
    return h("div", { cls: `fe-inv ${it || e.name ? "" : "is-missing"} ${s.usedUp ? "is-used-up" : ""}`.replace(/\s+/g, " ").trim(), data: { item: String(i) } },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: name, ...(it && e.id ? { data: { ref: entryRef(e) } } : {}) }), (e.id && ctl.host.registry.get("item", e.id)?.source) === "vault" ? h("span", { cls: "fe-src", text: "Homebrew" }) : null,
        h("div", { cls: "fe-faint", text: [!stack && e.qty > 1 ? `x${e.qty}` : "", s.upWord, it?.rarity ?? "", it?.attunement ? (e.attuned ? "attuned" : "requires attunement") : ""].filter(Boolean).join(" · ") })),
      stack ? qtyStepper(ctl, i, name) : null,
      s.useBtn(),
      ...s.actionBtns(),
      it && it.kind !== "gear" && it.kind !== "consumable" ? btn(e.equipped ? "Equipped" : "Equip", () => ctl.dispatch({ type: "equip", index: i, on: !e.equipped }), e.equipped ? "is-on" : "") : null,
      it?.attunement ? btn(e.attuned ? "Attuned" : "Attune", () => ctl.dispatch({ type: "attune", index: i, on: !e.attuned }), e.attuned ? "is-on" : "") : null,
      itemPinButton(ctl, itemRef(e)),
      itemMenuButton(ctl, i, name),
      ctl.itemMenu === i ? itemMenu(ctl, i, s) : null);
  }),
  weightLine(st));
}

const lb = (n: number) => String(Math.round(n * 10) / 10);
/** What you carry against what you can: a plain warning when it is too much. */
function weightLine(st: ActorStats): HTMLElement {
  const why = st.why.carry ? { data: { ref: "why:carry" } } : {}, heavy = st.carry.weight > st.carry.capacity;
  return heavy
    ? h("div", { cls: "fe-kv" }, h("span", { cls: "fe-warn fe-too-heavy", text: `Carrying ${lb(st.carry.weight)} of ${lb(st.carry.capacity)} lb: too heavy`, data: { note: "too-heavy", ...(st.why.carry ? { ref: "why:carry" } : {}) } }),
      h("span", { cls: "fe-muted", text: `attuned ${st.attunedCount}/3` }))
    : h("div", { cls: "fe-kv" }, h("span", { text: "" }), h("span", { cls: "fe-muted", text: `${st.carry.weight} / ${st.carry.capacity} lb · attuned ${st.attunedCount}/3`, ...why }));
}
