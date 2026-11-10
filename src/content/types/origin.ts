import { ABILS, type Abil } from "../../core/types";
import { isObj, str, type Errs, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { optOut, validateLevels, validateOps, validateOptions, type Op, type OptionDef } from "./ops";

/** Subclass: picked inside a class; its `levels` are keyed by the CLASS level at which they apply. */
export interface SubclassData { name: string; class: string; options?: Record<string, OptionDef[]>; levels: Record<number, Op[]>; /** false: the built-in mechanics never fill in this subclass. */ overlay?: false; }
/** Ability score increase of a race, subrace or feat: fixed amounts plus "pick `count` of `from`, +`amount` each" groups. */
export interface AbilityChoose { from: Abil[]; count: number; amount: number; /** The highest score this group may raise an ability to (20 to 30); absent means the usual 20. */ max?: number; }
export interface AbilityIncrease { fixed: Partial<Record<Abil, number>>; choose: AbilityChoose[]; /** Per ability, the score cap of the entry its fixed amount was written in (absent: the usual 20). */ fixedMax?: Partial<Record<Abil, number>>; }
/** "Pick one pattern, then give each number of it to a different ability of `from`" (a background's ability scores). */
export interface AbilityPick { from: Abil[]; patterns: number[][]; }
/** Race, subrace, background and feat: a flat list of grants. */
export interface GrantsData { name: string; grants: Op[]; ability?: AbilityIncrease; abilityPick?: AbilityPick; /** false: the built-in mechanics never fill in this note. */ overlay?: false; }
export interface SubraceData extends GrantsData { race: string; }
export interface FeatData extends GrantsData { prerequisite?: string; /** An opaque label (a slot offers the feats of the categories it lists). */ category?: string; /** The character level from which the feat may be taken. */ minLevel?: number; }

/**
 * The raw 5e.tools `ability` field: a list (or one mapping) of `{ con: 2 }` and `{ choose: { from, count, amount } }`, which may share a mapping
 * (`{ cha: 2, choose: {...} }`). An entry may carry `max` (a whole number from 20 to 30: the highest score its increase may raise an ability to).
 * All entries of the list add up. `choose.from` defaults to all six abilities, `count` and `amount` to 1.
 */
export function parseAbilityIncrease(v: unknown, at: string, e: Errs): AbilityIncrease | undefined {
  if (v === undefined) return undefined;
  const list = Array.isArray(v) ? v : [v], fixed: Partial<Record<Abil, number>> = {}, choose: AbilityChoose[] = [], fixedMax: Partial<Record<Abil, number>> = {}, before = e.length;
  list.forEach((entry: unknown, i: number) => {
    const here = Array.isArray(v) ? `${at}[${i}]` : at;
    if (!isObj(entry)) { e.push(`${here}: must be a mapping such as { con: 2 }`); return; }
    let max: number | undefined, own = 0;
    if ("max" in entry) {
      const m = entry.max;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 20 || m > 30) e.push(`${here}.max: must be a whole number from 20 to 30`);
      else max = m;
    }
    const mark = choose.length, fixedHere: Abil[] = [];
    for (const [k, x] of Object.entries(entry)) {
      if (k === "max") continue;
      if (k === "choose") {
        if (!isObj(x)) { e.push(`${here}.choose: must be a mapping with from, count and amount`); continue; }
        if (x.weighted !== undefined) { e.push(`${here}.choose.weighted: not supported, use from, count and amount`); continue; }
        const from = x.from === undefined ? [...ABILS] : Array.isArray(x.from) && x.from.every(a => ABILS.includes(a as Abil)) && x.from.length ? [...new Set(x.from as Abil[])] : undefined;
        const count = x.count === undefined ? 1 : x.count, amount = x.amount === undefined ? 1 : x.amount;
        if (!from) e.push(`${here}.choose.from: must be a list of abilities (${ABILS.join(", ")})`);
        else if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > from.length) e.push(`${here}.choose.count: must be a whole number from 1 to ${from.length}`);
        else if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 4) e.push(`${here}.choose.amount: must be a whole number from 1 to 4`);
        else choose.push({ from, count, amount });
      } else if (ABILS.includes(k as Abil)) {
        if (typeof x !== "number" || !Number.isInteger(x) || x < -4 || x > 4 || x === 0) e.push(`${here}.${k}: must be a whole number from -4 to 4, not 0`);
        else { fixed[k as Abil] = (fixed[k as Abil] ?? 0) + x; fixedHere.push(k as Abil); }
      } else e.push(`${here}.${k}: unknown ability (use ${ABILS.join(", ")} or choose)`);
    }
    if (max !== undefined) {
      for (const g of choose.slice(mark)) g.max = max;
      for (const a of fixedHere) fixedMax[a] = Math.max(fixedMax[a] ?? 0, max);
      own = choose.length - mark + fixedHere.length;
      if (!own && e.length === before) e.push(`${here}.max: has no ability or choose beside it to cap`);
    }
  });
  if (e.length > before) return undefined;
  return Object.keys(fixed).length || choose.length ? { fixed, choose, ...(Object.keys(fixedMax).length ? { fixedMax } : {}) } : undefined;
}

/** `abilityPick: { from: [<abil>, ...], patterns: [[2, 1], [1, 1, 1]] }`. */
export function parseAbilityPick(v: unknown, at: string, e: Errs): AbilityPick | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) { e.push(`${at}: must be a mapping with from and patterns`); return undefined; }
  const from = Array.isArray(v.from) && v.from.length && v.from.every(a => ABILS.includes(a as Abil)) ? [...new Set(v.from as Abil[])] : undefined;
  if (!from) { e.push(`${at}.from: must be a list of abilities`); return undefined; }
  const ok = Array.isArray(v.patterns) && v.patterns.length > 0 && v.patterns.every(p => Array.isArray(p) && p.length >= 1 && p.length <= 4 && p.length <= from.length
    && p.every(n => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 4));
  if (!ok) { e.push(`${at}.patterns: each pattern must be 1 to 4 whole numbers from 1 to 4, no longer than from`); return undefined; }
  return { from, patterns: (v.patterns as number[][]).map(p => [...p]) };
}

const sizes = (o: Record<string, OptionDef[]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length]));

export const subclassType: TypeDef<SubclassData> = {
  type: "subclass",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e), cls = str(raw.class, "class", e);
    const options = validateOptions(raw.options, "options", e);
    const levels = validateLevels(raw.levels, "levels", { kind: "subclass", options: sizes(options) }, e);
    const overlay = optOut(raw.overlay, "overlay", e);
    if (e.length || !name || !cls) return { errors: e };
    return { errors: e, value: { name, class: cls, levels, ...(Object.keys(options).length ? { options } : {}), ...(overlay === false ? { overlay } : {}) } };
  },
};

function grantsType<T extends GrantsData>(type: string, more: (raw: Raw, e: string[]) => Partial<T>, withAbility = false, withPick = false): TypeDef<T> {
  return {
    type,
    validate(raw: Raw) {
      const e: string[] = [];
      const name = str(raw.name, "name", e), extra = more(raw, e);
      const grants = validateOps(raw.grants, "grants", { kind: "grants", options: {} }, e);
      const ability = withAbility ? parseAbilityIncrease(raw.ability, "ability", e) : undefined;
      const abilityPick = withPick ? parseAbilityPick(raw.abilityPick, "abilityPick", e) : undefined;
      const overlay = optOut(raw.overlay, "overlay", e);
      if (e.length || !name) return { errors: e };
      return { errors: e, value: { name, grants, ...extra, ...(ability ? { ability } : {}), ...(abilityPick ? { abilityPick } : {}), ...(overlay === false ? { overlay } : {}) } as T };
    },
  };
}

export const raceType = grantsType<GrantsData>("race", () => ({}), true, true);
export const backgroundType = grantsType<GrantsData>("background", () => ({}), true, true);
export const subraceType = grantsType<SubraceData>("subrace", (raw, e) => ({ race: str(raw.race, "race", e) ?? "" }), true, true);
export const featType = grantsType<FeatData>("feat", (raw, e) => {
  const p = str(raw.prerequisite, "prerequisite", e, true), category = str(raw.category, "category", e, true);
  let minLevel: number | undefined;
  if (raw.minLevel !== undefined) { if (typeof raw.minLevel === "number" && Number.isInteger(raw.minLevel) && raw.minLevel >= 1 && raw.minLevel <= 20) minLevel = raw.minLevel; else e.push("minLevel: must be a whole number from 1 to 20"); }
  return { ...(p ? { prerequisite: p } : {}), ...(category ? { category } : {}), ...(minLevel !== undefined ? { minLevel } : {}) };
}, true, true);
