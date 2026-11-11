import type { Registry } from "../content/registry";
import { combineVariant } from "../content/item-variant";
import type { ItemData, ItemVariant } from "../content/types/item";
import type { InventoryEntry } from "./character";

/** The library item behind a row, combined with its chosen base and the row's own changes. Custom items (no id) have none. */
export function entryItem(e: InventoryEntry, reg: Registry): ItemData | undefined {
  if (!e.id) return undefined;
  const lib = reg.get<ItemData>("item", e.id)?.data; if (!lib) return undefined;
  const baseData = e.base ? reg.get<ItemData>("item", e.base)?.data : undefined;
  let it: ItemData = lib;
  if (baseData) it = combineVariant({ ...lib, variant: lib.variant ?? { base: baseData.armor ? "armor" : "weapon" } }, baseData, e.change?.bonus);
  else if (e.change?.bonus) {
    const b = e.change.bonus;
    if (it.weapon) it = { ...it, weapon: { ...it.weapon, bonus: b } };
    else if (it.armor || it.kind === "shield") it = { ...it, effects: { ...it.effects, modifiers: [...(it.effects.modifiers ?? []), { target: "ac", value: b }] } };
  }
  if (e.change?.charges) it = { ...it, charges: e.change.charges };
  if (e.change?.name) it = { ...it, name: e.change.name };
  return it;
}

/** What the row is called: the resolved item's name, else the row's own name. */
export const entryName = (e: InventoryEntry, reg: Registry): string => entryItem(e, reg)?.name ?? e.name ?? e.id ?? "";

/** The generic item's variant while no base has been chosen yet. */
export function entryVariant(e: InventoryEntry, reg: Registry): ItemVariant | undefined {
  if (!e.id || e.base) return undefined;
  return reg.get<ItemData>("item", e.id)?.data.variant;
}

/** Armor, a shield or a weapon, by kind or by its numbers. */
export const isGear = (d: ItemData): boolean => d.kind === "armor" || d.kind === "shield" || d.kind === "weapon" || !!d.armor || !!d.weapon;

/** Key for pins and detail cards: the row when it has a base or change, else the compendium id or custom name. */
export function entryRef(e: InventoryEntry): string {
  if (e.row && (e.base || e.change)) return `inv:${e.row}`;
  return e.id ? `item:${e.id}` : `item-name:${e.name ?? ""}`;
}
