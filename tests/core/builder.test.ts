import { parseNote, writeInto } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { progress } from "../../src/core/progression";
import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, buildCharacter, buildSteps, characterFrontmatter, defaultScores, draftProblems, newDraft, notePath, pointBuyCost, rollGold,
  scoreProblems, type BuildDraft } from "../../src/core/builder";
import { homebrewRegistry } from "../fixtures/homebrew";

const squire = { type: "5e-class", name: "Squire", hitDie: 10, saves: ["str", "con"], equipment: [["dagger", "silk-rope"], ["rations"]], gold: "5d4*10", levels: { 1: [{ op: "feature", name: "Drill" }] } };
const bare = { type: "5e-class", name: "Bare", hitDie: 6, levels: {} };
const reg = homebrewRegistry([squire, bare]);

const L1 = { "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] };
const draft = (o: Partial<BuildDraft> = {}): BuildDraft => ({ ...newDraft(), name: "Vex", race: "skink", subrace: "cave-skink", background: "cartographer", classId: "skirmisher",
  method: "standard-array", scores: { str: 8, dex: 15, con: 13, int: 14, wis: 10, cha: 12 }, bonus: { dex: 2 }, choices: { ...L1, "race:skink:choose-2": ["elvish"] }, ...o });
const built = (d: BuildDraft) => { const r = buildCharacter(d, reg, seeded(3)); if ("error" in r) throw new Error(r.error); return r; };

describe("point buy", () => {
  it("costs follow the 2014 table and the budget is 27", () => {
    expect(POINT_BUY_BUDGET).toBe(27);
    expect(POINT_BUY_COST).toEqual({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
    expect(pointBuyCost(defaultScores("point-buy"))).toBe(0);
    expect(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(pointBuyCost({ str: 13, dex: 13, con: 13, int: 12, wis: 12, cha: 12 })).toBe(27);
    expect(pointBuyCost({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNull();
  });
  it("rejects scores outside 8-15 and spending over 27", () => {
    expect(scoreProblems("point-buy", { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toEqual([]);
    expect(scoreProblems("point-buy", { str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 })).toEqual(["Point buy spends 28 of 27 points"]);
    expect(scoreProblems("point-buy", { str: 7, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })[0]).toMatch(/STR.*8 to 15/);
  });
});

describe("standard array", () => {
  it("is 15 14 13 12 10 8 and must be used once each", () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
    expect(defaultScores("standard-array")).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
    expect(scoreProblems("standard-array", defaultScores("standard-array"))).toEqual([]);
    expect(scoreProblems("standard-array", { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 })).toEqual(["Standard array: use 15, 14, 13, 12, 10 and 8 once each"]);
  });
  it("manual only needs scores from 1 to 30", () => {
    expect(scoreProblems("manual", { str: 18, dex: 3, con: 10, int: 10, wis: 10, cha: 10 })).toEqual([]);
    expect(scoreProblems("manual", { str: 31, dex: 3, con: 10, int: 10, wis: 10, cha: 10 })).toHaveLength(1);
  });
});

describe("starting gold", () => {
  it("rolls dice times a multiplier", () => { const g = rollGold("5d4*10", seeded(9)); expect(g % 10).toBe(0); expect(g).toBeGreaterThanOrEqual(50); expect(g).toBeLessThanOrEqual(200); });
  it("rejects junk", () => { expect(() => rollGold("lots", seeded(1))).toThrow(); });
});

describe("buildSteps", () => {
  it("separates the race and background choices from the class level 1 steps and leaves HP out", () => {
    const s = buildSteps(draft({ choices: {} }), reg);
    expect(s.origin.map(x => x.key)).toEqual(["race:skink:choose-2"]);
    expect(s.level.map(x => x.key)).toEqual(["class:skirmisher:1:skills", "class:skirmisher:1:stance"]);
    expect(s.level.some(x => x.kind === "hp")).toBe(false);
  });
  it("is empty without a class or race", () => { expect(buildSteps(newDraft(), reg)).toEqual({ origin: [], level: [] }); });
});

describe("draftProblems", () => {
  it("needs a name, race and class, and a subrace of that race", () => {
    expect(draftProblems(newDraft(), reg)).toEqual(expect.arrayContaining(["Give the character a name", "Pick a race", "Pick a class"]));
    expect(draftProblems(draft({ race: "elf" }), reg).join()).toMatch(/Cave Skink belongs to/);
    expect(draftProblems(draft(), reg)).toEqual([]);
  });
  it("final scores stay in range", () => { expect(draftProblems(draft({ bonus: { dex: 9 } }), reg).join()).toMatch(/DEX/); });
});

describe("buildCharacter", () => {
  it("makes a level 1 character: origin, scores with bonuses, full first-level HP, level log", () => {
    const { value: c } = built(draft());
    expect(c).toMatchObject({ name: "Vex", race: "skink", subrace: "cave-skink", background: "cartographer", classes: [{ class: "skirmisher", level: 1 }] });
    expect(c.abilities).toEqual({ str: 8, dex: 17, con: 13, int: 14, wis: 10, cha: 12 });
    expect(c.hp).toEqual({ max: 9, current: 9, temp: 0 });      // d8 + CON 13 (+1)
    expect(c.levelLog).toHaveLength(1); expect(c.levelLog[0]).toMatchObject({ class: "skirmisher", level: 1, hp: { method: "first", die: 8, gained: 8 } });
    expect(c.choices["race:skink:choose-2"]).toEqual(["elvish"]);
    const p = progress(c, reg);
    expect(p.pending).toEqual([]); expect(p.problems).toEqual([]);
    expect(p.languages).toEqual(expect.arrayContaining(["draconic", "elvish", "thieves-cant"]));
    expect(p.proficiencies.skills).toEqual(expect.arrayContaining(["acrobatics", "athletics", "perception", "survival"]));
  });
  it("refuses an incomplete choice instead of making half a character", () => {
    const r = buildCharacter(draft({ choices: { ...L1 } }), reg, seeded(1)); expect("error" in r && r.error).toMatch(/still needs an answer/);
    const r2 = buildCharacter(draft({ choices: { "race:skink:choose-2": ["elvish"] } }), reg, seeded(1)); expect("error" in r2).toBe(true);
  });
  it("equipment option adds the items, by id when known and by name when not", () => {
    const { value: c } = built(draft({ classId: "squire", choices: { "race:skink:choose-2": ["elvish"] }, equipment: { kind: "option", index: 0 } }));
    expect(c.inventory).toEqual([{ id: "dagger", qty: 1, equipped: false, attuned: false }, { name: "Silk Rope", qty: 1, equipped: false, attuned: false }]);
    expect(c.coins.gp).toBe(0); expect(c.hp.max).toBe(11);       // d10 + CON 13 (+1)
  });
  it("gold instead of equipment sets the coins", () => {
    const { value: c } = built(draft({ classId: "squire", choices: { "race:skink:choose-2": ["elvish"] }, equipment: { kind: "gold", gold: 120 } }));
    expect(c.coins.gp).toBe(120); expect(c.inventory.map(i => i.name ?? i.id)).toEqual([]);
  });
  it("asks for the equipment choice only when the class offers one", () => {
    expect(draftProblems(draft({ classId: "squire" }), reg)).toContain("Choose starting equipment or gold");
    expect(draftProblems(draft({ classId: "bare", choices: {} }), reg)).toEqual([]);
    expect(draftProblems(draft({ classId: "squire", equipment: { kind: "option", index: 5 } }), reg).join()).toMatch(/equipment option/);
  });
  it("a point-buy character with no race bonuses and no background", () => {
    const { value: c } = built(draft({ method: "point-buy", scores: { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }, bonus: {}, race: "skink", subrace: undefined, background: undefined }));
    expect(c.abilities.str).toBe(15); expect(c.background).toBeUndefined(); expect(c.hp.max).toBe(8 + 2);
  });
});

describe("the created note", () => {
  it("frontmatter parses, is writable and round-trips unchanged", () => {
    const { value } = built(draft()), fm = characterFrontmatter(value);
    expect(fm.type).toBe("5e-character");
    const parsed = parseNote(JSON.parse(JSON.stringify(fm)));        // what a YAML round trip gives
    expect(parsed.kind).toBe("character");
    if (parsed.kind !== "character") return;
    expect(parsed.errors).toEqual([]); expect(parsed.writable).toBe(true);
    expect(parsed.value).toEqual(value);
    const again: Record<string, unknown> = JSON.parse(JSON.stringify(fm)); writeInto(again, parsed.value);
    expect(again).toEqual(fm);
  });
  it("a new character can be levelled straight away", () => {
    const { value } = built(draft()); expect(progress(value, reg).pending).toEqual([]);
  });
});

describe("notePath", () => {
  it("uses the name and avoids collisions", () => {
    const taken = new Set(["Characters/Vex.md", "Characters/Vex 2.md"]);
    expect(notePath("Characters", "Vex", p => taken.has(p))).toBe("Characters/Vex 3.md");
    expect(notePath("", "A/B: C?", () => false)).toBe("A B C.md");
    expect(notePath("x/", "  ", () => false)).toBe("x/New character.md");
  });
});
