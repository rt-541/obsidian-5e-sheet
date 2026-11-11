// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());
const css = readFileSync("styles.css", "utf8");

it("underlines only mark headings and stat labels", () => {
  expect(css).not.toMatch(/\.fe-sheet \[data-ref\] \{[^}]*underline/);
  expect(css).toMatch(/\.fe-sheet \.fe-card-title\[data-ref\], \.fe-sheet \.fe-stat-l\[data-ref\] \{[^}]*underline dotted/);
});
for (const layout of LAYOUTS) it(`dots have legends (${layout})`, () => {
  const s = sheet(layout, thalia);
  expect(s.q('[data-feature="skills"] [data-legend]').textContent).toBe("Filled dot: trained (add your proficiency bonus).");
  expect(s.q('[data-feature="saves"] [data-legend]').textContent).toBe("Filled dot: trained (add your proficiency bonus).");
});
it("summaries use an arrow character", () => {
  const s = sheet("desktop", { ...thalia, conditions: { exhaustion: 2 } });
  expect(s.ctl.restPreview("long")).toContain("Exhaustion 2 → 1");
});
