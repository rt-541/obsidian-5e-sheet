import type { Problem, Registry } from "../registry";
import conditions from "./conditions.json";
import classes from "./classes.json";
import items from "./items.json";
import creatures from "./creatures.json";
import spells from "./spells.json";

const SETS: [string, Record<string, unknown>[]][] = [
  ["condition", conditions as Record<string, unknown>[]], ["class", classes as Record<string, unknown>[]],
  ["item", items as Record<string, unknown>[]], ["creature", creatures as Record<string, unknown>[]],
  ["spell", spells as Record<string, unknown>[]],
];

export function loadSrd(r: Registry): Problem[] {
  const out: Problem[] = [];
  for (const [type, list] of SETS) for (const raw of list) { const p = r.add("srd", type, raw); if (p) out.push(p); }
  return out;
}
export const srdCounts = () => Object.fromEntries(SETS.map(([t, l]) => [t, l.length]));
