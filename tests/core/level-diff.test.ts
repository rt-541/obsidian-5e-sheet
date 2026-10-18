import { applyLevel, undoLevel } from "../../src/core/levelup";
import { explainChange, flattenChange } from "../../src/core/level-diff";
import { pc, pcSub, srdRegistry } from "../fixtures/overlay";

const R = srdRegistry(), ctx = { registry: R };
const up = (c: ReturnType<typeof pc>, cls: string, choices: Record<string, unknown> = {}) => {
  const r = applyLevel(c, { class: cls }, { hp: { method: "average" }, choices }, R);
  if ("error" in r) throw new Error(r.error);
  return r.value;
};

describe("the level-up explainer", () => {
  it("Monk 10 -> 11 lists the bigger die, the extra ki and the new feature", () => {
    const c = pcSub("monk", 10, "open-hand", { dex: 18, wis: 16, con: 14 });
    const lines = flattenChange(explainChange(c, up(c, "monk"), ctx));
    const text = lines.join("\n");
    expect(text).toMatch(/What grows with your level: Martial arts die 1d6 -> 1d8: Unarmed Strike now rolls 1d8\+4/i);
    expect(text).toMatch(/Ki Points 10 -> 11/);
    expect(text).toMatch(/New features: Tranquility: /);
    expect(text).toMatch(/Hit points: Max HP \d+ -> \d+ \(\+\d+\)/);
    expect(text).toContain("Unarmed Strike damage 1d6+4 bludgeoning -> 1d8+4 bludgeoning");
  });

  it("Barbarian 4 -> 5 lists Extra Attack, Fast Movement and the proficiency ripple", () => {
    const c = pc("barbarian", 4, { str: 16, con: 14, dex: 12 }, { proficiencies: { saves: ["str", "con"], skills: ["athletics"], expertise: [] } });
    const lines = flattenChange(explainChange(c, up(c, "barbarian"), ctx));
    const text = lines.join("\n");
    expect(text).toMatch(/New features: Extra Attack: /);
    expect(text).toMatch(/New features: Fast Movement: /);
    expect(text).toContain("Speed 30 -> 40");
    expect(text).toMatch(/Proficiency bonus \+2 -> \+3\. It is added to attack rolls, saving throws you are trained in and 1 skill, so those went up too/);
    expect(text).toContain("Athletics +5 -> +6");
  });

  it("an undone level is the same list reversed", () => {
    const c = pc("barbarian", 4, { str: 16 });
    const after = up(c, "barbarian");
    const back = undoLevel(after, R);
    if ("error" in back) throw new Error(back.error);
    const text = flattenChange(explainChange(after, back.value, ctx)).join("\n");
    expect(text).toMatch(/Features you lose: Extra Attack/);
    expect(text).toContain("Speed 40 -> 30");
    expect(text).toContain("Proficiency bonus +3 -> +2");
  });

  it("a level that changes nothing shows nothing", () => {
    const c = pc("barbarian", 4, { str: 16 });
    expect(explainChange(c, structuredClone(c), ctx)).toEqual([]);
  });
});
