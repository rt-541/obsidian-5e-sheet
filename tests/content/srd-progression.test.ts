import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { progress } from "../../src/core/progression";
import { STANDARD_ARRAY, POINT_BUY_COST, pointBuyCost, scoreProblems } from "../../src/core/builder";

const r = new Registry(); registerBuiltinTypes(r); const problems = loadSrd(r);
const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const char = (classes: { class: string; subclass?: string; level: number }[], o: object = {}): Character => {
  const p = parseNote({ type: "5e-character", name: "T", classes, abilities, hp: { max: 10, current: 10, temp: 0 }, ...o });
  if (p.kind !== "character") throw new Error("not a character");
  return p.value;
};
const data = (type: string, id: string) => r.get<any>(type, id)!.data;

describe("SRD progression content", () => {
  it("everything validates and the roster is complete", () => {
    expect(problems).toEqual([]);
    expect(r.list("class").map(e => e.id)).toEqual(["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]);
    expect(r.list("subclass")).toHaveLength(12);
    expect(r.list("race").map(e => e.id)).toContain("dragonborn"); expect(r.list("subrace").map(e => e.id)).toContain("hill-dwarf");
    expect(r.get("background", "acolyte")).toBeDefined(); expect(r.get("feat", "grappler")).toBeDefined();
  });
  it("every class has a subclass level with the subclass op, and every subclass belongs to a class", () => {
    for (const e of r.list<any>("class")) {
      expect(e.data.subclassLevel, e.id).toBeGreaterThanOrEqual(1);
      expect(e.data.levels[e.data.subclassLevel].some((o: any) => o.op === "subclass"), e.id).toBe(true);
      expect(Object.keys(e.data.levels).length, e.id).toBeGreaterThanOrEqual(10);
    }
    for (const s of r.list<any>("subclass")) expect(r.get("class", s.data.class), s.id).toBeDefined();
  });
  it("every subclass replays 1..20 with its class without a problem", () => {
    for (const s of r.list<any>("subclass")) {
      const p = progress(char([{ class: s.data.class, subclass: s.id, level: 20 }]), r);
      expect(p.problems, s.id).toEqual([]); expect(p.unknown, s.id).toEqual([]);
    }
  });

  it("cleric 1-5: Channel Divinity 1 use per short rest, Life domain spells always prepared, five SRD features", () => {
    const p = progress(char([{ class: "cleric", subclass: "life", level: 5 }]), r);
    expect(p.resources).toMatchObject([{ id: "channel-divinity", max: 1, reset: "short" }]);
    expect(p.grantedSpells.map(s => s.id)).toEqual(["bless", "cure-wounds", "lesser-restoration", "spiritual-weapon", "beacon-of-hope", "revivify"]);
    expect(p.features.filter(f => f.sourceKind === "class").map(f => f.name)).toEqual([
      "Spellcasting: Cleric", "Divine Domain", "Channel Divinity (1/rest)", "Channel Divinity: Turn Undead", "Destroy Undead (CR 1/2 or below)"]);
    expect(p.features.filter(f => f.sourceKind === "subclass").map(f => f.name)).toEqual(["Bonus Proficiency", "Disciple of Life", "Channel Divinity: Preserve Life"]);
    expect(p.features[0].text).toContain("cleric spells");
    expect(p.scales["destroy-undead-cr"]).toBe("1/2");
  });
  it("cleric without a subclass has the subclass choice pending", () => {
    expect(progress(char([{ class: "cleric", level: 3 }]), r).pending.map(x => x.label)).toContain("Choose a subclass");
  });
  it("fighter 1 has a Second Wind resource (short rest) and a fighting style to choose", () => {
    const p = progress(char([{ class: "fighter", level: 1 }]), r);
    expect(p.resources).toMatchObject([{ id: "second-wind", max: 1, reset: "short" }]);
    expect(p.pending.map(x => x.key)).toContain("class:fighter:1:fighter-fighting-style-pick");
    expect(data("class", "fighter").options["fighter-fighting-style"].map((o: any) => o.name)).toContain("Archery");
  });
  it("fighter Action Surge grows to 2 and Indomitable to 3 by level 17", () => {
    const p = progress(char([{ class: "fighter", level: 17 }]), r);
    expect(p.resources.find(x => x.id === "action-surge")!.max).toBe(2);
    expect(p.resources.find(x => x.id === "indomitable")!.max).toBe(3);
    expect(p.scales["attacks-per-action"]).toBe(3);
  });
  it("rogue sneak attack is 3d6 at level 5", () => {
    expect(progress(char([{ class: "rogue", level: 5 }]), r).scales["sneak-attack"]).toBe("3d6");
    expect(progress(char([{ class: "rogue", level: 1 }]), r).scales["sneak-attack"]).toBe("1d6");
  });
  it("barbarian rage: 3 uses at level 3, damage bonus scales 2/3/4", () => {
    expect(progress(char([{ class: "barbarian", level: 3 }]), r).resources).toMatchObject([{ id: "rage", max: 3, reset: "long" }]);
    expect(progress(char([{ class: "barbarian", level: 3 }]), r).scales["rage-damage"]).toBe(2);
    expect(progress(char([{ class: "barbarian", level: 9 }]), r).scales["rage-damage"]).toBe(3);
    expect(progress(char([{ class: "barbarian", level: 16 }]), r).scales["rage-damage"]).toBe(4);
    expect(progress(char([{ class: "barbarian", level: 6 }]), r).resources[0].max).toBe(4);
  });
  it("wizard 1 learns six spells and three cantrips", () => {
    const op = data("class", "wizard").levels[1].find((o: any) => o.op === "spells");
    expect(op).toMatchObject({ count: 6, cantrips: 3, from: "wizard" });
    expect(progress(char([{ class: "wizard", level: 1 }]), r).resources).toMatchObject([{ id: "arcane-recovery", max: 1 }]);
  });
  it("monk, paladin and sorcerer resources follow level and ability mods", () => {
    expect(progress(char([{ class: "monk", level: 5 }]), r).resources).toMatchObject([{ id: "ki-points", max: 5, reset: "short" }]);
    expect(progress(char([{ class: "monk", level: 5 }]), r).scales["martial-arts-die"]).toBe("1d6");
    expect(progress(char([{ class: "paladin", level: 4 }]), r).resources.find(x => x.id === "lay-on-hands")!.max).toBe(20);
    expect(progress(char([{ class: "sorcerer", level: 7 }]), r).resources).toMatchObject([{ id: "sorcery-points", max: 7 }]);
  });
  it("races, subraces, background and the Grappler feat grant what the SRD says", () => {
    const p = progress(char([{ class: "fighter", level: 1 }], { race: "dwarf", subrace: "hill-dwarf", background: "acolyte", feats: ["grappler"] }), r);
    expect(p.speed).toBe(25); expect(p.darkvision).toBe(60);
    expect(p.languages).toEqual(expect.arrayContaining(["Common", "Dwarvish"]));
    expect(p.proficiencies.skills).toEqual(expect.arrayContaining(["insight", "religion"]));
    expect(p.features.map(f => f.name)).toEqual(expect.arrayContaining(["Dwarven Resilience", "Dwarven Toughness", "Shelter of the Faithful", "Grappler"]));
    expect(p.unknown).toEqual([]); expect(p.problems).toEqual([]);
    expect(data("feat", "grappler").prerequisite).toBe("Strength 13");
  });
  it("point buy cost table and standard array are unchanged", () => {
    expect(POINT_BUY_COST).toEqual({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
    expect(pointBuyCost({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(9 + 7 + 5 + 4 + 2 + 0);
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
    expect(scoreProblems("standard-array", { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toEqual([]);
  });
});
