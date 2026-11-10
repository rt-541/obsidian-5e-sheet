import { describe, expect, it } from "vitest";
import { parseNote } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { apply } from "../../src/core/actions";
import type { Registry } from "../../src/content/registry";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

const blade = (id: string, name: string, mastery?: string, extra: object = {}) => ({ id, name, kind: "weapon", attunement: false, weight: 2, weapon: { dmg: "1d6", type: "slashing", ab: "str", range: "melee", ...(mastery ? { mastery } : {}) }, ...extra });
function reg(): Registry {
  const r = mechanicsRegistry();
  r.add("vault", "mastery", { name: "Snag", rules: "Invented snag text." }, { path: "snag.md", id: "snag" } as never);
  r.add("vault", "item", blade("tin-blade", "Tin Blade", "snag"), { path: "tin-blade.md" });
  r.add("vault", "item", blade("lead-blade", "Lead Blade", "snag"), { path: "lead-blade.md" });
  r.add("vault", "item", blade("hush-blade", "Hush Blade", "missing-note"), { path: "hush-blade.md" });
  r.add("vault", "item", blade("plain-blade", "Plain Blade"), { path: "plain-blade.md" });
  r.add("vault", "item", { ...blade("glow-sword", "Glow Sword", "snag"), rarity: "rare" }, { path: "glow-sword.md" });
  r.add("vault", "item", { id: "any-sword", name: "Any Sword", kind: "weapon", attunement: false, weight: 3, rarity: "rare", variant: { base: "weapon", bonusWeapon: 1 } }, { path: "any-sword.md" });
  return r;
}
const stats = (note: object, r = reg()) => { const p = parseNote({ ...tester, ...note }); if (p.kind !== "character") throw new Error("x"); return deriveCharacter(p.value, { registry: r }); };
const inv = (id: string, extra: object = {}) => [{ id, equipped: true, ...extra }];

describe("attack row mastery", () => {
  it("a mastered weapon's row names the property, and the numbers are identical without it", () => {
    const withM = stats({ inventory: inv("tin-blade"), mastery: ["tin-blade"] }).attacks[0], without = stats({ inventory: inv("tin-blade") }).attacks[0];
    expect(withM.mastery).toEqual({ id: "snag", name: "Snag" });
    expect(without.mastery).toBeUndefined();
    const { mastery: _m, ...rest } = withM; expect(rest).toEqual(without);
  });
  it("an unmastered weapon, a weapon with no property and a property with no note get no chip", () => {
    expect(stats({ inventory: inv("tin-blade"), mastery: ["lead-blade"] }).attacks[0].mastery).toBeUndefined();
    expect(stats({ inventory: inv("plain-blade"), mastery: ["plain-blade"] }).attacks[0].mastery).toBeUndefined();
    expect(stats({ inventory: inv("hush-blade"), mastery: ["hush-blade"] }).attacks[0].mastery).toBeUndefined();
  });
  it("a variant built on a mastered base shows the chip; a named magic weapon only when its own id is mastered", () => {
    expect(stats({ inventory: inv("any-sword", { base: "tin-blade" }), mastery: ["tin-blade"] }).attacks[0].mastery).toEqual({ id: "snag", name: "Snag" });
    expect(stats({ inventory: inv("glow-sword"), mastery: ["tin-blade"] }).attacks[0].mastery).toBeUndefined();
    expect(stats({ inventory: inv("glow-sword"), mastery: ["glow-sword"] }).attacks[0].mastery).toEqual({ id: "snag", name: "Snag" });
  });
});

describe("mastery action", () => {
  it("replaces one id with another and leaves the rest", () => {
    const p = parseNote({ ...tester, mastery: ["tin-blade", "lead-blade"] }); if (p.kind !== "character") throw new Error("x");
    const r = reg(), st = deriveCharacter(p.value, { registry: r });
    const out = apply(p.value, { type: "mastery", out: "tin-blade", in: "hush-blade" }, { self: st, companions: [], chargesMax: () => 0, ctx: { registry: r } });
    expect(out.error).toBeUndefined(); expect(out.value.mastery).toEqual(["hush-blade", "lead-blade"]);
  });
  it("refuses an id that is not mastered and an id already mastered", () => {
    const p = parseNote({ ...tester, mastery: ["tin-blade", "lead-blade"] }); if (p.kind !== "character") throw new Error("x");
    const r = reg(), st = deriveCharacter(p.value, { registry: r }), lim = { self: st, companions: [], chargesMax: () => 0, ctx: { registry: r } };
    expect(apply(p.value, { type: "mastery", out: "plain-blade", in: "hush-blade" }, lim).error).toMatch(/not one of your mastered weapons/);
    expect(apply(p.value, { type: "mastery", out: "tin-blade", in: "lead-blade" }, lim).error).toMatch(/already/);
  });
});
