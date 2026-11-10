import { describe, expect, it } from "vitest";
import { seeded } from "../../src/core/dice";
import { newCharacter, writeInto, type Character } from "../../src/core/character";
import { applyLevel, planLevel, undoLevel, type LevelAnswers, type LevelPlan } from "../../src/core/levelup";
import { homebrewRegistry } from "../fixtures/homebrew";

const blade = (name: string, mastery?: string) => ({ type: "5e-item", name, kind: "weapon", attunement: false, weight: 2, weapon: { dmg: "1d6", type: "slashing", ab: "str", range: "melee", ...(mastery ? { mastery } : {}) } });
const maker = { type: "5e-class", name: "Maker", hitDie: 8, levels: {
  1: [{ op: "choose", what: "mastery", count: 2 }],
  2: [{ op: "choose", what: "mastery", count: 1, from: ["tin-blade", "ghost-blade", "plain-blade"] }],
  3: [{ op: "choose", what: "mastery", count: 1 }] } };
const plainClass = { type: "5e-class", name: "Plainer", hitDie: 8, levels: { 1: [{ op: "feature", name: "Calm" }] } };
const reg = homebrewRegistry([maker, plainClass, { type: "5e-mastery", name: "Snag" },
  blade("Tin Blade", "snag"), blade("Pewter Blade", "snag"), blade("Brass Blade", "hush"), blade("Plain Blade"),
  { ...blade("Glint Blade", "snag"), rarity: "rare" }, { ...blade("Spark Blade", "snag"), weapon: { ...blade("x", "snag").weapon, bonus: 1 } }]);
const seed = seeded(3);
const base = (): Character => ({ ...newCharacter("Tester"), abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 8 } });
const lvl = (c: Character, cls: string, choices: Record<string, unknown> = {}) => {
  const r = applyLevel(c, { class: cls }, { hp: { method: "average" } as LevelAnswers["hp"], choices }, reg, seed);
  if ("error" in r) throw new Error(r.error); return r;
};
const plan = (c: Character, cls: string) => { const p = planLevel(c, cls, reg); if ("error" in p) throw new Error(p.error); return p as LevelPlan; };
const K1 = "class:maker:1:choose-0", K2 = "class:maker:2:choose-0", K3 = "class:maker:3:choose-0";
const step = (p: LevelPlan, key: string) => p.steps.find(s => s.key === key) as Extract<LevelPlan["steps"][number], { kind: "pick" }>;

describe("weapon mastery picks", () => {
  it("the level-up asks for N weapons, lists only weapons with a mastery, and records them", () => {
    const p = plan(base(), "maker"), s = step(p, K1);
    expect(s).toMatchObject({ kind: "pick", what: "mastery", count: 2, free: false });
    const ids = s.options.map(o => o.id);
    expect(ids).toEqual(expect.arrayContaining(["tin-blade", "pewter-blade", "brass-blade"]));
    expect(ids).not.toContain("plain-blade");
    expect(s.options.find(o => o.id === "tin-blade")).toMatchObject({ name: "Tin Blade", text: "Snag" });
    expect(s.options.find(o => o.id === "brass-blade")!.text).toBe("Hush");   // no note for the property: its id, capitalised
    const r = lvl(base(), "maker", { [K1]: ["tin-blade", "pewter-blade"] });
    expect(r.value.mastery).toEqual(["tin-blade", "pewter-blade"]);
    expect(r.entry.choices[K1]).toEqual(["tin-blade", "pewter-blade"]);
    expect(r.summary.join("\n")).toMatch(/Mastery: Tin Blade, Pewter Blade/);
  });
  it("without from, offers only ordinary weapons sorted by name; from stays as listed", () => {
    const ids = step(plan(base(), "maker"), K1).options.map(o => o.id);
    expect(ids).not.toContain("glint-blade"); expect(ids).not.toContain("spark-blade");
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(ids).toContain("tin-blade");
  });
  it("needs exactly N picks of listed weapons", () => {
    const go = (v: unknown) => applyLevel(base(), { class: "maker" }, { hp: { method: "average" }, choices: { [K1]: v } }, reg, seed);
    expect(go(["tin-blade"])).toHaveProperty("error");
    expect(go(["tin-blade", "plain-blade"])).toHaveProperty("error");
    expect(go(["tin-blade", "tin-blade"])).toHaveProperty("error");
  });
  it("from limits the options; a missing id is skipped and a weapon without a mastery is not special", () => {
    const c1 = lvl(base(), "maker", { [K1]: ["tin-blade", "pewter-blade"] }).value;
    const s = step(plan(c1, "maker"), K2);
    expect(s.options).toHaveLength(2);
    expect(s.options.map(o => o.id)).not.toContain("ghost-blade");
    expect(s.options.map(o => o.id)).toEqual(expect.arrayContaining(["tin-blade", "plain-blade"]));
    expect(s.options.find(o => o.id === "tin-blade")!.disabled).toBeTruthy();   // already mastered
  });
  it("two ops at different levels add up and undo removes only the last ones", () => {
    let c = lvl(base(), "maker", { [K1]: ["tin-blade", "pewter-blade"] }).value;
    c = lvl(c, "maker", { [K2]: ["plain-blade"] }).value;
    expect(c.mastery).toEqual(["tin-blade", "pewter-blade", "plain-blade"]);
    c = lvl(c, "maker", { [K3]: ["brass-blade"] }).value;
    expect(c.mastery).toEqual(["tin-blade", "pewter-blade", "plain-blade", "brass-blade"]);
    const u = undoLevel(c, reg); if ("error" in u) throw new Error(u.error);
    expect(u.value.mastery).toEqual(["tin-blade", "pewter-blade", "plain-blade"]);
    const u2 = undoLevel(u.value, reg); if ("error" in u2) throw new Error(u2.error);
    expect(u2.value.mastery).toEqual(["tin-blade", "pewter-blade"]);
    const u3 = undoLevel(u2.value, reg); if ("error" in u3) throw new Error(u3.error);
    expect(u3.value.mastery ?? []).toEqual([]);
    expect(u3.value.mastery).toBeUndefined();
  });
  it("writeInto removes mastery from a note that had it when the value has none", () => {
    const fm: Record<string, unknown> = { type: "5e-character", name: "A", mastery: ["tin-blade"] };
    writeInto(fm, { ...base(), mastery: undefined });
    expect(fm).not.toHaveProperty("mastery");
  });
  it("a note without mastery loads and levels as before", () => {
    const c = lvl(base(), "plainer").value;
    expect(c.mastery).toBeUndefined();
    const fm: Record<string, unknown> = {}; writeInto(fm, c);
    expect(fm).not.toHaveProperty("mastery");
    expect(plan(base(), "plainer").steps.map(s => s.key)).toEqual(["hp"]);
  });
});
