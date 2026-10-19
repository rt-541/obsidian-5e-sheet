// @vitest-environment jsdom
import type { Effects } from "../../src/core/types";
import { describeEffects } from "../../src/ui/widgets";
import { LAYOUTS, sheet } from "./review-helpers";

// invented feat: a speed bonus from a scale-backed formula
const swift = { type: "5e-feat", name: "Swift Plans", grants: [{ op: "effect", effects: { modifiers: [{ target: "speed", value: "plan_count" }] } }] };
const note = { type: "5e-character", name: "Pip", classes: [{ class: "skirmisher", level: 3 }], feats: ["swift-plans"], abilities: { str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 8 }, hp: { max: 20, current: 20, temp: 0 } };
const BAD = [/\{[a-z0-9-]+\}/, /\b[a-z]+_[a-z_]+\b/, / \+ total\b/, /\((?:[a-z]+-)+[a-z]+\)/];

for (const layout of LAYOUTS) it(`no raw tokens on any tab (${layout})`, () => {
  const s = sheet(layout, note, [swift]);
  for (const t of s.all(".fe-tab")) { s.click(t); for (const re of BAD) expect(s.root.textContent, String(re)).not.toMatch(re); }
  s.ctl.open({ kind: "details", ref: "feature:class:skirmisher:3:feature-1" });   // Sudden Strike, damage "{plan-die}+2"
  for (const re of BAD) expect(s.q('[data-panel="details"]').textContent).not.toMatch(re);
});
it("formula modifiers evaluate with the character's numbers, else read as words", () => {
  const e: Effects = { modifiers: [{ target: "speed", value: "plan_count" }] };
  expect(describeEffects(e, { vars: { plan_count: 4 } })).toBe("Speed +4");
  expect(describeEffects(e)).toBe("Speed + your plan count");
  expect(describeEffects({ modifiers: [{ target: "hpMax", value: "total" }] })).toBe("Max HP + your level");
});
it("the Actions card fills scale dice", () => {
  const s = sheet("desktop", note, [swift]); s.click(s.q('[data-tab="features"]'));
  expect(s.q('[data-action="class:skirmisher:3:feature-1"] .fe-faint').textContent).toContain("costs 1 Focus · attack · 1d4+2");
});
it("an unknown formula name or dice scale reads as words and never throws", () => {
  expect(describeEffects({ modifiers: [{ target: "speed", value: "no_such_scale" }] }, { vars: {} })).toBe("Speed + your no such scale");
  expect(describeEffects({ extraDamage: [{ dice: "{ghost-die}", type: "weapon" }] })).toContain("your ghost die");
});
