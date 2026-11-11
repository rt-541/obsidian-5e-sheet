import { slotTable } from "../../src/core/slots";

describe("slotTable", () => {
  it("cleric 5", () => expect(slotTable([{ level: 5, progression: "full" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 3 }, { level: "3", max: 2 }]));
  it("paladin 1 has none, paladin 5 uses full table at 3", () => {
    expect(slotTable([{ level: 1, progression: "half" }])).toEqual([]);
    expect(slotTable([{ level: 5, progression: "half" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 2 }]);
  });
  it("multiclass wizard 3 / paladin 4 = caster level 5", () => {
    expect(slotTable([{ level: 3, progression: "full" }, { level: 4, progression: "half" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 3 }, { level: "3", max: 2 }]);
  });
  it("warlock pact slots are separate", () => {
    expect(slotTable([{ level: 5, progression: "pact" }])).toEqual([{ level: "pact", max: 2, pactLevel: 3 }]);
    expect(slotTable([{ level: 2, progression: "full" }, { level: 11, progression: "pact" }])).toEqual([{ level: "1", max: 3 }, { level: "pact", max: 3, pactLevel: 5 }]);
  });
  it("non-casters get nothing", () => expect(slotTable([{ level: 10 }])).toEqual([]));
  it("third casters: eldritch knight 7 and a multiclass third + full", () => {
    expect(slotTable([{ level: 7, progression: "third" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 2 }]);
    expect(slotTable([{ level: 3, progression: "third" }])).toEqual([{ level: "1", max: 2 }]);
    // wizard 4 + third 6: 4 + 2 = caster level 6 -> 4/3/3
    expect(slotTable([{ level: 4, progression: "full" }, { level: 6, progression: "third" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 3 }, { level: "3", max: 3 }]);
  });
  it("custom table: highest row at or below the level, alone and added to a full caster", () => {
    const table = { 3: { slots: [2] }, 7: { slots: [4, 2] } };
    expect(slotTable([{ level: 2, progression: "table", table }])).toEqual([]);
    expect(slotTable([{ level: 5, progression: "table", table }])).toEqual([{ level: "1", max: 2 }]);
    expect(slotTable([{ level: 8, progression: "table", table }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 2 }]);
    expect(slotTable([{ level: 2, progression: "full" }, { level: 8, progression: "table", table }])).toEqual([{ level: "1", max: 7 }, { level: "2", max: 2 }]);
  });
  it("a table pact row adds to warlock pact slots", () => {
    const table = { 3: { pact: { slots: 1, level: 1 } }, 5: { pact: { slots: 2, level: 2 } } };
    expect(slotTable([{ level: 5, progression: "table", table }])).toEqual([{ level: "pact", max: 2, pactLevel: 2 }]);
    expect(slotTable([{ level: 5, progression: "table", table }, { level: 5, progression: "pact" }])).toEqual([{ level: "pact", max: 4, pactLevel: 3 }]);
  });
});
