import { newCharacter, parseNote, writeInto, type Character } from "../../src/core/character";
import { thalia } from "../fixtures/notes";

const parse = (fm: object) => { const p = parseNote({ type: "5e-character", name: "X", ...fm }); if (p.kind !== "character") throw new Error(); return p; };

describe("leveling fields", () => {
  it("defaults are empty and stay out of the note", () => {
    const p = parse({}); expect(p.errors).toEqual([]);
    expect(p.value).toMatchObject({ levelLog: [], feats: [], uses: {}, choices: {} }); expect(p.value.subrace).toBeUndefined();
    const fm: Record<string, unknown> = { type: "5e-character", name: "X" };
    writeInto(fm, p.value);
    for (const k of ["levelLog", "feats", "uses", "choices", "subrace"]) expect(k in fm, k).toBe(false);
  });
  it("legacy notes without a level log parse as before", () => {
    const p = parseNote(thalia); expect(p.kind === "character" && p.errors).toEqual([]);
    if (p.kind === "character") { expect(p.value.levelLog).toEqual([]); expect(p.writable).toBe(true); }
  });
  it("parses a level log, feats, uses, choices and subrace and round-trips them", () => {
    const fm = {
      subrace: "cave-skink", feats: ["tough-mind"], uses: { plans: 2 }, choices: { "dc.analysis.alt": true },
      levelLog: [
        { class: "skirmisher", level: 1, hp: { method: "first", die: 8, gained: 8 }, choices: { "class:skirmisher:1:stance": ["duelist"] } },
        { class: "skirmisher", level: 2, hp: { method: "roll", die: 8, gained: 5 }, choices: {}, extra: "keep" },
      ],
    };
    const p = parse(fm); expect(p.errors).toEqual([]);
    expect(p.value.levelLog).toHaveLength(2); expect(p.value.levelLog[1]).toMatchObject({ level: 2, hp: { method: "roll", gained: 5 }, extra: "keep" });
    const out: Record<string, unknown> = { type: "5e-character", name: "X", mystery: 1 };
    writeInto(out, p.value);
    expect(out).toMatchObject({ subrace: "cave-skink", feats: ["tough-mind"], uses: { plans: 2 }, choices: { "dc.analysis.alt": true }, mystery: 1 });
    expect(parse(out).value).toEqual(p.value);
  });
  it("wrong types make the note read-only instead of crashing", () => {
    for (const bad of [
      { levelLog: "no" }, { levelLog: [{ class: "x", level: 0, hp: { method: "roll", gained: 1 }, choices: {} }] },
      { levelLog: [{ class: "x", level: 1, hp: { method: "magic", gained: 1 }, choices: {} }] },
      { levelLog: [{ class: "x", level: 1, hp: { method: "roll", gained: -3 }, choices: {} }] },
      { levelLog: [{ level: 1, hp: { method: "roll", gained: 1 }, choices: {} }] },
      { levelLog: [{ class: "x", level: 1, hp: { method: "roll", gained: 1 }, choices: [] }] },
      { feats: [1] }, { feats: "x" }, { uses: { a: -1 } }, { uses: [] }, { choices: [] }, { subrace: 3 },
    ]) { const p = parse(bad); expect(p.errors.length, JSON.stringify(bad)).toBeGreaterThan(0); expect(p.writable).toBe(false); }
  });
  it("recorded hp method is allowed for characters that predate the log", () => {
    const p = parse({ levelLog: [{ class: "x", level: 1, hp: { method: "recorded", gained: 43 }, choices: {} }] });
    expect(p.errors).toEqual([]);
  });
  it("newCharacter has the new fields", () => {
    const c: Character = newCharacter("N"); expect(c.levelLog).toEqual([]); expect(c.feats).toEqual([]);
  });
});
