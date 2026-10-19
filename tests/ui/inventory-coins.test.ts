// @vitest-environment jsdom
import { DESKTOP, MOBILE, TABLET, CHARACTER_FEATURES, placed } from "../../src/ui/layouts";
import { act, makeChar } from "../fixtures/mechanics";
import { mechanicsRegistry } from "../fixtures/mechanics";
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

describe("coins layout", () => {
  it("coins is a character feature placed exactly once on the Main page of every layout", () => {
    expect(CHARACTER_FEATURES).toContain("coins");
    for (const [l, main] of [[DESKTOP, "main"], [TABLET, "main"], [MOBILE, "combat"]] as const) {
      expect(placed(l).filter(f => f === "coins")).toHaveLength(1);
      expect(l.tabs.find(t => t.id === main)!.columns.flat()).toContain("coins");
    }
    expect(DESKTOP.tabs[0].columns[1]).toContain("coins");   // the middle column, next to HP
  });
});

describe("coins action", () => {
  const r = mechanicsRegistry();
  it("sets one kind of coin to a whole number", () => {
    expect(act(makeChar(), { type: "coins", coin: "gp", value: 12.9 }, r).value.coins.gp).toBe(12);
  });
  it("refuses a negative or non-number value in words", () => {
    for (const value of [-1, NaN]) expect(act(makeChar(), { type: "coins", coin: "sp", value }, r).error).toBe("Coins must be a whole number, 0 or more.");
  });
});

for (const layout of LAYOUTS) {
  describe(`coins (${layout})`, () => {
    const boxes = (el: Element) => [...el.querySelectorAll<HTMLInputElement>(".fe-coin-in")];
    it("five labelled number boxes on the Main page and again at the top of the Inventory card", () => {
      const s = setup(layout, { coins: { pp: 1, gp: 2, ep: 3, sp: 4, cp: 5 } });
      for (const where of ['[data-feature="coins"]', '[data-feature="inventory"]']) {
        const bs = boxes(s.q(where));
        expect(bs.map(b => b.dataset.coin)).toEqual(["pp", "gp", "ep", "sp", "cp"]);
        expect(bs.map(b => b.value)).toEqual(["1", "2", "3", "4", "5"]);
        expect(bs.every(b => b.getAttribute("inputmode") === "numeric" && b.type === "number")).toBe(true);
        expect(bs[1].getAttribute("aria-label")).toBe("Gold coins (gp)");
      }
      const inv = s.q('[data-feature="inventory"]');
      expect(inv.children[1].getAttribute("data-act")).toBe("add-item");
      expect(inv.children[2].classList.contains("fe-coins")).toBe(true);
      expect(s.root.querySelectorAll('[data-feature="coins"]')).toHaveLength(1);
    });
    it("is editable in Play mode and both copies update together", () => {
      const s = setup(layout);
      expect(s.ctl.editing).toBe(false);
      s.type(boxes(s.q('[data-feature="coins"]'))[1], "35", "change");
      expect(s.char().coins.gp).toBe(35);
      expect(boxes(s.q('[data-feature="inventory"]'))[1].value).toBe("35");
      s.type(boxes(s.q('[data-feature="inventory"]'))[4], "7", "change");
      expect(s.char().coins.cp).toBe(7);
      expect(boxes(s.q('[data-feature="coins"]'))[4].value).toBe("7");
      expect((s.saved.at(-1) as { coins: { gp: number; cp: number } }).coins).toMatchObject({ gp: 35, cp: 7 });
    });
    it("an empty box means 0 and a bad number is refused in words", () => {
      const s = setup(layout, { coins: { gp: 9 } });
      s.type(boxes(s.q('[data-feature="coins"]'))[1], "", "change");
      expect(s.char().coins.gp).toBe(0);
      s.type(boxes(s.q('[data-feature="coins"]'))[1], "-4", "change");
      expect(s.char().coins.gp).toBe(0);
      expect(s.notices.at(-1)).toBe("Coins must be a whole number, 0 or more.");
    });
    it("the old read-only coin line is gone", () => {
      const s = setup(layout);
      expect(s.q('[data-feature="inventory"]').textContent).not.toContain("No coins");
    });
  });
}
