import { describe, expect, it } from "vitest";
import { act, makeChar, mechanicsRegistry } from "../fixtures/mechanics";
import { addInvented } from "../ui/inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

const r = mechanicsRegistry(); addInvented(r); addVariants(r);

describe("split a stack", () => {
  it("one row per piece, the first keeps its state, the rest start put away", () => {
    const v = act(makeChar({ inventory: [{ id: "thorn-sword", qty: 3, equipped: true, change: { notes: "Family blades" } }, { id: "ember-tonic" }] }), { type: "itemSplit", index: 0 }, r).value;
    expect(v.inventory.map(e => [e.id, e.qty, e.equipped, e.row])).toEqual([["thorn-sword", 1, true, "r1"], ["thorn-sword", 1, false, "r2"], ["thorn-sword", 1, false, "r3"], ["ember-tonic", 1, false, undefined]]);
    expect(v.inventory[2].change).toEqual({ notes: "Family blades" });
  });
  it("copies do not share the change object and drop grip, charges and attunement", () => {
    const v = act(makeChar({ inventory: [{ id: "thorn-sword", qty: 2, equipped: true, attuned: true, hands: 2, charges: { used: 1 }, change: { notes: "x" } }] }), { type: "itemSplit", index: 0 }, r).value;
    expect(v.inventory[1]).toMatchObject({ qty: 1, equipped: false, attuned: false });
    expect(v.inventory[1].hands).toBeUndefined(); expect(v.inventory[1].charges).toBeUndefined();
    expect(v.inventory[1].change).not.toBe(v.inventory[0].change);
  });
  it("leaves a single piece and a potion stack alone", () => {
    const c = makeChar({ inventory: [{ id: "thorn-sword", qty: 1 }, { id: "ember-tonic", qty: 4 }] });
    expect(act(c, { type: "itemSplit", index: 0 }, r).value.inventory).toEqual(c.inventory);
    expect(act(c, { type: "itemSplit", index: 1 }, r).value.inventory).toEqual(c.inventory);
  });
});
