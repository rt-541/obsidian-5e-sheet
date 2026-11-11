// @vitest-environment jsdom
import { parseNote } from "../../src/core/character";
import { LAYOUTS, setup } from "./inventory-helpers";
import { tester } from "../fixtures/mechanics";

for (const layout of LAYOUTS) {
  describe(`custom items (${layout})`, () => {
    const fill = (s: ReturnType<typeof setup>, name: string, qty = "1", weight = "") => {
      s.type(s.q('.fe-additem-form [data-field="name"]'), name);
      s.type(s.q('.fe-additem-form [data-field="qty"]'), qty);
      s.type(s.q('.fe-additem-form [data-field="weight"]'), weight);
    };
    it("the add panel starts with a form: Name, Quantity, Weight and a used-up switch", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      const form = s.q('.fe-panel [data-form="custom-item"]');
      expect(form.textContent).toContain("Name"); expect(form.textContent).toContain("Quantity"); expect(form.textContent).toContain("Weight (lb)");
      expect(form.textContent).toContain("Used up when used (consumable)");
      expect(s.q(".fe-additem").lastElementChild).toBe(form);   // the search comes first, the custom form last
    });
    it("adds a named item with its count, weight and consumable switch, and keeps the panel open", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      fill(s, "  Rope, 50 feet ", "2", "5");
      s.click(s.q('[data-act="custom-consumable"]'));
      fill(s, "  Rope, 50 feet ", "2", "5");   // the switch redraws the form from what was typed
      s.click(s.q('[data-act="add-custom"]'));
      expect(s.char().inventory).toEqual([{ name: "Rope, 50 feet", qty: 2, equipped: false, attuned: false, weight: 5, consumable: true }]);
      expect(s.ctl.panel?.kind).toBe("compendium");
      expect(s.notices.at(-1)).toBe("Added Rope, 50 feet.");
      expect((s.q('[data-field="name"]') as HTMLInputElement).value).toBe("");
      expect(s.row("Rope, 50 feet")).toBeDefined();
    });
    it("a name with no weight leaves weight and consumable off the entry", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      fill(s, "Lucky coin"); s.click(s.q('[data-act="add-custom"]'));
      expect(s.char().inventory[0]).toEqual({ name: "Lucky coin", qty: 1, equipped: false, attuned: false });
    });
    it("says what is wrong in plain words and adds nothing", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      s.click(s.q('[data-act="add-custom"]'));
      expect(s.q('[data-note="custom-item-error"]').textContent).toBe("Give the item a name.");
      fill(s, "Lamp", "0"); s.click(s.q('[data-act="add-custom"]'));
      expect(s.q('[data-note="custom-item-error"]').textContent).toBe("How many? Use a whole number, 1 or more.");
      fill(s, "Lamp", "1.5"); s.click(s.q('[data-act="add-custom"]'));
      expect(s.q('[data-note="custom-item-error"]').textContent).toBe("How many? Use a whole number, 1 or more.");
      fill(s, "Lamp", "1", "-2"); s.click(s.q('[data-act="add-custom"]'));
      expect(s.q('[data-note="custom-item-error"]').textContent).toBe("Weight is in pounds: use a number like 2 or 0.5, or leave it empty.");
      expect(s.char().inventory).toHaveLength(0);
    });
    it("a custom item's weight counts toward what you carry, per piece", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      fill(s, "Brick", "3", "2.5"); s.click(s.q('[data-act="add-custom"]'));
      expect(s.ctl.stats()!.carry.weight).toBe(7.5);
    });
    it("adding the same custom name again adds to its count", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      fill(s, "Brick", "3"); s.click(s.q('[data-act="add-custom"]'));
      fill(s, "brick", "2"); s.click(s.q('[data-act="add-custom"]'));
      expect(s.char().inventory).toHaveLength(1); expect(s.char().inventory[0].qty).toBe(5);
      expect(s.notices.at(-1)).toBe("Added brick (now 5)");
    });
  });
}

describe("consumable flag in the note", () => {
  it("is read and written back as a plain boolean, and a bad value is an error", () => {
    const p = parseNote({ ...tester, inventory: [{ name: "Chalk", qty: 3, consumable: true }] });
    expect(p.kind === "character" && p.value.inventory[0].consumable).toBe(true);
    const bad = parseNote({ ...tester, inventory: [{ name: "Chalk", qty: 3, consumable: "maybe" }] });
    expect(bad.kind !== "none" && bad.errors.join()).toContain("inventory[0].consumable");
  });
});
