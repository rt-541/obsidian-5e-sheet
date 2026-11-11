import { newCharacter, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { applyLevel, planLevel, type LevelPlan, type Step } from "../../src/core/levelup";
import { homebrewRegistry } from "../fixtures/homebrew";

/** Eldritch Knight shaped: spells limited to two schools (but cantrips free), plus a free pick, plus Magical Secrets from any list. */
const magus = { type: "5e-class", name: "Magus", hitDie: 8, levels: {
  1: [{ op: "spellcasting", abil: "int", progression: "third" }],
  3: [{ op: "spells", count: 2, cantrips: 1, from: "wizard", schools: ["evocation", "abjuration"] }, { op: "spells", count: 1, from: "wizard" }, { op: "spells", count: 1, from: "*" }],
} };
const reg = homebrewRegistry([magus]);
const base = (o: Partial<Character> = {}): Character => ({ ...newCharacter("Tester"), abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 }, classes: [{ class: "magus", level: 2 }], ...o });
const plan = (c: Character, choices: Record<string, unknown> = {}) => { const p = planLevel(c, "magus", reg, choices); if ("error" in p) throw new Error(p.error); return p as LevelPlan; };
const spellsStep = (p: LevelPlan, i: number) => p.steps.filter(s => s.kind === "spells")[i] as Extract<Step, { kind: "spells" }>;
const ids = (s: Extract<Step, { kind: "spells" }>, level?: number) => s.options.filter(o => level === undefined || o.level === level).map(o => o.id);

describe("spell picks", () => {
  const p = plan(base());
  it("school limits apply to leveled spells only: cantrips stay free", () => {
    const s = spellsStep(p, 0);
    expect(ids(s, 0)).toContain("acid-splash");                                   // conjuration cantrip is fine
    expect(ids(s, 1)).toContain("burning-hands");                                 // evocation
    expect(ids(s, 1)).toContain("alarm");                                         // abjuration
    expect(ids(s, 1)).not.toContain("charm-person");                              // enchantment is out
  });
  it("an op without schools is a free pick from the class list", () => {
    const s = spellsStep(p, 1);
    expect(ids(s, 1)).toContain("charm-person"); expect(ids(s, 1)).not.toContain("bless");
  });
  it("from * offers every spell, whatever class list it is on (Magical Secrets)", () => {
    const s = spellsStep(p, 2);
    expect(ids(s, 1)).toEqual(expect.arrayContaining(["bless", "cure-wounds", "charm-person", "burning-hands"]));
    expect(ids(s, 0)).toEqual(expect.arrayContaining(["guidance", "sacred-flame", "acid-splash"]));
  });
  it("a Magical Secrets pick from another class list is accepted and saved", () => {
    const choices = { "class:magus:3:spells-0": ["acid-splash", "burning-hands", "alarm"], "class:magus:3:spells-1": ["charm-person"], "class:magus:3:spells-2": ["bless"] };
    const r = applyLevel(base(), { class: "magus" }, { hp: { method: "average" }, choices }, reg, seeded(3));
    if ("error" in r) throw new Error(r.error);
    expect(r.value.spells.map(s => s.id).sort()).toEqual(["acid-splash", "alarm", "bless", "burning-hands", "charm-person"]);
  });
  it("a leveled pick outside the allowed schools is still refused where the op restricts", () => {
    const choices = { "class:magus:3:spells-0": ["acid-splash", "burning-hands", "charm-person"], "class:magus:3:spells-1": ["alarm"], "class:magus:3:spells-2": ["bless"] };
    const r = applyLevel(base(), { class: "magus" }, { hp: { method: "average" }, choices }, reg, seeded(3));
    expect("error" in r && r.error).toMatch(/not on the list/);
  });
});
