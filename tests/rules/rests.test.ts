import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { seeded } from "../../src/core/dice";
import { activeRests } from "../../src/rules";
import { spendHitDie, type RestCtx } from "../../src/rules/module";
import { thalia } from "../fixtures/notes";
import { homebrewRegistry } from "../fixtures/homebrew";

const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
r.add("vault", "item", { name: "Dawn wand", kind: "wondrous", charges: { max: 7, reset: "dawn" } }, { path: "w.md" });
const char = (o: object = {}): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
const ctx = (c: Character, rules: Record<string, boolean> = { "rest-standard": true }): RestCtx => ({ c, stats: deriveCharacter(c, { registry: r }), registry: r, rules });
const rest = (id: string, rules: Record<string, boolean>) => activeRests(rules).find(x => x.id === id)!;

describe("standard rests", () => {
  it("short rest resets short resources only", () => {
    const c = char({ resources: [{ name: "Channel Divinity", max: 1, used: 1, reset: "short" }, { name: "Rage", max: 3, used: 2, reset: "long" }] });
    const out = rest("short", { "rest-standard": true }).apply(ctx(c));
    expect(out.value.resources.map(x => x.used)).toEqual([0, 2]); expect(out.summary).toEqual(["Channel Divinity recharges"]);
  });
  it("long rest: exhaustion first, then full HP; half hit dice back; slots; dawn charges", () => {
    const c = char({ conditions: { exhaustion: 4 }, hp: { max: 43, current: 10, temp: 4 }, hitDice: { d8: { used: 5 } }, deathSaves: { successes: 1, failures: 2 },
      inventory: [{ id: "dawn-wand", charges: { used: 5 } }] });
    const L = rest("long", { "rest-standard": true });
    expect(L.preview(ctx(c))).toEqual(["Exhaustion 4 -> 3", "HP to 43", "All spell slots", "Regain 2 Hit Dice", "Dawn wand: charges restored"]);
    const v = L.apply(ctx(c)).value;
    expect(v.conditions.exhaustion).toBe(3); expect(v.hp).toEqual({ max: 43, current: 43, temp: 0 }); expect(v.hitDice.d8.used).toBe(3);
    expect(v.deathSaves).toEqual({ successes: 0, failures: 0 }); expect(v.spellSlots).toEqual({}); expect(v.inventory[0].charges).toEqual({ used: 0 });
  });
  it("holy days keep dawn charges spent through a long rest", () => {
    const c = char({ inventory: [{ id: "dawn-wand", charges: { used: 5 } }] });
    const v = rest("long", { "rest-standard": true }).apply(ctx(c, { "rest-standard": true, "holy-days": true })).value;
    expect(v.inventory[0].charges).toEqual({ used: 5 });
  });
  it("spending a hit die heals die + CON (min 1) and marks it used", () => {
    const c = char({ hp: { max: 43, current: 20, temp: 0 }, hitDice: { d8: { used: 0 } } });
    const out = spendHitDie(ctx(c), "d8", seeded(3));
    expect(out.value.hitDice.d8.used).toBe(1);
    expect(out.value.hp.current).toBe(20 + Math.max(1, out.roll!.dice[0] + 3));
    const none = spendHitDie(ctx(char({ hitDice: { d8: { used: 5 } } })), "d8");
    expect(none.error).toBe("No d8 Hit Dice left");
  });
});

describe("excursion rests", () => {
  const ex = { "rest-excursion": true };
  it("night's rest counts nights and recharges short features", () => {
    const c = char({ rest: { nightsInPlace: 0 }, resources: [{ name: "Channel Divinity", max: 1, used: 1, reset: "short" }], hp: { max: 43, current: 10, temp: 0 } });
    const out = rest("night", ex).apply(ctx(c, ex), { samePlace: true });
    expect(out.value.rest.nightsInPlace).toBe(1); expect(out.value.resources[0].used).toBe(0); expect(out.value.hp.current).toBe(10);
  });
  it("moving camp resets the count to 1", () => {
    const out = rest("night", ex).apply(ctx(char({ rest: { nightsInPlace: 2 } }), ex), { samePlace: false });
    expect(out.value.rest.nightsInPlace).toBe(1);
  });
  it("third night in place becomes a good rest", () => {
    const c = char({ rest: { nightsInPlace: 2 }, hp: { max: 43, current: 5, temp: 0 }, hitDice: { d8: { used: 5 } }, conditions: { exhaustion: 2 } });
    const n = rest("night", ex);
    expect(n.preview(ctx(c, ex), { samePlace: true })[0]).toBe("Good Rest (3 nights in place)");
    const v = n.apply(ctx(c, ex), { samePlace: true }).value;
    expect(v.hp.current).toBe(43); expect(v.hitDice.d8.used).toBe(0); expect(v.conditions.exhaustion).toBe(1); expect(v.rest.nightsInPlace).toBe(0);
  });
  it("a safe haven makes any night a good rest", () => {
    const v = rest("night", ex).apply(ctx(char({ rest: { nightsInPlace: 0 }, hp: { max: 43, current: 5, temp: 0 } }), ex), { samePlace: false, safeHaven: true }).value;
    expect(v.hp.current).toBe(43);
  });
});

describe("rests and resources derived from class operations", () => {
  const hb = homebrewRegistry();
  const skirm = (o: object = {}, reg = hb): Character => {
    const p = parseNote({ ...thalia, race: undefined, background: undefined, classes: [{ class: "skirmisher", subclass: "scholar", level: 6 }], levelLog: [], resources: [], ...o });
    if (p.kind !== "character") throw new Error(); void reg; return p.value;
  };
  const mk = (c: Character, reg = hb): RestCtx => ({ c, stats: deriveCharacter(c, { registry: reg }), registry: reg, rules: { "rest-standard": true } });
  it("a short rest clears short-reset resources and leaves the long ones", () => {
    const c = skirm({ uses: { plans: 5, focus: 2 } });                    // Plans: long, Focus: short with refill 1 (max 3)
    const S = rest("short", { "rest-standard": true });
    expect(S.preview(mk(c))).toEqual(["Focus recharges", "Spend Hit Dice to heal"]);
    expect(S.apply(mk(c)).value.uses).toEqual({ plans: 5 });
  });
  it("a refill with oncePer long regains uses on a short rest the first time only, and a long rest re-arms it", () => {
    const hb2 = homebrewRegistry([{ type: "5e-class", name: "Planner", hitDie: 8, levels: { 1: [{ op: "resource", name: "Contingency", max: 3, reset: "long", refill: { on: "short", amount: 1, oncePer: "long" } }] } }]);
    const c = skirm({ classes: [{ class: "planner", level: 1 }], uses: { contingency: 3 } });
    const S = rest("short", { "rest-standard": true }), L = rest("long", { "rest-standard": true });
    const once = S.apply(mk(c, hb2));
    expect(once.value.uses).toEqual({ contingency: 2 }); expect(once.value.choices).toEqual({ "refill.contingency": true }); expect(once.summary).toEqual(["Contingency: regain 1"]);
    const twice = S.apply(mk(once.value, hb2));
    expect(twice.value.uses).toEqual({ contingency: 2 }); expect(twice.summary).toEqual([]);
    const long = L.apply(mk(twice.value, hb2)).value;
    expect(long.uses).toEqual({}); expect(long.choices).toEqual({});
  });
  it("a long rest clears long and short derived resources and says so", () => {
    const c = skirm({ uses: { plans: 5, focus: 2, stale: 1 } });
    const L = rest("long", { "rest-standard": true });
    expect(L.preview(mk(c))).toEqual(expect.arrayContaining(["Plans recharges", "Focus recharges"]));
    expect(L.apply(mk(c)).value.uses).toEqual({ stale: 1 });
  });
});
