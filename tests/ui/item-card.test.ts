// @vitest-environment jsdom
import { addVariants } from "../fixtures/item-variants";
import { detailCard } from "../../src/ui/details";
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`item stat-block card (${layout})`, () => {
    it("hovering or tapping a changed row shows its own card, with the player's notes", () => {
      const s = setup(layout, { inventory: [{ id: "plus-one-armor", base: "slate-mail", row: "r1", change: { notes: "Dented" } }] }, addVariants);
      const name = s.row("+1 Slate Mail").querySelector(".fe-inv-name")!;
      expect(name.getAttribute("data-ref")).toBe("inv:r1");
      const card = detailCard("inv:r1", s.ctl)!;
      expect(card.querySelector(".fe-itemcard")).not.toBeNull();
      expect(card.querySelector('[data-fact="Armor Class"]')!.textContent).toBe("Armor Class: 15 (14 + 1)");
      expect(card.textContent).toContain("Dented");
    });
    it("the pinned row on Main opens the same card as the inventory row", () => {
      const s = setup(layout, { inventory: [{ id: "plus-one-armor", base: "slate-mail", row: "r1" }], mainPins: ["item:plus-one-armor"] }, addVariants);
      const pin = document.querySelector("[data-pinned-item] .fe-inv-name");
      expect(pin).not.toBeNull();
      expect(pin!.getAttribute("data-ref")).toBe("inv:r1");
      expect(s.row("+1 Slate Mail").querySelector(".fe-inv-name")!.getAttribute("data-ref")).toBe("inv:r1");
    });
    it("an unchanged row keeps the item reference", () => {
      const s = setup(layout, { inventory: [{ id: "reed-vest", qty: 1 }] });
      expect(s.row("Reed Vest").querySelector(".fe-inv-name")!.getAttribute("data-ref")).toBe("item:reed-vest");
    });
  });
}
