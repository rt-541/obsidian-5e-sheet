import { newCharacter, parseNote, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { applyLevel, planLevel, undoLevel } from "../../src/core/levelup";
import { progress } from "../../src/core/progression";
import { homebrewRegistry } from "../fixtures/homebrew";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";

const scout = { type: "5e-class", name: "Scout", hitDie: 8, levels: {
  1: [{ op: "feature", id: "base", name: "Keen Eye", text: "You see far." },
      { op: "feature", id: "terrain", name: "Favored Terrain", optional: true, text: "Pick a terrain you know well.", effects: { modifiers: [{ target: "speed", value: 5 }] } }],
  2: [{ op: "feature", id: "trap", name: "Snare", optional: true, text: "Set a snare.", action: { name: "Snare", damage: "1d6" } }],
} };
const reg = homebrewRegistry([scout]);
const seed = seeded(4);
const T1 = "class:scout:1:terrain", T2 = "class:scout:2:trap";
const up = (c: Character, choices: Record<string, unknown> = {}) => applyLevel(c, { class: "scout" }, { hp: { method: "average" }, choices }, reg, seed);
const ok = (r: ReturnType<typeof up>) => { if ("error" in r) throw new Error(r.error); return r; };
const names = (c: Character) => progress(c, reg).features.map(f => f.name);

describe("optional class features", () => {
  it("validates the flag and rejects a non-boolean", () => {
    const r = new Registry(); registerBuiltinTypes(r);
    expect(r.add("vault", "class", { name: "X", hitDie: 8, levels: { 1: [{ op: "feature", name: "A", optional: "yes" }] } }, { path: "x.md" })?.errors.join()).toMatch(/optional: must be true or false/);
    expect(r.add("vault", "class", { name: "Y", hitDie: 8, levels: { 1: [{ op: "feature", name: "A", optional: true }] } }, { path: "y.md" })).toBeNull();
  });

  it("the wizard asks about each optional feature at its level, with the feature named in the question", () => {
    const p = planLevel(newCharacter("T"), "scout", reg);
    if ("error" in p) throw new Error(p.error);
    expect(p.steps.map(s => s.key)).toEqual(["hp", T1]);
    expect(p.steps[1]).toMatchObject({ kind: "optional", label: "Take optional feature Favored Terrain?", name: "Favored Terrain", text: "Pick a terrain you know well." });
  });

  it("must be answered yes or no", () => {
    expect("error" in up(newCharacter("T"))).toBe(true);
    expect(up(newCharacter("T"), { [T1]: "maybe" })).toMatchObject({ error: expect.stringMatching(/yes or no/) });
  });

  it("not taken: no feature, no effects, answer recorded as false", () => {
    const r = ok(up(newCharacter("T"), { [T1]: false }));
    expect(names(r.value)).toEqual(["Keen Eye"]);
    expect(r.entry.choices[T1]).toBe(false);
    expect(r.summary.join("|")).toMatch(/Optional feature: Favored Terrain \(not taken\)/);
  });

  it("taken: the feature and its effects apply and the answer is recorded", () => {
    const r = ok(up(newCharacter("T"), { [T1]: true }));
    expect(names(r.value)).toEqual(["Keen Eye", "Favored Terrain"]);
    expect(progress(r.value, reg).effects.some(e => e.source === "Favored Terrain")).toBe(true);
    expect(r.entry.choices[T1]).toBe(true);
    expect(r.summary.join("|")).toMatch(/Optional feature: Favored Terrain \(taken\)/);
  });

  it("level 2 asks only about level 2's optional feature, and undo takes it away", () => {
    const l1 = ok(up(newCharacter("T"), { [T1]: true })).value;
    const p = planLevel(l1, "scout", reg);
    if ("error" in p) throw new Error(p.error);
    expect(p.steps.map(s => s.key)).toEqual(["hp", T2]);
    const l2 = ok(up(l1, { [T2]: true })).value;
    expect(names(l2)).toEqual(["Keen Eye", "Favored Terrain", "Snare"]);
    expect(progress(l2, reg).features.find(f => f.name === "Snare")!.action).toMatchObject({ name: "Snare" });
    const back = undoLevel(l2, reg);
    if ("error" in back) throw new Error(back.error);
    expect(names(back.value)).toEqual(["Keen Eye", "Favored Terrain"]);
  });

  it("legacy notes (no answer recorded) treat optional features as not taken, with nothing pending", () => {
    const p = parseNote({ type: "5e-character", name: "Old", classes: [{ class: "scout", level: 2 }], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { max: 10, current: 10, temp: 0 } });
    if (p.kind !== "character") throw new Error();
    const pr = progress(p.value, reg);
    expect(pr.features.map(f => f.name)).toEqual(["Keen Eye"]); expect(pr.pending).toEqual([]); expect(pr.problems).toEqual([]);
  });
});
