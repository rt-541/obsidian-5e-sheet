import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import type { ClassData } from "../../src/content/types";
import { homebrewRegistry, skirmisher, scholar, skink } from "../fixtures/homebrew";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };
const cls = (levels: unknown, more: object = {}) => ({ name: "Test", hitDie: 8, saves: ["str"], levels, ...more });
const probs = (type: string, raw: Record<string, unknown>) => { const r = reg(); const p = r.add("vault", type, raw, { path: "t.md" }); return p?.errors ?? []; };

describe("operations validate", () => {
  it("the homebrew fixtures use every op type and load cleanly", () => {
    const r = homebrewRegistry();
    expect(r.problems()).toEqual([]);
    const used = new Set(Object.values(r.get<ClassData>("class", "skirmisher")!.data.levels!).flat().map(o => o.op));
    expect([...used].sort()).toEqual(["asi", "choose", "dc", "effect", "feature", "grant", "modify", "resource", "scale", "spellcasting", "spells", "subclass"]);
    expect(r.get("subclass", "scholar")).toBeTruthy(); expect(r.get("race", "skink")).toBeTruthy();
    expect(r.get("subrace", "cave-skink")).toBeTruthy(); expect(r.get("background", "cartographer")).toBeTruthy(); expect(r.get("feat", "tough-mind")).toBeTruthy();
  });
  it("op ids default to <op>-<index> and levels are numbers", () => {
    const d = homebrewRegistry().get<ClassData>("class", "skirmisher")!.data;
    expect(d.levels![1].map(o => o.id)).toEqual(["grant-0", "quick-wits", "scale-2", "scale-3", "resource-4", "dc-5", "stance"]);
    expect(d.options!.stances).toHaveLength(3);
    expect(d.options!.stances[0].id).toBe("duelist");
  });
  it("unknown op, junk formula, level 25 and bad ids are problems, never a crash", () => {
    expect(probs("class", cls({ 1: [{ op: "teleport" }] })).join()).toMatch(/unknown op "teleport"/);
    expect(probs("class", cls({ 1: [{ op: "resource", name: "X", max: "level +" }] })).join()).toMatch(/max/);
    expect(probs("class", cls({ 1: [{ op: "resource", name: "X", max: "process.exit(1)" }] })).join()).toMatch(/max/);
    expect(probs("class", cls({ 25: [{ op: "asi" }] })).join()).toMatch(/level must be a whole number from 1 to 20/);
    expect(probs("class", cls({ 1: [{ op: "asi", id: "Bad Id" }] })).join()).toMatch(/id/);
    expect(probs("class", cls({ 1: [{ op: "asi", id: "a" }, { op: "feature", id: "a", name: "x" }] })).join()).toMatch(/duplicate op id/);
    expect(probs("class", cls({ 1: "no" })).join()).toMatch(/list of ops/);
    expect(probs("class", cls([]) ).join()).toMatch(/levels/);
    expect(probs("class", cls({ 1: [7] })).join()).toMatch(/mapping/);
  });
  it("choose cannot ask for more than exists", () => {
    expect(probs("class", cls({ 1: [{ op: "choose", what: "skills", count: 3, from: ["arcana", "history"] }] })).join()).toMatch(/more than the 2/);
    expect(probs("class", cls({ 1: [{ op: "choose", what: "option", list: "nope", count: 1 }] })).join()).toMatch(/no options list called nope/);
    expect(probs("class", cls({ 1: [{ op: "choose", what: "option", list: "l", count: 2 }] }, { options: { l: [{ name: "A" }] } })).join()).toMatch(/more than the 1/);
    expect(probs("class", cls({ 1: [{ op: "choose", what: "skills", count: 1, from: ["juggling"] }] })).join()).toMatch(/unknown skill/);
    expect(probs("class", cls({ 1: [{ op: "choose", what: "wishes", count: 1 }] })).join()).toMatch(/what/);
    expect(probs("class", cls({ 1: [{ op: "choose", what: "skills", count: 0 }] })).join()).toMatch(/count/);
  });
  it("op-specific shape errors", () => {
    expect(probs("class", cls({ 1: [{ op: "scale", name: "S" }] })).join()).toMatch(/either values or formula/);
    expect(probs("class", cls({ 1: [{ op: "scale", name: "S", values: { 0: 1 } }] })).join()).toMatch(/level must be/);
    expect(probs("class", cls({ 1: [{ op: "modify", set: 3 }] })).join()).toMatch(/either resource or scale/);
    expect(probs("class", cls({ 1: [{ op: "dc", name: "D", abil: "luck" }] })).join()).toMatch(/abil/);
    expect(probs("class", cls({ 1: [{ op: "resource", name: "R", max: 1, reset: "weekly" }] })).join()).toMatch(/reset/);
    expect(probs("class", cls({ 1: [{ op: "resource", name: "R", max: 1, refill: { on: "long", amount: 1 } }] })).join()).toMatch(/refill/);
    expect(probs("class", cls({ 1: [{ op: "spells", count: 1 }] })).join()).toMatch(/from/);
    expect(probs("class", cls({ 1: [{ op: "spellcasting", abil: "int", progression: "table" }] })).join()).toMatch(/table/);
    expect(probs("class", cls({ 1: [{ op: "spellcasting", abil: "int", progression: "full", table: {} }] })).join()).toMatch(/only valid/);
    expect(probs("class", cls({ 1: [{ op: "spellcasting", abil: "int", progression: "table", table: { 1: { slots: [1, "x"] } } }] })).join()).toMatch(/slots/);
    expect(probs("class", cls({ 1: [{ op: "feature", name: "F", action: { name: "A", damage: "lots" } }] })).join()).toMatch(/dice/);
    expect(probs("class", cls({ 1: [{ op: "feature", name: "F", action: { name: "A", cost: {} } }] })).join()).toMatch(/cost/);
    expect(probs("class", cls({ 1: [{ op: "feature", name: "F", effects: { acAbility: "x" } }] })).join()).toMatch(/acAbility/);
    expect(probs("class", cls({ 1: [{ op: "grant", speed: -1 }] })).join()).toMatch(/speed/);
  });
  it("class level fields", () => {
    expect(probs("class", { name: "T", hitDie: 1, levels: {} }).join()).toMatch(/hitDie/);
    expect(probs("class", { name: "T", hitDie: 8, saves: ["luck"] }).join()).toMatch(/saves/);
    expect(probs("class", { name: "T", hitDie: 8, gold: "lots" }).join()).toMatch(/gold/);
    expect(probs("class", { name: "T", hitDie: 8, multiclass: { requires: { any: [{ luck: 13 }] } } }).join()).toMatch(/unknown ability/);
    expect(probs("class", { name: "T", hitDie: 8, options: { l: [] } }).join()).toMatch(/non-empty/);
    expect(probs("class", { name: "T", hitDie: 8, gold: "4d4*10", equipment: [["dagger"], ["club"]], subclassLevel: 3 })).toEqual([]);
  });
  it("subclass op only in classes, asi not in grants, option lists in subclasses", () => {
    expect(probs("subclass", { name: "S", class: "c", levels: { 3: [{ op: "subclass" }] } }).join()).toMatch(/only belongs in a class/);
    expect(probs("race", { name: "R", grants: [{ op: "asi" }] }).join()).toMatch(/asi/);
    expect(probs("race", { name: "R", grants: [{ op: "choose", what: "option", list: "x", count: 1 }] }).join()).toMatch(/no options list/);
    expect(probs("subclass", { name: "S", levels: {} }).join()).toMatch(/class/);
    expect(probs("subrace", { name: "S", grants: [] }).join()).toMatch(/race/);
    expect(probs("feat", { name: "F", prerequisite: 3 }).join()).toMatch(/prerequisite/);
  });
  it("a bad vault note becomes a compendium problem and registers nothing", () => {
    const r = reg();
    const p = r.add("vault", "class", { ...skirmisher, levels: { 1: [{ op: "teleport" }] } }, { path: "Bad.md" });
    expect(p!.errors.length).toBeGreaterThan(0);
    expect(r.get("class", "skirmisher")).toBeUndefined();
    expect(r.problems()).toHaveLength(1);
    // the good ones still load
    expect(r.add("vault", "subclass", (({ type: _t, ...x }) => x)(scholar), { path: "S.md" })).toBeNull();
    expect(r.add("vault", "race", (({ type: _t, ...x }) => x)(skink), { path: "R.md" })).toBeNull();
  });
});
