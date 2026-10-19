// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseNote } from "../../src/core/character";
import { HIT_WINDOW_MS } from "../../src/ui/controller";
import { seq, sheetWith } from "../fixtures/attack-options";
import { tester } from "../fixtures/mechanics";

for (const layout of ["desktop", "tablet", "mobile"] as const) {
  describe(`attack options on rolls (${layout})`, () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

    const attackIndex = (s: ReturnType<typeof sheetWith>) => s.ctl.stats()!.attacks.findIndex(a => a.name === "Longsword");

    it("to-hit: spends on the roll, adds the die, says so", () => {
      const s = sheetWith(layout, { feats: ["test-focus"], optionsOn: ["test-focus"] }, seq(0.5));
      const ai = attackIndex(s), a = s.ctl.stats()!.attacks[ai];
      const r = s.ctl.attackRoll(ai)!;
      expect(r.total).toBe(11 + a.toHit! + 3);
      expect(r.detail).toContain("+ Test Focus 1d4 (3)");
      expect(r.detail).toContain("; 2 of 3 Focus Dice left");
      expect(s.left("focus-dice").used).toBe(1);
    });

    it("two to-hit options share the last die", () => {
      const s = sheetWith(layout, { feats: ["test-focus", "test-steady"], optionsOn: ["test-focus", "test-steady"], uses: { "focus-dice": 2 } }, seq(0.5));
      const r = s.ctl.attackRoll(attackIndex(s))!;
      expect(s.left("focus-dice").used).toBe(3);
      expect(r.detail).toContain("Test Focus");
      expect(r.detail).not.toContain("Test Steady");
      expect(s.ctl.stats()!.attackOptions.every(o => !o.on)).toBe(true);
      expect(s.notices.at(-1)).toBe("No Focus Dice left: Test Focus and Test Steady are off.");
    });

    it("on-hit: only damage spends, and the damage button counts as a hit", () => {
      const d = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      const ai = attackIndex(d);
      d.ctl.attackRoll(ai); expect(d.left("insight-dice").used).toBe(0);
      expect(d.ctl.attackDamage(ai)!.detail).toContain("+ Test Analysis 1d4 (3)"); expect(d.left("insight-dice").used).toBe(1);
      expect(d.ctl.attackDamage(ai, true)!.detail).toContain("+ Test Analysis 2d4 (");
      // the hit window: 3 s, then a miss spends nothing
      d.ctl.attackRoll(ai); expect(d.ctl.hitWindow).toMatchObject({ ai, name: "Longsword" });
      vi.advanceTimersByTime(HIT_WINDOW_MS); expect(d.ctl.hitWindow).toBeNull(); expect(d.left("insight-dice").used).toBe(2);
    });

    it("a miss leaves once-per-turn options on", () => {
      const m = sheetWith(layout, { feats: ["test-savage"], optionsOn: ["test-savage"] }, seq(0.5));
      const ai = attackIndex(m);
      m.ctl.attackRoll(ai); vi.advanceTimersByTime(HIT_WINDOW_MS);
      expect(m.ctl.stats()!.attackOptions[0].on).toBe(true);
      const hit = m.ctl.attackDamage(ai)!;
      expect(hit.detail).toContain("rolled twice"); expect(hit.detail).not.toMatch(/ {2}/); expect(hit.detail).toContain("Test Savage is off (once per turn)");
      expect(m.ctl.stats()!.attackOptions[0].on).toBe(false);
    });

    it("a reroll with extra damage dice reads in words, joined by plus", () => {
      const m = sheetWith(layout, { feats: ["test-savage", "test-ember"], optionsOn: ["test-savage"] }, seq(0.5));
      const d = m.ctl.attackDamage(attackIndex(m))!.detail;
      expect(d).not.toMatch(/ {2}/);
      expect(d).toMatch(/^rolled twice: \d+ and \d+, kept \d+ \([^)]*\) \+ 1d6 fire/);
    });

    it("extra switches are listed, and off means left out", () => {
      const e = sheetWith(layout, { feats: ["test-ember"] }, seq(0.5));
      const ai = attackIndex(e);
      expect(e.ctl.attackDamage(ai)!.detail).toContain("; applied: Test Ember");
      e.ctl.setAttackOption("extra:test-ember", false);
      expect(e.ctl.attackDamage(ai)!.detail).not.toContain("Test Ember");
    });

    it("reload closes the hit window", () => {
      const d = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      const ai = attackIndex(d);
      d.ctl.attackRoll(ai); d.ctl.reload(parseNote({ ...tester, feats: ["test-analysis"] }) as never);
      expect(d.ctl.hitWindow).toBeNull(); expect(d.ctl.attackDamage(99)).toBeUndefined();
    });

    // the weapon changes under an open window without a reload (an edit), so row `ai` is now another attack
    const swapWeapon = (d: ReturnType<typeof sheetWith>) => { (d.ctl.value as { inventory: unknown[] }).inventory = [{ id: "test-hunting-blade", equipped: true }]; };

    it("a window left over from another attack list rolls nothing and spends nothing", () => {
      const d = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      const ai = attackIndex(d);
      d.ctl.attackRoll(ai); expect(d.ctl.hitWindow).not.toBeNull();
      swapWeapon(d);
      expect(d.ctl.stats()!.attacks[ai]?.name).not.toBe("Longsword");
      expect(d.ctl.attackDamage(ai)).toBeUndefined();
      expect(d.left("insight-dice").used).toBe(0);
      expect(d.ctl.hitWindow).toBeNull();
    });

    it("a stale window also stops a new to-hit roll on the renamed row", () => {
      const d = sheetWith(layout, { feats: ["test-focus"], optionsOn: ["test-focus"] }, seq(0.5));
      const ai = attackIndex(d);
      d.ctl.attackRoll(ai); expect(d.left("focus-dice").used).toBe(1);
      swapWeapon(d);
      expect(d.ctl.attackRoll(ai)).toBeUndefined();
      expect(d.left("focus-dice").used).toBe(1);
    });
  });
}
