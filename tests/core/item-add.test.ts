import { describe, expect, it } from "vitest";
import { act, makeChar, mechanicsRegistry } from "../fixtures/mechanics";
import { addInvented } from "../ui/inventory-helpers";
import { addVariants } from "../fixtures/item-variants";
import { previewAdd } from "../../src/core/item-preview";

const r = mechanicsRegistry(); addInvented(r); addVariants(r);

describe("adding gear", () => {
  it("armor, shields and weapons never stack; potions still do", () => {
    let c = makeChar({ inventory: [{ id: "reed-vest" }, { id: "ember-tonic" }] });
    c = act(c, { type: "addItem", id: "reed-vest" }, r).value; c = act(c, { type: "addItem", id: "ember-tonic" }, r).value;
    expect(c.inventory.map(e => [e.id, e.qty, e.row])).toEqual([["reed-vest", 1, undefined], ["ember-tonic", 2, undefined], ["reed-vest", 1, "r1"]]);
  });
  it("adds a variant with its base and equips it, putting the old armor away", () => {
    const out = act(makeChar({ inventory: [{ id: "reed-vest", equipped: true }] }), { type: "addItem", id: "plus-one-armor", base: "slate-mail", equip: true }, r);
    expect(out.value.inventory[1]).toMatchObject({ id: "plus-one-armor", base: "slate-mail", equipped: true });
    expect(out.value.inventory[0].equipped).toBe(false); expect(out.note).toBe("Reed Vest unequipped.");
  });
  it("refuses a base that does not fit", () => {
    expect(act(makeChar(), { type: "addItem", id: "ember-edge", base: "reed-spear" }, r).error).toBe("That base does not fit this item.");
  });
  it("refuses to attune a fourth item and adds nothing", () => {
    const c = makeChar({ inventory: [1, 2, 3].map(() => ({ id: "reed-vest", equipped: true, attuned: true })) });
    const out = act(c, { type: "addItem", id: "ember-edge", base: "thorn-sword", attune: true }, r);
    expect(out.error).toBe("Already attuned to 3 items"); expect(out.value.inventory).toHaveLength(3);
  });
  it("previews in words without changing the character", () => {
    const c = makeChar({ inventory: [{ id: "reed-vest", equipped: true }] }), before = structuredClone(c);
    expect(previewAdd(c, { registry: r }, { id: "plus-one-armor", base: "slate-mail" })).toBe("AC 14 -> 15, Reed Vest put away");   // tester Dex 14: 12 + 2
    expect(previewAdd(c, { registry: r }, { id: "thorn-sword" })).toMatch(/^Adds Thorn Sword to Attacks: \+\d+, 1d6\+\d+$/);
    expect(c).toEqual(before);
  });
});
