// @vitest-environment jsdom
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());
for (const layout of LAYOUTS) it(`cast panel counts slots and warns when unprepared (${layout})`, () => {
  const s = sheet(layout, { ...thalia, spellSlots: { "1": { used: 1 }, "2": { used: 3 } }, spells: [{ id: "cure-wounds", prepared: true }, { id: "bless", prepared: false }] });
  s.ctl.open({ kind: "cast", spell: "cure-wounds" });
  expect(s.all('[data-panel="cast"] [data-slot]').map(b => b.textContent)).toEqual(["Level 1 (3 left)", "Level 2 (none left)", "Level 3 (2 left)"]);
  expect((s.q('[data-panel="cast"] [data-slot="2"]') as HTMLButtonElement).disabled).toBe(true);
  expect(s.root.querySelector("[data-unprepared]")).toBeNull();
  s.ctl.open({ kind: "cast", spell: "bless" });
  expect(s.q("[data-unprepared]").textContent).toContain("Bless is not prepared today.");
  s.click(s.q('[data-act="prepare-now"]')); expect(s.ctl.character!.spells[1].prepared).toBe(true);
});
