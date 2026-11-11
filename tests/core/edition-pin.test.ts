import { newCharacter, parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { planLevel, type LevelPlan, type Step } from "../../src/core/levelup";
import { progress } from "../../src/core/progression";
import { slotTable } from "../../src/core/slots";
import { activeRests } from "../../src/rules";
import type { RestCtx } from "../../src/rules/module";
import { homebrewRegistry } from "../fixtures/homebrew";
import { thalia } from "../fixtures/notes";

// Pins what a character with no edition resolves and derives today; every assertion must also hold after the edition work.
const reg = homebrewRegistry([
  { type: "5e-class", name: "Chanter", hitDie: 6, levels: { 1: [{ op: "spells", count: 2, cantrips: 1, from: "wizard" }], 2: [{ op: "spells", count: 1, from: "wizard" }] } },
  { type: "5e-class", name: "Lamplighter", hitDie: 8, levels: { 1: [{ op: "spellcasting", abil: "int", progression: "table", list: "wizard",
    table: { 1: { cantrips: 2, known: 1, slots: [2] }, 5: { cantrips: 2, known: 3, slots: [4, 2] } } }] } },
]);
const base = (o: Partial<Character> = {}): Character => ({ ...newCharacter("Pin"), abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 }, ...o });
const plan = (c: Character, cls: string) => { const p = planLevel(c, cls, reg); if ("error" in p) throw new Error(p.error); return p as LevelPlan; };
const spellStep = (p: LevelPlan) => p.steps.find(s => s.kind === "spells") as Extract<Step, { kind: "spells" }> | undefined;

describe("edition pin: core", () => {
  it("multiclass slots round as they do today", () => {
    expect(slotTable([{ level: 3, progression: "half" }, { level: 3, progression: "half" }])).toEqual([{ level: "1", max: 3 }]);
    expect(slotTable([{ level: 1, progression: "half" }])).toEqual([]);
    expect(slotTable([{ level: 2, progression: "half" }])).toEqual([{ level: "1", max: 2 }]);
    expect(slotTable([{ level: 5, progression: "half" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 2 }]);
  });

  it("a long rest gives back half the Hit Dice, lowers exhaustion by one and halves max HP only from level 4", () => {
    const char = (o: object): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
    const ctx = (c: Character): RestCtx => ({ c, stats: deriveCharacter(c, { registry: reg }), registry: reg, rules: { "rest-standard": true } });
    const L = activeRests({ "rest-standard": true }).find(x => x.id === "long")!;
    const five = char({ conditions: { exhaustion: 5 }, hp: { max: 43, current: 10, temp: 0 }, hitDice: { d8: { used: 5 } } });
    expect(L.preview(ctx(five))).toContain("Regain 2 Hit Dice");
    const a = L.apply(ctx(five)).value;
    expect(a.conditions.exhaustion).toBe(4); expect(a.hitDice.d8.used).toBe(3);
    expect(a.hp.current).toBe(Math.floor(deriveCharacter(five, { registry: reg }).hpFull / 2));
    const three = char({ conditions: { exhaustion: 3 }, hp: { max: 43, current: 10, temp: 0 }, hitDice: { d8: { used: 5 } } });
    const b = L.apply(ctx(three)).value;
    expect(b.conditions.exhaustion).toBe(2); expect(b.hp.current).toBe(deriveCharacter(three, { registry: reg }).hpFull);
  });

  it("the level-up asks as many spells as the class's spells ops say", () => {
    // This is how the 2024 library carries prepared-spell counts (see the contract): a spells op per level.
    expect(spellStep(plan(base(), "chanter"))).toMatchObject({ count: 2, cantrips: 1 });
    const one = { ...base(), classes: [{ class: "chanter", level: 1 }] };
    expect(spellStep(plan(one, "chanter"))).toMatchObject({ count: 1, cantrips: 0 });
  });

  it("a class with a spellcasting table keeps its known column on the caster entry; the level-up asks only what a spells op says", () => {
    // Today the `known` column is carried in progress().spellcasting but no step reads it, so a table with no spells op asks nothing.
    const c = base({ classes: [{ class: "lamplighter", level: 4 }] });
    expect(progress(c, reg).spellcasting.find(e => e.class === "lamplighter")).toMatchObject({ known: 1 });
    expect(spellStep(plan(c, "lamplighter"))).toBeUndefined();
    expect(progress({ ...c, classes: [{ class: "lamplighter", level: 5 }] }, reg).spellcasting.find(e => e.class === "lamplighter")).toMatchObject({ known: 3, cantrips: 2 });
  });

  it("a character with no edition derives the numbers it derives today", () => {
    const c = base({ classes: [{ class: "skirmisher", level: 5 }, { class: "chanter", level: 2 }], hp: { max: 40, current: 40, temp: 0 } });
    const s = deriveCharacter(c, { registry: reg });
    expect(s.hp).toEqual({ current: 40, max: 40, temp: 0, maxReduced: false }); expect(s.hpFull).toBe(40);
    expect(s.ac.value).toBe(13); expect(s.ac.sources).toEqual(["Unarmored", "Quick Wits"]);
    expect(s.slots).toEqual([{ level: "1", max: 3, used: 0 }]);
    expect(s.attacks.map(a => [a.name, a.toHit, a.damage])).toEqual([["Unarmed Strike", 3, "1 bludgeoning"]]);
    expect(s.prof).toBe(3);
  });
});
