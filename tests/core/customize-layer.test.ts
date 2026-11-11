import { freshToggleId, layerRow, levelDice } from "../../src/core/customize";

const fail = (m: string) => { throw new Error(m); };
const note = { toggle: { id: "fury", endsOn: "long" as const, cost: { resource: "Fury" } } };

describe("layering a customization over a note", () => {
  it("absent keeps the note, false removes, a partial merges", () => {
    expect(layerRow("Fury", note, undefined, 1, fail)).toEqual(note);
    expect(layerRow("Fury", note, { toggle: false }, 1, fail).toggle).toBeUndefined();
    expect(layerRow("Fury", note, { toggle: { group: "rage" } }, 1, fail).toggle).toEqual({ id: "fury", endsOn: "long", cost: { resource: "Fury" }, group: "rage" });
  });
  it("marks a customized row", () => {
    expect(layerRow("Fury", note, { toggle: { group: "rage" } }, 1, fail).custom).toBe(true);
    expect(layerRow("Fury", note, {}, 1, fail).custom).toBeUndefined();
  });
  it("a new Use button from nothing", () => {
    expect(layerRow("Spark", {}, { action: { name: "Spark", damage: "2d6", damageType: "fire" } }, 1, fail).action).toEqual({ name: "Spark", damage: "2d6", damageType: "fire" });
  });
  it("grows with level: nothing below the first level, then the highest step reached", () => {
    const mine = { attackOption: { onHit: { byLevel: { 3: "1d4", 7: "2d4" } }, resource: "Fury" } };
    expect(layerRow("Edge", {}, mine, 2, fail).attackOption).toBeUndefined();
    expect(layerRow("Edge", {}, mine, 8, fail).attackOption?.onHit).toBe("2d4");
    expect(layerRow("Edge", {}, mine, 8, fail).attackOption?.resource).toBe("Fury");
  });
  it("levelDice reads strings and tables", () => {
    expect(levelDice("1d4", 1)).toBe("1d4");
    expect(levelDice({ byLevel: { 5: "1d6" } }, 4)).toBeUndefined();
    expect(levelDice({ byLevel: { 5: "1d6", 9: "2d6" } }, 9)).toBe("2d6");
  });
  it("an invalid merge keeps the note and says so once", () => {
    const msgs: string[] = [];
    expect(layerRow("Fury", note, { toggle: { endsOn: "tomorrow" as never } }, 1, m => msgs.push(m)).toggle).toEqual(note.toggle);
    expect(msgs).toEqual(["Your changes to Fury could not be used, so the note's version is shown. Open Customize to fix or reset them."]);
  });
  it("a removed field (null) is dropped from the merge", () => {
    expect(layerRow("Fury", note, { toggle: { cost: null as never } }, 1, fail).toggle).toEqual({ id: "fury", endsOn: "long" });
  });
  it("setting onHit replaces a note's scale, and scale replaces onHit", () => {
    const scaled = { attackOption: { id: "edge", scale: { 1: "1d4", 5: "2d4" } } };
    expect(layerRow("Edge", scaled, { attackOption: { onHit: "1d8" } }, 1, fail).attackOption).toEqual({ id: "edge", onHit: "1d8" });
    const flat = { attackOption: { id: "edge", onHit: "1d4" } };
    expect(layerRow("Edge", flat, { attackOption: { scale: { 1: "1d6" } } }, 1, fail).attackOption).toEqual({ id: "edge", scale: { 1: "1d6" } });
  });
  it("a level table below its first step drops only that field when something is left", () => {
    const flat = { attackOption: { id: "edge", toHit: "1d4" } };
    expect(layerRow("Edge", flat, { attackOption: { onHit: { byLevel: { 5: "1d6" } } } }, 1, fail).attackOption).toEqual({ id: "edge", toHit: "1d4" });
  });
  it("never mutates the note", () => {
    const n = structuredClone(note); layerRow("Fury", note, { toggle: { group: "x" } }, 1, fail); expect(note).toEqual(n);
  });
  it("fresh switch ids do not collide", () => {
    expect(freshToggleId("Long Sword", ["long-sword", "long-sword-2"])).toBe("long-sword-3");
    expect(freshToggleId("Long Sword", [])).toBe("long-sword");
  });
});
