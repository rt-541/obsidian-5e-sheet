import { newCharacter, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { abilityPickKey } from "../../src/core/ability-increase";
import { buildCharacter, buildSteps, newDraft, type BuildDraft } from "../../src/core/builder";
import { applyLevel, featOptions, planLevel, planResolve, undoLevel, type LevelPlan, type Step } from "../../src/core/levelup";
import { progress } from "../../src/core/progression";
import { featCategoryWords } from "../../src/core/words";
import { homebrewRegistry } from "../fixtures/homebrew";

const feat = (name: string, extra: object = {}) => ({ type: "5e-feat", name, grants: [], ...extra });
const feats = [
  feat("Keen", { category: "general", grants: [{ op: "grant", items: ["rope"] }, { op: "feature", name: "Keen Eye", effects: {} }] }),
  feat("Snag", { category: "general", minLevel: 4 }),
  feat("Hush", { category: "origin" }),
  feat("Nova", { category: "epic-boon", minLevel: 19 }),
  feat("Lore", { category: "origin", abilityPick: { from: ["int", "wis", "cha"], patterns: [[1]] } }),
  feat("Plain"),
];
const vigil = { type: "5e-class", name: "Vigil", hitDie: 8, levels: {
  1: [{ op: "feature", name: "Watch" }], 2: [{ op: "asi", feats: ["general"] }], 3: [{ op: "feat", feat: "keen" }],
  4: [{ op: "feat", categories: ["general", "origin"] }], 5: [{ op: "asi" }], 6: [{ op: "feat", feat: "lore" }], 7: [{ op: "feat", categories: ["origin"] }] } };
const squire = { type: "5e-class", name: "Squire", hitDie: 8, levels: { 1: [{ op: "feat", categories: ["general"] }] } };
const drifter = { type: "5e-background", name: "Drifter", grants: [{ op: "feat", feat: "hush" }] };
const wanderer = { type: "5e-background", name: "Wanderer", grants: [{ op: "feat", categories: ["origin"] }] };
const scholar = { type: "5e-background", name: "Scholar", grants: [{ op: "feat", feat: "lore" }] };
const plainRace = { type: "5e-race", name: "Plain Folk", grants: [] };
const reg = homebrewRegistry([...feats, vigil, squire, drifter, wanderer, scholar, plainRace]);

const base = (o: Partial<Character> = {}): Character => ({ ...newCharacter("Tester"), abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 8 }, ...o });
const at = (n: number, o: Partial<Character> = {}) => base({ classes: [{ class: "vigil", level: n }], ...o });
const plan = (c: Character, cls: string, choices: Record<string, unknown> = {}) => { const p = planLevel(c, cls, reg, choices); if ("error" in p) throw new Error(p.error); return p as LevelPlan; };
const lvl = (c: Character, cls: string, choices: Record<string, unknown> = {}) => applyLevel(c, { class: cls }, { hp: { method: "average" }, choices }, reg, seeded(3));
const ok = (r: ReturnType<typeof lvl>) => { if ("error" in r) throw new Error(r.error); return r; };
const err = (r: ReturnType<typeof lvl>) => { if (!("error" in r)) throw new Error("expected an error"); return r.error; };
const undo = (c: Character) => { const r = undoLevel(c, reg); if ("error" in r) throw new Error(r.error); return r; };
const stepOf = <K extends Step["kind"]>(p: LevelPlan, key: string) => p.steps.find(s => s.key === key) as Extract<Step, { kind: K }>;
const ids = (o: { id: string }[]) => o.map(x => x.id);

describe("featOptions", () => {
  it("offers only the listed categories, and every feat when none are listed", () => {
    expect(ids(featOptions(reg, ["general"], base(), 4)).sort()).toEqual(["keen", "snag"]);
    const wide = ids(featOptions(reg, ["general"], base(), 4, true));
    expect(wide).toEqual(expect.arrayContaining(["keen", "plain", "snag"])); expect(wide).not.toContain("hush");
    expect(ids(featOptions(reg, ["origin", "epic-boon"], base(), 19)).sort()).toEqual(["hush", "lore", "nova"]);
    expect(ids(featOptions(reg, undefined, base(), 1))).toEqual(expect.arrayContaining(["hush", "keen", "lore", "nova", "plain", "snag"]));
  });
  it("disables a feat below its level and one the character already has", () => {
    const low = featOptions(reg, ["general"], base(), 3);
    expect(low.find(o => o.id === "snag")!.disabled).toBe("Needs level 4"); expect(low.find(o => o.id === "keen")!.disabled).toBeUndefined();
    expect(featOptions(reg, ["general"], base(), 4).find(o => o.id === "snag")!.disabled).toBeUndefined();
    expect(featOptions(reg, ["general"], base({ feats: ["keen"] }), 4).find(o => o.id === "keen")!.disabled).toBe("Already have");
    expect(featOptions(reg, ["epic-boon"], base(), 19)[0].disabled).toBeUndefined();
  });
  it("words categories plainly", () => {
    expect(featCategoryWords(["general"])).toBe("general");
    expect(featCategoryWords(["general", "origin", "epic-boon"])).toBe("general, origin or epic boon");
  });
});

describe("an asi slot with a feats list", () => {
  it("carries the categories and offers only those feats, level gate shown", () => {
    const s = stepOf<"asi">(plan(at(1), "vigil"), "class:vigil:2:asi-0");
    expect(s.feats).toEqual(["general"]);
    expect(ids(s.featOptions)).toEqual(expect.arrayContaining(["keen", "plain", "snag"])); expect(ids(s.featOptions)).not.toContain("hush");
    expect(s.featOptions.find(o => o.id === "snag")!.disabled).toBe("Needs level 4");
  });
  it("refuses a feat of another category or below its level, and takes one that fits", () => {
    const pick = (f: string) => lvl(at(1), "vigil", { "class:vigil:2:asi-0": { feat: f } });
    expect(err(pick("hush"))).toMatch(/not offered/);
    expect(err(pick("snag"))).toMatch(/not available \(needs level 4\)/);
    expect(ok(pick("keen")).value.feats).toEqual(["keen"]);
  });
  it("keeps a feat with no category takeable, while a feat op with categories stays strict", () => {
    expect(ok(lvl(at(1), "vigil", { "class:vigil:2:asi-0": { feat: "plain" } })).value.feats).toEqual(["plain"]);
    expect(ids(stepOf<"feat">(plan(at(3, { feats: ["keen"] }), "vigil"), "class:vigil:4:feat-0").options)).not.toContain("plain");
    expect(err(lvl(at(3, { feats: ["keen"] }), "vigil", { "class:vigil:4:feat-0": "plain" }))).toMatch(/pick one of the listed feats/);
  });
  it("without a feats list it still accepts any feat, with or without a category", () => {
    const s = stepOf<"asi">(plan(at(4), "vigil"), "class:vigil:5:asi-0");
    expect(s.feats).toBeUndefined();
    expect(ids(s.featOptions)).toContain("plain");
    const c = ok(lvl(at(4), "vigil", { "class:vigil:5:asi-0": { feat: "plain" } })).value;
    expect(c.feats).toEqual(["plain"]);
    expect(ok(lvl(at(4), "vigil", { "class:vigil:5:asi-0": { feat: "hush" } })).value.feats).toEqual(["hush"]);
  });
});

describe("a fixed feat op", () => {
  it("adds the feat when the level is applied, records it under +feats, and undo removes it with its items", () => {
    const before = at(2);
    const r = ok(lvl(before, "vigil"));
    expect(r.value.feats).toEqual(["keen"]);
    expect(r.entry.choices["+feats"]).toEqual(["keen"]);
    expect(r.value.inventory.map(i => i.id)).toContain("rope");
    expect(r.summary.join("\n")).toContain("Feat: Keen");
    const u = undo(r.value).value;
    expect(u.feats).toEqual([]); expect(u.inventory.map(i => i.id)).not.toContain("rope"); expect(u.classes[0].level).toBe(2);
  });
  it("does not add it twice when the character already has it", () => {
    const r = ok(lvl(at(2, { feats: ["keen"] }), "vigil"));
    expect(r.value.feats).toEqual(["keen"]); expect(r.entry.choices["+feats"]).toBeUndefined();
  });
  it("a background's fixed feat is granted live and by the builder", () => {
    const live = progress(base({ background: "drifter" }), reg);
    expect(live.grantedFeats).toEqual([{ id: "hush", key: "background:drifter:feat-0", source: "Background: Drifter", fixed: true }]);
    expect(live.unknown).toEqual([]);
    const d: BuildDraft = { ...newDraft(), name: "Ada", race: "plain-folk", background: "drifter", classId: "squire", choices: { "class:squire:1:feat-0": "keen" } };
    const b = buildCharacter(d, reg); if ("error" in b) throw new Error(b.error);
    expect(b.value.feats).toEqual(["hush", "keen"]);
  });
  it("an unknown fixed feat is reported, not fatal", () => {
    const r2 = homebrewRegistry([{ type: "5e-background", name: "Odd", grants: [{ op: "feat", feat: "nope" }] }]);
    expect(progress(base({ background: "odd" }), r2).unknown).toContain("feat:nope");
  });
});

describe("a categories feat op", () => {
  it("asks a feat step with the categories, and the answer adds the feat and undoes", () => {
    const c0 = at(3, { feats: ["keen"] });
    const s = stepOf<"feat">(plan(c0, "vigil"), "class:vigil:4:feat-0");
    expect(s.kind).toBe("feat"); expect(s.categories).toEqual(["general", "origin"]);
    expect(ids(s.options).sort()).toEqual(["hush", "keen", "lore", "snag"]);
    expect(s.options.find(o => o.id === "keen")!.disabled).toBe("Already have");
    expect(s.label).toBe("Choose one general or origin feat");
    expect(stepOf<"feat">(plan(at(6), "vigil"), "class:vigil:7:feat-0").label).toBe("Choose one origin feat");
    const r = ok(lvl(c0, "vigil", { "class:vigil:4:feat-0": "hush" }));
    expect(r.value.feats).toEqual(["keen", "hush"]); expect(r.entry.choices["+feats"]).toEqual(["hush"]); expect(r.entry.choices["class:vigil:4:feat-0"]).toBe("hush");
    expect(progress(r.value, reg).pending.filter(p => p.key.includes("feat-0"))).toEqual([]);
    expect(undo(r.value).value.feats).toEqual(["keen"]);
  });
  it("needs an answer, and respects the category, the level gate and a feat already held", () => {
    const c0 = at(3, { feats: ["keen"] });
    expect(err(lvl(c0, "vigil"))).toMatch(/still needs an answer/);
    expect(err(lvl(c0, "vigil", { "class:vigil:4:feat-0": "nova" }))).toMatch(/pick one of the listed feats/);
    expect(err(lvl(c0, "vigil", { "class:vigil:4:feat-0": "keen" }))).toMatch(/not available \(already have\)/);
    expect(err(lvl(c0, "vigil", { "class:vigil:4:feat-0": 7 }))).toMatch(/pick one of the listed feats/);
    const sq = stepOf<"feat">(plan(base(), "squire"), "class:squire:1:feat-0");
    expect(sq.options.find(o => o.id === "snag")!.disabled).toBe("Needs level 4");
    expect(err(lvl(base(), "squire", { "class:squire:1:feat-0": "snag" }))).toMatch(/not available \(needs level 4\)/);
  });
  it("the same feat cannot fill two slots of one level", () => {
    const twice = homebrewRegistry([...feats, { type: "5e-class", name: "Twin", hitDie: 8, levels: { 1: [{ op: "feat", categories: ["general"] }, { op: "feat", categories: ["general"] }] } }]);
    const r = applyLevel(base(), { class: "twin" }, { choices: { "class:twin:1:feat-0": "keen", "class:twin:1:feat-1": "keen" } }, twice);
    expect("error" in r && r.error).toMatch(/already taken|already chosen/);
  });
});

describe("a feat's own ability pick", () => {
  const pat = { pattern: 0, to: ["wis"] };
  it("is asked as a pattern step when a fixed class feat is taken, and recorded for undo", () => {
    const c0 = at(5), s = stepOf<"pattern">(plan(c0, "vigil"), abilityPickKey("feat", "lore"));
    expect(s).toMatchObject({ kind: "pattern", from: ["int", "wis", "cha"], patterns: [[1]] });
    expect(err(lvl(c0, "vigil"))).toMatch(/still needs an answer/);
    const r = ok(lvl(c0, "vigil", { "feat:lore:pick": pat }));
    expect(r.value.feats).toEqual(["lore"]); expect(r.value.abilities.wis).toBe(13);
    expect(r.entry.choices["feat:lore:pick"]).toMatchObject({ pattern: 0, to: ["wis"], abilities: { wis: 1 } });
    const u = undo(r.value).value;
    expect(u.feats).toEqual([]); expect(u.abilities.wis).toBe(12);
  });
  it("is asked when the feat is picked from a categories op", () => {
    const c0 = at(6, { feats: ["lore"] }), none = plan(c0, "vigil").steps.map(s => s.key);
    expect(none).toEqual(["hp", "class:vigil:7:feat-0"]);
    const p = plan(c0, "vigil", { "class:vigil:7:feat-0": "hush" });
    expect(p.steps.map(s => s.key)).toEqual(["hp", "class:vigil:7:feat-0"]);
    const two = homebrewRegistry([...feats, { type: "5e-class", name: "Vigil", hitDie: 8, levels: { 1: [{ op: "feat", categories: ["origin"] }] } }]);
    const q = planLevel(base(), "vigil", two, { "class:vigil:1:feat-0": "lore" }); if ("error" in q) throw new Error(q.error);
    expect(q.steps.map(s => s.key)).toEqual(["hp", "class:vigil:1:feat-0", "feat:lore:pick"]);
  });
  it("stops at 20 and the recorded amount is what applied", () => {
    const r = ok(lvl(at(5, { abilities: { ...base().abilities, wis: 20 } }), "vigil", { "feat:lore:pick": pat }));
    expect(r.value.abilities.wis).toBe(20);
    expect(undo(r.value).value.abilities.wis).toBe(20);
  });
  it("the builder asks a background's feat pick, adds the points, and does not finish until answered", () => {
    const d: BuildDraft = { ...newDraft(), name: "Ada", race: "plain-folk", background: "scholar", classId: "squire", choices: { "class:squire:1:feat-0": "keen" } };
    const st = buildSteps(d, reg).origin.find(s => s.key === "feat:lore:pick") as Extract<Step, { kind: "pattern" }>;
    expect(st).toMatchObject({ kind: "pattern", source: "Feat: Lore", scores: d.scores });
    expect(buildCharacter(d, reg)).toEqual({ error: expect.stringContaining("still needs an answer") });
    const done = buildCharacter({ ...d, choices: { ...d.choices, "feat:lore:pick": { pattern: 0, to: ["int"] } } }, reg); if ("error" in done) throw new Error(done.error);
    expect(done.value.feats).toEqual(["lore", "keen"]); expect(done.value.abilities.int).toBe(d.scores.int + 1);
    expect(done.summary.join("\n")).toMatch(/Ability scores from .*feat.*\+1 INT/);
  });
});

describe("a feat op whose feat raises an ability", () => {
  const sturdy = feat("Sturdy", { category: "origin", ability: [{ con: 1 }] });
  const r2 = homebrewRegistry([sturdy, { type: "5e-class", name: "Vigil", hitDie: 8, levels: { 1: [{ op: "feat", feat: "sturdy" }, { op: "feat", categories: ["origin"] }] } }]);
  it("adds the points, records them for undo, and undo takes them back", () => {
    const r = applyLevel(base(), { class: "vigil" }, { choices: { "class:vigil:1:feat-1": "sturdy" } }, r2);
    expect("error" in r && r.error).toMatch(/not available \(already have\)/);
    const r3 = homebrewRegistry([sturdy, feat("Calm", { category: "origin", ability: [{ wis: 1 }] }), { type: "5e-class", name: "Vigil", hitDie: 8, levels: { 1: [{ op: "feat", feat: "sturdy" }, { op: "feat", categories: ["origin"] }] } }]);
    const ok3 = applyLevel(base(), { class: "vigil" }, { choices: { "class:vigil:1:feat-1": "calm" } }, r3); if ("error" in ok3) throw new Error(ok3.error);
    expect(ok3.value.feats).toEqual(["sturdy", "calm"]); expect(ok3.value.abilities).toMatchObject({ con: 15, wis: 13 });
    expect(ok3.entry.choices["+feat-abilities"]).toEqual({ abilities: { con: 1, wis: 1 } });
    const u = undoLevel(ok3.value, r3); if ("error" in u) throw new Error(u.error);
    expect(u.value.abilities).toEqual(base().abilities); expect(u.value.feats).toEqual([]);
  });
});

describe("a background that asks for a feat", () => {
  const d: BuildDraft = { ...newDraft(), name: "Ada", race: "plain-folk", background: "wanderer", classId: "squire", choices: { "class:squire:1:feat-0": "keen" } };
  it("the builder asks it as a feat step in the origin steps", () => {
    const s = buildSteps(d, reg).origin.find(x => x.kind === "feat") as Extract<Step, { kind: "feat" }>;
    expect(s.key).toBe("background:wanderer:feat-0"); expect(ids(s.options).sort()).toEqual(["hush", "lore"]);
    expect(buildCharacter(d, reg)).toEqual({ error: expect.stringContaining("still needs an answer") });
  });
  it("an origin feat that needs level 1 is open to a character with no class yet", () => {
    const r2 = homebrewRegistry([feat("Dawn", { category: "origin", minLevel: 1 }), wanderer, plainRace, squire, ...feats]);
    const s = buildSteps(d, r2).origin.find(x => x.kind === "feat") as Extract<Step, { kind: "feat" }>;
    expect(s.options.find(o => o.id === "dawn")!.disabled).toBeUndefined();
  });
  it("the answer becomes a feat of the new character", () => {
    const b = buildCharacter({ ...d, choices: { ...d.choices, "background:wanderer:feat-0": "hush" } }, reg); if ("error" in b) throw new Error(b.error);
    expect(b.value.feats).toEqual(["hush", "keen"]); expect(b.value.choices["background:wanderer:feat-0"]).toBe("hush");
    expect(planResolve(b.value, reg)).toEqual([]);
  });
  it("a feat outside the categories is refused", () => {
    expect("error" in buildCharacter({ ...d, choices: { ...d.choices, "background:wanderer:feat-0": "keen" } }, reg)).toBe(true);
  });
});
