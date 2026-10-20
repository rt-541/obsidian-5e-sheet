import { describe, expect, it } from "vitest";
import { act, derive, makeChar, mechanicsRegistry } from "../fixtures/mechanics";
import { addInvented } from "../ui/inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

const r = mechanicsRegistry(); addInvented(r); addVariants(r);

describe("every inventory read goes through the resolver", () => {
  it("a worn +1 Slate Mail row gives AC 15 and counts as heavy armor", () => {
    const st = derive(makeChar({ inventory: [{ id: "plus-one-armor", base: "slate-mail", equipped: true }] }), r);
    expect(st.ac.value).toBe(15); expect(st.ac.sources[0]).toBe("+1 Slate Mail");
  });
  it("an Ember Edge on a Thorn Sword attacks with the sword's dice and the row's bonus", () => {
    const st = derive(makeChar({ inventory: [{ id: "ember-edge", base: "thorn-sword", equipped: true, attuned: true, change: { bonus: 1 } }] }), r);
    expect(st.attacks[0]).toMatchObject({ name: "Ember Edge (Thorn Sword)" }); expect(st.attacks[0].damage).toMatch(/^1d6\+/);
  });
  it("equipping a +1 Slate Mail puts the worn Reed Vest away", () => {
    const out = act(makeChar({ inventory: [{ id: "reed-vest", equipped: true }, { id: "plus-one-armor", base: "slate-mail" }] }), { type: "equip", index: 1, on: true }, r);
    expect(out.value.inventory[0].equipped).toBe(false); expect(out.note).toBe("Reed Vest unequipped.");
  });
});
