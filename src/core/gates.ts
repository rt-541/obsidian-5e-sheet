import type { ItemData } from "../content/types";
import type { InventoryEntry } from "./character";
import { itemWorks, type SourcedEffects } from "./effects";

/** What an effects block's `while` list is checked against. */
export interface GateState {
  armor: "none" | "light" | "medium" | "heavy"; shield: boolean;
  /** Two weapons in hand (two equipped melee weapons). */
  dual: boolean;
  active: Record<string, unknown>; concentrating: boolean;
}
export const NO_GATES: GateState = { armor: "none", shield: false, dual: false, active: {}, concentrating: false };

const SIMPLE = ["armor:none", "armor:worn", "armor:light", "armor:medium", "armor:heavy", "shield:none", "shield:worn", "wield:dual", "concentrating"];
/** `armor:worn`, `!armor:heavy`, `toggle:rage`, ... */
export function validGate(g: string): boolean {
  if (typeof g !== "string") return false;
  const x = g.startsWith("!") ? g.slice(1) : g;
  return SIMPLE.includes(x) || /^toggle:[a-z0-9-]+$/.test(x);
}

const isOn = (v: unknown) => v !== undefined && v !== null && v !== false && v !== 0 && v !== "";
export function gateHolds(g: string, s: GateState): boolean {
  const neg = g.startsWith("!"), x = neg ? g.slice(1) : g;
  let ok: boolean;
  if (x.startsWith("toggle:")) ok = isOn(s.active[x.slice(7)]);
  else switch (x) {
    case "armor:none": ok = s.armor === "none"; break;
    case "armor:worn": ok = s.armor !== "none"; break;
    case "armor:light": case "armor:medium": case "armor:heavy": ok = s.armor === x.slice(6); break;
    case "shield:none": ok = !s.shield; break;
    case "shield:worn": ok = s.shield; break;
    case "wield:dual": ok = s.dual; break;
    case "concentrating": ok = s.concentrating; break;
    default: ok = false;
  }
  return neg ? !ok : ok;
}

/** Armor class (light = full Dex, medium = Dex up to 2, heavy = none), shield and two-weapon state from the equipped items. */
export function gateStateOf(items: { e: InventoryEntry; it: ItemData | undefined }[], active: Record<string, unknown>, concentrating: boolean): GateState {
  const works = items.filter(x => x.it && itemWorks(x.e, x.it));
  const armor = works.find(x => x.it!.armor)?.it?.armor;
  const melee = works.filter(x => x.it!.weapon?.range === "melee").length;
  return { armor: !armor ? "none" : armor.dex === "full" ? "light" : armor.dex === "max2" ? "medium" : "heavy",
    shield: works.some(x => x.it!.kind === "shield"), dual: melee >= 2, active, concentrating };
}

/** Drops every effects block whose `while` gates do not all hold. */
export const filterGated = (list: SourcedEffects[], s: GateState): SourcedEffects[] =>
  list.filter(x => !x.effects.while || x.effects.while.every(g => gateHolds(g, s)));
