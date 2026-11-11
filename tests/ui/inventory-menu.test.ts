// @vitest-environment jsdom
import { parseNote, writeInto } from "../../src/core/character";
import { LAYOUTS, setup } from "./inventory-helpers";
import { tester } from "../fixtures/mechanics";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`item menu and consumable toggle (${layout})`, () => {
    const pack = [{ id: "ember-tonic", qty: 2 }, { name: "Torch", qty: 3 }, { id: "reed-vest", qty: 1 }];
    const useBtn = (s: ReturnType<typeof setup>, name: string) => s.row(name).querySelector('[data-act="use-item"]');

    it("every row has a ... button that opens its options in the row, and a second tap closes them", () => {
      const s = setup(layout, { inventory: pack });
      for (const n of ["Ember Tonic", "Torch", "Reed Vest"]) expect(s.row(n).querySelector('[data-act="item-menu"]')).not.toBeNull();
      expect(s.row("Torch").querySelector(".fe-item-menu")).toBeNull();
      s.click(s.row("Torch").querySelector('[data-act="item-menu"]'));
      const menu = s.row("Torch").querySelector(".fe-item-menu")!;
      expect(menu.textContent).toContain("Consumable"); expect(menu.textContent).toContain("Quantity");
      expect(s.root.querySelectorAll(".fe-item-menu")).toHaveLength(1);
      s.click(s.row("Torch").querySelector('[data-act="item-menu"]'));
      expect(s.root.querySelector(".fe-item-menu")).toBeNull();
    });
    it("a custom item is not used up by default, whatever its count; the Consumable switch gives it a Use one button", () => {
      const s = setup(layout, { inventory: pack });
      expect(useBtn(s, "Torch")).toBeNull();
      s.click(s.row("Torch").querySelector('[data-act="item-menu"]'));
      s.click(s.row("Torch").querySelector('[data-act="item-consumable"]'));
      expect(s.char().inventory[1].consumable).toBe(true);
      s.click(useBtn(s, "Torch"));
      expect(s.char().inventory[1].qty).toBe(2);
      expect(s.notices.at(-1)).toContain("Torch");
    });
    it("a potion is used up by default and the switch can turn that off", () => {
      const s = setup(layout, { inventory: pack });
      expect(useBtn(s, "Ember Tonic")).not.toBeNull();
      s.click(s.row("Ember Tonic").querySelector('[data-act="item-menu"]'));
      expect(s.row("Ember Tonic").querySelector('[data-act="item-consumable"]')!.getAttribute("aria-checked")).toBe("true");
      s.click(s.row("Ember Tonic").querySelector('[data-act="item-consumable"]'));
      expect(s.char().inventory[0].consumable).toBe(false);
      expect(useBtn(s, "Ember Tonic")).toBeNull();
    });
    it("the quantity box sets an exact number", () => {
      const s = setup(layout, { inventory: pack });
      s.click(s.row("Torch").querySelector('[data-act="item-menu"]'));
      s.type(s.row("Torch").querySelector('[data-act="item-qty-input"]') as HTMLElement, "12", "change");
      expect(s.char().inventory[1].qty).toBe(12);
    });
    it("the consumable choice is saved in the note and read back", () => {
      const s = setup(layout, { inventory: pack });
      s.ctl.dispatch({ type: "itemConsumable", index: 1, on: true });
      const fm: Record<string, unknown> = { ...tester }; writeInto(fm, s.char());
      const again = parseNote(fm);
      expect(again.kind === "character" && again.value.inventory[1]).toMatchObject({ name: "Torch", qty: 3, consumable: true });
    });
    it("a used-up custom consumable greys out like a potion and stays", () => {
      const s = setup(layout, { inventory: [{ name: "Chalk", qty: 1, consumable: true }] });
      s.click(useBtn(s, "Chalk"));
      expect(s.char().inventory).toHaveLength(1);
      expect(s.row("Chalk").classList.contains("is-used-up")).toBe(true);
      expect(s.row("Chalk").textContent).toContain("none left");
    });
  });
}
