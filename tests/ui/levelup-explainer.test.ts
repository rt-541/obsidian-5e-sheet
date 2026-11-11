// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { pcSub } from "../fixtures/overlay";

function setup(layout: "desktop" | "tablet" | "mobile") {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(5), body: "" };
  const p = parseNote(pcSub("monk", 10, "open-hand", { dex: 18, wis: 16, con: 14 })); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, q, click };
}

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`level-up explainer (${layout})`, () => {
  it("the summary page lists what changes in plain words, grouped under headings", () => {
    const s = setup(layout);
    s.click('[data-act="level-up"]'); s.click('[data-class="monk"]'); s.click('[data-act="lu-next"]');
    s.click('[data-hp="average"]'); s.click('[data-act="lu-next"]');
    // any further steps (none for this level) then the summary
    const sum = s.q('[data-step="summary"]');
    expect(sum).not.toBeNull();
    const text = sum.textContent!;
    expect(text).toContain("What changes");
    expect(text).toContain("New features");
    expect(text).toContain("Tranquility");
    expect(text).toContain("Martial arts die 1d6 → 1d8");
    expect(text).toContain("Ki Points 10 → 11");
    expect([...sum.querySelectorAll(".fe-change-title")].map(e => e.textContent)).toEqual(expect.arrayContaining(["New features", "What grows with your level", "Hit points"]));
  });

  it("undo shows the same list reversed before it asks to confirm", () => {
    const s = setup(layout);
    s.click('[data-act="level-up"]'); s.click('[data-class="monk"]'); s.click('[data-act="lu-next"]');
    s.click('[data-hp="average"]'); s.click('[data-act="lu-next"]'); s.click('[data-act="lu-apply"]');
    s.click('[data-feature="play-edit"] .fe-seg .fe-btn:last-child');
    s.click('[data-act="undo-level"]');
    const diff = s.q(".fe-undo-diff");
    expect(diff).not.toBeNull();
    expect(diff.textContent).toContain("Features you lose");
    expect(diff.textContent).toContain("Tranquility");
    expect(diff.textContent).toContain("Ki Points 11 → 10");
  });
});
