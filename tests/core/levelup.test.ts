import { newCharacter, parseNote, writeInto, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { deriveCharacter } from "../../src/core/derive";
import { progress } from "../../src/core/progression";
import { applyLevel, applyResolve, averageHp, levelFromXp, levelOptions, planLevel, planResolve, rollHitDie, undoLevel, xpProgress, XP_THRESHOLDS,
  type LevelAnswers, type LevelPlan, type Step } from "../../src/core/levelup";
import { homebrewRegistry } from "../fixtures/homebrew";
import { thalia } from "../fixtures/notes";

const linguist = { type: "5e-feat", name: "Linguist", grants: [{ op: "grant", items: ["rope"] }, { op: "choose", what: "languages", count: 1, from: ["elvish", "dwarvish"] }] };
const savant = { type: "5e-class", name: "Savant", hitDie: 6, levels: { 1: [{ op: "spells", count: 1, cantrips: 1, from: "wizard" }], 2: [{ op: "spells", count: 1, from: "wizard", swap: 1 }] } };
const brute = { type: "5e-class", name: "Brute", hitDie: 12, multiclass: { requires: { all: { str: 15 } }, proficiencies: [] }, levels: { 1: [{ op: "feature", name: "Rage" }], 2: [{ op: "asi" }], 3: [{ op: "asi" }] } };
const reg = homebrewRegistry([linguist, savant, brute]);
const seed = seeded(5);

const base = (o: Partial<Character> = {}): Character => ({ ...newCharacter("Tester"), abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 }, ...o });
const ok = (r: ReturnType<typeof applyLevel>) => { if ("error" in r) throw new Error(r.error); return r; };
const avg: LevelAnswers["hp"] = { method: "average" };
const lvl = (c: Character, cls: string, choices: Record<string, unknown> = {}, hp: LevelAnswers["hp"] = avg) => ok(applyLevel(c, { class: cls }, { hp, choices }, reg, seed));
const plan = (c: Character, cls: string, choices: Record<string, unknown> = {}) => { const p = planLevel(c, cls, reg, choices); if ("error" in p) throw new Error(p.error); return p as LevelPlan; };
const keys = (p: LevelPlan) => p.steps.map(s => s.key);
const err = (r: ReturnType<typeof applyLevel>) => { if (!("error" in r)) throw new Error("expected an error"); return r.error; };
const undo = (c: Character) => { const r = undoLevel(c, reg); if ("error" in r) throw new Error(r.error); return r; };

const L1 = { "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] };
const L2 = { "class:skirmisher:2:choose-2": ["stealth"] };
const L3 = { "class:skirmisher:3:subclass-0": "scholar" };
const L4 = { "class:skirmisher:4:asi-0": { abilities: { int: 2 } } };
const L5 = { "class:skirmisher:5:spells-2": ["acid-splash", "burning-hands", "charm-person"] };

/** A Skirmisher (Scholar) at class level n, built through the same applyLevel calls the UI makes. */
function upTo(n: number, c: Character = base()): Character {
  const all = [L1, L2, L3, L4, L5];
  for (let i = 0; i < n; i++) c = lvl(c, "skirmisher", all[i]).value;
  return c;
}

describe("XP", () => {
  it("2014 thresholds and the level they give", () => {
    expect(XP_THRESHOLDS).toHaveLength(20); expect(XP_THRESHOLDS[1]).toBe(300); expect(XP_THRESHOLDS[19]).toBe(355000);
    expect([0, 299, 300, 6499, 6500, 355000, 9e9].map(levelFromXp)).toEqual([1, 1, 2, 4, 5, 20, 20]);
  });
  it("progress toward the next level and whether a level is waiting", () => {
    expect(xpProgress(6500, 5)).toEqual({ from: 6500, next: 14000, pct: 0, ready: false });
    expect(xpProgress(10250, 5)).toMatchObject({ pct: 50, ready: false });
    expect(xpProgress(14000, 5)).toMatchObject({ ready: true });
    expect(xpProgress(400000, 20)).toEqual({ from: 355000, pct: 100, ready: false });
  });
});

describe("levelOptions", () => {
  it("a new character may take any class; current classes come first", () => {
    const o = levelOptions(base(), reg);
    expect(o.every(x => x.allowed)).toBe(true); expect(o.find(x => x.class === "wizard")).toMatchObject({ level: 1, current: false });
  });
  it("multiclass prerequisites of the class taken and the class left, with reasons", () => {
    const c = base({ classes: [{ class: "skirmisher", level: 3 }], abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 12, cha: 8 } });
    const o = levelOptions(c, reg);
    expect(o[0]).toMatchObject({ class: "skirmisher", level: 4, current: true, allowed: true });
    expect(o.find(x => x.class === "brute")).toMatchObject({ allowed: false, reasons: expect.arrayContaining(["Multiclassing into Brute needs STR 15", "Leaving Skirmisher needs DEX 13 or INT 13"]) });
    expect(o.find(x => x.class === "wizard")!.allowed).toBe(false);            // leaving Skirmisher fails
    const good = levelOptions({ ...c, abilities: { ...c.abilities, str: 15, int: 13 } }, reg);
    expect(good.find(x => x.class === "brute")).toMatchObject({ allowed: true, reasons: [] });
  });
  it("nothing is allowed at level 20", () => {
    const o = levelOptions(base({ classes: [{ class: "fighter", level: 20 }] }), reg);
    expect(o.every(x => !x.allowed && x.reasons[0] === "Characters stop at level 20")).toBe(true);
  });
});

describe("planLevel", () => {
  it("first level: HP step with the full die, then skills and the stance option", () => {
    const p = plan(base(), "skirmisher");
    expect(keys(p)).toEqual(["hp", "class:skirmisher:1:skills", "class:skirmisher:1:stance"]);
    expect(p).toMatchObject({ className: "Skirmisher", level: 1, total: 1, first: true });
    expect(p.steps[0]).toMatchObject({ kind: "hp", die: 8, conMod: 2, average: 5, first: true });
    const skills = p.steps[1] as Extract<Step, { kind: "pick" }>;
    expect(skills).toMatchObject({ what: "skills", count: 2 }); expect(skills.options.map(o => o.id)).toEqual(["acrobatics", "athletics", "investigation", "perception"]);
    const stance = p.steps[2] as Extract<Step, { kind: "pick" }>;
    expect(stance.options.map(o => o.id)).toEqual(["duelist", "guardian", "hunter"]);
    expect(stance.options[2].disabled).toBe("Needs level 5");
  });
  it("later levels only ask what the new level asks; the subclass answer reveals the subclass steps", () => {
    const at2 = lvl(base(), "skirmisher", L1).value;
    expect(keys(plan(at2, "skirmisher"))).toEqual(["hp", "class:skirmisher:2:choose-2"]);
    const at3 = lvl(at2, "skirmisher", L2).value;
    expect(keys(plan(at3, "skirmisher"))).toEqual(["hp", "class:skirmisher:3:subclass-0"]);
    expect(keys(plan(at3, "skirmisher", { "class:skirmisher:3:subclass-0": "pact-mind" }))).toEqual(["hp", "class:skirmisher:3:subclass-0", "subclass:pact-mind:3:boon"]);
    expect(keys(plan(at3, "skirmisher", L3))).toEqual(["hp", "class:skirmisher:3:subclass-0"]);
    expect((plan(at3, "skirmisher").steps[1] as Extract<Step, { kind: "subclass" }>).options.map(o => o.id)).toEqual(["pact-mind", "scholar"]);
  });
  it("an ASI answer of a feat adds the feat's own choices", () => {
    const at3 = upTo(3);
    expect(keys(plan(at3, "skirmisher"))).toEqual(["hp", "class:skirmisher:4:asi-0"]);
    const p = plan(at3, "skirmisher", { "class:skirmisher:4:asi-0": { feat: "linguist" } });
    expect(keys(p)).toEqual(["hp", "class:skirmisher:4:asi-0", "feat:linguist:choose-1"]);
    expect(p.steps[2]).toMatchObject({ kind: "pick", what: "languages", count: 1, source: "Feat: Linguist" });
  });
  it("spells step: cantrips and levels split, known and too-high spells disabled", () => {
    const c = lvl(base(), "savant", { "class:savant:1:spells-0": ["acid-splash", "burning-hands"] }).value;
    const p = plan(c, "savant");
    const s = p.steps[1] as Extract<Step, { kind: "spells" }>;
    expect(s).toMatchObject({ count: 1, cantrips: 0, swap: 1 }); expect(s.options.find(o => o.id === "burning-hands")!.disabled).toBe("Already known");
    expect(s.maxLevel).toBe(9);
  });
  it("unknown class and level 20 are errors", () => {
    expect(planLevel(base(), "nope", reg)).toEqual({ error: "Unknown class nope" });
    expect(planLevel(base({ classes: [{ class: "fighter", level: 20 }] }), "fighter", reg)).toEqual({ error: "Characters stop at level 20" });
  });
});

describe("applyLevel: HP", () => {
  it("first level is the full die plus CON; average and rolled levels add CON (min 1) to HP and current", () => {
    const a = lvl(base(), "skirmisher", L1);
    expect(a.value.hp).toEqual({ max: 10, current: 10, temp: 0 }); expect(a.entry.hp).toEqual({ method: "first", die: 8, gained: 8, added: 10 });
    const b = lvl({ ...a.value, hp: { max: 10, current: 4, temp: 0 } }, "skirmisher", L2, avg);
    expect(b.value.hp).toMatchObject({ max: 10 + 7, current: 4 + 7 }); expect(b.entry.hp).toMatchObject({ method: "average", gained: 5, added: 7 });
    const r = lvl(a.value, "skirmisher", L2, { method: "roll", roll: 1 });
    expect(r.entry.hp).toMatchObject({ method: "roll", gained: 1, added: 3 });
    const weak = lvl({ ...a.value, abilities: { ...a.value.abilities, con: 3 } }, "skirmisher", L2, { method: "roll", roll: 1 });
    expect(weak.entry.hp.added).toBe(1);                                        // never less than 1
  });
  it("a roll comes from the rng when none is given and stays within the die", () => {
    const a = lvl(base(), "skirmisher", L1).value;
    const r = ok(applyLevel(a, { class: "skirmisher" }, { hp: { method: "roll" }, choices: L2 }, reg, seeded(9)));
    expect(r.entry.hp.gained).toBeGreaterThanOrEqual(1); expect(r.entry.hp.gained).toBeLessThanOrEqual(8);
    expect(r.entry.hp.gained).toBe(rollHitDie(8, seeded(9)));
    expect(err(applyLevel(a, { class: "skirmisher" }, { hp: { method: "roll", roll: 9 }, choices: L2 }, reg))).toMatch(/d8 roll must be from 1 to 8/);
    expect(averageHp(8)).toBe(5); expect(averageHp(12)).toBe(7);
  });
  it("a non-first level without an HP method is an error", () => {
    const a = lvl(base(), "skirmisher", L1).value;
    expect(err(applyLevel(a, { class: "skirmisher" }, { choices: L2 }, reg))).toBe("Choose Roll or Average for hit points");
  });
  it("an ASI that raises the CON modifier adds the difference for every level", () => {
    let c = lvl(base({ abilities: { str: 10, dex: 10, con: 13, int: 10, wis: 10, cha: 10 } }), "brute").value;       // 12 + 1
    c = lvl(c, "brute", { "class:brute:2:asi-0": { abilities: { str: 1, dex: 1 } } }).value;                          // + 7 + 1... average 7, CON +1
    const before = c.hp.max;
    const r = lvl(c, "brute", { "class:brute:3:asi-0": { abilities: { con: 1, dex: 1 } } });                           // con 13 -> 14
    expect(r.value.abilities.con).toBe(14);
    expect(r.entry.hp.added).toBe(7 + 1 + 3);                                                                          // average 7 + CON +1, then +1 on 3 levels
    expect(r.value.hp.max).toBe(before + 11);
  });
});


describe("applyLevel: answers are validated and nothing half-applies", () => {
  const at1 = upTo(1);
  const run = (c: Character, cls: string, choices: Record<string, unknown>, hp = avg) => applyLevel(c, { class: cls }, { hp, choices }, reg, seed);
  it("missing, wrong count, duplicate and not-listed picks", () => {
    expect(err(run(base(), "skirmisher", { "class:skirmisher:1:stance": ["duelist"] }))).toMatch(/Choose 2 skills still needs an answer/);
    expect(err(run(base(), "skirmisher", { ...L1, "class:skirmisher:1:skills": ["acrobatics"] }))).toMatch(/pick exactly 2/);
    expect(err(run(base(), "skirmisher", { ...L1, "class:skirmisher:1:skills": ["acrobatics", "acrobatics"] }))).toMatch(/must be different/);
    expect(err(run(base(), "skirmisher", { ...L1, "class:skirmisher:1:skills": ["acrobatics", "arcana"] }))).toMatch(/not one of the choices/);
    expect(err(run(base(), "skirmisher", { ...L1, "class:skirmisher:1:stance": ["hunter"] }))).toMatch(/Hunter is not available \(needs level 5\)/);
    expect(err(run(base(), "skirmisher", { ...L1, "class:skirmisher:1:stance": "duelist" }))).toMatch(/pick exactly 1/);
  });
  it("no duplicate skills: a proficiency the character already has cannot be picked again", () => {
    const c = base({ proficiencies: { saves: [], skills: ["athletics"], expertise: [] } });
    expect(err(run(c, "skirmisher", L1))).toMatch(/Athletics is not available \(already proficient\)/);
  });
  it("expertise needs a proficient skill and cannot repeat", () => {
    const c = lvl(base(), "skirmisher", { ...L1, "class:skirmisher:1:skills": ["acrobatics", "perception"] }).value;
    expect(err(run(c, "skirmisher", { "class:skirmisher:2:choose-2": ["athletics"] }))).toMatch(/expertise needs a skill you are proficient in \(Athletics\)/);
    expect("value" in run(c, "skirmisher", { "class:skirmisher:2:choose-2": ["stealth"] })).toBe(true);     // stealth comes from the class
    const twice = { ...c, proficiencies: { ...c.proficiencies, expertise: ["stealth"] } };
    expect(err(run(twice, "skirmisher", { "class:skirmisher:2:choose-2": ["stealth"] }))).toMatch(/Stealth is not available \(already have\)/);
  });
  it("subclass must be one of the class's subclasses", () => {
    const at2 = upTo(2);
    expect(err(run(at2, "skirmisher", { "class:skirmisher:3:subclass-0": "nope" }))).toMatch(/pick one of the listed subclasses/);
    expect(err(run(at2, "skirmisher", {}))).toMatch(/Choose a subclass still needs an answer/);
  });
  it("ASI: +2 or +1 +1, under the cap, or a real feat", () => {
    const at3 = upTo(3), asi = (v: unknown) => run(at3, "skirmisher", { "class:skirmisher:4:asi-0": v });
    expect(err(asi({ abilities: { int: 3 } }))).toMatch(/add \+2 to one ability or \+1 to two/);
    expect(err(asi({ abilities: { int: 1 } }))).toMatch(/add \+2 to one ability or \+1 to two/);
    expect(err(asi({ abilities: { int: 1, dex: 1, wis: 1 } }))).toMatch(/add \+2 to one ability or \+1 to two/);
    expect(err(asi({ abilities: { luck: 2 } }))).toMatch(/add \+2/);
    expect(err(asi({ feat: "no-such-feat" }))).toMatch(/unknown feat no-such-feat/);
    expect(err(asi("lots"))).toMatch(/pick abilities or a feat/);
    expect(err(run({ ...at3, abilities: { ...at3.abilities, dex: 19 } }, "skirmisher", { "class:skirmisher:4:asi-0": { abilities: { dex: 2 } } }))).toMatch(/DEX cannot go above 20/);
    const one = asi({ abilities: { dex: 1, wis: 1 } }); expect("value" in one && one.value.abilities).toMatchObject({ dex: 15, wis: 13 });
  });
  it("a feature can raise the cap (maxScore 22 for Int from level 5)", () => {
    const at5 = upTo(5), at4 = upTo(4);
    expect(at4.abilities.int).toBe(18);
    const r = run({ ...at5, abilities: { ...at5.abilities, int: 21 } }, "skirmisher", {});
    expect(r).toBeDefined();
  });
  it("a feat's own choice must be answered", () => {
    const at3 = upTo(3);
    expect(err(run(at3, "skirmisher", { "class:skirmisher:4:asi-0": { feat: "linguist" } }))).toMatch(/Choose 1 languages still needs an answer/);
    expect(err(run(at3, "skirmisher", { "class:skirmisher:4:asi-0": { feat: "linguist" }, "feat:linguist:choose-1": ["klingon"] }))).toMatch(/not one of the choices/);
  });
  it("spells: right number of cantrips and spells, on the list, not known, not above the slots", () => {
    const at4 = upTo(4), spells = (v: unknown) => run(at4, "skirmisher", { "class:skirmisher:5:spells-2": v });
    expect(err(spells(["acid-splash", "burning-hands"]))).toMatch(/pick 1 cantrip and 2 spells/);
    expect(err(spells(["acid-splash", "burning-hands", "charm-person", "alarm"]))).toMatch(/pick 1 cantrip and 2 spells/);
    expect(err(spells(["acid-splash", "burning-hands", "fireball"]))).toMatch(/Fireball is not available \(needs a level 3 slot\)/);
    expect(err(spells(["acid-splash", "burning-hands", "cure-wounds"]))).toMatch(/not on the list/);       // not a wizard spell
    expect(err(spells("acid-splash"))).toMatch(/pick spells/);
    expect(err(run({ ...at4, spells: [{ id: "charm-person", prepared: true }] }, "skirmisher", { "class:skirmisher:5:spells-2": ["acid-splash", "burning-hands", "charm-person"] }))).toMatch(/Charm Person is not available \(already known\)/);
  });
  it("homebrew that cannot evaluate blocks the level instead of half-applying it", () => {
    const r = homebrewRegistry([{ type: "5e-class", name: "Odd", hitDie: 8, levels: { 1: [{ op: "resource", name: "Ghost", max: "nonsense + 1" }] } }]);
    const out = applyLevel(base(), { class: "odd" }, { choices: {} }, r);
    expect(err(out)).toMatch(/This level would break the class: resource Ghost: unknown name nonsense/);
  });
  it("errors never change the character", () => {
    const before = structuredClone(at1);
    run(at1, "skirmisher", { "class:skirmisher:2:choose-2": ["athletics", "x"] }); run(at1, "nope", {});
    expect(at1).toEqual(before);
  });
  it("level 20 characters cannot level", () => {
    expect(err(run(base({ classes: [{ class: "fighter", level: 20 }] }), "fighter", {}))).toBe("Characters stop at level 20");
  });
});

describe("applying a whole career", () => {
  const six = upTo(6);
  it("lands on the same numbers the sheet derives, with nothing pending", () => {
    expect(six.classes).toEqual([{ class: "skirmisher", subclass: "scholar", level: 6 }]);
    expect(six.levelLog.map(e => [e.level, e.hp.method])).toEqual([[1, "first"], [2, "average"], [3, "average"], [4, "average"], [5, "average"], [6, "average"]]);
    expect(six.hp.max).toBe(10 + 5 * 7);                                    // d8 + 2, then average 5 + 2 per level
    expect(six.abilities.int).toBe(18);
    const p = progress(six, reg);
    expect(p.pending).toEqual([]); expect(p.problems).toEqual([]);
    expect(six.spells.map(s => s.id)).toEqual(["acid-splash", "burning-hands", "charm-person"]);
    expect(six.inventory).toEqual([{ id: "dagger", qty: 1, equipped: false, attuned: false }]);
    const st = deriveCharacter(six, { registry: reg });
    expect(st.progress.features.map(f => f.name)).toEqual(["Quick Wits", "Duelist", "Sudden Strike", "Lore"]);
    expect(st.progress.proficiencies.expertise).toEqual(["stealth"]);
  });
  it("the log survives being written to the note and read back, and undo still works", () => {
    const fm: Record<string, unknown> = { type: "5e-character", name: "Tester" };
    writeInto(fm, six);
    const back = parseNote(fm); if (back.kind !== "character") throw new Error();
    expect(back.errors).toEqual([]); expect(back.value).toEqual(six);
    expect(undo(back.value).value).toEqual(upTo(5));
  });
  it("a Pact Mind subclass asks for its boon at level 3", () => {
    const c = lvl(upTo(2), "skirmisher", { "class:skirmisher:3:subclass-0": "pact-mind", "subclass:pact-mind:3:boon": ["tome"] });
    expect(c.value.classes[0]).toMatchObject({ subclass: "pact-mind", level: 3 });
    expect(c.entry.choices).toMatchObject({ "subclass:pact-mind:3:boon": ["tome"], "+subclass": "pact-mind" });
    expect(c.summary).toEqual(expect.arrayContaining(["Subclass: Pact Mind", "Boons: Tome"]));
    expect(err(applyLevel(upTo(2), { class: "skirmisher" }, { hp: avg, choices: { "class:skirmisher:3:subclass-0": "pact-mind" } }, reg))).toMatch(/Choose 1 \(boons\) still needs an answer/);
  });
  it("the summary says what happened", () => {
    const r = lvl(upTo(4), "skirmisher", L5);
    expect(r.summary[0]).toBe("Skirmisher 5 (character level 5)");
    expect(r.summary[1]).toBe("HP +7 (average 5 +2 CON)");
    expect(r.summary).toEqual(expect.arrayContaining(["Spells: Acid Splash, Burning Hands, Charm Person"]));
  });
  it("multiclassing appends the class; first-level skills are not asked again", () => {
    const c = { ...upTo(3), abilities: { ...upTo(3).abilities, str: 15 } };
    expect(keys(plan(c, "brute"))).toEqual(["hp", ]);
    const r = lvl(c, "brute");
    expect(r.value.classes.map(k => [k.class, k.level])).toEqual([["skirmisher", 3], ["brute", 1]]);
    expect(r.entry.hp).toMatchObject({ method: "average", die: 12, gained: 7 });
    expect(r.value.hp.max).toBe(c.hp.max + 7 + 2);
  });
});

describe("undoLevel: round trip on every op type", () => {
  /** Apply a level, check undo restores the exact previous character, and return the applied result. */
  const trip = (c: Character, cls: string, choices: Record<string, unknown> = {}, hp = avg) => {
    const before = structuredClone(c), r = lvl(c, cls, choices, hp), u = undo(r.value);
    expect(u.value).toEqual(before);
    expect(c).toEqual(before);                                        // neither call touches its input
    return r;
  };
  it("level 1: grant (items), feature, scale, resource, dc, choose option and skills", () => {
    const r = trip(base(), "skirmisher", L1);
    expect(r.value.inventory).toHaveLength(1); expect(r.entry.choices["+items"]).toEqual(["dagger"]);
  });
  it("level 2: effect, resource refill and expertise", () => { trip(upTo(1), "skirmisher", L2); });
  it("level 3: subclass with a feature and a spellcasting table", () => {
    const r = trip(upTo(2), "skirmisher", L3);
    expect(r.value.classes[0].subclass).toBe("scholar");
  });
  it("level 3: a subclass with its own option pick", () => { trip(upTo(2), "skirmisher", { "class:skirmisher:3:subclass-0": "pact-mind", "subclass:pact-mind:3:boon": ["blade"] }); });
  it("level 4: asi with abilities, and asi with a feat that has a choice and an item", () => {
    trip(upTo(3), "skirmisher", L4);
    trip(upTo(3), "skirmisher", { "class:skirmisher:4:asi-0": { abilities: { dex: 1, wis: 1 } } });
    const r = trip(upTo(3), "skirmisher", { "class:skirmisher:4:asi-0": { feat: "linguist" }, "feat:linguist:choose-1": ["elvish"] });
    expect(r.value.feats).toEqual(["linguist"]); expect(r.value.inventory.map(i => i.id)).toEqual(["dagger", "rope"]);
    expect(r.summary).toEqual(expect.arrayContaining(["Feat: Linguist", "Languages: Elvish", "Gained: rope"]));
    expect(progress(r.value, reg).languages).toContain("elvish");
  });
  it("level 5: modify, spells, spellcasting and a maxScore effect", () => {
    const r = trip(upTo(4), "skirmisher", L5);
    expect(r.entry.choices["+spells"]).toEqual(["acid-splash", "burning-hands", "charm-person"]);
  });
  it("spell swaps put the old spell back in place with its prepared flag", () => {
    let c = lvl(base(), "savant", { "class:savant:1:spells-0": ["acid-splash", "burning-hands"] }).value;
    c = { ...c, spells: c.spells.map(s => s.id === "burning-hands" ? { ...s, prepared: true } : s), mainSpells: ["burning-hands"] };
    const r = trip(c, "savant", { "class:savant:2:spells-0": ["alarm"], "class:savant:2:spells-0:swap": [{ out: "burning-hands", in: "charm-person" }] });
    expect(r.value.spells).toEqual([{ id: "acid-splash", prepared: false }, { id: "charm-person", prepared: false }, { id: "alarm", prepared: false }]);
    expect(r.entry.choices["+swaps"]).toEqual([{ out: "burning-hands", in: "charm-person", prepared: true }]);
    expect(err(applyLevel(c, { class: "savant" }, { hp: avg, choices: { "class:savant:2:spells-0": ["alarm"], "class:savant:2:spells-0:swap": [{ out: "nope", in: "charm-person" }] } }, reg))).toMatch(/not a spell you can swap out/);
    expect(err(applyLevel(c, { class: "savant" }, { hp: avg, choices: { "class:savant:2:spells-0": ["alarm"], "class:savant:2:spells-0:swap": [{ out: "acid-splash", in: "charm-person" }, { out: "burning-hands", in: "sleep" }] } }, reg))).toMatch(/swap at most 1 spell/);
  });
  it("multiclass level 1 and the CON-raising ASI", () => {
    const c = { ...upTo(3), abilities: { ...upTo(3).abilities, str: 15 } };
    trip(c, "brute");
    const b2 = lvl(lvl(c, "brute").value, "brute", { "class:brute:2:asi-0": { abilities: { str: 1, dex: 1 } } }).value;
    const r = trip(b2, "brute", { "class:brute:3:asi-0": { abilities: { con: 2 } } });
    expect(r.entry.hp.added).toBe(7 + 2 + 1 * 6);                    // average 7 + old CON +2, then CON 14 -> 16 is +1 on all 6 levels
  });
  it("rolled HP, rolled low, and current HP below the new max", () => {
    const c = { ...upTo(2), hp: { max: 17, current: 6, temp: 3 } };
    trip(c, "skirmisher", L3, { method: "roll", roll: 1 });
    const u = undo(lvl({ ...c }, "skirmisher", L3).value).value;
    expect(u.hp).toEqual({ max: 17, current: 6, temp: 3 });
  });
  it("undoing a level whose resource was used drops the used count, but keeps unrelated keys", () => {
    const r = lvl(upTo(1), "skirmisher", L2);                     // introduces Focus
    const used = { ...r.value, uses: { ...r.value.uses, focus: 1, stale: 4 } };
    const u = undo(used).value;
    expect(u.uses).toEqual({ stale: 4 });
  });
  it("damaged characters keep at least 1 HP when a level is undone", () => {
    const r = lvl(upTo(1), "skirmisher", L2).value;
    expect(undo({ ...r, hp: { ...r.hp, current: 3 } }).value.hp.current).toBe(1);
    expect(undo({ ...r, hp: { ...r.hp, current: 0 } }).value.hp.current).toBe(0);
  });
  it("undoing one at a time walks all the way back to nothing", () => {
    const steps = [base()]; let c = steps[0];
    const all = [L1, L2, L3, L4, L5, {}];
    for (const a of all) { c = lvl(c, "skirmisher", a).value; steps.push(c); }
    while (steps.length > 1) { const cur = steps.pop()!; expect(undo(cur).value).toEqual(steps[steps.length - 1]); }
    expect(steps[0].classes).toEqual([]);
  });
  it("legacy notes: Thalia levels up without a log and undo restores her exactly", () => {
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    const r = lvl(p.value, "cleric", {}, { method: "roll", roll: 4 });
    expect(r.value.classes[0]).toEqual({ class: "cleric", subclass: "life-domain", level: 6 });
    expect(r.value.hp.max).toBe(43 + 4 + 3); expect(r.value.levelLog).toHaveLength(1);
    expect(undo(r.value).value).toEqual(p.value);
  });
  it("hand-written entries: recorded HP is the whole amount, others fall back to gained plus CON", () => {
    const c: Character = { ...upTo(2), levelLog: [{ class: "skirmisher", level: 2, hp: { method: "recorded", gained: 9 }, choices: {} }], hp: { max: 20, current: 20, temp: 0 } };
    expect(undo(c).value.hp.max).toBe(11);
    const d: Character = { ...c, levelLog: [{ class: "skirmisher", level: 2, hp: { method: "roll", gained: 4 }, choices: { "class:skirmisher:2:asi-0": { abilities: { int: 2 } } } }] };
    const u = undo(d).value;
    expect(u.hp.max).toBe(14); expect(u.abilities.int).toBe(upTo(2).abilities.int - 2);
  });
  it("undo refuses when there is nothing to undo or the log does not match", () => {
    expect(undoLevel(base(), reg)).toEqual({ error: "There is no applied level to undo" });
    const c = { ...upTo(2), classes: [{ class: "skirmisher", level: 5 }] };
    expect(undoLevel(c, reg)).toEqual({ error: "The last log entry (skirmisher 2) does not match the class levels" });
  });
});

describe("resolving pending choices without a level", () => {
  const legacy = (o: Partial<Character> = {}): Character => ({ ...base({ classes: [{ class: "skirmisher", level: 4 }], hp: { max: 30, current: 30, temp: 0 } }), ...o });
  it("lists what a note without a log still owes", () => {
    const steps = planResolve(legacy(), reg);
    expect(steps.map(s => s.key)).toEqual(["class:skirmisher:1:skills", "class:skirmisher:1:stance", "class:skirmisher:2:choose-2", "class:skirmisher:3:subclass-0", "class:skirmisher:4:asi-0"]);
  });
  it("answering stores the picks in character.choices, applies the subclass and ability points, and adds no level", () => {
    const c = legacy();
    const r = applyResolve(c, { choices: { ...L1, ...L2, ...L3, ...L4 } }, reg);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.classes[0]).toEqual({ class: "skirmisher", subclass: "scholar", level: 4 });
    expect(r.value.levelLog).toEqual([]); expect(r.value.hp).toEqual(c.hp); expect(r.value.abilities.int).toBe(18);
    expect(r.value.choices["class:skirmisher:1:skills"]).toEqual(["acrobatics", "athletics"]);
    const p = progress(r.value, reg);
    expect(p.pending).toEqual([]); expect(p.options.stances).toEqual(["duelist"]); expect(p.proficiencies.expertise).toEqual(["stealth"]);
  });
  it("the subclass answer brings the subclass's own pending picks into the same wizard", () => {
    const steps = planResolve(legacy(), reg, { "class:skirmisher:3:subclass-0": "pact-mind" });
    expect(steps.map(s => s.key)).toContain("subclass:pact-mind:3:boon");
  });
  it("a partial or bad answer is an error and changes nothing; nothing pending is an error too", () => {
    const c = legacy();
    expect(applyResolve(c, { choices: L1 }, reg)).toMatchObject({ error: expect.stringMatching(/still needs an answer/) });
    expect(applyResolve(upTo(3), { choices: {} }, reg)).toEqual({ error: "Nothing is waiting for a choice" });
  });
});
