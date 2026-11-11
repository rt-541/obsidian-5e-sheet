import { seeded } from "../../src/core/dice";
import { buildCharacter, newDraft, scoreProblems, ROLL_SCHEMES, rollScores, describeRoll, type BuildDraft, type RollScheme, type ScoreRoll } from "../../src/core/builder";
import { homebrewRegistry } from "../fixtures/homebrew";

const reg = homebrewRegistry([]);
const SCHEMES = ROLL_SCHEMES.map(s => s.id);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("rolling ability scores", () => {
  it("lists the five ways in order with plain labels and a sentence each", () => {
    expect(ROLL_SCHEMES.map(s => [s.id, s.label])).toEqual([["4d6-drop-lowest", "4d6, drop the lowest"], ["3d6", "3d6"], ["1d20", "1d20"], ["2d20-drop-lowest", "2d20, drop the lowest"], ["3d6-and-1d20", "Four 3d6 and two 1d20"]]);
    for (const s of ROLL_SCHEMES) expect(s.text).toMatch(/^Roll .*\.$/);
  });

  it.each(SCHEMES)("%s gives six rolls with the right dice and totals", (scheme: RollScheme) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rolls = rollScores(scheme, seeded(seed));
      expect(rolls).toHaveLength(6);
      for (const [i, r] of rolls.entries()) {
        const mixedD20 = scheme === "3d6-and-1d20" && i >= 4;
        const d6 = scheme === "4d6-drop-lowest" || scheme === "3d6" || (scheme === "3d6-and-1d20" && !mixedD20);
        const n = scheme === "4d6-drop-lowest" ? 4 : scheme === "3d6" || (scheme === "3d6-and-1d20" && !mixedD20) ? 3 : scheme === "2d20-drop-lowest" ? 2 : 1;
        expect(r.dice).toHaveLength(n);
        for (const x of r.dice) { expect(x).toBeGreaterThanOrEqual(1); expect(x).toBeLessThanOrEqual(d6 ? 6 : 20); }
        expect(r.total).toBeGreaterThanOrEqual(d6 ? 3 : 1); expect(r.total).toBeLessThanOrEqual(d6 ? 18 : 20);
        if (scheme === "4d6-drop-lowest" || scheme === "2d20-drop-lowest") {
          expect(r.dropped).toBe(Math.min(...r.dice));
          expect(r.total).toBe(sum(r.dice) - Math.min(...r.dice));
        } else { expect(r.dropped).toBeUndefined(); expect(r.total).toBe(sum(r.dice)); }
      }
    }
  });

  it("the mixed way rolls four 3d6 then two 1d20, and every way names its dice", () => {
    const rolls = rollScores("3d6-and-1d20", seeded(9));
    expect(rolls.map(r => r.expr)).toEqual(["3d6", "3d6", "3d6", "3d6", "1d20", "1d20"]);
    expect(rollScores("4d6-drop-lowest", seeded(1)).every(r => r.expr === "4d6")).toBe(true);
    expect(rollScores("2d20-drop-lowest", seeded(1)).every(r => r.expr === "2d20")).toBe(true);
    expect(rollScores("1d20", seeded(1)).every(r => r.expr === "1d20")).toBe(true);
  });

  it("the same seed gives the same rolls and a tie drops exactly one die", () => {
    expect(rollScores("3d6", seeded(5))).toEqual(rollScores("3d6", seeded(5)));
    const tie = rollScores("4d6-drop-lowest", () => 0.5);   // every die is 4
    expect(tie[0]).toEqual({ dice: [4, 4, 4, 4], dropped: 4, total: 12, expr: "4d6" });
    expect(rollScores("1d20")).toHaveLength(6);
  });

  it("describes a roll in words", () => {
    expect(describeRoll({ dice: [6, 5, 3, 1], dropped: 1, total: 14, expr: "4d6" })).toBe("4d6: 6, 5, 3, 1, dropped the 1 = 14");
    expect(describeRoll({ dice: [4, 4, 2], total: 10, expr: "3d6" })).toBe("3d6: 4, 4, 2 = 10");
    expect(describeRoll({ dice: [17], total: 17, expr: "1d20" })).toBe("1d20: 17");
    expect(describeRoll({ dice: [12, 7], dropped: 7, total: 12, expr: "2d20" })).toBe("2d20: 12, 7, dropped the 7 = 12");
  });
});

describe("scoreProblems for rolled scores", () => {
  const mk = (totals: number[]): ScoreRoll[] => totals.map(t => ({ dice: [t], total: t, expr: "1d20" }));
  const rolled = { scheme: "1d20" as const, rolls: mk([14, 13, 12, 11, 9, 8]) };
  const scores = (a: number[]) => ({ str: a[0], dex: a[1], con: a[2], int: a[3], wis: a[4], cha: a[5] });

  it("asks for a roll first", () => {
    expect(scoreProblems("rolled", scores([10, 10, 10, 10, 10, 10]))).toEqual(["Roll the dice first"]);
    expect(scoreProblems("rolled", scores([10, 10, 10, 10, 10, 10]), { scheme: "1d20", rolls: [] })).toEqual(["Roll the dice first"]);
  });
  it("accepts any order of the rolled totals and names the real ones otherwise", () => {
    expect(scoreProblems("rolled", scores([8, 9, 11, 12, 13, 14]), rolled)).toEqual([]);
    expect(scoreProblems("rolled", scores([14, 14, 12, 11, 9, 8]), rolled)).toEqual(["Use each rolled number once: 14, 13, 12, 11, 9, 8"]);
  });
  it("handles duplicate totals", () => {
    const dup = { scheme: "1d20" as const, rolls: mk([12, 12, 10, 9, 9, 9]) };
    expect(scoreProblems("rolled", scores([9, 12, 9, 10, 12, 9]), dup)).toEqual([]);
    expect(scoreProblems("rolled", scores([9, 12, 12, 10, 12, 9]), dup)).toEqual(["Use each rolled number once: 12, 12, 10, 9, 9, 9"]);
  });
  it("leaves the other methods alone", () => {
    expect(scoreProblems("manual", scores([10, 10, 10, 10, 10, 10]))).toEqual([]);
  });
});

describe("the creation summary", () => {
  const draft = (o: Partial<BuildDraft>): BuildDraft => ({ ...newDraft(), name: "Vex", classId: "bare", race: "skink", subrace: "cave-skink", choices: { "race:skink:choose-2": ["elvish"] }, ...o });
  const rolls: ScoreRoll[] = [{ dice: [6, 5, 3, 1], dropped: 1, total: 14, expr: "4d6" }, { dice: [6, 4, 3, 1], dropped: 1, total: 13, expr: "4d6" }, { dice: [5, 4, 3, 1], dropped: 1, total: 12, expr: "4d6" },
    { dice: [4, 4, 3, 1], dropped: 1, total: 11, expr: "4d6" }, { dice: [3, 3, 3, 1], dropped: 1, total: 9, expr: "4d6" }, { dice: [3, 3, 2, 1], dropped: 1, total: 8, expr: "4d6" }];
  it("says how the scores were rolled, and says nothing for other methods", () => {
    const bare = homebrewRegistry([{ type: "5e-class", name: "Bare", hitDie: 6, levels: {} }]);
    const d = draft({ method: "rolled", rolled: { scheme: "4d6-drop-lowest", rolls }, scores: { str: 14, dex: 13, con: 12, int: 11, wis: 9, cha: 8 } });
    const r = buildCharacter(d, bare);
    if ("error" in r) throw new Error(r.error);
    expect(r.summary).toContain("Ability scores rolled with 4d6, drop the lowest: 14, 13, 12, 11, 9, 8");
    const m = buildCharacter(draft({ method: "manual" }), bare);
    if ("error" in m) throw new Error(m.error);
    expect(m.summary.some(l => /rolled/i.test(l))).toBe(false);
    void reg;
  });
});
