import { describe, expect, it } from "vitest";
import { parseNote, writeInto } from "../../src/core/character";
import { itemType, versatileDie, type WeaponData } from "../../src/content/types/item";
import { carrier, derive, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";
import { addWeapons } from "../fixtures/weapons";

const r = mechanicsRegistry(); addWeapons(r);
const at = (inv: object[], o: object = {}) => derive(makeChar({ inventory: inv, ...o }), r).attacks[0];

describe("versatile grip", () => {
  it("parses hands: 2 is kept, 1 is dropped, anything else is an error", () => {
    expect(makeChar({ inventory: [{ id: "ash-cudgel", hands: 2 }] }).inventory[0].hands).toBe(2);
    expect(makeChar({ inventory: [{ id: "ash-cudgel", hands: 1 }] }).inventory[0].hands).toBeUndefined();
    const p = parseNote({ ...tester, inventory: [{ id: "ash-cudgel", hands: 3 }] });
    expect(p.kind === "character" && p.errors).toContain("inventory[0].hands: must be 1 or 2");
  });
  it("one hand by default; two hands uses the next die up", () => {
    const one = at([{ id: "ash-cudgel", equipped: true }]);
    expect(one.damage).toBe("1d6+3 bludgeoning"); expect(one.item).toBe(0);
    expect(one.grip).toEqual({ hands: 1, twoHanded: "1d8", shield: false }); expect(one.target.tags).toContain("one-handed");
    const two = at([{ id: "ash-cudgel", equipped: true, hands: 2 }]);
    expect(two.damage).toBe("1d8+3 bludgeoning"); expect(two.critDamage).toBe("2d8+3 bludgeoning");
    expect(two.target.tags).toContain("two-handed"); expect(two.target.tags).not.toContain("one-handed");
    expect(two.why!.damage).toContain("two hands");
  });
  it("an explicit versatile die, and one written in the property, win over the step up", () => {
    expect(at([{ id: "glass-saber", equipped: true, hands: 2 }]).damage).toBe("1d12+4 slashing");
    expect(at([{ id: "reed-pike", equipped: true, hands: 2 }]).damage).toBe("1d10+3 piercing");
  });
  it("hands: 2 with a shield equipped counts as one hand", () => {
    const a = at([{ id: "ash-cudgel", equipped: true, hands: 2 }, { id: "oak-buckler", equipped: true }]);
    expect(a.damage).toBe("1d6+3 bludgeoning"); expect(a.grip).toEqual({ hands: 1, twoHanded: "1d8", shield: true });
  });
  it("an equipped shield that is not attuned still blocks two hands", () => {
    const a = at([{ id: "ash-cudgel", equipped: true, hands: 2 }, { id: "rune-targe", equipped: true }]);
    expect(a.damage).toBe("1d6+3 bludgeoning"); expect(a.grip).toEqual({ hands: 1, twoHanded: "1d8", shield: true });
  });
  it("rules aimed at one-handed or two-handed weapons follow the grip", () => {
    const give = carrier(r);
    const fx = { modifiers: [{ target: "damage", value: 2, on: "weapon:one-handed" }, { target: "attack", value: 1, on: "weapon:two-handed" }] };
    const one = give(fx, { inventory: [{ id: "ash-cudgel", equipped: true }] }).attacks[0];
    const two = give(fx, { inventory: [{ id: "ash-cudgel", equipped: true, hands: 2 }] }).attacks[0];
    expect(one.damage).toBe("1d6+5 bludgeoning"); expect(two.damage).toBe("1d8+3 bludgeoning");
    expect(two.toHit).toBe(one.toHit! + 1);
  });
  it("non-versatile weapons and unarmed strikes have no grip", () => {
    const atts = derive(makeChar({ inventory: [{ id: "dagger", equipped: true }] }), r).attacks;
    expect(atts.every(a => a.grip === undefined)).toBe(true);
    expect(atts.find(a => a.name === "Unarmed Strike")!.item).toBeUndefined();
  });
  it("versatileDie steps one size up unless told otherwise", () => {
    const w = (dmg: string): WeaponData => ({ dmg, type: "bludgeoning", ab: "str", range: "melee" });
    expect(versatileDie(w("1d4"))).toBe("1d6"); expect(versatileDie(w("1d10"))).toBe("1d12");
    expect(versatileDie(w("1d12"))).toBe("1d12"); expect(versatileDie(w("2d6"))).toBe("2d8"); expect(versatileDie(w("1"))).toBe("1");
  });
  it("hands: 2 survives a write round trip", () => {
    const p = parseNote({ ...tester, inventory: [{ id: "ash-cudgel", equipped: true, hands: 2 }] });
    if (p.kind !== "character") throw new Error();
    const out: Record<string, unknown> = {}; writeInto(out, p.value);
    expect((out.inventory as { hands?: number }[])[0].hands).toBe(2);
  });
  it("rejects a versatile die that is not dice", () => {
    const res = itemType.validate({ name: "X", kind: "weapon", attunement: false, weight: 1, weapon: { dmg: "1d6", type: "x", ab: "str", range: "melee", versatile: "big" } });
    expect(JSON.stringify(res)).toContain("weapon.versatile");
  });
});
