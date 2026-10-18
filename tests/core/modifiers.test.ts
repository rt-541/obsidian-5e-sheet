import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { validateEffects } from "../../src/content/types/effects";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { collectEffects, rollSources, sumModifier } from "../../src/core/effects";
import { validRollTarget } from "../../src/core/roll-tags";
import { thalia } from "../fixtures/notes";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };
const char = (o: object = {}): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(JSON.stringify(p)); return p.value; };
const derive = (o: object = {}) => deriveCharacter(char(o), { registry: reg() });

describe("modifier values", () => {
  it("a formula value is worked out with prof and level", () => {
    const a = derive({ modifiers: [{ target: "ac", value: "floor(prof / 2)", source: "Test" }] });
    expect(a.ac.value).toBe(19 + 1); expect(a.ac.sources).toContain("Test");
  });
  it("numeric hpMax adds to the maximum (Tough) and a formula can use level", () => {
    expect(derive({ modifiers: [{ target: "hpMax", value: 5 }] }).hp.max).toBe(48);
    expect(derive({ modifiers: [{ target: "hpMax", value: "level * 2" }] }).hp.max).toBe(53);
  });
  it("hpMax half applies to the boosted maximum", () => {
    expect(derive({ modifiers: [{ target: "hpMax", value: 5 }, { target: "hpMax", value: "half" }] }).hp.max).toBe(24);
  });
  it("numeric carry adds and double doubles", () => {
    expect(derive({ modifiers: [{ target: "carry", value: 30 }] }).carry.capacity).toBe(240);
    expect(derive({ modifiers: [{ target: "carry", value: "double" }] }).carry.capacity).toBe(420);
  });
  it("a formula that cannot be worked out is skipped and reported, not crashed on", () => {
    const a = derive({ modifiers: [{ target: "ac", value: "nothing_here + 1" }] });
    expect(a.ac.value).toBe(19);
    expect(a.progress.problems.join(" ")).toContain("unknown name nothing_here");
  });
  it("toggle_ names are available to formulas", () => {
    const a = derive({ active: { rage: true }, modifiers: [{ target: "ac", value: "toggle_rage * 2" }] });
    expect(a.ac.value).toBe(21);
  });
  it("the validator accepts formulas and double on carry only, and keeps rejecting nonsense", () => {
    const e: string[] = [];
    const ok = validateEffects({ modifiers: [{ target: "hpMax", value: "level * 2" }, { target: "carry", value: "double" }] }, "effects", e);
    expect(e).toEqual([]); expect(ok.modifiers).toHaveLength(2);
    const e2: string[] = [];
    validateEffects({ modifiers: [{ target: "ac", value: "double" }, { target: "ac", value: "x" }, { target: "ac", value: 1, on: "flying" }] }, "effects", e2);
    expect(e2).toEqual(["effects.modifiers[0].value: double only works on carry", "effects.modifiers[1].value: must be a number, half, zero, double or a formula", "effects.modifiers[2].on: unknown roll tag flying"]);
  });
});

describe("modifiers scoped with on", () => {
  const bow = (r: Registry) => r.add("vault", "item", { name: "Test bow", kind: "weapon", weapon: { dmg: "1d8", type: "piercing", ab: "dex", range: "ranged", props: ["thrown"] } }, { path: "b.md" });
  const both = [{ id: "test-bow", equipped: true }, { id: "warhammer", equipped: true }];
  it("applies an attack bonus only to ranged attacks (Archery)", () => {
    const r = reg(); bow(r);
    const a = deriveCharacter(char({ inventory: both, modifiers: [{ target: "attack", value: 2, on: "attack:ranged" }] }), { registry: r });
    const base = deriveCharacter(char({ inventory: both }), { registry: r });
    const toHit = (s: typeof a, n: string) => s.attacks.find(x => x.name === n)!.toHit;
    expect(toHit(a, "Test bow")).toBe(toHit(base, "Test bow")! + 2); expect(toHit(a, "Warhammer")).toBe(toHit(base, "Warhammer"));
  });
  it("+ joins tags with AND: a damage bonus for melee Strength attacks only", () => {
    const r = reg(); bow(r);
    const a = deriveCharacter(char({ inventory: both, modifiers: [{ target: "damage", value: 2, on: "attack:melee+str" }] }), { registry: r });
    expect(a.attacks.find(x => x.name === "Warhammer")!.damage).toBe("1d8+4 bludgeoning");
    expect(a.attacks.find(x => x.name === "Test bow")!.damage).toBe("1d8 piercing");
  });
  it("weapon:<tag> aims at a weapon property or id", () => {
    const r = reg(); bow(r);
    const inv = [{ id: "test-bow", equipped: true }];
    const a = deriveCharacter(char({ inventory: inv, modifiers: [{ target: "attack", value: 1, on: "weapon:thrown" }, { target: "damage", value: 1, on: "weapon:test-bow" }] }), { registry: r });
    const b = deriveCharacter(char({ inventory: inv }), { registry: r });
    expect(a.attacks[0].toHit).toBe(b.attacks[0].toHit! + 1); expect(a.attacks[0].damage).toBe("1d8+1 piercing");
  });
  it("a save modifier scoped to one ability moves only that save", () => {
    const a = derive({ modifiers: [{ target: "save", value: 2, on: "save:dex" }] }), b = derive();
    expect(a.saves.dex.mod).toBe(b.saves.dex.mod + 2); expect(a.saves.wis.mod).toBe(b.saves.wis.mod);
  });
  it("a skill modifier scoped to one skill", () => {
    const a = derive({ modifiers: [{ target: "check", value: 3, on: "skill:stealth" }] }), b = derive();
    expect(a.skills.find(k => k.id === "stealth")!.mod).toBe(b.skills.find(k => k.id === "stealth")!.mod + 3);
    expect(a.skills.find(k => k.id === "arcana")!.mod).toBe(b.skills.find(k => k.id === "arcana")!.mod);
  });
});

describe("check modifiers reach raw checks and initiative so the number and the roll agree", () => {
  it("checks carry the modifier, initiative gets it once, a scope limits it", () => {
    const base = derive();
    const a = derive({ modifiers: [{ target: "check", value: 5 }] });
    expect(a.checks.str).toBe(base.checks.str + 5); expect(a.initiative).toBe(base.initiative + 5);
    const b = derive({ modifiers: [{ target: "check", value: 5, on: "check:str" }] });
    expect(b.checks.str).toBe(base.checks.str + 5); expect(b.checks.dex).toBe(base.checks.dex); expect(b.initiative).toBe(base.initiative);
    const list = collectEffects(char({ modifiers: [{ target: "check", value: 1, on: "check:dex" }] }), { registry: reg() });
    expect(sumModifier(list, "check", { t: { kind: "initiative", abil: "dex" } }).add).toBe(1);
  });
  it("without a modifier checks equal the ability modifier", () => {
    const a = derive(); expect(a.checks).toEqual(a.mods);
  });
});

describe("passive targets", () => {
  it("a passive modifier raises passive perception only (Observant)", () => {
    const base = derive();
    const a = derive({ modifiers: [{ target: "passive", value: 5, on: "passive:perception" }] });
    expect(a.passivePerception).toBe(base.passivePerception + 5); expect(a.passives.perception).toBe(base.passives.perception + 5);
    expect(a.passives.insight).toBe(base.passives.insight); expect(a.passives.investigation).toBe(base.passives.investigation);
  });
});

describe("roll tags", () => {
  it("accepts + joins, weapon, passive and concentration tags", () => {
    for (const t of ["attack:melee+str", "weapon:thrown", "passive:perception", "concentration", "attack:weapon", "save:con"]) expect(validRollTarget(t)).toBe(true);
    for (const t of ["passive:flying", "attack:melee+nope", "weapon:Bad Tag", "concentration:x"]) expect(validRollTarget(t)).toBe(false);
  });
  it("adv / dis use + joins too", () => {
    const list = [{ source: "Reckless", effects: { adv: ["attack:melee+str"] } }];
    expect(rollSources(list, { kind: "attack", abil: "str", range: "melee" }).adv).toEqual(["Reckless"]);
    expect(rollSources(list, { kind: "attack", abil: "dex", range: "melee" }).adv).toEqual([]);
    expect(rollSources(list, { kind: "attack", abil: "str", range: "ranged" }).adv).toEqual([]);
  });
  it("concentration saves are matched by concentration and by save:con", () => {
    const list = [{ source: "War Caster", effects: { adv: ["concentration"] } }, { source: "Resilient", effects: { adv: ["save:con"] } }];
    expect(rollSources(list, { kind: "save", abil: "con", concentration: true }).adv).toEqual(["War Caster", "Resilient"]);
    expect(rollSources(list, { kind: "save", abil: "con" }).adv).toEqual(["Resilient"]);
  });
});
