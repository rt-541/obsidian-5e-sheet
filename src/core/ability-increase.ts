import type { AbilityIncrease } from "../content/types";
import { ABILS, type Abil } from "./types";

export type AbilityDelta = Partial<Record<Abil, number>>;

/** The step / choice key of the n-th `choose` group of a race, subrace or feat. */
export const abilityKey = (kind: "race" | "subrace" | "feat", id: string, index: number): string => `${kind}:${id}:${index === 0 ? "ability" : `ability-${index + 1}`}`;

const isAbils = (v: unknown, from: readonly Abil[], count: number): v is Abil[] =>
  Array.isArray(v) && v.length === count && new Set(v).size === count && v.every(a => from.includes(a as Abil));

/**
 * What an ability increase adds, as per-ability amounts: the fixed part plus `amount` for each ability picked in every choose group.
 * `picks[i]` answers `inc.choose[i]`; a group whose answer is missing or not allowed adds nothing and is reported in `missing`.
 * With `current` and `max`, a positive amount stops at the maximum (the delta is what actually applies, so recording it makes undo exact).
 */
export function increaseDelta(inc: AbilityIncrease | undefined, picks: unknown[], current?: Record<Abil, number>, max?: Record<Abil, number>): { delta: AbilityDelta; missing: number[] } {
  const want: AbilityDelta = {}, missing: number[] = [];
  if (!inc) return { delta: want, missing };
  for (const [a, n] of Object.entries(inc.fixed)) want[a as Abil] = (want[a as Abil] ?? 0) + n;
  inc.choose.forEach((g, i) => {
    const p = picks[i];
    if (!isAbils(p, g.from, g.count)) { missing.push(i); return; }
    for (const a of p) want[a] = (want[a] ?? 0) + g.amount;
  });
  const delta: AbilityDelta = {};
  for (const a of ABILS) {
    let n = want[a] ?? 0;
    if (n > 0 && current && max) n = Math.min(n, Math.max(0, max[a] - current[a]));
    else if (n < 0 && current) n = Math.max(n, 1 - current[a]);
    if (n) delta[a] = n;
  }
  return { delta, missing };
}

export const describeDelta = (d: AbilityDelta): string => ABILS.filter(a => d[a]).map(a => `${d[a]! >= 0 ? "+" : ""}${d[a]} ${a.toUpperCase()}`).join(", ");
