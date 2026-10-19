// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`using a healing item (${layout})`, () => {
    const pack = [{ id: "ember-tonic", qty: 2 }, { id: "moss-salve", qty: 1 }];
    const hurt = { hp: { max: 20, current: 6, temp: 0 } };
    const use = (s: ReturnType<typeof setup>, name: string) => s.click(s.row(name).querySelector('[data-act="use-item"]'));

    it("rolls the item's healing dice, heals that much and says so in words", () => {
      const s = setup(layout, { inventory: pack, ...hurt });
      use(s, "Ember Tonic");
      const rolled = Number(s.host.log[0].total);
      expect(s.host.log[0].title).toBe("Ember Tonic healing");
      expect(rolled).toBeGreaterThanOrEqual(4); expect(rolled).toBeLessThanOrEqual(7);   // 1d4 + 3
      expect(s.char().hp.current).toBe(6 + rolled);
      expect(s.char().inventory[0].qty).toBe(1);
      expect(s.notices.at(-1)).toBe(`Ember Tonic: healed ${rolled}. 1 left.`);
    });
    it("never heals past the maximum and says how much it did heal", () => {
      const s = setup(layout, { inventory: pack, hp: { max: 20, current: 19, temp: 0 } });
      use(s, "Ember Tonic");
      const rolled = Number(s.host.log[0].total);
      expect(s.char().hp.current).toBe(20);
      expect(s.notices.at(-1)).toContain(`healed 1 (rolled ${rolled}`);
    });
    it("an item with no healing just uses one up", () => {
      const s = setup(layout, { inventory: pack, ...hurt });
      use(s, "Moss Salve");
      expect(s.char().hp.current).toBe(6); expect(s.host.log).toHaveLength(0);
      expect(s.notices.at(-1)).toContain("Used Moss Salve");
      expect(s.char().inventory[1].qty).toBe(0);
    });
    it("works from the pinned row under Resources too, and the last one leaves the entry greyed out", () => {
      const s = setup(layout, { inventory: [{ id: "ember-tonic", qty: 1 }], mainPins: ["item:ember-tonic"], ...hurt });
      s.click(s.q('[data-feature="resources"] [data-pinned-item="item:ember-tonic"] [data-act="use-item"]'));
      expect(s.char().hp.current).toBeGreaterThan(6);
      expect(s.char().inventory[0].qty).toBe(0);
      expect(s.notices.at(-1)).toContain("stays in your inventory");
    });
    it("healing from 0 wakes the character", () => {
      const s = setup(layout, { inventory: pack, hp: { max: 20, current: 0, temp: 0 }, conditions: { unconscious: 1 } });
      use(s, "Ember Tonic");
      expect(s.char().hp.current).toBeGreaterThan(0);
      expect(s.char().conditions.unconscious).toBeUndefined();
    });
    it("the item card shows the Healing dice", () => {
      const s = setup(layout, { inventory: pack });
      s.ctl.open({ kind: "details", ref: "item:ember-tonic" });
      expect(s.q(".fe-panel").textContent).toContain("Healing: 1d4+3");
      s.ctl.open({ kind: "details", ref: "item:moss-salve" });
      expect(s.q(".fe-panel").textContent).not.toContain("Healing:");
    });
  });
}
