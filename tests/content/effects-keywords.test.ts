import { validateEffects } from "../../src/content/types/effects";

const run = (v: unknown) => { const e: string[] = []; const out = validateEffects(v, "effects", e); return { out, e }; };

describe("new effect keywords", () => {
  it("accepts acAbility, saveBonus, critRange and maxScore", () => {
    const { out, e } = run({ acAbility: "int", saveBonus: [{ abils: ["int", "wis"], value: "prof" }, { abils: ["con"], value: 1 }],
      critRange: 19, critVs: "analyzed creatures", maxScore: { abil: "int", max: 22 } });
    expect(e).toEqual([]);
    expect(out).toEqual({ acAbility: "int", saveBonus: [{ abils: ["int", "wis"], value: "prof" }, { abils: ["con"], value: 1 }],
      critRange: 19, critVs: "analyzed creatures", maxScore: { abil: "int", max: 22 } });
  });
  it("reports every bad value", () => {
    const { e } = run({ acAbility: "luck", saveBonus: [{ abils: [], value: 1 }, { abils: ["str"], value: "1 +" }, "x"], critRange: 1, maxScore: { abil: "str", max: 99 } });
    expect(e.join("\n")).toMatch(/acAbility/);
    expect(e.filter(x => x.includes("saveBonus"))).toHaveLength(3);
    expect(e.join("\n")).toMatch(/critRange/);
    expect(e.join("\n")).toMatch(/maxScore/);
  });
});
