import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { parseAbilityPick } from "../../src/content/types/origin";
import { abilityPickKey, describePattern, pickDelta } from "../../src/core/ability-increase";
import { buildCharacter, buildSteps, newDraft, originBonus, type BuildDraft } from "../../src/core/builder";
import { seeded } from "../../src/core/dice";
import { homebrewRegistry } from "../fixtures/homebrew";

const pickIn = { from: ["str", "con", "wis"] as ("str" | "con" | "wis")[], patterns: [[2, 1], [1, 1, 1]] };
const drifter = { type: "5e-background", name: "Drifter", ability: [{ wis: 1 }], abilityPick: { from: ["str", "con", "wis"], patterns: [[2, 1], [1, 1, 1]] }, grants: [] };
const loner = { type: "5e-background", name: "Loner", grants: [] };
const brute = { type: "5e-class", name: "Brute", hitDie: 12, levels: { 1: [{ op: "feature", name: "Rage" }] } };
const hardy = { type: "5e-race", name: "Hardy", ability: [{ con: 1 }], grants: [] };
const spry = { type: "5e-race", name: "Spry", ability: [{ choose: { from: ["dex", "wis"], count: 1, amount: 1 } }], grants: [] };
const plainRace = { type: "5e-race", name: "Plain", grants: [] };
const reg = homebrewRegistry([drifter, loner, brute, plainRace, hardy, spry]);

const check = (raw: unknown) => { const r = new Registry(); registerBuiltinTypes(r); return r.add("vault", "background", { name: "X", grants: [], abilityPick: raw }, { path: "x.md" }); };

describe("ability pick on a background", () => {
  it("may carry ability and a pick, and bad picks are named", () => {
    expect(check({ from: ["str", "dex", "con"], patterns: [[2, 1], [1, 1, 1]] })).toBeNull();
    expect(check({ from: ["str", "dex"], patterns: [[5]] })?.errors[0]).toBe("abilityPick.patterns: each pattern must be 1 to 4 whole numbers from 1 to 4, no longer than from");
    expect(check({ from: ["str"], patterns: [[1, 1]] })?.errors[0]).toMatch(/abilityPick.patterns/);
    expect(check({ from: [], patterns: [[1]] })?.errors[0]).toBe("abilityPick.from: must be a list of abilities");
    expect(check({ from: ["strength"], patterns: [[1]] })?.errors[0]).toBe("abilityPick.from: must be a list of abilities");
    const e: string[] = [];
    expect(parseAbilityPick(undefined, "abilityPick", e)).toBeUndefined();
    const r = new Registry(); registerBuiltinTypes(r);
    expect(r.add("vault", "background", { name: "Y", ability: [{ con: 1 }], grants: [] }, { path: "y.md" })).toBeNull();
    expect(r.get<any>("background", "y")!.data.ability).toEqual({ fixed: { con: 1 }, choose: [] });
  });
});

describe("pickDelta and the words", () => {
  it("keys the answer by kind and id", () => { expect(abilityPickKey("background", "drifter")).toBe("background:drifter:pick"); });
  it("gives each number to a different listed ability", () => {
    expect(pickDelta(pickIn, { pattern: 0, to: ["str", "con"] })).toEqual({ str: 2, con: 1 });
    expect(pickDelta(pickIn, { pattern: 0, to: ["str", "str"] })).toBeUndefined();
    expect(pickDelta(pickIn, { pattern: 1, to: ["str", "con", "wis"] })).toEqual({ str: 1, con: 1, wis: 1 });
    expect(pickDelta(pickIn, { pattern: 0, to: ["str", "dex"] })).toBeUndefined();
    expect(pickDelta(pickIn, { pattern: 0, to: ["str"] })).toBeUndefined();
    expect(pickDelta(pickIn, { pattern: 7, to: ["str", "con"] })).toBeUndefined();
    expect(pickDelta(pickIn, "str")).toBeUndefined();
    expect(pickDelta(pickIn, undefined)).toBeUndefined();
  });
  it("describes a pattern in plain words", () => {
    expect(describePattern([2, 1])).toBe("+2 to one ability and +1 to another");
    expect(describePattern([1, 1, 1])).toBe("+1 to each of three abilities");
    expect(describePattern([1])).toBe("+1 to one ability");
  });
});

describe("builder with a background pick", () => {
  const draft = (o: Partial<BuildDraft> = {}): BuildDraft => ({ ...newDraft(), name: "Rhea", race: "plain", background: "drifter", classId: "brute", method: "manual",
    scores: { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, ...o });
  const answer = { pattern: 0, to: ["str", "con"] };
  it("originBonus adds the background's fixed ability and the picked pattern", () => {
    expect(originBonus(draft({ choices: { "background:drifter:pick": answer } }), reg)).toEqual({ wis: 1, str: 2, con: 1 });
    expect(originBonus(draft(), reg)).toEqual({ wis: 1 });
  });
  it("asks for the pattern as a step with the scores before it", () => {
    const s = buildSteps(draft(), reg).origin.filter(x => x.kind === "pattern");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "pattern", key: "background:drifter:pick", from: ["str", "con", "wis"], patterns: [[2, 1], [1, 1, 1]], scores: { str: 14, wis: 11 } });
    const after = buildSteps(draft({ choices: { "background:drifter:pick": answer } }), reg).origin.find(x => x.kind === "pattern");
    expect(after).toMatchObject({ scores: { str: 14, con: 13, wis: 11 } });
  });
  it("is not done until the pattern is answered", () => {
    expect(buildCharacter(draft(), reg, seeded(1))).toEqual({ error: expect.stringContaining("still needs an answer") });
    expect(buildCharacter(draft({ choices: { "background:drifter:pick": { pattern: 0, to: ["str", "str"] } } }), reg, seeded(1))).toEqual({ error: expect.stringContaining("still needs an answer") });
  });
  it("builds with the pick, records it and says so", () => {
    const r = buildCharacter(draft({ choices: { "background:drifter:pick": answer } }), reg, seeded(1));
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities).toEqual({ str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 });
    expect(r.value.choices["background:drifter:pick"]).toEqual(answer);
    expect(r.summary.join("|")).toMatch(/Ability scores from background: .*\+2 STR/);
  });
  it("names only the sources that gave something, in the edition's word", () => {
    const sum = (o: Partial<BuildDraft>) => { const r = buildCharacter(draft({ choices: { "background:drifter:pick": answer }, ...o }), reg, seeded(1)); if ("error" in r) throw new Error(r.error); return r.summary.join("|"); };
    expect(sum({ edition: "2024" })).toMatch(/Ability scores from background: /);
    expect(sum({ edition: "2024", race: "hardy" })).toMatch(/Ability scores from species and background: /);
    expect(sum({ race: "hardy" })).toMatch(/Ability scores from race and background: /);
    expect(sum({ race: "hardy", background: "loner" })).toMatch(/Ability scores from race: /);
  });
  it("scores stop at 20", () => {
    const r = buildCharacter(draft({ scores: { str: 19, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, choices: { "background:drifter:pick": answer } }), reg, seeded(1));
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities.str).toBe(20);
  });
  it("labels a race pick with the edition's word", () => {
    const src = (e: "2014" | "2024") => (buildSteps(draft({ race: "spry", background: "loner", edition: e }), reg).origin.find(x => x.kind === "pick" && x.what === "abilities") as { source: string } | undefined)?.source;
    expect(src("2014")).toBe("Race: Spry");
    expect(src("2024")).toBe("Species: Spry");
  });
  it("a background without a pick builds as before", () => {
    const r = buildCharacter(draft({ background: "loner" }), reg, seeded(1));
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities).toEqual({ str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 });
    expect(buildSteps(draft({ background: "loner" }), reg).origin).toEqual([]);
  });
});
