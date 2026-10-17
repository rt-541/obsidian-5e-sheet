import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd, srdCounts } from "../../src/content/srd";

describe("SRD bundle", () => {
  const r = new Registry(); registerBuiltinTypes(r); const problems = loadSrd(r);
  it("every entry validates", () => expect(problems).toEqual([]));
  it("has the expected coverage", () => {
    expect(srdCounts()).toEqual({ condition: 15, class: 12, item: 32, creature: 19, spell: 319 });
    expect(r.list("condition")).toHaveLength(15); expect(r.list("creature")).toHaveLength(19);
  });
  it("exhaustion has six cumulative levels", () => {
    const ex = r.get<any>("condition", "exhaustion")!.data;
    expect(ex.levels).toBe(6); expect(ex.levelEffects).toHaveLength(7);
    expect(ex.levelEffects[3].dis).toEqual(["check", "attack", "save"]);
  });
  it("find familiar forms are all present", () => {
    for (const id of ["bat", "cat", "crab", "frog", "hawk", "lizard", "octopus", "owl", "poisonous-snake", "quipper", "rat", "raven", "sea-horse", "spider", "weasel"])
      expect(r.get("creature", id), id).toBeDefined();
  });
  it("cleric is a full wisdom caster with a d8", () => {
    expect(r.get<any>("class", "cleric")!.data).toEqual({ name: "Cleric", hitDie: 8, saves: ["wis", "cha"], spellcasting: { abil: "wis", progression: "full" } });
  });
});
