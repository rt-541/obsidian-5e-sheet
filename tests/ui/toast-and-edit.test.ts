// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) describe(`feedback (${layout})`, () => {
  it("a sheet message shows in the sheet's own toast", () => {
    const s = sheet(layout, thalia); s.ctl.say("Added Rope.");
    expect(s.q(".fe-toast").hidden).toBe(false); expect(s.q(".fe-toast").textContent).toContain("Added Rope.");
    expect(s.notices).toEqual([]);
  });
  it("Edit mode shows XP once and says it is editing", () => {
    const s = sheet(layout, thalia); s.ctl.setEditing(true);
    expect(s.q('[data-feature="xp"]').textContent!.match(/6500/g) ?? []).toHaveLength(0);
    expect((s.q('[data-feature="xp"] input.fe-xp-input') as HTMLInputElement).value).toBe("6500");
    expect(s.q(".fe-edit-bar").textContent).toBe("Editing: changes save as you type");
  });
});
it("the Obsidian view sends sheet messages to the sheet", () =>
  expect(readFileSync("src/obsidian/character-view.ts", "utf8")).toMatch(/notify: m => \(?\w+ \? \w+\.say\(m\) : this\.plugin\.notice\(m\)/));
it("the phone toast sits at the bottom", () => expect(readFileSync("styles.css", "utf8")).toMatch(/\.fe-mobile \.fe-toast \{ left: 12px; right: 12px; top: auto; bottom: 12px; \}/));
