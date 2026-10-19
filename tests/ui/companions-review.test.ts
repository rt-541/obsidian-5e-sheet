// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { thalia } from "../fixtures/notes";
import { LAYOUTS, sheet } from "./review-helpers";

type S = ReturnType<typeof sheet>;
const openMenu = (s: S) => {
  const t = s.root.querySelector<HTMLElement>('[data-tab="companions"], [data-tab="more"], [data-tab="pets"]');
  if (t) s.click(t);
  s.click(s.q('[data-companion="0"] [data-act="companion-menu"]'));
};

for (const layout of LAYOUTS) describe(`companions (${layout})`, () => {
  it("familiars list beasts first and the make buttons come first", () => {
    const s = sheet(layout, thalia, [], { saveCreature: async () => "x" }); s.ctl.open({ kind: "add-companion" });
    const first = s.q('[data-panel="add-companion"] [data-creature]').closest(".fe-inv")!;
    expect(first.textContent).toMatch(/beast/);
    expect(s.q('[data-panel="add-companion"] .fe-companion-panel > div:last-child').firstElementChild!.matches("[data-make]")).toBe(true);
  });
  it("rename and remove from the card's menu", () => {
    const s = sheet(layout, thalia); openMenu(s);
    s.type(s.q('[data-act="companion-rename"]'), "Moonfeather", "change");
    expect(s.ctl.character!.companions[0].name).toBe("Moonfeather");
    s.click(s.q('[data-act="companion-remove"]')); s.click(s.q('[data-act="remove-yes"]'));
    expect(s.ctl.character!.companions.length).toBe(0);
  });
  it("a blank rename keeps the old name and saves nothing", () => {
    const s = sheet(layout, thalia), before = s.saved.length; openMenu(s);
    s.type(s.q('[data-act="companion-rename"]'), "   ", "change");
    expect(s.ctl.character!.companions[0].name).toBe("Hoot"); expect(s.saved.length).toBe(before);
    expect(s.notices).toContain("A companion needs a name.");
  });
});
