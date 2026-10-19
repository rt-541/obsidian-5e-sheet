import { describe, expect, it } from "vitest";
import { act, makeChar, mechanicsRegistry } from "../fixtures/mechanics";
import { addWeapons } from "../fixtures/weapons";

const r = mechanicsRegistry(); addWeapons(r);
const inv = (o: object[]) => makeChar({ inventory: o });

describe("grip actions", () => {
  it("switches to two hands and back", () => {
    let c = act(inv([{ id: "ash-cudgel", equipped: true }]), { type: "hands", index: 0, hands: 2 }, r).value;
    expect(c.inventory[0].hands).toBe(2);
    c = act(c, { type: "hands", index: 0, hands: 1 }, r).value; expect(c.inventory[0].hands).toBeUndefined();
  });
  it("refuses two hands for a weapon that is not versatile, and while a shield is on", () => {
    expect(act(inv([{ id: "dagger", equipped: true }]), { type: "hands", index: 0, hands: 2 }, r).error).toBe("This weapon cannot be held in two hands.");
    expect(act(inv([{ id: "ash-cudgel", equipped: true }, { id: "oak-buckler", equipped: true }]), { type: "hands", index: 0, hands: 2 }, r).error).toBe("Put away your shield to use two hands.");
  });
  it("Put away shield does both in one step and says so", () => {
    const out = act(inv([{ id: "ash-cudgel", equipped: true }, { id: "oak-buckler", equipped: true }]), { type: "hands", index: 0, hands: 2, putAwayShield: true }, r);
    expect(out.value.inventory.map(e => [e.equipped, e.hands])).toEqual([[true, 2], [false, undefined]]);
    expect(out.note).toBe("Oak Buckler put away. Ash Cudgel in two hands.");
  });
  it("equipping (or attuning) a shield flips two-handed weapons to one hand and says so", () => {
    const out = act(inv([{ id: "ash-cudgel", equipped: true, hands: 2 }, { id: "oak-buckler" }]), { type: "equip", index: 1, on: true }, r);
    expect(out.value.inventory[0].hands).toBeUndefined(); expect(out.note).toBe("Ash Cudgel switched to one hand (shield equipped).");
    const at = act(inv([{ id: "ash-cudgel", equipped: true, hands: 2 }, { id: "rune-targe" }]), { type: "attune", index: 1, on: true }, r);
    expect(at.value.inventory[0].hands).toBeUndefined(); expect(at.note).toBe("Ash Cudgel switched to one hand (shield equipped).");
  });
  it("a stowed weapon keeps its choice and is not announced", () => {
    const out = act(inv([{ id: "ash-cudgel", equipped: false, hands: 2 }, { id: "oak-buckler" }]), { type: "equip", index: 1, on: true }, r);
    expect(out.value.inventory[0].hands).toBe(2); expect(out.note).toBeUndefined();
  });
  it("a rival shield note comes first, joined with a space", () => {
    const out = act(inv([{ id: "ash-cudgel", equipped: true, hands: 2 }, { id: "oak-buckler", equipped: true }, { id: "rune-targe" }]), { type: "equip", index: 2, on: true }, r);
    expect(out.note).toBe("Oak Buckler unequipped. Ash Cudgel switched to one hand (shield equipped).");
  });
  it("removing an earlier row keeps the choice with its weapon", () => {
    const c = act(inv([{ id: "ash-cudgel", equipped: true }, { id: "glass-saber", equipped: true, hands: 2 }]), { type: "removeItem", index: 0 }, r).value;
    expect(c.inventory.map(e => [e.id, e.hands])).toEqual([["glass-saber", 2]]);
  });
  it("unequip then equip again keeps two hands", () => {
    let c = act(inv([{ id: "ash-cudgel", equipped: true, hands: 2 }]), { type: "equip", index: 0, on: false }, r).value;
    c = act(c, { type: "equip", index: 0, on: true }, r).value; expect(c.inventory[0].hands).toBe(2);
  });
});
