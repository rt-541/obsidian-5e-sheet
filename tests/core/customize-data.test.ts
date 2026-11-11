import { parseNote, writeInto } from "../../src/core/character";
import { act, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";

const R = mechanicsRegistry();
const KEY = "feature:class:tester:1:fury";

describe("customization data", () => {
  it("a note without customize parses to {} and writes nothing back", () => {
    const c = makeChar(); expect(c.customize).toEqual({});
    const fm: Record<string, unknown> = { ...tester }; writeInto(fm, c); expect("customize" in fm).toBe(false);
  });
  it("reads the map and inventory customizations", () => {
    const p = parseNote({ ...tester, customize: { [KEY]: { toggle: false, action: { name: "Roar", damage: { byLevel: { 1: "1d4", 5: "2d4" } } } } },
      inventory: [{ name: "Odd Charm", qty: 1, customize: { action: { name: "Zap", damage: "1d6", damageType: "lightning" } } }] });
    expect(p.kind === "character" && p.errors).toEqual([]);
    expect((p as any).value.customize[KEY].toggle).toBe(false);
    expect((p as any).value.inventory[0].customize.action.damageType).toBe("lightning");
  });
  it("structural mistakes are reported in words", () => {
    const p = parseNote({ ...tester, customize: { "feature:x": { colour: "red" }, "feature:y": 3 } }) as any;
    expect(p.errors).toEqual(['customize.feature:x: unknown part "colour" (use toggle, attackOption or action)', "customize.feature:y: must be a mapping"]);
  });
  it("a removed field is stored as null and survives a round trip", () => {
    const p = parseNote({ ...tester, customize: { [KEY]: { toggle: { cost: null } } } }) as any;
    expect(p.errors).toEqual([]);
    expect(p.value.customize[KEY]).toEqual({ toggle: { cost: null } });
  });
  it("customize sets, and an empty or missing value resets", () => {
    let c = act(makeChar(), { type: "customize", key: KEY, value: { toggle: { group: "rage" } } }, R).value;
    expect(c.customize[KEY]).toEqual({ toggle: { group: "rage" } });
    c = act(c, { type: "customize", key: KEY, value: {} }, R).value;
    expect(c.customize).toEqual({});
    c = act(c, { type: "customize", key: KEY, value: { toggle: false } }, R).value;
    c = act(c, { type: "customize", key: KEY }, R).value;
    expect(c.customize).toEqual({});
  });
  it("making an active switch not a switch clears its on state and keeps its pin", () => {
    const c0 = makeChar({ active: { fury: true }, mainPins: ["feature:class:tester:1:fury"] });
    const c = act(c0, { type: "customize", key: KEY, value: { toggle: false } }, R).value;
    expect(c.active.fury).toBeUndefined();
    expect(c.mainPins).toEqual(["feature:class:tester:1:fury"]);
  });
  it("customizeItem changes one inventory row only", () => {
    const c0 = makeChar({ inventory: [{ id: "longsword", qty: 1, equipped: true }, { id: "longsword", qty: 1, equipped: false }] });
    const c = act(c0, { type: "customizeItem", index: 1, value: { action: { name: "Glow" } } }, R).value;
    expect(c.inventory[0].customize).toBeUndefined(); expect(c.inventory[1].customize).toEqual({ action: { name: "Glow" } });
    const back = act(c, { type: "customizeItem", index: 1 }, R).value;
    expect(back.inventory[1].customize).toBeUndefined();
  });
});
