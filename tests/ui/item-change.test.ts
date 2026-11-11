// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`change an inventory item (${layout})`, () => {
    it("Change in the ... menu opens the form with a live card; Save renames that row", () => {
      const s = setup(layout, { inventory: [{ id: "plus-one-armor", base: "slate-mail" }] }, addVariants);
      s.click(s.row("+1 Slate Mail").querySelector('[data-act="item-menu"]'));
      s.click(s.q('[data-act="item-change"]'));
      expect(s.q(".fe-panel-head .fe-name").textContent).toBe("Change item");
      const name = s.q('.fe-panel [data-field="change-name"]'); name.focus(); s.type(name, "Old Grey");
      expect(s.q(".fe-panel .fe-itemcard .fe-sb-name").textContent).toBe("Old Grey"); expect(document.activeElement).toBe(name);
      s.type(s.q('.fe-panel [data-field="change-base"]'), "bark-plate", "change");
      expect(s.q('.fe-panel [data-fact="Armor Class"]').textContent).toBe("Armor Class: 16 (15 + 1)");
      s.click(s.q('.fe-panel [data-act="change-save"]'));
      expect(s.char().inventory[0]).toMatchObject({ base: "bark-plate", change: { name: "Old Grey" }, row: "r1" });
      expect(s.notices.at(-1)).toBe("Changed Old Grey.");
    });
    it("Undo my changes puts the row back to the compendium item", () => {
      const s = setup(layout, { inventory: [{ id: "plus-one-armor", base: "slate-mail", row: "r1", change: { name: "Old Grey" } }] }, addVariants);
      s.click(s.row("Old Grey").querySelector('[data-act="item-menu"]'));
      s.click(s.q('[data-act="item-change"]'));
      s.click(s.q('.fe-panel [data-act="change-reset"]'));
      expect(s.char().inventory[0].change).toBeUndefined(); expect(s.char().inventory[0].base).toBe("slate-mail");
      expect(s.row("+1 Slate Mail")).toBeTruthy();
    });
    it("a problem is shown in words and nothing is saved", () => {
      const s = setup(layout, { inventory: [{ id: "thorn-sword" }] }, addVariants);
      s.click(s.row("Thorn Sword").querySelector('[data-act="item-menu"]')); s.click(s.q('[data-act="item-change"]'));
      s.type(s.q('.fe-panel [data-field="change-bonus"]'), "1.5");
      s.click(s.q('.fe-panel [data-act="change-save"]'));
      expect(s.q('.fe-panel [data-note="change-error"]').textContent).toBe("The bonus must be a whole number, like 1.");
      expect(s.char().inventory[0].change).toBeUndefined();
    });
    it("two rows of one item stay independent", () => {
      const s = setup(layout, { inventory: [{ id: "thorn-sword", row: "r1" }, { id: "thorn-sword", row: "r2" }] }, addVariants);
      s.click(s.all(".fe-inv")[1].querySelector('[data-act="item-menu"]')); s.click(s.q('[data-act="item-change"]'));
      s.type(s.q('.fe-panel [data-field="change-name"]'), "Briar"); s.click(s.q('.fe-panel [data-act="change-save"]'));
      expect(s.char().inventory[0].change).toBeUndefined(); expect(s.char().inventory[1].change).toEqual({ name: "Briar" });
    });
    it("an old +1 Armor row with no base asks Which armor? and the choice opens Change", () => {
      const s = setup(layout, { inventory: [{ id: "plus-one-armor" }] }, addVariants);
      const ask = s.row("+1 Armor").querySelector('[data-act="choose-base"]')!;
      expect(ask.textContent).toBe("Which armor? Choose one");
      s.click(ask); expect(s.q(".fe-panel-head .fe-name").textContent).toBe("Change item");
    });
  });
}
