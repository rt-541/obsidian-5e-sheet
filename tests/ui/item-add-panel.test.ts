// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";
import { addVariants } from "../fixtures/item-variants";

afterEach(() => document.body.replaceChildren());

const search = (s: ReturnType<typeof setup>, text: string) => s.type(s.q(".fe-panel .fe-search"), text);

for (const layout of LAYOUTS) {
  describe(`add item panel: owned, card and which armor (${layout})`, () => {
    it("owned gear says Owned and still offers Add; stackables keep +1", () => {
      const s = setup(layout, { inventory: [{ id: "reed-vest" }, { id: "ember-tonic" }] }, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "reed");
      expect(s.q('.fe-panel [data-item="reed-vest"]').textContent).toBe("Add");
      expect(s.q('.fe-panel [data-item="reed-vest"]').closest(".fe-inv")!.querySelector('[data-note="owned"]')!.textContent).toBe("Owned");
      search(s, "tonic");
      expect(s.q('.fe-panel [data-item="ember-tonic"]').textContent).toBe("+1");
      expect(s.q('.fe-panel [data-note="owned"]')).toBeNull();
    });
    it("tapping a result's name opens its card under it", () => {
      const s = setup(layout, {}, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "slate");
      s.click(s.all(".fe-panel .fe-inv-name").find(e => e.textContent === "Slate Mail")!);
      expect(s.q(".fe-panel .fe-itemcard").getAttribute("data-itemcard")).toBe("Slate Mail");
      expect(s.root.querySelector(".fe-panel-head .fe-name")?.textContent).toBe("Add item");
    });
    it("a generic item asks Which armor?, previews each base, then offers the choices", () => {
      const s = setup(layout, { inventory: [{ id: "reed-vest", equipped: true }] }, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "+1 armor");
      s.click(s.q('.fe-panel [data-item="plus-one-armor"]'));
      expect(s.q('.fe-panel [data-pane="base-pick"] .fe-card-title').textContent).toBe("Which armor?");
      const slate = s.q('.fe-panel [data-base="slate-mail"]');
      expect(slate.textContent).toContain("+1 Slate Mail: AC 15 (14 + 1), Str 12, Stealth disadvantage, 40 lb");
      s.click(slate);
      expect(s.q(".fe-panel .fe-itemcard").getAttribute("data-itemcard")).toBe("+1 Slate Mail");
      expect(s.q('.fe-panel [data-note="equip-preview"]').textContent).toBe("AC 14 -> 15, Reed Vest put away");
      expect(s.q('.fe-panel [data-act="add-attune"]')).toBeNull();
      s.click(s.q('.fe-panel [data-act="add-equip"]'));
      expect(s.char().inventory[1]).toMatchObject({ id: "plus-one-armor", base: "slate-mail", equipped: true });
      expect(s.notices.at(-1)).toBe("Added +1 Slate Mail. Reed Vest unequipped.");
      expect(s.q(".fe-panel .fe-search")).not.toBeNull();   // the panel stays open
      expect(s.q('.fe-panel [data-pane="add-choice"]')).toBeNull();
    });
    it("an item needing attunement offers Equip and attune with the count after", () => {
      const s = setup(layout, { inventory: [{ id: "reed-vest", equipped: true, attuned: true }] }, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "ember");
      s.click(s.q('.fe-panel [data-item="ember-edge"]'));
      s.click(s.q('.fe-panel [data-base="thorn-sword"]'));
      expect(s.q('.fe-panel [data-act="add-attune"]').textContent).toBe("Equip and attune (2 of 3)");
      s.click(s.q('.fe-panel [data-act="add-attune"]'));
      expect(s.char().inventory[1]).toMatchObject({ id: "ember-edge", base: "thorn-sword", equipped: true, attuned: true });
    });
    it("with three attuned items the attune button is disabled and says why", () => {
      const three = [1, 2, 3].map(() => ({ id: "reed-vest", equipped: true, attuned: true }));
      const s = setup(layout, { inventory: three }, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "ember");
      s.click(s.q('.fe-panel [data-item="ember-edge"]')); s.click(s.q('.fe-panel [data-base="thorn-sword"]'));
      expect((s.q('.fe-panel [data-act="add-attune"]') as HTMLButtonElement).disabled).toBe(true);
      expect(s.q('.fe-panel [data-note="attune-full"]').textContent).toBe("Already attuned to 3 items");
    });
    it("Just add it adds an unequipped row; Back returns to the results", () => {
      const s = setup(layout, {}, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "slate");
      s.click(s.q('.fe-panel [data-item="slate-mail"]'));
      expect(s.q('.fe-panel [data-act="add-attune"]')).toBeNull();
      s.click(s.q('.fe-panel [data-act="add-only"]'));
      expect(s.char().inventory.at(-1)).toMatchObject({ id: "slate-mail", equipped: false });
      expect(s.notices.at(-1)).toBe("Added Slate Mail.");
      s.click(s.q('.fe-panel [data-item="slate-mail"]')); s.click(s.q('.fe-panel [data-act="add-back"]'));
      expect(s.ctl.addPick).toBeNull();
      expect(s.q('.fe-panel [data-item="slate-mail"]')).not.toBeNull();
    });
    it("says so when no ordinary base fits", () => {
      const s = setup(layout, {}, r => { addVariants(r); r.add("vault", "item", { id: "odd-weapon", name: "Odd Weapon", kind: "weapon", attunement: false, rarity: "rare", variant: { base: "weapon", only: ["nothing-fits"] } }, { path: "odd.md" }); });
      s.ctl.open({ kind: "compendium" }); search(s, "odd weapon");
      s.click(s.q('.fe-panel [data-item="odd-weapon"]'));
      expect(s.q('.fe-panel [data-pane="base-pick"]').textContent).toContain("No ordinary weapon in your compendium fits this item.");
    });
    it("potions are still added at once", () => {
      const s = setup(layout, {}, addVariants);
      s.ctl.open({ kind: "compendium" }); search(s, "tonic");
      s.click(s.q('.fe-panel [data-item="ember-tonic"]'));
      expect(s.ctl.addPick).toBeNull();
      expect(s.char().inventory.at(-1)).toMatchObject({ id: "ember-tonic", qty: 1 });
    });
  });
}
