// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, writeInto, newCharacter, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

function setup(note: object, mobile: boolean, extra?: (r: Registry) => void) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); extra?.(r);
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(3), body: "" };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, saved, q, click };
}
const wand = (r: Registry) => r.add("vault", "item", { id: "ember-wand", name: "Ember Wand", kind: "wondrous", attunement: true, charges: { max: 3, reset: "dawn" },
  grants: { spells: [{ id: "burning-hands", charges: 1 }] } }, { path: "w.md" });
const note = { ...thalia, spells: [{ id: "bless", prepared: true }, { id: "sacred-flame", prepared: true }],
  inventory: [...thalia.inventory, { id: "ember-wand", equipped: true, attuned: false }] };

describe("pinning spells to the main page", () => {
  for (const mobile of [false, true]) {
    it(`${mobile ? "mobile" : "desktop"}: pin an own spell and an item spell, both show on the main page`, () => {
      const s = setup(note, mobile, wand);
      expect(s.q('[data-feature="pinned-spells"]').textContent).toContain("Pin spells on the Spells tab");
      s.click('[data-tab="spells"]');
      s.click('[data-spell="sacred-flame"] [data-act="pin"]');
      expect(s.ctl.character!.mainSpells).toEqual(["sacred-flame"]);
      s.ctl.dispatch({ type: "attune", index: 5, on: true });
      s.click('[data-from-items] [data-spell="burning-hands"] [data-act="pin"]');
      expect(s.ctl.character!.mainSpells).toEqual(["sacred-flame", "ember-wand/burning-hands"]);
      const card = s.q('[data-feature="pinned-spells"]');
      expect([...card.querySelectorAll("[data-spell]")].map(e => (e as HTMLElement).dataset.spell)).toEqual(["sacred-flame", "burning-hands"]);
      expect(card.textContent).toContain("1 charge");
      expect((s.saved.at(-1) as Character).mainSpells).toEqual(["sacred-flame", "ember-wand/burning-hands"]);
    });
  }
  it("cast from the main page works and unpin removes it", () => {
    const s = setup(note, false, wand);
    s.ctl.dispatch({ type: "pinSpell", key: "sacred-flame", on: true });
    s.click('[data-feature="pinned-spells"] [data-spell="sacred-flame"] [data-act="cast"]');
    expect(s.q(".fe-toast").textContent).toContain("Sacred Flame");
    s.click('[data-tab="spells"]'); s.click('[data-spell="sacred-flame"] [data-act="pin"]');
    expect(s.ctl.character!.mainSpells).toEqual([]);
  });
  it("an item spell pin hides while the item is not attuned and returns when it is", () => {
    const s = setup({ ...note, mainSpells: ["ember-wand/burning-hands"] }, false, wand);
    expect(s.q('[data-feature="pinned-spells"] [data-spell="burning-hands"]')).toBeNull();
    s.ctl.dispatch({ type: "attune", index: 5, on: true });
    expect(s.q('[data-feature="pinned-spells"] [data-spell="burning-hands"]')).not.toBeNull();
  });
  it("removing a spell drops its pin; untouched notes gain no mainSpells key", () => {
    const s = setup({ ...note, mainSpells: ["bless"] }, false);
    s.ctl.setEditing(true); s.click('[data-tab="spells"]');
    s.click('[data-spell="bless"] [data-act="remove-spell"]');
    expect(s.ctl.character!.mainSpells).toEqual([]);
    const fm: Record<string, unknown> = { type: "5e-character", name: "New" }; writeInto(fm, newCharacter("New"));
    expect("mainSpells" in fm).toBe(false);
  });
  it("mainSpells with a non-list value makes the note read-only", () => {
    const p = parseNote({ ...thalia, mainSpells: "bless" }); if (p.kind !== "character") throw new Error();
    expect(p.writable).toBe(false); expect(p.errors).toContain("mainSpells: must be a list");
  });
});

describe("button shapes survive Obsidian's global button height", () => {
  const css = readFileSync("styles.css", "utf8");
  it("pips, dots and switches have explicit sizes at button specificity", () => {
    for (const sel of [".fe-sheet button.fe-pip", ".fe-sheet button.fe-dot", ".fe-sheet button.fe-switch"]) expect(css, sel).toContain(sel);
    expect(css).toMatch(/\.fe-sheet button\.fe-pip \{ width: 16px; height: 16px; \}/);
  });
});
