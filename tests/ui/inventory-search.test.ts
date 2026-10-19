// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

const many = (r: import("../../src/content/registry").Registry) => {
  for (let i = 0; i < 60; i++) r.add("vault", "item", { id: `zed-widget-${i}`, name: `Zed Widget ${String(i).padStart(2, "0")}`, kind: "gear", attunement: false, weight: 1 }, { path: `zed-${i}.md` });
};
const names = (s: ReturnType<typeof setup>) => s.all('[data-pane="item-results"] .fe-inv .fe-inv-name').map(e => e.textContent);
const search = (s: ReturnType<typeof setup>, text: string) => s.type(s.q(".fe-panel .fe-search"), text);

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) {
  describe(`add item button and search (${layout})`, () => {
    it("a prominent + Add item button sits at the top of the Inventory card and opens the Add item panel", () => {
      const s = setup(layout, { inventory: [{ id: "ember-tonic", qty: 1 }] });
      const card = s.q('[data-feature="inventory"]');
      const add = card.querySelector('[data-act="add-item"]') as HTMLElement;
      expect(add.textContent).toBe("+ Add item");
      expect(add.classList.contains("mod-cta")).toBe(true);
      expect(card.children[1]).toBe(add);   // right under the card title, above the rows
      expect(card.textContent).not.toContain("Add from compendium");
      s.click(add);
      expect(s.q(".fe-panel-head .fe-name").textContent).toBe("Add item");
    });
    it("shows a Type to search hint until two characters or a kind chip", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      expect(s.q('[data-note="item-hint"]').textContent).toBe("Type to search");
      search(s, "d"); expect(names(s)).toEqual([]); expect(s.q('[data-note="item-hint"]')).not.toBeNull();
      search(s, "da"); expect(names(s)).toContain("Dagger"); expect(s.q('[data-note="item-hint"]')).toBeNull();
      search(s, ""); s.click(s.q('[data-chip="armor"]'));
      expect(s.q('[data-note="item-hint"]')).toBeNull();
      expect(names(s)).toEqual(expect.arrayContaining(["Reed Vest", "Bark Plate", "Oak Buckler", "Chain mail"]));
      expect(names(s)).not.toContain("Dagger");
    });
    it("has kind chips: All, Potions and scrolls, Weapons, Armor, Gear, Magic items", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      expect(s.all('[data-group="item-chips"] button').map(b => b.textContent)).toEqual(["All", "Potions and scrolls", "Weapons", "Armor", "Gear", "Magic items"]);
      s.click(s.q('[data-chip="consumable"]')); expect(names(s)).toEqual(expect.arrayContaining(["Ember Tonic", "Moss Salve"]));
      expect(names(s)).not.toContain("Tin Whistle");
      s.click(s.q('[data-chip="weapon"]')); expect(names(s)).toContain("Dagger"); expect(names(s)).not.toContain("Ember Tonic");
      s.click(s.q('[data-chip="gear"]')); expect(names(s)).toContain("Tin Whistle");
      s.click(s.q('[data-chip="magic"]')); expect(names(s)).toEqual(expect.arrayContaining(["Glow Lamp", "Spark Rod", "Moss Salve"])); expect(names(s)).not.toContain("Tin Whistle");
      expect(s.q('[data-chip="magic"]').classList.contains("is-on")).toBe(true);
    });
    it("a chip and a few letters narrow together", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      s.click(s.q('[data-chip="armor"]')); search(s, "buckler");
      expect(names(s).sort()).toEqual(["Elm Buckler", "Oak Buckler"]);
    });
    it("lists names that start with the search first", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      search(s, "plate");
      const list = names(s);
      expect(list.indexOf("Plate armor")).toBeGreaterThanOrEqual(0);
      expect(list.indexOf("Bark Plate")).toBeGreaterThan(list.indexOf("Plate armor"));
    });
    it("shows at most 50 and says how many more", () => {
      const s = setup(layout, {}, many); s.ctl.open({ kind: "compendium" });
      search(s, "widget");
      expect(names(s)).toHaveLength(50);
      expect(s.q('[data-note="item-more"]').textContent).toBe("10 more: keep typing");
      search(s, "widget 5"); expect(names(s)).toHaveLength(10); expect(s.q('[data-note="item-more"]')).toBeNull();
    });
    it("respects the campaign's sources", () => {
      const camp = { name: "T", rules: {}, sources: { Roll20: false }, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } };
      const s = setup(layout, {}, r => { r.add("vault", "item", { id: "r20-rod", name: "Roll Rod", kind: "wondrous", attunement: false }, { path: "r20.md", sourceName: "Roll20" }); }, camp);
      s.ctl.open({ kind: "compendium" }); search(s, "roll rod");
      expect(names(s)).toEqual([]);
    });
    it("adding keeps the panel open, notifies, and turns the button into +1", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      search(s, "whistle");
      s.click(s.q('[data-item="tin-whistle"]'));
      expect(s.ctl.panel?.kind).toBe("compendium");
      expect(s.char().inventory.map(e => e.id)).toEqual(["tin-whistle"]);
      expect(s.notices.at(-1)).toBe("Added Tin Whistle.");
      expect((s.q(".fe-panel .fe-search") as HTMLInputElement).value).toBe("whistle");
      expect(s.q('[data-item="tin-whistle"]').textContent).toBe("+1");
    });
    it("an empty result offers to add the search as a custom item and prefills the form", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      search(s, "Brass key");
      expect(s.q('[data-note="item-none"]').textContent).toContain("Brass key");
      const offer = s.q('[data-act="prefill-custom"]');
      expect(offer.textContent).toBe("Add 'Brass key' as a custom item");
      s.click(offer);
      expect((s.q('[data-field="name"]') as HTMLInputElement).value).toBe("Brass key");
      s.click(s.q('[data-act="add-custom"]'));
      expect(s.char().inventory[0]).toMatchObject({ name: "Brass key", qty: 1 });
    });
  });
}

describe("search focus", () => {
  it("desktop puts the cursor in the search box when the panel opens; touch layouts do not", () => {
    const d = setup("desktop"); d.ctl.open({ kind: "compendium" });
    expect(document.activeElement).toBe(d.q(".fe-panel .fe-search"));
    document.body.replaceChildren();
    for (const l of ["tablet", "mobile"] as const) {
      const t = setup(l); t.ctl.open({ kind: "compendium" });
      expect(document.activeElement).not.toBe(t.q(".fe-panel .fe-search"));
      document.body.replaceChildren();
    }
  });
  it("keeps focus and caret in the search box when the sheet redraws", () => {
    const s = setup("desktop"); s.ctl.open({ kind: "compendium" });
    const box = s.q(".fe-panel .fe-search") as HTMLInputElement;
    box.focus(); s.type(box, "ember tonic"); box.setSelectionRange(3, 5);
    s.click(s.q('[data-chip="consumable"]'));   // a chip redraws the whole panel
    const again = s.q(".fe-panel .fe-search") as HTMLInputElement;
    expect(again).not.toBe(box);
    expect(again.value).toBe("ember tonic");
  });
  it("a redraw while typing keeps the caret where it was", () => {
    const s = setup("desktop"); s.ctl.open({ kind: "compendium" });
    const box = s.q(".fe-panel .fe-search") as HTMLInputElement;
    box.focus(); s.type(box, "ember tonic"); box.setSelectionRange(3, 5);
    s.ctl.emit();
    const again = s.q(".fe-panel .fe-search") as HTMLInputElement;
    expect(document.activeElement).toBe(again);
    expect([again.selectionStart, again.selectionEnd]).toEqual([3, 5]);
  });
  it("the Add custom item offer moves the cursor to the Name box on desktop", () => {
    const s = setup("desktop"); s.ctl.open({ kind: "compendium" });
    s.type(s.q(".fe-panel .fe-search"), "Brass key"); s.click(s.q('[data-act="prefill-custom"]'));
    expect(document.activeElement).toBe(s.q('[data-field="name"]'));
  });
});
