// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`removing an item safely (${layout})`, () => {
    const pack = [{ id: "ember-tonic", qty: 2 }, { name: "Torch", qty: 3 }];
    const open = (s: ReturnType<typeof setup>, name: string) => s.click(s.row(name).querySelector('[data-act="item-menu"]'));

    it("is available in Play mode through the menu and asks Yes or No first", () => {
      const s = setup(layout, { inventory: pack });
      expect(s.ctl.editing).toBe(false);
      open(s, "Torch");
      s.click(s.row("Torch").querySelector('[data-act="item-remove"]'));
      expect(s.char().inventory).toHaveLength(2);
      expect(s.row("Torch").querySelector('[data-note="remove-confirm"]')!.textContent).toContain("Remove Torch?");
      s.click(s.row("Torch").querySelector('[data-act="remove-no"]'));
      expect(s.char().inventory).toHaveLength(2);
      expect(s.row("Torch").querySelector('[data-note="remove-confirm"]')).toBeNull();
      s.click(s.row("Torch").querySelector('[data-act="item-remove"]'));
      s.click(s.row("Torch").querySelector('[data-act="remove-yes"]'));
      expect(s.char().inventory.map(e => e.name ?? e.id)).toEqual(["ember-tonic"]);
      expect(s.notices.at(-1)).toBe("Removed Torch.");
      expect(s.root.querySelector(".fe-item-menu")).toBeNull();
    });
    it("closing the menu cancels a pending remove", () => {
      const s = setup(layout, { inventory: pack });
      open(s, "Torch"); s.click(s.row("Torch").querySelector('[data-act="item-remove"]'));
      open(s, "Torch"); open(s, "Torch");
      expect(s.row("Torch").querySelector('[data-note="remove-confirm"]')).toBeNull();
      expect(s.char().inventory).toHaveLength(2);
    });
    it("removing an item also drops its pin, for compendium and custom items", () => {
      const s = setup(layout, { inventory: pack, mainPins: ["item:ember-tonic", "item-name:Torch", "feature:keep-me"] });
      open(s, "Ember Tonic"); s.click(s.row("Ember Tonic").querySelector('[data-act="item-remove"]')); s.click(s.row("Ember Tonic").querySelector('[data-act="remove-yes"]'));
      expect(s.char().mainPins).toEqual(["item-name:Torch", "feature:keep-me"]);
      open(s, "Torch"); s.click(s.row("Torch").querySelector('[data-act="item-remove"]')); s.click(s.row("Torch").querySelector('[data-act="remove-yes"]'));
      expect(s.char().mainPins).toEqual(["feature:keep-me"]);
      expect(s.q('[data-feature="resources"] [data-pinned-item]')).toBeNull();
    });
    it("a pin stays while another row still has the same item", () => {
      const s = setup(layout, { inventory: [{ id: "ember-tonic", qty: 1 }, { id: "ember-tonic", qty: 1 }], mainPins: ["item:ember-tonic"] });
      s.ctl.dispatch({ type: "removeItem", index: 0 });
      expect(s.char().mainPins).toEqual(["item:ember-tonic"]);
    });
  });
}
