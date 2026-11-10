import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { EDITION_RULES, editionRules, isNewer } from "../../src/core/edition";
import { planLevel } from "../../src/core/levelup";
import { newCharacter } from "../../src/core/character";
import { slotTable } from "../../src/core/slots";
import { activeRests } from "../../src/rules";
import type { RestCtx } from "../../src/rules/module";
import { homebrewRegistry } from "../fixtures/homebrew";
import { thalia } from "../fixtures/notes";

const reg = homebrewRegistry([]);

describe("the edition table", () => {
  it("holds the real values for both editions", () => {
    expect(EDITION_RULES["2014"]).toMatchObject({ raceWord: "Race", longRestHitDice: "half", halfCasterRounding: "down", halfCasterFromLevel: 2, exhaustionHalvesHpAt: 4 });
    expect(EDITION_RULES["2024"]).toMatchObject({ raceWord: "Species", longRestHitDice: "all", halfCasterRounding: "up", halfCasterFromLevel: 1, exhaustionHalvesHpAt: null });
    expect(EDITION_RULES["2014"].inspiration.name).toBe("Inspiration");
    expect(EDITION_RULES["2024"].inspiration.name).toBe("Heroic Inspiration");
    expect(EDITION_RULES["2014"].inspiration.card).toMatch(/roll one d20 twice and keep the better/);
    expect(EDITION_RULES["2024"].inspiration.card).toMatch(/reroll any die/);
  });
  it("no edition reads as 2014", () => {
    expect(editionRules(undefined)).toBe(EDITION_RULES["2014"]);
    expect(editionRules("2024").label).toBe("2024 rules");
  });
  it("slots follow the table", () => {
    const r24 = editionRules("2024");
    expect(slotTable([{ level: 3, progression: "half" }, { level: 3, progression: "half" }], r24)).toEqual([{ level: "1", max: 4 }, { level: "2", max: 3 }]);
    expect(slotTable([{ level: 1, progression: "half" }], r24)).toEqual([{ level: "1", max: 2 }]);
    expect(slotTable([{ level: 3, progression: "third" }, { level: 3, progression: "third" }], r24)).toEqual(slotTable([{ level: 3, progression: "third" }, { level: 3, progression: "third" }]));
    // the 2014 table, passed explicitly, is what no argument gives
    const two = [{ level: 3, progression: "half" as const }, { level: 3, progression: "half" as const }];
    expect(slotTable(two, editionRules("2014"))).toEqual(slotTable(two));
    expect(slotTable(two)).toEqual([{ level: "1", max: 3 }]);
  });
  it("derive reads the character's edition for slots", () => {
    const mk = (o: object): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
    const r = homebrewRegistry([{ type: "5e-class", name: "Warden", hitDie: 8, levels: { 1: [{ op: "spellcasting", abil: "wis", progression: "half", list: "wizard" }] } }]);
    const slots = (o: object) => deriveCharacter(mk({ classes: [{ class: "warden", level: 1 }], ...o }), { registry: r }).slots.map(s => `${s.level}:${s.max}`);
    expect(slots({})).toEqual([]);
    expect(slots({ edition: "2014" })).toEqual([]);
    expect(slots({ edition: "2024" })).toEqual(["1:2"]);
  });
  it("a 2024 long rest gives back every Hit Die and always restores full HP; the 2014 one is unchanged", () => {
    const mk = (o: object): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
    const ctx = (c: Character): RestCtx => ({ c, stats: deriveCharacter(c, { registry: reg }), registry: reg, rules: { "rest-standard": true } });
    const L = activeRests({ "rest-standard": true }).find(x => x.id === "long")!;
    const o = { conditions: { exhaustion: 5 }, hp: { max: 43, current: 10, temp: 0 }, hitDice: { d8: { used: 5 } } };
    const c14 = mk({ ...o, edition: "2014" }), c24 = mk({ ...o, edition: "2024" });
    expect(L.preview(ctx(c14))).toContain("Regain 2 Hit Dice");
    expect(L.preview(ctx(c24))).toContain("All Hit Dice");
    const a = L.apply(ctx(c14)).value, b = L.apply(ctx(c24)).value;
    expect(a.hitDice.d8.used).toBe(3);
    expect(a.hp.current).toBe(Math.floor(deriveCharacter(c14, { registry: reg }).hpFull / 2));
    expect(b.hitDice.d8.used).toBe(0);
    expect(b.hp.current).toBe(deriveCharacter(c24, { registry: reg }).hpFull);
    expect(b.conditions.exhaustion).toBe(4);
  });
  it("a level 1 lone half-caster's level-up spell cap follows the edition", () => {
    const r = homebrewRegistry([{ type: "5e-class", name: "Lantern-Keeper", hitDie: 8, levels: { 1: [{ op: "spellcasting", abil: "wis", progression: "half", list: "wizard" }, { op: "spells", count: 1, from: "wizard" }] } }]);
    const cap = (edition: "2014" | "2024") => {
      const p = planLevel({ ...newCharacter("Tester"), edition }, "lantern-keeper", r, {});
      if ("error" in p) throw new Error(p.error);
      const step = p.steps.find(s => s.kind === "spells");
      if (!step || step.kind !== "spells") throw new Error("no spells step");
      return step.maxLevel;
    };
    expect(cap("2024")).toBe(1);
    expect(cap("2014")).not.toBe(1);
  });
});

describe("isNewer", () => {
  it("orders editions by the oldest-first list", () => {
    expect(isNewer("2024", "2014")).toBe(true);
    expect(isNewer("2014", "2024")).toBe(false);
    expect(isNewer("2014", "2014")).toBe(false);
  });
});
