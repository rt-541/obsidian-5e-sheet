// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`armor and shield swapping (${layout})`, () => {
    const pack = [{ id: "reed-vest", qty: 1, equipped: true }, { id: "bark-plate", qty: 1 }, { id: "oak-buckler", qty: 1, equipped: true }, { id: "elm-buckler", qty: 1 }, { id: "tin-whistle", qty: 1, equipped: true }];
    const equip = (s: ReturnType<typeof setup>, name: string) => s.click(s.row(name).querySelector(".fe-btn:not([data-act])"));
    const worn = (s: ReturnType<typeof setup>) => s.char().inventory.filter(e => e.equipped).map(e => e.id);

    it("equipping body armor puts the other suit away and says so", () => {
      const s = setup(layout, { inventory: pack });
      equip(s, "Bark Plate");
      expect(worn(s)).toEqual(["bark-plate", "oak-buckler", "tin-whistle"]);
      expect(s.notices.at(-1)).toBe("Reed Vest unequipped.");
      expect(s.ctl.stats()!.ac.value).toBe(15 + 2);
    });
    it("equipping a shield puts the other shield away", () => {
      const s = setup(layout, { inventory: pack });
      equip(s, "Elm Buckler");
      expect(worn(s)).toEqual(["reed-vest", "elm-buckler", "tin-whistle"]);
      expect(s.notices.at(-1)).toBe("Oak Buckler unequipped.");
    });
    it("armor and a shield do not displace each other, and unequipping says nothing", () => {
      const s = setup(layout, { inventory: [{ id: "reed-vest", qty: 1, equipped: true }, { id: "oak-buckler", qty: 1 }] });
      equip(s, "Oak Buckler");
      expect(worn(s)).toEqual(["reed-vest", "oak-buckler"]); expect(s.notices).toEqual([]);
      s.click(s.row("Oak Buckler").querySelector(".fe-btn:not([data-act])"));
      expect(worn(s)).toEqual(["reed-vest"]); expect(s.notices).toEqual([]);
    });
    it("only the swapped-out suit is unequipped, nothing else", () => {
      const s = setup(layout, { inventory: pack });
      s.ctl.dispatch({ type: "equip", index: 1, on: true });
      expect(s.char().inventory[4].equipped).toBe(true);
    });
  });
}
