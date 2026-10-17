// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

function setup(note: object, mobile: boolean, extra?: (r: Registry) => void) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); extra?.(r);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(11), body: "" };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { r, ctl, root, saved, notices, q, click };
}
const wand = (r: Registry) => r.add("vault", "item", { id: "ember-wand", name: "Ember Wand", kind: "wondrous", attunement: true, charges: { max: 3, reset: "dawn" },
  grants: { spells: [{ id: "burning-hands", charges: 1 }] } }, { path: "w.md" });
const withSpell = { ...thalia, spells: [{ id: "cure-wounds", prepared: true }, { id: "burning-hands", prepared: true }] };

describe("spells tab", () => {
  for (const mobile of [false, true]) {
    it(`${mobile ? "mobile" : "desktop"} places spells and concentration`, () => {
      const s = setup(withSpell, mobile);
      expect(s.root.querySelectorAll('[data-feature="spells"]')).toHaveLength(1);
      expect(s.root.querySelectorAll('[data-feature="concentration"]')).toHaveLength(1);
      expect([...s.root.querySelectorAll(".fe-tab")].map(t => t.textContent)).toContain("Spells");
    });
  }
  it("casting Burning Hands from the panel at level 2 spends a level-2 slot", () => {
    const s = setup(withSpell, false);
    s.click('[data-tab="spells"]');
    s.click('[data-spell="burning-hands"] [data-act="cast"]');
    s.click('[data-panel="cast"] [data-slot="2"]');
    s.click('[data-act="cast-apply"]');
    expect(s.ctl.character!.spellSlots["2"]).toEqual({ used: 1 });
    expect(s.ctl.panel).toBeNull();
    expect(s.q(".fe-toast").textContent).toContain("Cast Burning Hands (level 2, slot spent)");
  });
  it("the cast panel offers damage and healing dice at the chosen slot level", () => {
    const s = setup(withSpell, false);
    s.click('[data-tab="spells"]');
    s.click('[data-spell="burning-hands"] [data-act="cast"]');
    s.click('[data-panel="cast"] [data-slot="3"]');
    expect(s.q('[data-panel="cast"] [data-upcast="3"]').textContent).toBe("5d6");
    s.click('[data-panel="cast"] [data-upcast] button');
    expect(s.ctl.lastRoll?.title).toContain("Burning Hands damage");
    s.click('[data-panel="cast"] [data-act="cast-apply"]');
    s.click('[data-spell="cure-wounds"] [data-act="cast"]');
    s.click('[data-panel="cast"] [data-slot="2"]');
    expect(s.q('[data-panel="cast"] [data-upcast="2"]').textContent).toMatch(/^2d8/);
  });
  it("an attuned charged item lists its spell, casting spends a charge, unattuning removes it", () => {
    const base = { ...thalia, inventory: [{ id: "ember-wand", equipped: true, attuned: false }] };
    const s = setup(base, false, wand);
    s.click('[data-tab="spells"]');
    expect(s.q('[data-from-items] [data-spell="burning-hands"]')).toBeNull();
    s.ctl.dispatch({ type: "attune", index: 0, on: true });
    s.click('[data-from-items] [data-spell="burning-hands"] [data-act="cast"]');
    expect(s.ctl.character!.inventory[0].charges).toEqual({ used: 1 });
    s.ctl.dispatch({ type: "attune", index: 0, on: false });
    expect(s.q('[data-from-items] [data-spell="burning-hands"]')).toBeNull();
  });
  it("concentration chip shows and clears", () => {
    const s = setup({ ...withSpell, concentration: "bless" }, false);
    expect(s.q('[data-feature="concentration"]').textContent).toContain("Bless");
    s.click('[data-act="end-concentration"]');
    expect(s.ctl.character!.concentration).toBeUndefined();
  });
  it("add spell panel adds and edit mode removes", () => {
    const s = setup(thalia, false);
    s.click('[data-feature="play-edit"] .fe-seg .fe-btn:last-child'); s.click('[data-tab="spells"]');
    s.click('[data-act="add-spell"]'); s.click('[data-panel="add-spell"] [data-add="bless"]');
    expect(s.ctl.character!.spells.map(x => x.id)).toContain("bless");
    s.click('[data-panel="add-spell"] .fe-panel-head .fe-btn');
    s.click('[data-spell="bless"] [data-act="remove-spell"]');
    expect(s.ctl.character!.spells.map(x => x.id)).not.toContain("bless");
  });
});
