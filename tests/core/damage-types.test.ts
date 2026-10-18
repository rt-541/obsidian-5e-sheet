import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter, deriveCompanion } from "../../src/core/derive";
import { apply, type Action } from "../../src/core/actions";
import { thalia } from "../fixtures/notes";

const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
r.add("vault", "item", { name: "Fire ward", kind: "wondrous", effects: { resist: ["fire"] } }, { path: "a.md" });
r.add("vault", "item", { name: "Cold charm", kind: "wondrous", effects: { vulnerable: ["cold"], immune: ["poison"] } }, { path: "b.md" });
r.add("vault", "item", { name: "Mind knot", kind: "wondrous", effects: { resist: ["cold"], vulnerable: ["cold"] } }, { path: "c.md" });
r.add("vault", "item", { name: "Nonmagical shell", kind: "wondrous", effects: { resist: ["bludgeoning, piercing, and slashing from nonmagical attacks"] } }, { path: "d.md" });
r.add("vault", "item", { name: "Steady heart", kind: "wondrous", effects: { conditionImmune: ["poisoned"] } }, { path: "e.md" });

const char = (o: object = {}): Character => { const p = parseNote({ ...thalia, conditions: {}, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
const wearing = (...ids: string[]) => ids.map(id => ({ id, equipped: true }));
const hit = (c: Character, a: Action) => {
  const ctx = { registry: r }, lim = { self: deriveCharacter(c, ctx), companions: c.companions.map(x => deriveCompanion(x, ctx)), chargesMax: () => 3, ctx, derive: (v: Character) => deriveCharacter(v, ctx) };
  return apply(c, a, lim);
};
const dmg = (c: Character, amount: number, damageType?: string) => hit(c, { type: "damage", amount, ...(damageType ? { damageType } : {}) });
// Thalia starts at 31 of 43 HP

describe("damage types", () => {
  it("with no type nothing changes", () => {
    const out = dmg(char({ inventory: wearing("fire-ward") }), 10);
    expect(out.value.hp.current).toBe(21); expect(out.note).toBeUndefined();
  });
  it("resistance halves, rounding down, and the note says why", () => {
    const out = dmg(char({ inventory: wearing("fire-ward") }), 11, "fire");
    expect(out.value.hp.current).toBe(26);
    expect(out.note).toBe("Fire damage: 11 is halved to 5 (resistance from Fire ward).");
  });
  it("a different type is unaffected", () => {
    const out = dmg(char({ inventory: wearing("fire-ward") }), 10, "cold");
    expect(out.value.hp.current).toBe(21); expect(out.note).toBeUndefined();
  });
  it("immunity takes no damage", () => {
    const out = dmg(char({ inventory: wearing("cold-charm") }), 10, "poison");
    expect(out.value.hp.current).toBe(31); expect(out.note).toBe("Poison damage: 10 becomes 0 (immune, from Cold charm).");
  });
  it("vulnerability doubles", () => {
    const out = dmg(char({ inventory: wearing("cold-charm") }), 6, "cold");
    expect(out.value.hp.current).toBe(19); expect(out.note).toBe("Cold damage: 6 is doubled to 12 (vulnerable, from Cold charm).");
  });
  it("resistance and vulnerability together halve and then double", () => {
    const out = dmg(char({ inventory: wearing("mind-knot") }), 11, "cold");
    expect(out.value.hp.current).toBe(21); expect(out.note).toBe("Cold damage: 11 is halved to 5, then doubled to 10 (resistance and vulnerability from Mind knot).");
  });
  it("a long resistance line still matches the type it names", () => {
    expect(dmg(char({ inventory: wearing("nonmagical-shell") }), 10, "slashing").value.hp.current).toBe(26);
  });
  it("temporary hit points soak up the adjusted damage", () => {
    const out = dmg(char({ inventory: wearing("fire-ward"), hp: { max: 43, current: 31, temp: 4 } }), 10, "fire");
    expect(out.value.hp).toEqual({ max: 43, current: 30, temp: 0 });
  });
  it("a companion's own resistances count", () => {
    r.add("vault", "creature", { name: "Ember hound", size: "Medium", type: "beast", ac: 12, hp: { average: 20, dice: "3d8+6" }, speed: { walk: 40 }, abilities: { str: 12, dex: 12, con: 12, int: 3, wis: 10, cha: 5 }, effects: { resist: ["fire"] } }, { path: "h.md" });
    const c = char({ companions: [{ creature: "ember-hound", name: "Ash", kind: "companion" }] });
    const out = hit(c, { type: "damage", amount: 10, damageType: "fire", who: { companion: 0 } });
    expect(out.value.companions[0].hp.current).toBe(15);
  });
});

describe("dropping to 0 hit points", () => {
  it("adds Unconscious and says what to do", () => {
    const out = dmg(char(), 40);
    expect(out.value.hp.current).toBe(0); expect(out.value.conditions.unconscious).toBe(1);
  });
  it("does not add it while hit points remain", () => {
    expect(dmg(char(), 30).value.conditions.unconscious).toBeUndefined();
  });
  it("healing from 0 takes Unconscious off again and clears death saves", () => {
    const down = dmg(char(), 40).value;
    const up = hit(down, { type: "heal", amount: 5 }).value;
    expect(up.conditions.unconscious).toBeUndefined(); expect(up.hp.current).toBe(5);
  });
  it("healing a character who was knocked out another way keeps their own conditions", () => {
    const c = char({ hp: { max: 43, current: 0, temp: 0 }, conditions: { poisoned: 1 } });
    expect(hit(c, { type: "heal", amount: 5 }).value.conditions).toEqual({ poisoned: 1 });
  });
  it("damage when already at 0 does not add a second reason to roll", () => {
    const c = char({ hp: { max: 43, current: 0, temp: 0 }, concentration: "bless" });
    expect(dmg(c, 5).concentrationCheck).toBeUndefined();
  });
});

describe("concentration prompt", () => {
  const conc = (o: object = {}) => char({ concentration: "bless", ...o });
  it("damage while concentrating asks for a Constitution save, DC 10 or half the damage", () => {
    expect(dmg(conc(), 8).concentrationCheck).toEqual({ dc: 10, spell: "bless" });
    expect(dmg(conc(), 30).concentrationCheck).toEqual({ dc: 15, spell: "bless" });
    expect(dmg(conc(), 8).value.concentration).toBe("bless");                       // the player rolls; nothing ends on its own
  });
  it("dropping to 0 also asks, because the character stops concentrating if they fail", () => {
    const out = dmg(conc(), 40);
    expect(out.value.hp.current).toBe(0); expect(out.concentrationCheck).toEqual({ dc: 20, spell: "bless" });
  });
  it("no prompt when not concentrating, when no damage got through, or for healing", () => {
    expect(dmg(char(), 8).concentrationCheck).toBeUndefined();
    expect(dmg(conc({ inventory: wearing("cold-charm") }), 8, "poison").concentrationCheck).toBeUndefined();
    expect(hit(conc(), { type: "heal", amount: 3 }).concentrationCheck).toBeUndefined();
  });
  it("a resisted hit sets the DC from the damage actually taken", () => {
    expect(dmg(conc({ inventory: wearing("fire-ward") }), 50, "fire").concentrationCheck).toEqual({ dc: 12, spell: "bless" });
  });
});

describe("condition immunities", () => {
  it("refuse the condition and say why", () => {
    const c = char({ inventory: wearing("steady-heart") });
    const out = hit(c, { type: "condition", id: "poisoned", level: 1 });
    expect(out.error).toBe("Can't be poisoned: Steady heart protects against it.");
    expect(out.value.conditions.poisoned).toBeUndefined();
  });
  it("other conditions still go on, and removing one is always allowed", () => {
    const c = char({ inventory: wearing("steady-heart") });
    expect(hit(c, { type: "condition", id: "blinded", level: 1 }).value.conditions.blinded).toBe(1);
    const stuck = char({ inventory: wearing("steady-heart"), conditions: { poisoned: 1 } });
    expect(hit(stuck, { type: "condition", id: "poisoned", level: 0 }).value.conditions.poisoned).toBeUndefined();
  });
  it("a character without the protection can be poisoned", () => {
    expect(hit(char(), { type: "condition", id: "poisoned", level: 1 }).value.conditions.poisoned).toBe(1);
  });
});
