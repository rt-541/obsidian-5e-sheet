// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

afterEach(() => document.body.replaceChildren());

const lib = { sourceName: "Invented Library", library: true, book: "XX" };
const BODIES: Record<string, string> = {
  "lib/gale-brand.md": "*Weapon (any sword), rare*\n\nA blade that hums in a crosswind.",
  "lib/mist-draught.md": "*Potion, common*\n\nA cool grey drink.",
};
const withLibrary = (r: Parameters<typeof addVariants>[0]) => {
  addVariants(r);
  r.setBodyReader(async p => BODIES[p] ?? "");
  // the raw data carries no variant: only the note text says "(any sword)"
  r.add("vault", "item", { id: "gale-brand", name: "Gale Brand", kind: "wondrous", attunement: false, rarity: "rare" }, { path: "lib/gale-brand.md", ...lib });
  r.add("vault", "item", { id: "mist-draught", name: "Mist Draught", kind: "consumable", attunement: false, rarity: "common" }, { path: "lib/mist-draught.md", ...lib });
};

for (const layout of LAYOUTS) {
  describe(`startAdd with library items (${layout})`, () => {
    it("a library item whose text says (any sword) opens the pick view instead of being added", async () => {
      const s = setup(layout, {}, withLibrary);
      const before = s.char().inventory.length;
      await s.ctl.startAdd("gale-brand");
      expect(s.ctl.addPick).toEqual({ id: "gale-brand" });
      expect(s.char().inventory.length).toBe(before);
    });
    it("a plain library item (a potion) is still added at once", async () => {
      const s = setup(layout, {}, withLibrary);
      await s.ctl.startAdd("mist-draught");
      expect(s.ctl.addPick).toBeNull();
      expect(s.char().inventory.at(-1)).toMatchObject({ id: "mist-draught", qty: 1 });
    });
    it("an owned library row is read on load, so it asks Which weapon?", async () => {
      const s = setup(layout, { inventory: [{ id: "gale-brand" }] }, withLibrary);
      await new Promise(res => setTimeout(res, 0));   // the controller reads owned library items as it loads
      expect(s.row("Gale Brand").querySelector('[data-act="choose-base"]')?.textContent).toBe("Which weapon? Choose one");
    });
  });
}
