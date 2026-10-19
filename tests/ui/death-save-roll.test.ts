// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { seq, sheetWith } from "../fixtures/attack-options";

const down = { hp: { max: 20, current: 0, temp: 0 } };
const go = (s: ReturnType<typeof sheetWith>) => s.click(s.q('[data-feature="death-saves"] [data-act="death-save-roll"]'));

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`death save roll (${layout})`, () => {
  it("a middling roll is a success", () => {
    const s = sheetWith(layout, down, seq(0.5)); go(s);
    expect(s.ctl.character!.deathSaves.successes).toBe(1); expect(s.ctl.character!.deathSaves.failures).toBe(0);
  });
  it("a natural 1 counts as two failures", () => {
    const s = sheetWith(layout, down, seq(0)); go(s);
    expect(s.ctl.character!.deathSaves.failures).toBe(2);
  });
  it("a low roll is one failure", () => {
    const s = sheetWith(layout, down, seq(0.2)); go(s);
    expect(s.ctl.character!.deathSaves.failures).toBe(1);
  });
  it("a natural 20 brings you back up with 1 hit point and clears the saves", () => {
    const s = sheetWith(layout, { ...down, deathSaves: { successes: 1, failures: 1 } }, seq(0.99)); go(s);
    expect(s.ctl.stats()!.hp.current).toBe(1);
    expect(s.ctl.character!.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(s.notices.at(-1)).toBe("Natural 20: you are back up with 1 hit point.");
  });
  it("the third success says you are stable", () => {
    const s = sheetWith(layout, { ...down, deathSaves: { successes: 2, failures: 0 } }, seq(0.5)); go(s);
    expect(s.notices.at(-1)).toBe("Three successes: you are stable.");
  });
  it("the third failure says your character dies", () => {
    const s = sheetWith(layout, { ...down, deathSaves: { successes: 0, failures: 2 } }, seq(0.2)); go(s);
    expect(s.ctl.character!.deathSaves.failures).toBe(3);
    expect(s.notices.at(-1)).toBe("Three failed death saves: your character dies.");
  });
  it("the button is absent above 0 hit points", () => {
    const s = sheetWith(layout, { hp: { max: 20, current: 5, temp: 0 } });
    expect(s.q('[data-act="death-save-roll"]')).toBeNull();
  });
  it("own dice: asks for the die, checks the range, and applies the same rules", () => {
    const s = sheetWith(layout, { ...down, rules: { "own-dice": true } });
    go(s);
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 1d20");
    expect(s.ctl.character!.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(s.ctl.submitTotal("21")).toBe(false);
    expect(s.q(".fe-own-roll").textContent).toContain("Type a number from 1 to 20.");
    expect(s.ctl.submitTotal("20")).toBe(true);
    expect(s.ctl.stats()!.hp.current).toBe(1);
  });
});
