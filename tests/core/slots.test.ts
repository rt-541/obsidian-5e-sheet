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
});
