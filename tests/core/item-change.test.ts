import { describe, expect, it } from "vitest";
import { act, makeChar, mechanicsRegistry } from "../fixtures/mechanics";
import { addInvented } from "../ui/inventory-helpers";
import { addVariants, thornSword } from "../fixtures/item-variants";
import { changeFromForm } from "../../src/ui/item-change-ui";

const r = mechanicsRegistry(); addInvented(r); addVariants(r);
const form = { index: 0, name: "Thorn Sword", base: "", bonus: "", chargesMax: "", chargesReset: "dawn" as const, notes: "" };

describe("item change", () => {
  it("stores the change on that row only", () => {
    const c = makeChar({ inventory: [{ id: "thorn-sword" }, { id: "thorn-sword", row: "r1" }] });
    const v = act(c, { type: "itemChange", index: 1, change: { name: "Briar", bonus: 1 } }, r).value;
    expect(v.inventory[0]).toEqual(c.inventory[0]); expect(v.inventory[1].change).toEqual({ name: "Briar", bonus: 1 });
    expect(act(v, { type: "itemChange", index: 1, change: null }, r).value.inventory[1].change).toBeUndefined();
  });
  it("gives a row without an id one, and keeps the ids already there", () => {
    const c = makeChar({ inventory: [{ id: "thorn-sword", row: "r1" }, { id: "thorn-sword" }] });
    expect(act(c, { type: "itemChange", index: 1, change: { notes: "x" } }, r).value.inventory[1].row).toBe("r2");
  });
  it("sets a base that fits and refuses one that does not", () => {
    const c = makeChar({ inventory: [{ id: "plus-one-armor" }] });
    expect(act(c, { type: "itemChange", index: 0, change: null, base: "slate-mail" }, r).value.inventory[0].base).toBe("slate-mail");
    expect(act(c, { type: "itemChange", index: 0, change: null, base: "thorn-sword" }, r).error).toBe("That base does not fit this item.");
  });
  it("changeFromForm keeps only real changes and words problems plainly", () => {
    expect(changeFromForm(form, thornSword.data)).toEqual({ change: null });
    expect(changeFromForm({ ...form, name: "" }, thornSword.data)).toEqual({ error: "Give the item a name." });
    expect(changeFromForm({ ...form, bonus: "1.5" }, thornSword.data)).toEqual({ error: "The bonus must be a whole number, like 1." });
    expect(changeFromForm({ ...form, chargesMax: "0" }, thornSword.data)).toEqual({ error: "Charges must be a whole number, 1 or more (or leave it empty)." });
    expect(changeFromForm({ ...form, name: "Briar", bonus: "2", chargesMax: "3", chargesReset: "long", notes: " mine " }, thornSword.data))
      .toEqual({ change: { name: "Briar", bonus: 2, charges: { max: 3, reset: "long" }, notes: "mine" } });
    expect(changeFromForm({ ...form, base: "slate-mail" }, thornSword.data)).toEqual({ change: null, base: "slate-mail" });
  });
});
