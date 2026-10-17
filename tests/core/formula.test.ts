import { checkFormula, evalFormula, fillDice, formulaNames } from "../../src/core/formula";

const v = { prof: 3, level: 6, total: 6, int: 4, plan_dice: 7 };

describe("formula evaluator", () => {
  it("numbers, precedence and parentheses", () => {
    expect(evalFormula(5, v)).toBe(5);
    expect(evalFormula("2 + 3 * 4", v)).toBe(14);
    expect(evalFormula("(2 + 3) * 4", v)).toBe(20);
    expect(evalFormula("-prof + 10", v)).toBe(7);
    expect(evalFormula("10 - 2 - 3", v)).toBe(5);
  });
  it("variables and functions", () => {
    expect(evalFormula("prof + int", v)).toBe(7);
    expect(evalFormula("floor(level / 4)", v)).toBe(1);
    expect(evalFormula("max(1, int, 2)", v)).toBe(4);
    expect(evalFormula("min(prof, level + 1)", v)).toBe(3);
    expect(evalFormula("plan_dice * 2", v)).toBe(14);
  });
  it("rejects junk without running anything", () => {
    for (const bad of ["", "1 +", "alert(1)", "level.x", "1; 2", "(".repeat(40) + "1" + ")".repeat(40), "x".repeat(300)])
      expect(checkFormula(bad), bad).not.toBeNull();
    // property names parse as plain identifiers but never resolve to anything on the prototype
    expect(() => evalFormula("constructor", v)).toThrow(/unknown name/);
    expect(() => evalFormula("__proto__", v)).toThrow(/unknown name/);
    expect(() => evalFormula("1 / 0", v)).toThrow();
    expect(() => evalFormula("nope", v)).toThrow(/unknown name/);
    expect(checkFormula(NaN)).not.toBeNull();
    expect(checkFormula({})).not.toBeNull();
  });
  it("lists the names a formula uses", () => expect(formulaNames("floor(level / 2) + int + prof").sort()).toEqual(["int", "level", "prof"]));
  it("fills dice placeholders and leaves unknown ones", () => {
    expect(fillDice("{plan-die}+2 {x}", { "plan-die": "1d6" })).toBe("1d6+2 {x}");
  });
});
