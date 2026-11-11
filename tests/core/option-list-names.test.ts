import { resolveOptionList } from "../../src/core/progression";
import { put, srdRegistry } from "../fixtures/overlay";

describe("another class's option list across naming differences", () => {
  const r = srdRegistry();
  put(r, "class", { name: "Test Duelist", hitDie: 8, options: {
    stances: [{ id: "low-guard", name: "Low Guard" }],
    tricks: [{ id: "feint", name: "Feint" }],
  }, levels: { 1: [{ op: "choose", what: "option", list: "stances", count: 1 }] } });
  const ids = (list: string) => resolveOptionList(r, list)?.map(o => o.id);
  it("finds the list by its own name", () => expect(ids("test-duelist:stances")).toEqual(["low-guard"]));
  it("drops a class-name prefix (`fighter-fighting-style` finds `fighting-style`)", () => expect(ids("test-duelist:test-duelist-stances")).toEqual(["low-guard"]));
  it("drops a level suffix (`metamagic-1` finds `metamagic`)", () => expect(ids("test-duelist:tricks-1")).toEqual(["feint"]));
  it("finds a suffixed list from a bare name", () => {
    put(r, "class", { name: "Test Sage", hitDie: 6, options: { "lore-2": [{ id: "star-lore", name: "Star Lore" }] }, levels: {} });
    expect(ids("test-sage:lore")).toEqual(["star-lore"]);
  });
  it("an unknown list stays unknown", () => expect(ids("test-duelist:nothing")).toBeUndefined());
});
