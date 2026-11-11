import { EDITION_RULES } from "../../src/core/edition";
import { generalChanges } from "../../src/content/edition-changes";

describe("general edition changes", () => {
  it("covers the changes the design names", () => {
    expect(generalChanges().map(c => c.id)).toEqual(expect.arrayContaining(["ability-source", "origin-feat", "weapon-mastery", "subclass-level", "long-rest-hit-dice", "exhaustion", "inspiration", "multiclass-slots", "species-word"]));
  });
  it("each side is at most two sentences, with a title and no empty text", () => {
    for (const c of generalChanges()) {
      expect(c.title.length).toBeGreaterThan(0);
      for (const s of [c["2014"], c["2024"]]) { expect(s.length).toBeGreaterThan(10); expect((s.match(/[.!?](\s|$)/g) ?? []).length).toBeLessThanOrEqual(2); }
    }
  });
  it("ids are unique", () => { const ids = generalChanges().map(c => c.id); expect(new Set(ids).size).toBe(ids.length); });
  it("table-built sentences follow the table", () => {
    const base = generalChanges();
    const t = structuredClone(EDITION_RULES); t["2024"].longRestHitDice = "half";
    expect(generalChanges(t).find(c => c.id === "long-rest-hit-dice")!["2024"]).not.toBe(base.find(c => c.id === "long-rest-hit-dice")!["2024"]);
    const u = structuredClone(EDITION_RULES); u["2024"].halfCasterRounding = "down";
    expect(generalChanges(u).find(c => c.id === "multiclass-slots")!["2024"]).not.toBe(base.find(c => c.id === "multiclass-slots")!["2024"]);
    const w = structuredClone(EDITION_RULES); w["2024"].raceWord = "Race"; w["2014"].raceWord = "Species";
    expect(generalChanges(w).find(c => c.id === "species-word")!["2014"]).not.toBe(base.find(c => c.id === "species-word")!["2014"]);
    const x = structuredClone(EDITION_RULES); x["2024"].exhaustionHalvesHpAt = 5;
    expect(generalChanges(x).find(c => c.id === "exhaustion")!["2024"]).not.toBe(base.find(c => c.id === "exhaustion")!["2024"]);
    const y = structuredClone(EDITION_RULES); y["2014"].inspiration.name = "Spark";
    expect(generalChanges(y).find(c => c.id === "inspiration")!["2014"]).toContain("Spark");
  });
  it("the null-exhaustion branch states no number or edition fact", () => {
    for (const e of ["2014", "2024"] as const) {
      const t = structuredClone(EDITION_RULES); t[e].exhaustionHalvesHpAt = null;
      expect(generalChanges(t).find(c => c.id === "exhaustion")![e]).not.toMatch(/\d|never|flat|d20|speed/);
    }
  });
  it("the real table gives the expected facts", () => {
    const by = Object.fromEntries(generalChanges().map(c => [c.id, c]));
    expect(by["species-word"]["2014"]).toMatch(/race/i); expect(by["species-word"]["2024"]).toMatch(/species/i);
    expect(by["species-word"]["2014"]).not.toMatch(/comes from/i);
    expect(by["weapon-mastery"]["2024"]).toBe("Each weapon has a mastery property, and some classes learn to use them. The sheet shows what it does but does not apply it.");
    expect(by["exhaustion"]["2014"]).toContain("4"); expect(by["inspiration"]["2024"]).toContain("Heroic Inspiration");
  });
});
