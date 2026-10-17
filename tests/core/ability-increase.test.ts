import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { buildCharacter, buildSteps, newDraft, originBonus, type BuildDraft } from "../../src/core/builder";
import { newCharacter, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { applyLevel, applyResolve, planLevel, undoLevel } from "../../src/core/levelup";
import { homebrewRegistry } from "../fixtures/homebrew";

const wayfarer = { type: "5e-race", name: "Wayfarer", ability: [{ cha: 2 }, { choose: { from: ["str", "dex", "con"], count: 2, amount: 1 } }], grants: [{ op: "feature", name: "Road Sense" }] };
const hill = { type: "5e-subrace", name: "Hill Wayfarer", race: "wayfarer", ability: [{ con: 1 }], grants: [] };
const plain = { type: "5e-race", name: "Plain", grants: [] };
const adept = { type: "5e-feat", name: "Ember Adept", ability: [{ con: 1, choose: { from: ["int", "wis", "cha"], amount: 1 } }], grants: [{ op: "feature", name: "Ember Adept" }] };
const sturdy = { type: "5e-feat", name: "Sturdy", ability: [{ con: 1 }], grants: [] };
const brute = { type: "5e-class", name: "Brute", hitDie: 12, levels: { 1: [{ op: "feature", name: "Rage" }], 2: [{ op: "asi" }], 3: [{ op: "asi" }] } };
const reg = homebrewRegistry([wayfarer, hill, plain, adept, sturdy, brute]);
const seed = seeded(5);

describe("ability field validation", () => {
  const check = (raw: unknown) => { const r = new Registry(); registerBuiltinTypes(r); return r.add("vault", "race", { name: "X", grants: [], ability: raw }, { path: "x.md" }); };
  it("accepts the raw 5e.tools shapes, alone or combined", () => {
    expect(check([{ con: 2 }])).toBeNull();
    expect(check([{ choose: { from: ["str", "dex"], count: 1, amount: 1 } }])).toBeNull();
    expect(check([{ con: 2 }, { choose: { from: ["str", "dex", "wis"], count: 2 } }])).toBeNull();
    expect(check([{ cha: 2, choose: { from: ["str", "dex", "wis"], count: 2 } }])).toBeNull();
    expect(check({ str: 1 })).toBeNull();
  });
  it("rejects what it cannot read", () => {
    expect(check([{ strength: 2 }])?.errors[0]).toMatch(/unknown ability/);
    expect(check([{ con: 9 }])?.errors[0]).toMatch(/whole number from -4 to 4/);
    expect(check([{ choose: { from: ["str"], count: 2 } }])?.errors[0]).toMatch(/count/);
    expect(check([{ choose: { weighted: {} } }])?.errors[0]).toMatch(/weighted/);
    expect(check("con 2")?.errors[0]).toMatch(/mapping/);
  });
  it("is stored in a normal form", () => {
    const r = new Registry(); registerBuiltinTypes(r);
    r.add("vault", "race", { name: "X", grants: [], ability: [{ con: 2 }, { con: 1, choose: { from: ["str", "dex"] } }] }, { path: "x.md" });
    expect(r.get<any>("race", "x")!.data.ability).toEqual({ fixed: { con: 3 }, choose: [{ from: ["str", "dex"], count: 1, amount: 1 }] });
  });
});

describe("builder: race and subrace increases", () => {
  const draft = (o: Partial<BuildDraft> = {}): BuildDraft => ({ ...newDraft(), name: "Rhea", race: "wayfarer", subrace: "hill-wayfarer", classId: "brute", method: "manual",
    scores: { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, choices: { "race:wayfarer:ability": ["str", "dex"] }, ...o });
  it("asks for the choose group as a pick step in the origin phase", () => {
    const s = buildSteps(draft({ choices: {} }), reg).origin;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "pick", key: "race:wayfarer:ability", what: "abilities", count: 2, options: [{ id: "str" }, { id: "dex" }, { id: "con" }] });
  });
  it("applies fixed amounts and picks to the starting scores, and says so in the summary", () => {
    const r = buildCharacter(draft(), reg, seed);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities).toEqual({ str: 15, dex: 13, con: 14, int: 10, wis: 10, cha: 10 });
    expect(r.value.choices["race:wayfarer:ability"]).toEqual(["str", "dex"]);
    expect(r.summary.join("|")).toMatch(/Ability scores from race: .*\+2 CHA/);
    expect(originBonus(draft(), reg)).toEqual({ str: 1, dex: 1, con: 1, cha: 2 });
  });
  it("will not build until the pick is answered or if it is not one of the listed abilities", () => {
    expect("error" in buildCharacter(draft({ choices: {} }), reg, seed)).toBe(true);
    const bad = buildCharacter(draft({ choices: { "race:wayfarer:ability": ["str", "wis"] } }), reg, seed);
    expect("error" in bad && bad.error).toMatch(/not one of the choices/);
  });
  it("stops at 20 and leaves a race without the field alone", () => {
    const r = buildCharacter(draft({ scores: { str: 20, dex: 19, con: 13, int: 10, wis: 10, cha: 19 } }), reg, seed);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities).toMatchObject({ str: 20, dex: 20, cha: 20 });
    const p = buildCharacter(draft({ race: "plain", subrace: undefined, choices: {} }), reg, seed);
    if ("error" in p) throw new Error(p.error);
    expect(p.value.abilities).toEqual({ str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 });
  });
  it("a character that already has class levels is never asked about its race", () => {
    const c: Character = { ...newCharacter("Old"), race: "wayfarer", classes: [{ class: "brute", level: 1 }] };
    expect(applyResolve(c, { choices: {} }, reg)).toEqual({ error: "Nothing is waiting for a choice" });
  });
});

describe("level up: feat increases", () => {
  const start = (str = 15, con = 12): Character => {
    const c: Character = { ...newCharacter("T"), abilities: { str, dex: 12, con, int: 10, wis: 10, cha: 10 } };
    const r = applyLevel(c, { class: "brute" }, { hp: { method: "average" }, choices: {} }, reg, seed);
    if ("error" in r) throw new Error(r.error);
    return r.value;
  };
  const asi = (c: Character, choices: Record<string, unknown>) => applyLevel(c, { class: "brute" }, { hp: { method: "average" }, choices }, reg, seed);
  const KEY = "class:brute:2:asi-0";

  it("a feat with a choose group adds its pick step; fixed and picked amounts land on the scores and in the log", () => {
    const c = start();
    const p = planLevel(c, "brute", reg, { [KEY]: { feat: "ember-adept" } });
    if ("error" in p) throw new Error(p.error);
    expect(p.steps.map(s => s.key)).toEqual(["hp", KEY, "feat:ember-adept:ability"]);
    const r = asi(c, { [KEY]: { feat: "ember-adept" }, "feat:ember-adept:ability": ["wis"] });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.feats).toEqual(["ember-adept"]);
    expect(r.value.abilities).toMatchObject({ con: 13, wis: 11 });
    expect(r.entry.choices[KEY]).toEqual({ feat: "ember-adept", abilities: { con: 1, wis: 1 } });
    expect(r.summary.join("|")).toMatch(/Feat: Ember Adept \(\+1 CON, \+1 WIS\)/);
  });
  it("needs the pick, and only accepts abilities from the list", () => {
    const c = start();
    expect(asi(c, { [KEY]: { feat: "ember-adept" } })).toMatchObject({ error: expect.stringMatching(/choose the abilities/) });
    expect(asi(c, { [KEY]: { feat: "ember-adept" }, "feat:ember-adept:ability": ["str"] })).toMatchObject({ error: expect.stringMatching(/choose the abilities/) });
  });
  it("undo reverses the feat and exactly the points it gave", () => {
    const c = start();
    const r = asi(c, { [KEY]: { feat: "ember-adept" }, "feat:ember-adept:ability": ["int"] });
    if ("error" in r) throw new Error(r.error);
    const u = undoLevel(r.value, reg);
    if ("error" in u) throw new Error(u.error);
    expect(u.value.abilities).toEqual(c.abilities); expect(u.value.feats).toEqual([]); expect(u.value.levelLog).toHaveLength(1);
  });
  it("max 20 holds: a capped increase applies only what fits, and undo removes only that", () => {
    const c = start(15, 20);
    const r = asi(c, { [KEY]: { feat: "sturdy" } });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities.con).toBe(20);
    expect(r.entry.choices[KEY]).toEqual({ feat: "sturdy" });
    const u = undoLevel(r.value, reg);
    if ("error" in u) throw new Error(u.error);
    expect(u.value.abilities.con).toBe(20);
  });
  it("the plain ability-score answer still works and still undoes", () => {
    const c = start();
    const r = asi(c, { [KEY]: { abilities: { str: 1, dex: 1 } } });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities).toMatchObject({ str: 16, dex: 13 });
    const u = undoLevel(r.value, reg);
    if ("error" in u) throw new Error(u.error);
    expect(u.value.abilities).toEqual(c.abilities);
  });
});
