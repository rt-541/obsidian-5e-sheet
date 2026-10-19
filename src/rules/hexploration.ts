import type { Registry } from "../content/registry";
import type { ItemData } from "../content/types";
import type { Character } from "../core/character";
import type { RestCtx, RuleModule } from "./module";

/** Item ids that are a day of food. Any entry whose name has "ration" in it counts too. */
const RATION_IDS = ["rations", "rations-1-day"];
const RATION_NAME = /\bration/i;

/** Index of the inventory entry that is the character's rations, or -1. */
export function findRations(c: Character, registry: Registry): number {
  return c.inventory.findIndex(e => (e.id !== undefined && RATION_IDS.includes(e.id)) || RATION_NAME.test(e.name ?? (e.id ? registry.get<ItemData>("item", e.id)?.name ?? "" : "")));
}

/** Days of food a Survival check finds: nothing under 10, then one day, and one more for every 5 above 10. */
export const foodDays = (total: number): number => (total >= 10 ? 1 + Math.floor((total - 10) / 5) : 0);

/**
 * The night's meal: food foraged today first, else one ration. Changes `c`; the lines go in the rest summary.
 * Only a night's rest or a long rest is a night.
 */
export function eatTonight(restId: string, ctx: RestCtx, c: Character): string[] {
  if (restId !== "night" && restId !== "long") return [];
  if ((c.rest.foraged ?? 0) > 0) { delete c.rest.foraged; return ["Ate the food you foraged today"]; }
  const i = findRations(c, ctx.registry);
  if (i < 0 || c.inventory[i].qty <= 0) return ["No rations left: you go hungry tonight"];
  c.inventory[i].qty -= 1;
  return [`Ate a ration (${c.inventory[i].qty} left)`];
}

/** Optional rule: the party eats a ration every night and can forage for more. Off unless the table turns it on. */
export const hexploration: RuleModule = {
  id: "hexploration", title: "Hexploration: rations and foraging", defaultOn: false, excludes: [], rests: [], sections: ["rations"],
  onRest: eatTonight,
};
