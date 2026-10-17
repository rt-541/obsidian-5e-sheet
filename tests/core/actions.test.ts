import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter, deriveCompanion } from "../../src/core/derive";
import { apply, applyNpc, type Action } from "../../src/core/actions";
import { thalia, maren } from "../fixtures/notes";
import { homebrewRegistry } from "../fixtures/homebrew";
import { deriveNpc } from "../../src/core/derive";

const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
const base = (): Character => { const p = parseNote(thalia); if (p.kind !== "character") throw new Error(); return p.value; };
const run = (c: Character, ...as: Action[]) => as.reduce((acc, a) => {
  const ctx = { registry: r }, lim = { self: deriveCharacter(acc.value, ctx), companions: acc.value.companions.map(x => deriveCompanion(x, ctx)), chargesMax: () => 3 };
  const out = apply(acc.value, a, lim); return { value: out.value, error: out.error ?? acc.error };
}, { value: c, error: undefined as string | undefined });

describe("apply", () => {
  it("does not mutate the input", () => { const c = base(); run(c, { type: "damage", amount: 5 }); expect(c.hp.current).toBe(31); });
  it("damage uses temp first and floors at 0", () => {
    expect(run(base(), { type: "temp", amount: 8 }, { type: "damage", amount: 5 }).value.hp).toEqual({ max: 43, current: 31, temp: 3 });
    expect(run(base(), { type: "damage", amount: 500 }).value.hp.current).toBe(0);
  });
  it("ten rapid damage taps all land", () => {
    const taps = Array.from({ length: 10 }, () => ({ type: "damage", amount: 1 }) as Action);
    expect(run(base(), ...taps).value.hp.current).toBe(21);
  });
  it("heal caps at max, and at the halved max under exhaustion 4", () => {
    expect(run(base(), { type: "heal", amount: 100 }).value.hp.current).toBe(43);
    expect(run(base(), { type: "condition", id: "exhaustion", level: 4 }, { type: "heal", amount: 100 }).value.hp.current).toBe(21);
  });
  it("healing from 0 clears death saves", () => {
    const v = run(base(), { type: "damage", amount: 100 }, { type: "deathSave", which: "failures", value: 2 }, { type: "heal", amount: 3 }).value;
    expect(v.deathSaves).toEqual({ successes: 0, failures: 0 }); expect(v.hp.current).toBe(3);
  });
  it("temp hp does not stack", () => expect(run(base(), { type: "temp", amount: 5 }, { type: "temp", amount: 3 }).value.hp.temp).toBe(5));
  it("counters clamp", () => {
    const v = run(base(), { type: "slot", level: "1", used: 9 }, { type: "slot", level: "3", used: -2 }, { type: "hitDie", die: "d8", used: 99 }, { type: "deathSave", which: "failures", value: 7 }).value;
    expect(v.spellSlots["1"].used).toBe(4); expect(v.spellSlots["3"].used).toBe(0); expect(v.hitDice.d8.used).toBe(5); expect(v.deathSaves.failures).toBe(3);
  });
  it("exhaustion clamps at 6, level 0 removes", () => {
    expect(run(base(), { type: "condition", id: "exhaustion", level: 9 }).value.conditions.exhaustion).toBe(6);
    expect(run(base(), { type: "condition", id: "poisoned", level: 0 }).value.conditions).toEqual({});
    expect(run(base(), { type: "condition", id: "prone", level: 3 }).value.conditions.prone).toBe(1);
  });
  it("fourth attunement is refused", () => {
    let c = base();
    c.inventory.push({ id: "cloak-of-protection", qty: 1, equipped: false, attuned: false }, { id: "a", qty: 1, equipped: false, attuned: false }, { id: "b", qty: 1, equipped: false, attuned: false });
    const out = run(c, { type: "attune", index: 5, on: true }, { type: "attune", index: 6, on: true }, { type: "attune", index: 7, on: true });
    expect(out.error).toBe("Already attuned to 3 items"); expect(out.value.inventory.filter(e => e.attuned)).toHaveLength(3);
  });
  it("attune equips, unequip un-attunes", () => {
    let v = run(base(), { type: "attune", index: 3, on: false }).value; expect(v.inventory[3].attuned).toBe(false);
    v = run(base(), { type: "equip", index: 3, on: false }).value; expect(v.inventory[3]).toMatchObject({ equipped: false, attuned: false });
    v.inventory[3].attuned = false; v = run(v, { type: "attune", index: 3, on: true }).value; expect(v.inventory[3]).toMatchObject({ equipped: true, attuned: true });
  });
  it("companions take damage and conditions separately", () => {
    const v = run(base(), { type: "addCompanion", creature: "wolf", name: "Ash", kind: "companion" }, { type: "damage", amount: 4, who: { companion: 1 } }, { type: "condition", id: "prone", level: 1, who: { companion: 1 } }).value;
    expect(v.companions[1]).toMatchObject({ name: "Ash", hp: { current: 7, temp: 0 }, conditions: { prone: 1 } }); expect(v.hp.current).toBe(31);
  });
  it("unknown companion creature cannot be damaged", () => {
    const out = run(base(), { type: "addCompanion", creature: "nope", name: "X", kind: "summon" }, { type: "damage", amount: 1, who: { companion: 1 } });
    expect(out.error).toBe("Unknown creature");
  });
  it("ability scores clamp", () => expect(run(base(), { type: "ability", abil: "str", value: 99 }).value.abilities.str).toBe(30));
  it("add and remove items", () => {
    const v = run(base(), { type: "addItem", id: "potion-of-healing" }, { type: "removeItem", index: 0 }).value;
    expect(v.inventory[0].id).toBe("shield"); expect(v.inventory.at(-1)).toEqual({ id: "potion-of-healing", qty: 1, equipped: false, attuned: false });
  });
});

describe("applyNpc", () => {
  it("damage and heal", () => {
    const p = parseNote(maren); if (p.kind !== "npc") throw new Error();
    const st = deriveNpc(p.value, { registry: r })!;
    expect(applyNpc(p.value, { type: "damage", amount: 5 }, st).value.hp.current).toBe(7);
    expect(applyNpc(p.value, { type: "slot", level: "1", used: 1 }, st).error).toBe("Not available for NPCs");
  });
});

describe("leveling actions", () => {
  const hb = homebrewRegistry();
  const skirm = (o: object = {}): Character => {
    const p = parseNote({ ...thalia, race: undefined, background: undefined, classes: [{ class: "skirmisher", subclass: "scholar", level: 6 }], levelLog: [], ...o });
    if (p.kind !== "character") throw new Error(); return p.value;
  };
  const go = (c: Character, a: Action) => apply(c, a, { self: deriveCharacter(c, { registry: hb }), companions: [], chargesMax: () => 0 });
  it("uses sets a derived resource's used count, clamped to its max, and drops the key at zero", () => {
    const c = skirm();
    expect(go(c, { type: "uses", id: "plans", used: 3 }).value.uses).toEqual({ plans: 3 });
    expect(go(c, { type: "uses", id: "plans", used: 99 }).value.uses).toEqual({ plans: 9 });
    expect(go(skirm({ uses: { plans: 3 } }), { type: "uses", id: "plans", used: 0 }).value.uses).toEqual({});
    expect(go(c, { type: "uses", id: "nope", used: 1 }).error).toBe("Unknown resource");
    expect(go(c, { type: "uses", id: "manual:0", used: 1 }).error).toBe("Unknown resource");
  });
  it("xp is a whole number from zero", () => {
    expect(go(skirm(), { type: "xp", value: 12345.6 }).value.xp).toBe(12346);
    expect(go(skirm(), { type: "xp", value: -4 }).value.xp).toBe(0);
  });
  it("dcAlt switches a class DC to its alternate ability and back, only if it has one", () => {
    const on = go(skirm(), { type: "dcAlt", id: "analysis", on: true });
    expect(on.value.choices).toEqual({ "dc.analysis.alt": true });
    expect(go(on.value, { type: "dcAlt", id: "analysis", on: false }).value.choices).toEqual({});
    expect(go(skirm(), { type: "dcAlt", id: "nope", on: true }).error).toMatch(/no alternate ability/);
  });
});
