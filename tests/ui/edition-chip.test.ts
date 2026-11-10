// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { LAYOUTS, sheet } from "./review-helpers";
import { generalChanges } from "../../src/content/edition-changes";
import { CHARACTER_FEATURES, layoutFor, placed } from "../../src/ui/layouts";

const note = (edition?: string) => ({ type: "5e-character", name: "Brann", classes: [{ class: "skirmisher", level: 3 }], ...(edition ? { edition } : {}) });

for (const layout of LAYOUTS) {
  describe(`edition chip and panel (${layout})`, () => {
    afterEach(() => { document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });
    const openCard = (s: ReturnType<typeof sheet>, id: string): HTMLElement => {
      const el = s.q(`[data-feature="identity"] .fe-edition-chip`); expect(el.dataset.ref).toBe(`edition:${id}`);
      if (layout === "desktop") { vi.useFakeTimers(); el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300); vi.useRealTimers(); return document.querySelector(".fe-popover") as HTMLElement; }
      el.dispatchEvent(new MouseEvent("click", { bubbles: true })); return s.q('[data-panel="details"]');
    };
    it("the identity line shows the chip and its card opens the panel", () => {
      for (const [ed, id, text, title] of [["2024", "2024", "2024 rules", "What changed from 2014"], [undefined, "2014", "2014 rules", "What would change under 2024"]] as const) {
        const s = sheet(layout, note(ed));
        expect(s.q('[data-feature="identity"] span.fe-chip.fe-edition-chip').textContent).toBe(text);
        const card = openCard(s, id);
        const b = card.querySelector<HTMLElement>("button.fe-btn.fe-edition-open")!; expect(b.textContent).toBe("What changed");
        s.click(b);
        expect(s.ctl.panel).toEqual({ kind: "edition-changes" });
        expect(s.q('[data-panel="edition-changes"] .fe-panel-head .fe-name').textContent).toBe(title);
        document.body.replaceChildren();
      }
    });
    it("the Settings card reaches the same panel and each feature id is still placed once", () => {
      const s = sheet(layout, note("2024"));
      expect(s.q('[data-feature="settings"] [data-setting="edition"]').textContent).toContain("Rules edition");
      s.click(s.q('[data-feature="settings"] [data-setting="edition"] button.fe-edition-open'));
      expect(s.ctl.panel).toEqual({ kind: "edition-changes" });
      for (const f of CHARACTER_FEATURES) expect(placed(layoutFor(false, layout)).filter(x => x === f).length, f).toBe(1);
      expect(s.all('[data-feature="identity"]')).toHaveLength(1);
    });
    it("the panel lists part one with 2014 and 2024 sentences and its buttons are 44 px", () => {
      const s = sheet(layout, note());
      s.ctl.open({ kind: "edition-changes" });
      const p = s.q('[data-panel="edition-changes"]');
      const notes = generalChanges(); const items = [...p.querySelectorAll<HTMLElement>("[data-change]")];
      expect(items.map(i => i.dataset.change)).toEqual(notes.map(n => n.id));
      for (const [i, n] of notes.entries()) { expect(items[i].textContent).toContain(n.title); expect(items[i].textContent).toContain(`2014 (yours): ${n["2014"]}`); expect(items[i].textContent).toContain(`2024: ${n["2024"]}`); expect(items[i].querySelectorAll(".is-yours")).toHaveLength(1); }
      expect(p.querySelector(".fe-panel-head .fe-name")!.textContent).toBe("What would change under 2024");
    });
    it("the chip is a sibling of the identity label, so the label can be cut without cutting the chip", () => {
      const s = sheet(layout, note("2024"));
      const chip = s.q('[data-feature="identity"] .fe-edition-chip');
      expect(chip.parentElement!.classList.contains("fe-identity")).toBe(true);
      expect(chip.closest(".fe-identity-label")).toBeNull();
      expect(chip.previousElementSibling!.classList.contains("fe-identity-label")).toBe(true);
    });
    it("a non-character sheet has no chip", () => {
      const s = sheet(layout, { type: "5e-npc", name: "Snag", hp: 5, ac: 10 });
      expect(s.all(".fe-edition-chip")).toHaveLength(0);
    });
  });
}

describe("edition button sizing", () => {
  it("keeps 44 px on tablet and phone", () => {
    expect(readFileSync("styles.css", "utf8")).toContain(".fe-mobile button.fe-edition-open, .fe-tablet button.fe-edition-open { min-height: 44px; }");
  });
});

describe("edition chip sizing", () => {
  it("is a 44 px tap target on tablet and phone", () => {
    expect(readFileSync("styles.css", "utf8")).toMatch(/\.fe-sheet\.fe-mobile \.fe-chip\.fe-edition-chip, \.fe-sheet\.fe-tablet \.fe-chip\.fe-edition-chip, \.fe-mobile \.fe-sheet \.fe-chip\.fe-edition-chip, \.fe-tablet \.fe-sheet \.fe-chip\.fe-edition-chip \{[^}]*display: inline-flex;[^}]*min-height: 44px/);
  });
});
