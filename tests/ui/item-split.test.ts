// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`split a stack (${layout})`, () => {
    it("a stack of x2 armor loads as before and offers Split in its menu", () => {
      const s = setup(layout, { inventory: [{ id: "reed-vest", qty: 2 }] }, addVariants);
      expect(s.row("Reed Vest").textContent).toContain("x2");
      s.click(s.row("Reed Vest").querySelector('[data-act="item-menu"]'));
      expect(s.q('[data-act="item-split"]').textContent).toBe("Split into separate rows");
      s.click(s.q('[data-act="item-split"]'));
      expect(s.char().inventory.map(e => [e.id, e.qty])).toEqual([["reed-vest", 1], ["reed-vest", 1]]);
      expect(s.notices.at(-1)).toBe("Split Reed Vest into 2 rows.");
    });
    it("a potion stack has no Split button", () => {
      const s = setup(layout, { inventory: [{ id: "ember-tonic", qty: 3 }] }, addVariants);
      s.click(s.row("Ember Tonic").querySelector('[data-act="item-menu"]'));
      expect(document.querySelector('[data-act="item-split"]')).toBeNull();
    });
  });
}
