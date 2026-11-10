import type { AbilityIncrease, AbilityPick } from "../content/types";
import { ABILS, type Abil } from "./types";

export type AbilityDelta = Partial<Record<Abil, number>>;

/** The step / choice key of the n-th `choose` group of a race, subrace or feat. */
export const abilityKey = (kind: "race" | "subrace" | "background" | "feat", id: string, index: number): string => `${kind}:${id}:${index === 0 ? "ability" : `ability-${index + 1}`}`;

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

/** The key of the answer to a background's (or race's, subrace's) ability pick; the answer is `{ pattern, to }`. */
export const abilityPickKey = (kind: "race" | "subrace" | "background" | "feat", id: string): string => `${kind}:${id}:pick`;

/** What an answered pick adds: `to[i]` receives `patterns[pattern][i]`; undefined when the answer is not a whole, allowed one. */
export function pickDelta(p: AbilityPick, answer: unknown): AbilityDelta | undefined {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return undefined;
  const { pattern, to } = answer as { pattern?: unknown; to?: unknown };
  if (typeof pattern !== "number" || !Number.isInteger(pattern)) return undefined;
  const nums = p.patterns[pattern];
  if (!nums || !Array.isArray(to) || to.length !== nums.length || new Set(to).size !== to.length || !to.every(a => p.from.includes(a as Abil))) return undefined;
  const out: AbilityDelta = {};
  nums.forEach((n, i) => { out[to[i] as Abil] = n; });
  return out;
}

const COUNT_WORD = ["", "one", "two", "three", "four"];
/** A pattern in plain words: [2, 1] is "+2 to one ability and +1 to another". */
export function describePattern(pattern: number[]): string {
  if (pattern.length > 1 && pattern.every(n => n === pattern[0])) return `+${pattern[0]} to each of ${COUNT_WORD[pattern.length]} abilities`;
  const parts = pattern.map((n, i) => `+${n} to ${["one ability", "another", "a third", "a fourth"][i]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}
