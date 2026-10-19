// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

const pack = [{ id: "ember-tonic", qty: 2 }, { id: "reed-vest", qty: 1 }];

for (const layout of LAYOUTS) {
  describe(`quantities and restocking (${layout})`, () => {
    it("a stackable row has a minus, the count and a plus that work in Play mode", () => {
      const s = setup(layout, { inventory: pack });
      const tonic = () => s.row("Ember Tonic");
      expect(s.ctl.editing).toBe(false);
      expect(tonic().querySelector('[data-act="qty"]')!.textContent).toBe("2");
      s.click(tonic().querySelector('[data-act="qty-plus"]'));
      expect(s.char().inventory[0].qty).toBe(3);
      s.click(tonic().querySelector('[data-act="qty-minus"]')); s.click(tonic().querySelector('[data-act="qty-minus"]'));
      expect(s.char().inventory[0].qty).toBe(1);
      expect(tonic().querySelector('[data-act="qty"]')!.textContent).toBe("1");
    });
    it("minus stops at zero and the row stays", () => {
      const s = setup(layout, { inventory: [{ id: "moss-salve", qty: 1 }] });
      s.click(s.row("Moss Salve").querySelector('[data-act="qty-minus"]'));
      expect(s.char().inventory).toHaveLength(1);
      expect(s.char().inventory[0].qty).toBe(0);
      expect((s.row("Moss Salve").querySelector('[data-act="qty-minus"]') as HTMLButtonElement).disabled).toBe(true);
    });
    it("armor and charged items are one of a kind: no stepper", () => {
      const s = setup(layout, { inventory: [...pack, { id: "spark-rod", qty: 1 }] });
      expect(s.row("Reed Vest").querySelector(".fe-qty")).toBeNull();
      expect(s.row("Spark Rod").querySelector(".fe-qty")).toBeNull();
    });
    it("addItem on an owned id bumps its count instead of adding a row", () => {
      const s = setup(layout, { inventory: pack });
      s.ctl.dispatch({ type: "addItem", id: "ember-tonic" });
      expect(s.char().inventory).toHaveLength(2);
      expect(s.char().inventory[0].qty).toBe(3);
    });
    it("the add panel shows +1 for an owned item and says what the count is now", () => {
      const s = setup(layout, { inventory: pack });
      s.ctl.open({ kind: "compendium" });
      s.type(s.q(".fe-panel .fe-search"), "ember");
      const owned = s.q('.fe-panel [data-item="ember-tonic"]');
      expect(owned.textContent).toBe("+1");
      s.click(owned);
      expect(s.char().inventory[0].qty).toBe(3);
      expect(s.notices.at(-1)).toBe("Added Ember Tonic (now 3)");
      s.type(s.q(".fe-panel .fe-search"), "whistle");
      expect(s.q('.fe-panel [data-item="tin-whistle"]').textContent).toBe("Add");
    });
  });
}
