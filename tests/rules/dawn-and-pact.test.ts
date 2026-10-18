import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { activeRests } from "../../src/rules";
import type { RestCtx } from "../../src/rules/module";
import { thalia } from "../fixtures/notes";
import { homebrewRegistry } from "../fixtures/homebrew";

const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
r.add("vault", "item", { name: "Dawn wand", kind: "wondrous", charges: { max: 7, reset: "dawn" } }, { path: "w.md" });
const char = (o: object = {}): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
const ctx = (c: Character, rules: Record<string, boolean> = { "rest-standard": true }, reg: Registry = r): RestCtx => ({ c, stats: deriveCharacter(c, { registry: reg }), registry: reg, rules });
const rest = (id: string, rules: Record<string, boolean>) => activeRests(rules).find(x => x.id === id)!;
const STD = { "rest-standard": true };

describe("Warlock pact slots on a short rest", () => {
  const lock = (o: object = {}) => char({ race: undefined, background: undefined, classes: [{ class: "warlock", level: 3 }], spellSlots: { pact: { used: 2 } }, ...o });
  it("the SRD warlock has pact slots to spend", () => {
    expect(deriveCharacter(lock(), { registry: r }).slots.find(s => s.level === "pact")).toMatchObject({ max: 2, used: 2 });
  });
  it("a short rest gives the pact slots back and says so in words", () => {
    const S = rest("short", STD), c = lock();
    expect(S.preview(ctx(c))).toContain("Pact Magic spell slots return");
    const out = S.apply(ctx(c));
    expect(out.value.spellSlots.pact).toBeUndefined(); expect(out.summary).toContain("Pact Magic spell slots return");
  });
  it("other spell slots stay spent on a short rest", () => {
    const c = lock({ spellSlots: { pact: { used: 1 }, "1": { used: 1 } } });
    expect(rest("short", STD).apply(ctx(c)).value.spellSlots).toEqual({ "1": { used: 1 } });
  });
  it("nothing to report when the pact slots are full", () => {
    expect(rest("short", STD).preview(ctx(lock({ spellSlots: {} })))).not.toContain("Pact Magic spell slots return");
  });
  it("a night's rest that is not a good rest also returns them", () => {
    const ex = { "rest-excursion": true };
    expect(rest("night", ex).apply(ctx(lock(), ex), { samePlace: false }).value.spellSlots.pact).toBeUndefined();
  });
});

describe("dawn resources", () => {
  const withDawn = (o: object = {}) => char({ resources: [{ name: "Sunlit ward", max: 3, used: 2, reset: "dawn" }, { name: "Rage", max: 3, used: 2, reset: "long" }],
    inventory: [{ id: "dawn-wand", charges: { used: 5 } }], ...o });
  it("a long rest restores dawn resources while the holy-days rule is off", () => {
    const L = rest("long", STD), c = withDawn();
    expect(L.preview(ctx(c))).toContain("Sunlit ward recharges");
    const v = L.apply(ctx(c)).value;
    expect(v.resources.map(x => x.used)).toEqual([0, 0]); expect(v.inventory[0].charges).toEqual({ used: 0 });
  });
  it("with holy days on, a long rest leaves dawn resources and charges alone", () => {
    const rules = { ...STD, "holy-days": true }, c = withDawn();
    expect(rest("long", rules).preview(ctx(c, rules))).not.toContain("Sunlit ward recharges");
    const v = rest("long", rules).apply(ctx(c, rules)).value;
    expect(v.resources.map(x => x.used)).toEqual([0 + 2, 0]); expect(v.inventory[0].charges).toEqual({ used: 5 });
  });
  it("with holy days on there is a holy-day dawn rest that restores only the dawn things", () => {
    const rules = { ...STD, "holy-days": true }, c = withDawn({ hp: { max: 43, current: 10, temp: 0 } });
    expect(activeRests(rules).map(x => x.id)).toEqual(["short", "long", "holy-day"]);
    expect(activeRests(STD).map(x => x.id)).toEqual(["short", "long"]);
    const H = rest("holy-day", rules);
    expect(H.preview(ctx(c, rules))).toEqual(["Sunlit ward recharges", "Dawn wand: charges restored"]);
    const out = H.apply(ctx(c, rules));
    expect(out.value.resources.map(x => x.used)).toEqual([0, 2]); expect(out.value.inventory[0].charges).toEqual({ used: 0 });
    expect(out.value.hp.current).toBe(10);
  });
  it("dawn resources derived from a class come back too", () => {
    const hb = homebrewRegistry([{ type: "5e-class", name: "Dawnkeeper", hitDie: 8, levels: { 1: [{ op: "resource", name: "Morning light", max: 2, reset: "dawn" }] } }]);
    const c = char({ race: undefined, background: undefined, classes: [{ class: "dawnkeeper", level: 1 }], levelLog: [], resources: [], inventory: [], uses: { "morning-light": 2 } });
    expect(rest("long", STD).apply(ctx(c, STD, hb)).value.uses).toEqual({});
    const rules = { ...STD, "holy-days": true };
    expect(rest("long", rules).apply(ctx(c, rules, hb)).value.uses).toEqual({ "morning-light": 2 });
    expect(rest("holy-day", rules).apply(ctx(c, rules, hb)).value.uses).toEqual({});
  });
});
