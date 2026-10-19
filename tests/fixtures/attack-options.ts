import type { Registry } from "../../src/content/registry";
import type { Character } from "../../src/core/character";
import type { Rng } from "../../src/core/types";
import { makeChar, mechanicsRegistry } from "./mechanics";

/** mechanicsRegistry() plus invented feats and items that declare attack options, extra damage and a self-damage action. */
export function optionsRegistry(): Registry {
  const r = mechanicsRegistry();
  const bad = (p: unknown) => { if (p) throw new Error(JSON.stringify(p)); };
  const feat = (id: string, grants: object[]) => bad(r.add("vault", "feat", { name: id.replace(/(^|-)(\w)/g, (_m, s: string, ch: string) => `${s ? " " : ""}${ch.toUpperCase()}`), grants }, { path: `${id}.md` }));
  const res = (name: string, max: number) => ({ op: "resource", name, max, reset: "long" });
  const feature = (name: string, extra: object) => ({ op: "feature", name, text: `${name} (invented text).`, ...extra });
  feat("test-focus", [res("Focus Dice", 3), feature("Test Focus", { attackOption: { toHit: "1d4", resource: "Focus Dice" } })]);
  feat("test-steady", [feature("Test Steady", { attackOption: { toHit: "1", resource: "Focus Dice" } })]);
  feat("test-analysis", [res("Insight Dice", 2), feature("Test Analysis", { attackOption: { scale: { 1: "1d4", 5: "2d4" }, resource: "Insight Dice", on: "attack:weapon" } })]);
  feat("test-savage", [feature("Test Savage", { attackOption: { reroll: true, oncePerTurn: true, on: "attack:weapon" } })]);
  feat("test-lost", [feature("Test Lost", { attackOption: { toHit: "1d4", resource: "Missing Dice" } })]);
  feat("test-ember", [feature("Test Ember", { effects: { extraDamage: [{ dice: "1d6", type: "fire", on: "attack:weapon" }] } })]);
  feat("test-blood-price", [feature("Test Blood Price", { action: { name: "Blood Price", cost: { selfDamage: "1d6" }, damage: "2d6" } })]);
  bad(r.add("vault", "item", { id: "test-hunting-blade", name: "Test Hunting Blade", kind: "weapon", attunement: false, weight: 3,
    weapon: { dmg: "1d6", type: "slashing", ab: "str", range: "melee", category: "martial" }, attackOption: { onHit: "1d6", oncePerTurn: true } }, { path: "test-hunting-blade.md" }));
  bad(r.add("vault", "item", { id: "test-tonic", name: "Test Tonic", kind: "consumable", attunement: false, weight: 0.5, heal: "2d4+2" }, { path: "test-tonic.md" }));
  return r;
}

/** makeChar with the longsword equipped, merged with `o`. */
export const optChar = (o: object = {}): Character => makeChar({ inventory: [{ id: "longsword", equipped: true }], ...o });

/** A rng that returns the given values in turn, then starts over. */
export const seq = (...xs: number[]): Rng => { let i = 0; return () => xs[i++ % xs.length]; };
