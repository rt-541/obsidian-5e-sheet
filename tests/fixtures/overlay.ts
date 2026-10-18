import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import type { Character } from "../../src/core/character";
import { act, derive, makeChar } from "./mechanics";

/** SRD content only: the notes the overlay has to fill in (they carry no mechanics of their own). */
export const srdRegistry = (): Registry => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };

/** Add a homebrew note and fail loudly when it is invalid. */
export function put(r: Registry, type: string, raw: Record<string, unknown>): Registry {
  const p = r.add("vault", type, raw, { path: `${type}-${String(raw.name)}.md` });
  if (p) throw new Error(JSON.stringify(p));
  return r;
}

/** A bare feature the way most notes write it: a name and some text, no effects. */
export const feat = (name: string, extra: Record<string, unknown> = {}) => ({ op: "feature", name, text: `${name} (invented text).`, ...extra });

/** A subclass of an existing class whose features sit at the given class level. */
export function subclass(r: Registry, name: string, cls: string, level: number, features: (string | Record<string, unknown>)[], extra: Record<string, unknown> = {}): Registry {
  return put(r, "subclass", { name, class: cls, levels: { [level]: features.map(f => typeof f === "string" ? feat(f) : f) }, ...extra });
}
export const race = (r: Registry, name: string, features: (string | Record<string, unknown>)[], extra: Record<string, unknown> = {}): Registry =>
  put(r, "race", { name, grants: features.map(f => typeof f === "string" ? feat(f) : f), ...extra });
export const homebrewFeat = (r: Registry, name: string, features: (string | Record<string, unknown>)[] = [name], extra: Record<string, unknown> = {}): Registry =>
  put(r, "feat", { name, grants: features.map(f => typeof f === "string" ? feat(f) : f), ...extra });

export const SCORES = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
/** A character of one class at one level (SRD class ids), with ability scores overriding 10s. */
export function pc(cls: string, level: number, scores: Partial<typeof SCORES> = {}, o: Partial<Record<keyof Character, unknown>> = {}): Character {
  return makeChar({ classes: [{ class: cls, level }], abilities: { ...SCORES, ...scores }, ...o });
}
/** The same, with a subclass. */
export function pcSub(cls: string, level: number, subclassId: string, scores: Partial<typeof SCORES> = {}, o: Record<string, unknown> = {}): Character {
  return makeChar({ classes: [{ class: cls, level, subclass: subclassId }], abilities: { ...SCORES, ...scores }, ...o });
}
export const stats = (c: Character, r: Registry) => derive(c, r);
export const gear = (...ids: string[]) => ids.map(id => ({ id, qty: 1, equipped: true, attuned: false }));
/** Switch a toggle on through the real action pipeline (spends its cost). */
export function switchOn(c: Character, r: Registry, id: string): Character {
  const res = act(c, { type: "toggle", id, on: true }, r);
  if (res.error) throw new Error(res.error);
  return res.value;
}
export const attack = (s: ReturnType<typeof derive>, name: string) => s.attacks.find(a => a.name === name)!;
