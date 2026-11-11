// @vitest-environment jsdom
import { CHARACTER_FEATURES } from "../../src/ui/layouts";
import { SECTION_GROUPS, SECTION_LABELS } from "../../src/ui/panels";
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());

it("every section has a human label in a group", () => {
  const ids = CHARACTER_FEATURES.filter(f => f !== "identity" && f !== "play-edit");
  expect(Object.keys(SECTION_LABELS).sort()).toEqual([...ids].sort());
  expect(SECTION_GROUPS.flatMap(g => g.ids).sort()).toEqual([...ids].sort());
});

for (const layout of LAYOUTS) it(`play views use plain words (${layout})`, () => {
  const s = sheet(layout, { ...thalia, concentration: "bless", spells: [{ id: "bless", prepared: true }] });
  for (const t of s.all(".fe-tab")) s.click(t);
  const text = s.root.textContent!;
  for (const w of ["Class DCs", "Scales", "built-in", " S ", " F "]) expect(text, w).not.toContain(w);
  expect(s.q('[data-feature="death-saves"]').textContent).toMatch(/Successes.*Failures/);
  expect(s.q('[data-spell="bless"] [data-badge="concentration"]').textContent).toBe("Concentration");
  s.ctl.open({ kind: "conditions" }); expect(s.q('[data-panel="conditions"]').textContent).not.toContain("WotC (SRD)");
  s.ctl.setEditing(true); s.ctl.open({ kind: "customize" });
  for (const raw of ["Ac", "Xp", "Hp", "Spell dc", "Toggles"]) expect(s.all('[data-panel="customize"] .fe-kv > span').map(e => e.textContent)).not.toContain(raw);
});
