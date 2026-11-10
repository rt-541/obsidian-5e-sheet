import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { buildCharacter, buildSteps, newDraft, originBonus, type BuildDraft } from "../../src/core/builder";
import { newCharacter, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { increaseDelta } from "../../src/core/ability-increase";
import { applyLevel, applyResolve, planLevel, undoLevel } from "../../src/core/levelup";
import { homebrewRegistry } from "../fixtures/homebrew";

const wayfarer = { type: "5e-race", name: "Wayfarer", ability: [{ cha: 2 }, { choose: { from: ["str", "dex", "con"], count: 2, amount: 1 } }], grants: [{ op: "feature", name: "Road Sense" }] };
const hill = { type: "5e-subrace", name: "Hill Wayfarer", race: "wayfarer", ability: [{ con: 1 }], grants: [] };
const plain = { type: "5e-race", name: "Plain", grants: [] };
const adept = { type: "5e-feat", name: "Ember Adept", ability: [{ con: 1, choose: { from: ["int", "wis", "cha"], amount: 1 } }], grants: [{ op: "feature", name: "Ember Adept" }] };
const sturdy = { type: "5e-feat", name: "Sturdy", ability: [{ con: 1 }], grants: [] };
const brute = { type: "5e-class", name: "Brute", hitDie: 12, levels: { 1: [{ op: "feature", name: "Rage" }], 2: [{ op: "asi" }], 3: [{ op: "asi" }] } };
const keenEdge = { type: "5e-feat", name: "Keen Edge", ability: [{ choose: { from: ["str", "dex"] }, max: 30 }], grants: [] };
const keenFixed = { type: "5e-feat", name: "Keen Fixed", ability: [{ str: 1, max: 30 }], grants: [] };
const keenPlain = { type: "5e-feat", name: "Keen Plain", ability: [{ choose: { from: ["str", "dex"] } }], grants: [] };
const keenRace = { type: "5e-race", name: "Keen Folk", ability: [{ str: 1, max: 30 }], grants: [] };
const stout = { type: "5e-race", name: "Stout", ability: [{ str: 2 }], grants: [] };
const stoutKeen = { type: "5e-subrace", name: "Stout Keen", race: "stout", ability: [{ str: 1, max: 30 }], grants: [] };
const mixed = { type: "5e-race", name: "Mixed", ability: [{ str: 1 }, { choose: { from: ["str"] }, max: 30 }], grants: [] };
const reg = homebrewRegistry([stout, stoutKeen, mixed, wayfarer, hill, plain, adept, sturdy, brute, keenEdge, keenFixed, keenPlain, keenRace]);
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

describe("ability increase score cap (max)", () => {
  const add = (raw: unknown) => { const r = new Registry(); registerBuiltinTypes(r); const e = r.add("vault", "feat", { name: "X", grants: [], ability: raw }, { path: "x.md" }); return { e, r }; };
  it("accepts max beside choose or fixed amounts and keeps it", () => {
    const c = add([{ choose: { from: ["str", "dex"] }, max: 30 }]);
    expect(c.e).toBeNull();
    expect(c.r.get<any>("feat", "x")!.data.ability).toEqual({ fixed: {}, choose: [{ from: ["str", "dex"], count: 1, amount: 1, max: 30 }] });
    const f = add([{ str: 1, max: 30 }, { con: 1 }]);
    expect(f.e).toBeNull();
    expect(f.r.get<any>("feat", "x")!.data.ability).toEqual({ fixed: { str: 1, con: 1 }, fixedMax: { str: 30 }, choose: [] });
    expect(add({ dex: 1, max: 22 }).e).toBeNull();
  });
  it("a bad max is named in plain words", () => {
    for (const bad of [19, 31, "30", 22.5, null]) expect(add([{ choose: { from: ["str"] }, max: bad }]).e?.errors[0]).toBe("ability[0].max: must be a whole number from 20 to 30");
    expect(add([{ con: 1 }, { str: 1, max: 31 }]).e?.errors[0]).toBe("ability[1].max: must be a whole number from 20 to 30");
    expect(add({ str: 1, max: 5 }).e?.errors[0]).toBe("ability.max: must be a whole number from 20 to 30");
  });
  it("a max with nothing to raise is an error rather than ignored", () => {
    expect(add([{ max: 30 }]).e?.errors[0]).toMatch(/max/);
  });
  it("increaseDelta stops at the increase's own cap, not 20", () => {
    const inc = reg.get<any>("feat", "keen-edge")!.data.ability, cur = { str: 20, dex: 29, con: 10, int: 10, wis: 10, cha: 10 }, std = { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 };
    expect(increaseDelta(inc, [["str"]], cur, std).delta).toEqual({ str: 1 });
    expect(increaseDelta(inc, [["dex"]], cur, std).delta).toEqual({ dex: 1 });
    expect(increaseDelta(inc, [["dex"]], { ...cur, dex: 30 }, std).delta).toEqual({});
    const none = reg.get<any>("feat", "keen-plain")!.data.ability;
    expect(increaseDelta(none, [["str"]], cur, std).delta).toEqual({});
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
  it("a species increase with max carries past 20; the same without max stays at 20", () => {
    const r = buildCharacter(draft({ race: "keen-folk", subrace: undefined, scores: { str: 20, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, choices: {} }), reg, seed);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities.str).toBe(21);
    const w = buildCharacter(draft({ race: "wayfarer", subrace: undefined, scores: { str: 20, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, choices: { "race:wayfarer:ability": ["str", "dex"] } }), reg, seed);
    if ("error" in w) throw new Error(w.error);
    expect(w.value.abilities.str).toBe(20);
  });
  it("an uncapped increase stops at 20 even when a capped one lands on the same ability", () => {
    const str = (n: number) => { const r = buildCharacter(draft({ race: "stout", subrace: "stout-keen", scores: { str: n, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, choices: {} }), reg, seed); if ("error" in r) throw new Error(r.error); return r.value.abilities.str; };
    expect(str(19)).toBe(21);
    expect(str(20)).toBe(21);
    expect(str(14)).toBe(17);
    expect(str(26)).toBe(27);
  });
  it("inside one increase the uncapped amount stops at 20 and the capped one goes on", () => {
    const c = (n: number) => { const r = buildCharacter(draft({ race: "mixed", subrace: undefined, scores: { str: n, dex: 12, con: 13, int: 10, wis: 10, cha: 8 }, choices: { "race:mixed:ability": ["str"] } }), reg, seed); if ("error" in r) throw new Error(r.error); return r.value.abilities.str; };
    expect(c(19)).toBe(21);
    expect(c(20)).toBe(21);
    expect(c(14)).toBe(16);
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
  it("an increase with max goes past 20 and stops at its own cap; undo removes exactly what applied", () => {
    const c = start(20, 12);
    const r = asi(c, { [KEY]: { feat: "keen-edge" }, "feat:keen-edge:ability": ["str"] });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities.str).toBe(21);
    expect(r.entry.choices[KEY]).toEqual({ feat: "keen-edge", abilities: { str: 1 } });
    const u = undoLevel(r.value, reg);
    if ("error" in u) throw new Error(u.error);
    expect(u.value.abilities).toEqual(c.abilities);
    const top = asi(start(30, 12), { [KEY]: { feat: "keen-edge" }, "feat:keen-edge:ability": ["str"] });
    if ("error" in top) throw new Error(top.error);
    expect(top.value.abilities.str).toBe(30);
    expect(top.entry.choices[KEY]).toEqual({ feat: "keen-edge" });
    const u2 = undoLevel(top.value, reg);
    if ("error" in u2) throw new Error(u2.error);
    expect(u2.value.abilities.str).toBe(30);
  });
  it("a fixed amount with max goes past 20; without max the same increase stays at 20", () => {
    const r = asi(start(20, 12), { [KEY]: { feat: "keen-fixed" } });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities.str).toBe(21);
    const w = asi(start(20, 12), { [KEY]: { feat: "keen-plain" }, "feat:keen-plain:ability": ["str"] });
    if ("error" in w) throw new Error(w.error);
    expect(w.value.abilities.str).toBe(20);
  });
});
