// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Step } from "../../src/core/levelup";
import { answered, spellStepHeading, spellStepRows, spellsPage, type PageCtl, type PageState } from "../../src/ui/levelup-ui";

const opt = (id: string, level: number, disabled?: string) => ({ id, name: id, level, ...(disabled ? { disabled } : {}) });
const step = (count: number, cantrips: number): Extract<Step, { kind: "spells" }> => ({ kind: "spells", key: "k", label: "Spells", source: "Test 1", count, cantrips, swap: 0, maxLevel: 1,
  options: [opt("zap", 1), opt("glow", 0), opt("blast", 3, "Needs a level 3 slot"), opt("ash", 0), opt("bolt", 1, "Already known")] });

describe("spell step rows and heading", () => {
  it("a cantrip-only step lists only cantrips", () => expect(spellStepRows(step(0, 2), "").map(o => o.id)).toEqual(["ash", "glow"]));
  it("a mixed step lists cantrips first and leaves out spells the character cannot cast", () =>
    expect(spellStepRows(step(1, 2), "").map(o => o.id)).toEqual(["ash", "glow", "bolt", "zap"]));
  it("the search narrows the rows", () => expect(spellStepRows(step(1, 2), "ZA").map(o => o.id)).toEqual(["zap"]));
  it("the heading never says 0 of 0", () => {
    expect(spellStepHeading(step(0, 2), 1, 0)).toBe("Learn 2 cantrips: 1 of 2 chosen");
    expect(spellStepHeading(step(1, 2), 2, 0)).toBe("Learn 2 cantrips: 2 of 2 chosen; learn 1 spell: 0 of 1 chosen");
    expect(spellStepHeading(step(2, 0), 0, 1)).toBe("Learn 2 spells: 1 of 2 chosen");
  });
  it("nothing left to learn says so, and the step cannot be answered", () => {
    const s = { ...step(0, 1), options: [opt("glow", 0, "Already known")] };
    const ctl = { character: { spells: [] }, host: { registry: { get: () => undefined }, notify: () => {} }, pickers: () => ({}), pick: () => {} } as unknown as PageCtl;
    const st = { choices: {}, view: { spellQuery: "" } } as unknown as PageState;
    const page = spellsPage(ctl, s, st);
    expect(page.textContent).toContain("Every cantrip on this list is already known.");
    expect(page.textContent).toContain("Learn 1 cantrip: 0 of 1 chosen");
    expect(answered(s, st)).toBe(false);
    expect((page.querySelector("input.fe-search") as HTMLInputElement).type).toBe("search");
  });
});
