import { parseNote, newRowId, type InventoryEntry } from "../../src/core/character";
import { entryItem, entryVariant } from "../../src/core/item-entry";
import { missingIds } from "../../src/core/effects";
import { mechanicsRegistry } from "../fixtures/mechanics";
import { addInvented } from "../ui/inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

const tester = { type: "5e-character", name: "Tester" };
const r = mechanicsRegistry(); addInvented(r); addVariants(r);

describe("inventory row fields", () => {
  it("reads row, base and change, and names wrong types", () => {
    const p = parseNote({ ...tester, inventory: [{ id: "plus-one-armor", base: "slate-mail", row: "r2", change: { name: "Old Grey", bonus: 2, charges: { max: 3, reset: "dawn" }, notes: "From the mine" } }] });
    expect(p.kind === "character" && p.value.inventory[0]).toMatchObject({ row: "r2", base: "slate-mail", change: { name: "Old Grey", bonus: 2, charges: { max: 3, reset: "dawn" }, notes: "From the mine" } });
    const bad = parseNote({ ...tester, inventory: [{ id: "x", base: 3, change: { bonus: "lots" } }] });
    expect(bad.kind === "character" && bad.errors).toEqual(expect.arrayContaining(["inventory[0].base: must be text", "inventory[0].change.bonus: must be a whole number"]));
  });
  it("a note without the new fields reads exactly as before", () => {
    const p = parseNote({ ...tester, inventory: [{ id: "reed-vest", qty: 2 }] });
    expect(p.kind === "character" && p.value.inventory[0]).toEqual({ id: "reed-vest", qty: 2, equipped: false, attuned: false });
  });
  it("new row ids never repeat", () => {
    expect(newRowId([])).toBe("r1"); expect(newRowId([{ row: "r4" } as InventoryEntry, { row: "x" } as InventoryEntry])).toBe("r5");
  });
});

describe("entryItem", () => {
  it("combines library item, base and the row's change", () => {
    expect(entryItem({ id: "plus-one-armor", base: "slate-mail", qty: 1, equipped: true, attuned: false }, r)).toMatchObject({ name: "+1 Slate Mail", armor: { base: 14 } });
    expect(entryItem({ id: "plus-one-armor", base: "slate-mail", change: { name: "Old Grey", bonus: 2 }, qty: 1, equipped: true, attuned: false }, r)!.effects.modifiers).toContainEqual({ target: "ac", value: 2 });
    expect(entryItem({ id: "thorn-sword", change: { bonus: 1 }, qty: 1, equipped: true, attuned: false }, r)!.weapon!.bonus).toBe(1);
    expect(entryItem({ id: "spark-rod", change: { charges: { max: 5, reset: "long" } }, qty: 1, equipped: true, attuned: false }, r)!.charges).toEqual({ max: 5, reset: "long" });
  });
  it("a missing base falls back to the variant alone and is reported missing", () => {
    const e = { id: "plus-one-armor", base: "gone-armor", qty: 1, equipped: true, attuned: false };
    expect(entryItem(e, r)!.name).toBe("+1 Armor");
    expect(missingIds({ conditions: {}, inventory: [e] }, r)).toContain("item:gone-armor");
  });
  it("an old variant row with no base asks for one", () => {
    expect(entryVariant({ id: "plus-one-armor", qty: 1, equipped: false, attuned: false }, r)).toEqual({ base: "armor", bonusAc: 1 });
    expect(entryVariant({ id: "plus-one-armor", base: "slate-mail", qty: 1, equipped: false, attuned: false }, r)).toBeUndefined();
  });
});
