// @vitest-environment jsdom
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

// invented class with no spells at all (the Skirmisher fixture grants a spell at level 1, so it is not used here)
const brawler = { type: "5e-class", name: "Brawler", hitDie: 10, saves: ["str", "con"], levels: { 1: [{ op: "feature", name: "Thick Skin", text: "Shrug it off." }] } };
const fighterish = { type: "5e-character", name: "Brann", classes: [{ class: "brawler", level: 1 }], abilities: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 8 }, hp: { max: 10, current: 10, temp: 0 } };

afterEach(() => document.body.replaceChildren());
for (const layout of LAYOUTS) it(`a non-caster sees no spell cards (${layout})`, () => {
  const s = sheet(layout, fighterish, [brawler]);
  for (const f of ["spell-dc", "spell-slots", "pinned-spells"]) expect(s.q(`[data-feature="${f}"]`).hidden, f).toBe(true);
  expect(s.q('[data-feature="spells"] [data-no-spells]').textContent).toBe("Brann does not cast spells. Spells from items or feats will show here.");
  expect(s.root.textContent).not.toContain("No spellcasting");
});
it("the spell DC line sits in a card", () => {
  const s = sheet("desktop", thalia); expect(s.q('[data-feature="spell-dc"]').classList.contains("fe-card")).toBe(true);
});
it("pinned combos sit in a titled card", () => {
  const s = sheet("desktop", thalia);
  const el = s.q('[data-feature="pinned-combos"]'); expect(el.classList.contains("fe-card")).toBe(true);
  expect(el.querySelector(".fe-card-title")!.textContent).toBe("Combos");
});
