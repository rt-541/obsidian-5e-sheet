import { describe, expect, it } from "vitest";
import { seeded } from "../../src/core/dice";
import { newCharacter, type Character } from "../../src/core/character";
import { applyLevel, masteryOptions, planLevel, planResolve, type LevelPlan, type Step } from "../../src/core/levelup";
import { progress } from "../../src/core/progression";
import { editionRegistry } from "../fixtures/editions";

type Pick = Extract<Step, { kind: "pick" }>;
async function reg() {
  const { r } = await editionRegistry();
  const put = (type: string, raw: Record<string, unknown>, edition?: "2014" | "2024") => { const p = r.add("vault", type, raw, { path: `${type}-${String(raw.name)}${edition ?? ""}.md`, ...(edition ? { edition } : {}) }); if (p) throw new Error(JSON.stringify(p)); };
  put("mastery", { name: "Snag", rules: "Invented." }, "2024");
  put("class", { name: "Striker", hitDie: 8, levels: { 1: [{ op: "choose", what: "mastery", count: 2 }] } }, "2024");
  put("item", { name: "Pin-blade", kind: "weapon", attunement: false, weight: 1, weapon: { dmg: "1d4", type: "piercing", ab: "str", range: "melee", mastery: "snag" } }, "2024");
  put("class", { name: "Idler", hitDie: 8, levels: { 1: [{ op: "choose", what: "mastery", count: 1, from: ["no-such-blade"] }] } }, "2024");
  return r;
}
const base = (edition: "2014" | "2024"): Character => ({ ...newCharacter("Tester"), edition, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 8 } } as Character);
const plan = (c: Character, cls: string, r: Awaited<ReturnType<typeof reg>>, choices: Record<string, unknown> = {}) => { const p = planLevel(c, cls, r.forEdition(c.edition as "2014"), choices); if ("error" in p) throw new Error(p.error); return p as LevelPlan; };

describe("a mastery pick of a brought-in class", () => {
  it("lists the class's own edition weapons, qualified, and accepts them", async () => {
    const r = await reg(), c = base("2014"), p = plan(c, "striker@2024", r);
    const s = p.steps.find(x => x.kind === "pick" && x.what === "mastery") as Pick;
    expect(s.count).toBe(2);
    expect(s.options.map(o => o.id)).toEqual(expect.arrayContaining(["tin-blade@2024", "pin-blade@2024"]));
    const done = applyLevel(c, { class: "striker@2024" }, { hp: { method: "average" }, choices: { [s.key]: ["tin-blade@2024", "pin-blade@2024"] } }, r.forEdition("2014"), seeded(2));
    if ("error" in done) throw new Error(done.error);
    expect(done.value.mastery).toEqual(["tin-blade@2024", "pin-blade@2024"]);
    expect(progress(done.value, r.forEdition("2014")).pending.filter(x => x.op.op === "choose")).toEqual([]);
    expect(planResolve(done.value, r.forEdition("2014"))).toEqual([]);
  });
  it("marks an already mastered qualified weapon and still lists the own-edition ones of an own class", async () => {
    const r = await reg(), c = { ...base("2014"), mastery: ["tin-blade@2024"] };
    const s = plan(c, "striker@2024", r).steps.find(x => x.kind === "pick" && x.what === "mastery") as Pick;
    expect(s.options.find(o => o.id === "tin-blade@2024")!.disabled).toBeTruthy();
    expect(masteryOptions(r.forEdition("2014"), c).map(o => o.id)).not.toContain("pin-blade@2024");
  });
  it("a pick with nothing at all to choose from does not block and is not owed", async () => {
    const r = await reg(), c = base("2014"), p = plan(c, "idler@2024", r);
    expect(p.steps.some(x => x.kind === "pick")).toBe(false);
    const done = applyLevel(c, { class: "idler@2024" }, { hp: { method: "average" }, choices: {} }, r.forEdition("2014"), seeded(2));
    expect("error" in done).toBe(false);
    if (!("error" in done)) { expect(progress(done.value, r.forEdition("2014")).pending).toEqual([]); expect(planResolve(done.value, r.forEdition("2014"))).toEqual([]); }
  });
});

import { buildCharacter, buildSteps, draftProblems, newDraft } from "../../src/core/builder";
describe("the builder with a brought-in mastery class", () => {
  it("asks for the class's own edition weapons and builds with them; a class with nothing to pick builds as is", async () => {
    const r = (await reg()).forEdition("2014"), d = { ...newDraft(), name: "Pip", edition: "2014" as const, race: "fenling", classId: "striker@2024", method: "standard-array" as const, scores: { str: 8, dex: 15, con: 13, int: 14, wis: 10, cha: 12 }, bonus: {}, choices: {} as Record<string, unknown> };
    const s = buildSteps(d, r).level.find(x => x.kind === "pick" && x.what === "mastery") as Pick;
    expect(s.options.map(o => o.id)).toContain("tin-blade@2024");
    const built = buildCharacter({ ...d, choices: { [s.key]: ["tin-blade@2024", "pin-blade@2024"] } }, r, seeded(3));
    if ("error" in built) throw new Error(built.error);
    expect(built.value.mastery).toEqual(["tin-blade@2024", "pin-blade@2024"]);
    const idle = { ...d, classId: "idler@2024" };
    expect(buildSteps(idle, r).level.some(x => x.kind === "pick")).toBe(false);
    expect(draftProblems(idle, r).filter(m => /weapon|master|pick/i.test(m))).toEqual([]);
  });
});

describe("a brought-in subclass reading its parent class's option list", () => {
  it("falls back to the subclass's own edition's class when the character's class lacks the list", async () => {
    const { r } = await editionRegistry();
    const put = (type: string, raw: Record<string, unknown>, edition: "2014" | "2024") => { const p = r.add("vault", type, raw, { path: `${type}-${String(raw.name)}${edition}.md`, edition }); if (p) throw new Error(JSON.stringify(p)); };
    put("class", { name: "Tender", hitDie: 8, options: { gifts: [{ id: "calm", name: "Calm", text: "Invented." }, { id: "hush", name: "Hush", text: "Invented." }] }, levels: { 1: [{ op: "feature", name: "Mind", text: "Invented." }] } }, "2014");
    put("class", { name: "Tender", hitDie: 8, levels: { 1: [{ op: "feature", name: "Mind", text: "Invented." }] } }, "2024");
    put("subclass", { name: "Dusk", class: "tender", levels: { 1: [{ op: "choose", what: "option", list: "gifts", count: 1 }] } }, "2014");
    const c: Character = { ...base("2024"), classes: [{ class: "tender", subclass: "dusk@2014", level: 1 }] };
    const pr = progress(c, r.forEdition("2024"));
    expect(pr.problems.filter(m => /options list/.test(m))).toEqual([]);
    expect(pr.pending.some(x => x.op.op === "choose")).toBe(true);
    const step = planResolve(c, r.forEdition("2024")).find(x => x.kind === "pick") as Pick;
    expect(step.options.map(o => o.id)).toEqual(["calm", "hush"]);
  });
});
