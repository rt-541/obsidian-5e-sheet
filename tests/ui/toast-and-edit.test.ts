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
  it("a message stays visible across a later render", () => {
    const s = sheet(layout, thalia); s.ctl.say("Added Rope."); s.ctl.emit();
    expect(s.q(".fe-toast").hidden).toBe(false); expect(s.q(".fe-toast").textContent).toContain("Added Rope.");
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
it("the toast never swallows taps meant for panel buttons", () =>
  expect(readFileSync("styles.css", "utf8")).toMatch(/\.fe-toast \{ pointer-events: none;/));
for (const layout of LAYOUTS) it(`opening one ... menu closes the other (${layout})`, () => {
  const s = sheet(layout, thalia);
  s.ctl.toggleItemMenu(0); s.ctl.toggleCompanionMenu(0);
  expect(s.ctl.itemMenu).toBeNull(); expect(s.ctl.companionMenu).toBe(0);
  s.ctl.toggleItemMenu(1);
  expect(s.ctl.companionMenu).toBeNull(); expect(s.ctl.itemMenu).toBe(1);
});
