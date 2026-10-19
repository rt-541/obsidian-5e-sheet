// @vitest-environment jsdom
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());
for (const layout of LAYOUTS) describe(`pickers (${layout})`, () => {
  it("Add item puts the search first and shows no file paths", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "compendium" });
    const body = s.q('[data-panel="compendium"] .fe-additem');
    expect(body.firstElementChild!.matches('input[type="search"]')).toBe(true);
    s.type(s.q('[data-keep="item-search"]'), "dag");
    expect(s.q('[data-pane="item-results"]').textContent).not.toMatch(/\.md\b/);
    expect(s.q('[data-form="custom-item"]')).not.toBeNull();
  });
  it("an import after typing a quantity does not inherit it", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "compendium" });
    s.type(s.q('[data-field="qty"]'), "2");
    s.click(s.q('[data-act="import-item"]'));
    s.type(s.q('[data-field="import-text"]'), "Moonlit Lantern\nWondrous item, common\nA lantern that glows softly.");
    s.click(s.q(`[data-act="read-item"]`));
    expect((s.q('[data-field="qty"]') as HTMLInputElement).value).toBe("1");
  });
  it("Add spell hides spells above the highest slot until asked", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "add-spell" });
    expect(s.q('[data-pick="banishment"]')).toBeNull(); expect(s.q('[data-pick="spiritual-weapon"]')).not.toBeNull();
    s.click(s.q('[data-act="higher-levels"]')); expect(s.q('[data-pick="banishment"]')).not.toBeNull();
  });
  it("the class-list switch label tells the truth right after the click", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "add-spell" }); s.click(s.q('[data-act="show-all"]'));
    expect(s.q('[data-act="show-all"]').closest("label")!.textContent).toBe("Showing all spells");
  });
});
