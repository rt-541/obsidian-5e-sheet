import { provenanceLine } from "../../src/content/edition";
import { useOverlayData } from "../../src/content/overlay";
import type { Registry } from "../../src/content/registry";
import { apply, type Action } from "../../src/core/actions";
import { newCharacter, parseNote, writeInto, type Character } from "../../src/core/character";
import { draftProblems, newDraft, originFeats } from "../../src/core/builder";
import { deriveCharacter } from "../../src/core/derive";
import { applyLevel, planLevel, undoLevel, type LevelPlan, type Step } from "../../src/core/levelup";
import { progress } from "../../src/core/progression";
import { spellRows } from "../../src/core/spells";
import { editionRegistry } from "../fixtures/editions";

// Invented two-edition library (tests/fixtures/editions.ts). The characters below are 2024 characters holding things from the 2014 books.
let reg: Registry, reg14: Registry;
beforeAll(async () => {
  const { r } = await editionRegistry(); reg2 = r;
  const add = (type: string, raw: Record<string, unknown>, edition?: "2014" | "2024") => { const p = r.add("vault", type, raw, { path: `${type}-${String(raw.name)}${edition ?? ""}.md`, ...(edition ? { edition } : {}) }); if (p) throw new Error(JSON.stringify(p)); };
  add("mastery", { name: "Snag", rules: "Invented snag text." });
  // A class that only the 2014 books have, with a feat slot at level 2 and a subclass at level 3, and a subclass of it.
  add("class", { name: "Rover", hitDie: 8, saves: ["str", "con"], levels: { 1: [{ op: "feature", name: "Trek", text: "Invented." }], 2: [{ op: "asi" }], 3: [{ op: "subclass" }] } }, "2014");
  add("subclass", { name: "Wake", class: "rover", levels: { 3: [{ op: "feature", name: "Ripple", text: "Invented." }] } }, "2014");
  // A class with no edition that asks for one spell at level 1 and one at level 2.
  add("class", { name: "Chanter", hitDie: 6, levels: { 1: [{ op: "spells", count: 1, from: "wizard" }] } });
  // Things only the 2014 books have, a thing both editions have, a homebrew thing, and brought-in notes whose ops name them.
  add("feat", { name: "Spark", grants: [{ op: "feature", name: "Flicker", text: "Invented." }] }, "2014");
  add("item", { name: "Rope-coil", kind: "gear" }, "2014");
  add("item", { name: "Bell", kind: "gear" }, "2014"); add("item", { name: "Bell", kind: "gear" }, "2024");
  add("item", { name: "Pebble", kind: "gear" });
  const give = [{ op: "feat", feat: "spark" }, { op: "grant", items: ["rope-coil", "bell", "pebble"] }];
  add("class", { name: "Drifter", hitDie: 8, levels: { 1: [{ op: "feature", name: "Roam", text: "Invented." }], 2: give } }, "2014");
  add("class", { name: "Plain", hitDie: 8, levels: { 1: [{ op: "feature", name: "Roam", text: "Invented." }], 2: [{ op: "grant", items: ["bell"] }] } });
  add("background", { name: "Wanderer", grants: [{ op: "feat", feat: "spark" }] }, "2014");
  reg = r.forEdition("2024"); reg14 = r.forEdition("2014");
});
let reg2: Awaited<ReturnType<typeof editionRegistry>>["r"];
const add2 = (type: string, raw: Record<string, unknown>) => { const p = reg2.add("vault", type, raw, { path: `${type}-${String(raw.name)}.md`, edition: "2014" }); if (p) throw new Error(JSON.stringify(p)); };
afterEach(() => useOverlayData(undefined));

const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const note = (o: Record<string, unknown> = {}): Record<string, any> => ({ type: "5e-character", schema: 1, name: "Pip", edition: "2024", abilities: SCORES, hp: { max: 12, current: 12, temp: 0 }, classes: [{ class: "warden", level: 1 }], ...o });
const make = (o: Record<string, unknown> = {}): Character => { const p = parseNote(note(o)); if (p.kind !== "character") throw new Error(JSON.stringify(p)); return p.value; };
const derive = (c: Character, r: Registry = reg) => deriveCharacter(c, { registry: r });
const act = (c: Character, a: Action, r: Registry = reg) => { const ctx = { registry: r }; const out = apply(c, a, { self: deriveCharacter(c, ctx), companions: [], chargesMax: () => 3, ctx, derive: v => deriveCharacter(v, ctx) }); if (out.error) throw new Error(out.error); return out.value; };
const ac = (n: number) => ({ effects: { modifiers: [{ target: "ac", value: n }] } });
const plan = (c: Character, cls: string, choices: Record<string, unknown> = {}, r: Registry = reg): LevelPlan => { const p = planLevel(c, cls, r, choices); if ("error" in p) throw new Error(p.error); return p; };
const stepOf = <K extends Step["kind"]>(p: LevelPlan, kind: K) => p.steps.find(s => s.kind === kind) as Extract<Step, { kind: K }>;
const level = (c: Character, cls: string, choices: Record<string, unknown>, r: Registry = reg) => { const out = applyLevel(c, { class: cls }, { hp: { method: "average" }, choices }, r); if ("error" in out) throw new Error(out.error); return out; };

describe("edition-qualified references on the character", () => {
  it("an old note without qualifiers loads, derives and writes back unchanged", () => {
    const fm = { type: "5e-character", schema: 1, name: "Old", race: "fenling", subrace: "marsh-fenling", classes: [{ class: "warden", subclass: "lantern", level: 2 }], feats: ["keen"],
      abilities: SCORES, hp: { max: 12, current: 12, temp: 0 }, spells: [{ id: "hush", prepared: true }], inventory: [{ id: "tin-blade", qty: 1, equipped: true, attuned: false }],
      mastery: ["tin-blade"], mainPins: ["item:tin-blade"], mainSpells: ["hush"], myOwnKey: "keep me" };
    const parsed = parseNote(structuredClone(fm));
    if (parsed.kind !== "character") throw new Error("parse");
    const st = derive(parsed.value, reg14);
    expect(st.progress.unknown).toEqual([]); expect(st.progress.problems).toEqual([]); expect(st.missing).toEqual([]);
    expect(st.progress.features.map(f => f.name)).toEqual(expect.arrayContaining(["Guard", "Glow", "Hop", "Sink", "Edge"]));
    const out = structuredClone(fm); writeInto(out, parsed.value);
    expect(out).toEqual(fm);
  });

  it("both editions' version of one spell: both rows resolve, each to its own note, with their own source line (Review Focus 3)", () => {
    const c = make({ spells: [{ id: "glint" }, { id: "glint@2014" }] });
    const { own } = spellRows(c, derive(c), { registry: reg });
    expect(own.map(r => r.id)).toEqual(["glint", "glint@2014"]);
    expect(own.every(r => r.known)).toBe(true);
    expect(own[0].level).not.toBe(own[1].level);
    const a = reg.get("spell", "glint")!, b = reg.get("spell", "glint@2014")!;
    expect(a).not.toBe(b);
    expect(provenanceLine(a)).not.toBe(provenanceLine(b));
    expect(provenanceLine(b)).toContain("2014 rules");
    // each prepares, pins and goes away on its own
    let v = act(c, { type: "prepare", index: 1, on: true });
    expect(v.spells.map(s => s.prepared)).toEqual([false, true]);
    v = act(act(v, { type: "pinSpell", key: "glint", on: true }), { type: "pinSpell", key: "glint@2014", on: true });
    v = act(v, { type: "removeSpell", index: 0 });
    expect(v.spells.map(s => s.id)).toEqual(["glint@2014"]); expect(v.mainSpells).toEqual(["glint@2014"]);
  });

  it("a brought-in subclass of the character's class is accepted and keeps its mechanics (Review Focus 2)", () => {
    useOverlayData({ entries: { "subclass:lantern:glow@2014": ac(1), "subclass:lantern:glow@2024": ac(2), "class:warden:guard@2014": ac(4), "class:warden:guard@2024": ac(8) } });
    const base = derive(make());
    const c = make({ classes: [{ class: "warden", level: 1, subclass: "lantern@2014" }] });
    const st = derive(c);
    expect(st.progress.problems).toEqual([]); expect(st.progress.unknown).toEqual([]);
    const glow = st.progress.features.find(f => f.name === "Glow")!;
    expect(glow).toBeDefined(); expect(glow.key).toBe("subclass:lantern@2014:1:lantern-glow");
    expect(st.ac.value - base.ac.value).toBe(1);   // the 2014 subclass entry, not the 2024 one
    // a brought-in class: the 2014 class entry's mechanics, and the plain class the 2024 ones
    expect(derive(make({ classes: [{ class: "warden@2014", level: 1 }] })).ac.value - base.ac.value).toBe(4 - 8);
    // a subclass of another class still does not belong
    const other = derive(make({ classes: [{ class: "lantern-keeper@2014", level: 1, subclass: "lantern@2014" }] }));
    expect(other.progress.problems.join()).toContain("belongs to");
  });

  it("a brought-in feat or race keeps its overlay mechanics", () => {
    useOverlayData({ entries: { "feat::keen-edge@2014": ac(1), "feat::keen-edge@2024": ac(2), "race:fenling:fenling-hop@2014": ac(4), "subrace:marsh-fenling:marsh-fenling-sink@2014": ac(8) } });
    const base = derive(make()).ac.value;
    expect(derive(make({ feats: ["keen"] })).ac.value - base).toBe(2);
    expect(derive(make({ feats: ["keen@2014"] })).ac.value - base).toBe(1);
    const both = derive(make({ feats: ["keen", "keen@2014"] }));
    expect(both.ac.value - base).toBe(3); expect(both.progress.features.filter(f => f.name === "Edge")).toHaveLength(2);
    const fen = derive(make({ race: "fenling@2014", subrace: "marsh-fenling@2014" }));
    expect(fen.progress.problems).toEqual([]); expect(fen.progress.unknown).toEqual([]);
    expect(fen.ac.value - base).toBe(4 + 8);
  });

  it("level-up and undo round-trip with a qualified class and feat", () => {
    const c0 = make({ classes: [{ class: "rover@2014", level: 1 }], feats: ["keen"] });
    // level 2: the feat slot offers the brought-in feat beside the held one, which is not offered again
    const p2 = plan(c0, "rover@2014");
    const asi = stepOf(p2, "asi");
    expect(asi.key).toBe("class:rover@2014:2:" + asi.key.split(":")[3]);
    expect(asi.featOptions.find(o => o.id === "keen")?.disabled).toBe("Already have");
    const r2 = level(c0, "rover@2014", { [asi.key]: { feat: "keen@2014" } });
    expect(r2.value.feats).toEqual(["keen", "keen@2014"]);
    expect(r2.value.classes).toEqual([{ class: "rover@2014", level: 2 }]);
    expect(r2.entry.class).toBe("rover@2014"); expect(Object.keys(r2.entry.choices)[0]).toContain("@");
    expect(planLevel(r2.value, "rover@2014", reg, {})).toHaveProperty("steps");
    // level 3: a subclass of the class, brought in
    const p3 = plan(r2.value, "rover@2014");
    const sub = stepOf(p3, "subclass");
    expect(sub.key).toMatch(/^class:rover@2014:3:/);
    const r3 = level(r2.value, "rover@2014", { [sub.key]: "wake@2014" });
    expect(r3.value.classes[0].subclass).toBe("wake@2014");
    expect(r3.entry.choices["+subclass"]).toBe("wake@2014");
    expect(derive(r3.value).progress.features.map(f => f.name)).toContain("Ripple");
    // and back
    const u3 = undoLevel(r3.value, reg); if ("error" in u3) throw new Error(u3.error);
    expect(u3.value).toEqual(r2.value);
    const u2 = undoLevel(u3.value, reg); if ("error" in u2) throw new Error(u2.error);
    expect(u2.value).toEqual(c0);
    // a subclass of another class is refused
    expect(applyLevel(r2.value, { class: "rover@2014" }, { hp: { method: "average" }, choices: { [sub.key]: "lantern@2014" } }, reg)).toHaveProperty("error");
  });

  it("two rows of one item in different editions equip, attune and remove independently", () => {
    const row = (id: string) => ({ id, qty: 1, equipped: false, attuned: false });
    const c = make({ inventory: [row("tin-blade"), row("tin-blade@2014")], mastery: ["tin-blade"], mainPins: ["item:tin-blade", "item:tin-blade@2014"] });
    expect(derive(c).missing).toEqual([]);
    let v = act(c, { type: "equip", index: 1, on: true });
    expect(v.inventory.map(e => e.equipped)).toEqual([false, true]);
    v = act(v, { type: "equip", index: 0, on: true }); v = act(v, { type: "attune", index: 0, on: true });
    expect(v.inventory.map(e => [e.equipped, e.attuned])).toEqual([[true, true], [true, false]]);
    // mastery of the 2024 weapon shows on the 2024 row only
    const rows = derive(v).attacks.filter(a => a.item !== undefined);
    expect(rows.map(a => [a.item, !!a.mastery])).toEqual([[0, true], [1, false]]);
    const other = derive({ ...v, mastery: ["tin-blade@2014"] }).attacks.filter(a => a.item !== undefined);
    expect(other.map(a => [a.item, !!a.mastery])).toEqual([[0, false], [1, false]]);   // the 2014 weapon names no mastery property
    const gone = act(v, { type: "removeItem", index: 1 });
    expect(gone.inventory.map(e => e.id)).toEqual(["tin-blade"]); expect(gone.inventory[0].equipped && gone.inventory[0].attuned).toBe(true);
    expect(gone.mainPins).toEqual(["item:tin-blade"]);
    const gone0 = act(v, { type: "removeItem", index: 0 });
    expect(gone0.inventory.map(e => e.id)).toEqual(["tin-blade@2014"]); expect(gone0.mainPins).toEqual(["item:tin-blade@2014"]);
    // adding the other edition's version is a second row, adding it again stacks nothing new for gear
    expect(act(make({ inventory: [row("tin-blade")] }), { type: "addItem", id: "tin-blade@2014" }).inventory.map(e => e.id)).toEqual(["tin-blade", "tin-blade@2014"]);
  });

  it("a brought-in spell and the same spell of the character's edition both count as known and neither is offered again", () => {
    const c = make({ classes: [], spells: [{ id: "nova@2024" }, { id: "hush@2014" }, { id: "glint@2014" }] });
    const p = plan(c, "chanter");
    const sp = stepOf(p, "spells");
    expect(sp.options.find(o => o.id === "nova")?.disabled).toBe("Already known");     // `nova@2024` is `nova`
    expect(sp.options.find(o => o.id === "glint")?.disabled).toBeUndefined();          // the 2024 note is another spell than the held 2014 one
    // the held brought-in spell is not offered again, even when asked for by its qualified id
    const bad = applyLevel(c, { class: "chanter" }, { hp: { method: "roll", roll: 3 }, choices: { [sp.key]: ["hush@2014"] } }, reg);
    expect(bad).toMatchObject({ error: expect.stringContaining("already known") });
    const bad2 = applyLevel(c, { class: "chanter" }, { hp: { method: "roll", roll: 3 }, choices: { [sp.key]: ["nova"] } }, reg);
    expect(bad2).toMatchObject({ error: expect.stringContaining("already known") });
    // a spell of the other edition that is not held is accepted, stored qualified, and undone
    const c2 = make({ classes: [], spells: [{ id: "nova" }] });
    const ok = level(c2, "chanter", { [stepOf(plan(c2, "chanter"), "spells").key]: ["hush@2014"] });
    expect(ok.value.spells.map(s => s.id)).toEqual(["nova", "hush@2014"]);
    const un = undoLevel(ok.value, reg); if ("error" in un) throw new Error(un.error);
    expect(un.value.spells.map(s => s.id)).toEqual(["nova"]);
    // and both versions of one spell can be held at level-up
    const c3 = make({ classes: [], spells: [{ id: "glint" }] });
    expect(level(c3, "chanter", { [stepOf(plan(c3, "chanter"), "spells").key]: ["glint@2014"] }).value.spells.map(s => s.id)).toEqual(["glint", "glint@2014"]);
  });

  it("mainPins and uses keyed by a qualified id survive a round trip", () => {
    const fm = note({ classes: [{ class: "warden@2014", level: 1, subclass: "lantern@2014" }], race: "fenling@2014", feats: ["keen@2014"], mastery: ["tin-blade@2014"],
      spells: [{ id: "glint@2014", prepared: true }], inventory: [{ id: "tin-blade@2014", qty: 1, equipped: true, attuned: false }],
      companions: [{ creature: "owl@2014", name: "Hoot", kind: "familiar", hp: { temp: 0 }, conditions: {} }],
      mainPins: ["item:tin-blade@2014", "feature:class:warden@2014:1:warden-guard"], mainSpells: ["glint@2014"], uses: { "lantern@2014": 1 },
      levelLog: [{ class: "warden@2014", level: 1, hp: { method: "first", gained: 8 }, choices: { "class:warden@2014:1:x": ["a"], "+subclass": "lantern@2014" } }] });
    const parsed = parseNote(structuredClone(fm));
    if (parsed.kind !== "character") throw new Error("parse");
    const out = structuredClone(fm); writeInto(out, parsed.value);
    expect(out).toEqual(fm);
    expect(parsed.value.mainPins).toEqual(fm.mainPins); expect(parsed.value.uses).toEqual({ "lantern@2014": 1 });
    // an ordinary derive does not trip over the keys, and the pinned feature resolves
    const st = derive(parsed.value);
    expect(st.progress.features.some(f => f.key === "class:warden@2014:1:warden-guard")).toBe(true);
    // pinning and unpinning use the string as is
    const v = act(act(parsed.value, { type: "pin", ref: "item:tin-blade", on: true }), { type: "pin", ref: "item:tin-blade@2014", on: false });
    expect(v.mainPins).toEqual(["feature:class:warden@2014:1:warden-guard", "item:tin-blade"]);
  });

  it("the builder checks a brought-in subrace against its qualified race", () => {
    const d = { ...newDraft(), name: "Pip", edition: "2024" as const, race: "fenling@2014", subrace: "marsh-fenling@2014", classId: "warden" };
    expect(draftProblems(d, reg).filter(m => m.includes("belongs"))).toEqual([]);
    expect(draftProblems({ ...d, race: "fenling" }, reg).join()).toMatch(/Unknown race|belongs/);
    expect(progress(newCharacter("x"), reg).problems).toEqual([]);
  });

  it("a brought-in class's ops name things in its own edition, and undo removes exactly what was given", () => {
    const c0 = make({ classes: [{ class: "drifter@2014", level: 1 }] });
    const r2 = level(c0, "drifter@2014", {});
    expect(r2.value.feats).toEqual(["spark@2014"]);
    expect(r2.entry.choices["+feats"]).toEqual(["spark@2014"]);
    expect(r2.value.inventory.map(e => e.id)).toEqual(["rope-coil@2014", "bell@2014", "pebble"]);
    expect(r2.entry.choices["+items"]).toEqual(["rope-coil@2014", "bell@2014", "pebble"]);
    const st = derive(r2.value);
    expect(st.progress.features.map(f => f.name)).toContain("Flicker");
    expect(st.progress.grantedFeats.find(g => g.fixed)?.id).toBe("spark@2014");
    const u = undoLevel(r2.value, reg); if ("error" in u) throw new Error(u.error);
    expect(u.value).toEqual(c0);
  });

  it("a brought-in subclass's ops resolve the same way", () => {
    add2("subclass", { name: "Tide", class: "rover", levels: { 3: [{ op: "feat", feat: "spark" }, { op: "grant", items: ["bell"] }] } });
    const c0 = make({ classes: [{ class: "rover@2014", level: 2, subclass: "tide@2014" }] });
    const r3 = level(c0, "rover@2014", {});
    expect(r3.value.feats).toEqual(["spark@2014"]);
    expect(r3.value.inventory.map(e => e.id)).toEqual(["bell@2014"]);
    const u = undoLevel(r3.value, reg); if ("error" in u) throw new Error(u.error);
    expect(u.value).toEqual(c0);
  });

  it("the character's own notes' ops are unchanged", () => {
    const c0 = make({ classes: [{ class: "plain", level: 1 }] });
    const r2 = level(c0, "plain", {});
    expect(r2.value.inventory.map(e => e.id)).toEqual(["bell"]);
  });

  it("a brought-in background's fixed feat resolves in the builder", () => {
    const d = { ...newDraft(), name: "Pip", edition: "2024" as const, background: "wanderer@2014", classId: "warden" };
    expect(originFeats(d, reg)).toEqual(["spark@2014"]);
  });
});
