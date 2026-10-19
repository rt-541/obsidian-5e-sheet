import type { ItemData } from "../content/types";
import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { h } from "./h";
import { btn, card, pips } from "./widgets";

/** Pin key for an inventory entry: the compendium id, or the name of a custom item. */
export const itemRef = (e: { id?: string; name?: string }) => (e.id ? `item:${e.id}` : `item-name:${e.name ?? ""}`);
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
  const e = ctl.character!.inventory[index], it = e.id ? ctl.host.registry.get<ItemData>("item", e.id) : undefined;
  const name = it?.name ?? e.name ?? `${e.id} (missing from compendium)`;
  const charges = it?.data.charges && (!it.data.attunement || e.attuned) ? it.data.charges : undefined;
  const consumable = it?.data.kind === "consumable" || (!it && !!e.name && e.qty !== 1);
  const outOfStock = consumable && e.qty <= 0, outOfCharges = !!charges && (e.charges?.used ?? 0) >= charges.max;
  const usedUp = outOfStock || outOfCharges;
  const upWord = outOfStock ? "none left" : outOfCharges ? "no charges left" : "";
  const useBtn = () => {
    if (!consumable) return null;
    const b = btn(e.qty > 0 ? "Use one" : "None left", () => {
      ctl.dispatch({ type: "itemQty", index, qty: e.qty - 1 });
      ctl.host.notify(e.qty - 1 > 0 ? `Used ${name}: ${e.qty - 1} left.` : `Used ${name}: none left. It stays in your inventory, greyed out.`);
    });
    b.dataset.act = "use-item"; (b as HTMLButtonElement).disabled = e.qty <= 0; return b;
  };
  return { e, it, name, charges, consumable, usedUp, upWord, useBtn };
}


/** A stack of ordinary things (potions, rope, daggers) can be counted up and down; one-of-a-kind gear (armor, attuned or charged items) cannot. */
export function isStackable(ctl: SheetController, index: number): boolean {
  const e = ctl.character!.inventory[index], it = e.id ? ctl.host.registry.get<ItemData>("item", e.id)?.data : undefined;
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
  return card("Inventory", ...c.inventory.map((e, i) => {
    const s = itemState(ctl, i), it = s.it, name = s.name, stack = isStackable(ctl, i);
    return h("div", { cls: `fe-inv ${it || e.name ? "" : "is-missing"} ${s.usedUp ? "is-used-up" : ""}`.replace(/\s+/g, " ").trim(), data: { item: String(i) } },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: name, ...(it && e.id ? { data: { ref: `item:${e.id}` } } : {}) }), it?.source === "vault" ? h("span", { cls: "fe-src", text: "Homebrew" }) : null,
        h("div", { cls: "fe-faint", text: [!stack && e.qty > 1 ? `x${e.qty}` : "", s.upWord, it?.data.rarity ?? "", it?.data.attunement ? (e.attuned ? "attuned" : "requires attunement") : ""].filter(Boolean).join(" · ") })),
      stack ? qtyStepper(ctl, i, name) : null,
      s.useBtn(),
      it && it.data.kind !== "gear" && it.data.kind !== "consumable" ? btn(e.equipped ? "Equipped" : "Equip", () => ctl.dispatch({ type: "equip", index: i, on: !e.equipped }), e.equipped ? "is-on" : "") : null,
      it?.data.attunement ? btn(e.attuned ? "Attuned" : "Attune", () => ctl.dispatch({ type: "attune", index: i, on: !e.attuned }), e.attuned ? "is-on" : "") : null,
      ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeItem", index: i })) : null,
      itemPinButton(ctl, itemRef(e)));
  }),
  h("div", { cls: "fe-kv" }, h("span", { text: Object.entries(c.coins).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(" ") || "No coins" }),
    h("span", { cls: "fe-muted", text: `${st.carry.weight} / ${st.carry.capacity} lb · attuned ${st.attunedCount}/3`, ...(st.why.carry ? { data: { ref: "why:carry" } } : {}) })),
  btn("Add from compendium", () => ctl.open({ kind: "compendium" })));
}
