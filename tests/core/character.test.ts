import { parseNote, writeInto, newCharacter } from "../../src/core/character";
import { thalia, maren } from "../fixtures/notes";

describe("parseNote", () => {
  it("ignores notes that are not ours", () => {
    expect(parseNote({ title: "x" })).toEqual({ kind: "none" });
    expect(parseNote(null)).toEqual({ kind: "none" });
    expect(parseNote("text")).toEqual({ kind: "none" });
  });
  it("parses a full character", () => {
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    expect(p.errors).toEqual([]); expect(p.writable).toBe(true);
    expect(p.value.abilities.wis).toBe(17); expect(p.value.inventory[4]).toEqual({ name: "Grandmother's locket", qty: 1, equipped: false, attuned: false });
    expect(p.value.coins).toEqual({ pp: 0, gp: 47, ep: 0, sp: 12, cp: 30 });
    expect(p.value.companions[0]).toEqual({ creature: "owl", name: "Hoot", kind: "familiar", hp: { temp: 0 }, conditions: {} });
    expect(p.value.campaign).toBe("[[Ekron Campaign]]");
  });
  it("fills defaults for a minimal note without errors", () => {
    const p = parseNote({ type: "5e-character", name: "New" }); if (p.kind !== "character") throw new Error();
    expect(p.errors).toEqual([]); expect(p.writable).toBe(true);
    expect(p.value.abilities).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
    expect(p.value.hp).toEqual({ max: 0, current: 0, temp: 0 }); expect(p.value.classes).toEqual([]); expect(p.value.schema).toBe(1);
  });
  it("wrong types are errors and make the note read-only", () => {
    const p = parseNote({ type: "5e-character", name: "Bad", abilities: { str: "strong" }, hp: "lots", inventory: { a: 1 } });
    if (p.kind !== "character") throw new Error();
    expect(p.writable).toBe(false);
    expect(p.errors).toEqual(["abilities.str: must be a number", "hp: must be a mapping", "inventory: must be a list"]);
    expect(p.value.abilities.str).toBe(10);
  });
  it("rejects a newer schema", () => {
    const p = parseNote({ type: "5e-character", name: "Future", schema: 2 }); if (p.kind !== "character") throw new Error();
    expect(p.writable).toBe(false); expect(p.errors).toEqual(["schema 2 is newer than this plugin supports"]);
  });
  it("condition true means level 1, negative or junk is an error", () => {
    const ok = parseNote({ type: "5e-character", name: "C", conditions: { prone: true, exhaustion: 2 } });
    if (ok.kind !== "character") throw new Error();
    expect(ok.value.conditions).toEqual({ prone: 1, exhaustion: 2 });
    const bad = parseNote({ type: "5e-character", name: "C", conditions: { prone: -1 } });
    if (bad.kind !== "character") throw new Error();
    expect(bad.errors).toEqual(["conditions.prone: must be a whole number from 0"]);
  });
  it("parses an NPC", () => {
    const p = parseNote(maren); if (p.kind !== "npc") throw new Error();
    expect(p.value).toMatchObject({ name: "Sister Maren", creature: "acolyte", hp: { max: 12, current: 12, temp: 0 }, conditions: {} });
    expect(p.writable).toBe(true);
  });
  it("NPC without a creature is an error", () => {
    const p = parseNote({ type: "5e-npc", name: "Nobody" }); if (p.kind !== "npc") throw new Error();
    expect(p.errors).toEqual(["creature: must be text"]); expect(p.writable).toBe(false);
  });
});

describe("writeInto", () => {
  it("round-trips and keeps unknown keys", () => {
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    const fm: Record<string, unknown> = structuredClone(thalia);
    p.value.hp.current = 20; writeInto(fm, p.value);
    expect(fm.myOwnKey).toBe("keep me"); expect((fm.hp as any).current).toBe(20);
    const again = parseNote(fm); if (again.kind !== "character") throw new Error();
    expect(again.value).toEqual({ ...p.value });
  });
  it("does not add keys that are still default", () => {
    const fm: Record<string, unknown> = { type: "5e-character", name: "New" };
    writeInto(fm, newCharacter("New"));
    expect(Object.keys(fm).sort()).toEqual(["name", "schema", "type"]);
  });
  it("adds a key once it changes from its default", () => {
    const fm: Record<string, unknown> = { type: "5e-character", name: "New" };
    const c = newCharacter("New"); c.conditions = { poisoned: 1 }; writeInto(fm, c);
    expect(fm.conditions).toEqual({ poisoned: 1 });
  });
});
