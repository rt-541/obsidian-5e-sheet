// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`over-capacity warning (${layout})`, () => {
    const line = (s: ReturnType<typeof setup>) => s.q('[data-feature="inventory"]').lastElementChild!.textContent;
    it("shows weight against capacity while it fits", () => {
      const s = setup(layout, { inventory: [{ name: "Brick", qty: 2, weight: 5 }] });
      expect(line(s)).toBe("10 / 240 lb · attuned 0/3");
      expect(s.root.querySelector('[data-note="too-heavy"]')).toBeNull();
    });
    it("carrying exactly the capacity is still fine", () => {
      const s = setup(layout, { inventory: [{ name: "Anvil", qty: 1, weight: 240 }] });
      expect(s.root.querySelector('[data-note="too-heavy"]')).toBeNull();
    });
    it("turns into a plain warning when over", () => {
      const s = setup(layout, { inventory: [{ name: "Anvil", qty: 1, weight: 300.25 }] });
      const warn = s.q('[data-note="too-heavy"]');
      expect(warn.textContent).toBe("Carrying 300.3 of 240 lb: too heavy");
      expect(warn.classList.contains("fe-warn")).toBe(true);
      expect(line(s)).toContain("attuned 0/3");
    });
    it("goes away again when something is dropped", () => {
      const s = setup(layout, { inventory: [{ name: "Anvil", qty: 1, weight: 300 }] });
      s.ctl.dispatch({ type: "itemQty", index: 0, qty: 0 });
      expect(s.root.querySelector('[data-note="too-heavy"]')).toBeNull();
    });
  });
}
