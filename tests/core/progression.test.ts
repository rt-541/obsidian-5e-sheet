import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { progress } from "../../src/core/progression";
import { homebrewRegistry, skirmisher } from "../fixtures/homebrew";
import { thalia } from "../fixtures/notes";
import { loadSrd } from "../../src/content/srd";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";

const choices = {
  "class:skirmisher:1:skills": ["acrobatics", "athletics"],
  "class:skirmisher:1:stance": ["duelist"],
  "class:skirmisher:2:choose-2": ["stealth"],
  "class:skirmisher:4:asi-0": { abilities: { int: 2 } },
  "race:skink:choose-2": ["elvish"],
};
const base = {
  type: "5e-character", name: "Tester", race: "skink", subrace: "cave-skink", background: "cartographer", feats: ["tough-mind"],
  classes: [{ class: "skirmisher", subclass: "scholar", level: 6 }],
  abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 },
  levelLog: [{ class: "skirmisher", level: 1, hp: { method: "first", die: 8, gained: 8 }, choices }],
  hp: { max: 40, current: 40, temp: 0 },
};
const char = (o: object = {}): Character => { const p = parseNote({ ...base, ...o }); if (p.kind !== "character") throw new Error(); expect(p.errors).toEqual([]); return p.value; };
const reg = homebrewRegistry();

describe("progress(): replaying race, background, feats and class levels", () => {
  const p = progress(char(), reg);
  it("lists features by source in replay order, with picked options as features", () => {
    expect(p.features.map(f => f.name)).toEqual(["Scales", "Cave Born", "Maps", "Tough Mind", "Quick Wits", "Duelist", "Sudden Strike", "Lore"]);
    expect(p.features.find(f => f.name === "Duelist")).toMatchObject({ sourceKind: "option", source: "Skirmisher 1", text: "Fight one on one.", key: "class:skirmisher:1:stance:duelist" });
    expect(p.features.find(f => f.name === "Lore")).toMatchObject({ sourceKind: "subclass", level: 3, source: "Scholar (Skirmisher 3)" });
    expect(p.features.find(f => f.name === "Cave Born")!.key).toBe("subrace:cave-skink:feature-1");
    expect(p.problems).toEqual([]); expect(p.unknown).toEqual([]);
  });
  it("scales: by level table, formula and modify", () => {
    expect(p.scales).toEqual({ "plan-die": "1d6", "plan-count": 8 });
    expect(progress(char({ classes: [{ class: "skirmisher", level: 3 }] }), reg).scales).toEqual({ "plan-die": "1d4", "plan-count": 4 });
  });
  it("resources: formulas see scales, modify from level 5, refill and clamped uses", () => {
    expect(p.resources).toEqual([
      { id: "plans", name: "Plans", max: 9, used: 0, reset: "long", source: "Skirmisher 1" },
      { id: "focus", name: "Focus", max: 3, used: 0, reset: "short", source: "Skirmisher 2", refill: { on: "short", amount: 1, oncePer: "long" } },
    ]);
    const q = progress(char({ uses: { plans: 4, focus: 99, gone: 3 } }), reg);
    expect(q.resources.map(r => [r.id, r.used])).toEqual([["plans", 4], ["focus", 3]]);
    expect(progress(char({ classes: [{ class: "skirmisher", level: 4 }] }), reg).resources.map(r => [r.id, r.max])).toEqual([["plans", 5], ["focus", 2]]);
  });
  it("class DC with the optional ability toggle", () => {
    expect(p.dcs).toEqual([{ id: "analysis", name: "Analysis", base: "int", alt: "wis", abil: "int", dc: 14, attack: 6, source: "Skirmisher 1" }]);
    expect(progress(char({ choices: { "dc.analysis.alt": true } }), reg).dcs[0]).toMatchObject({ abil: "wis", dc: 12, attack: 4 });
  });
  it("proficiencies, languages, speed, darkvision, granted spells and items", () => {
    expect(p.proficiencies.saves.sort()).toEqual(["dex", "int"]);
    expect(p.proficiencies.skills.sort()).toEqual(["acrobatics", "athletics", "perception", "stealth", "survival"]);
    expect(p.proficiencies.expertise).toEqual(["stealth"]);
    expect(p.proficiencies.other.sort()).toEqual(["light armor", "tool:cartographer's tools"]);
    expect(p.languages.sort()).toEqual(["draconic", "elvish", "thieves-cant"]);
    expect(p.speed).toBe(25); expect(p.darkvision).toBe(120);
    expect(p.grantedSpells).toEqual([{ id: "shield", source: "Skirmisher 1" }]);
    expect(p.grantedItems).toEqual([{ id: "dagger", source: "Skirmisher 1" }]);
    expect(p.options).toEqual({ stances: ["duelist"] });
  });
  it("casters: a class op and a subclass table, with the table row for the class level", () => {
    expect(p.spellcasting.map(s => [s.from, s.progression, s.level, s.abil, s.cantrips, s.known])).toEqual([["class", "third", 6, "int", undefined, undefined], ["subclass", "table", 6, "int", 2, 4]]);
    expect(progress(char({ classes: [{ class: "skirmisher", level: 4 }] }), reg).spellcasting).toEqual([]);
  });
  it("without a level log the choices are pending, not invented", () => {
    const q = progress(char({ levelLog: [], classes: [{ class: "skirmisher", level: 5 }] }), reg);
    expect(q.pending.map(x => x.key)).toEqual(["race:skink:choose-2", "class:skirmisher:1:skills", "class:skirmisher:1:stance", "class:skirmisher:2:choose-2",
      "class:skirmisher:3:subclass-0", "class:skirmisher:4:asi-0", "class:skirmisher:5:spells-2"]);
    expect(q.pending[1]).toMatchObject({ source: "Skirmisher 1", level: 1, label: "Choose 2 skills" });
    expect(q.features.map(f => f.name)).not.toContain("Duelist");
    expect(q.proficiencies.expertise).toEqual([]);
  });
  it("the subclass op is pending until a subclass is set; the other subclasses' options resolve", () => {
    const q = progress(char({ classes: [{ class: "skirmisher", level: 3 }] }), reg);
    expect(q.pending.map(x => x.key)).toContain("class:skirmisher:3:subclass-0");
    const r = homebrewRegistry();
    const m = progress(char({ classes: [{ class: "skirmisher", subclass: "pact-mind", level: 3 }], levelLog: [{ class: "skirmisher", level: 3, hp: { method: "roll", gained: 5 }, choices: { ...choices, "subclass:pact-mind:3:boon": ["tome"] } }] }), r);
    expect(m.features.map(f => f.name)).toContain("Tome");
    expect(m.options.boons).toEqual(["tome"]);
  });
  it("a choice found in any log entry, or in character.choices, is used", () => {
    const q = progress(char({ levelLog: [{ class: "skirmisher", level: 2, hp: { method: "roll", gained: 5 }, choices: { "class:skirmisher:1:stance": ["guardian"] } }] }), reg);
    expect(q.options.stances).toEqual(["guardian"]);
    const early = progress(char({ levelLog: [], classes: [{ class: "skirmisher", level: 3 }], choices: { "class:skirmisher:1:stance": ["hunter"] } }), reg);
    expect(early.options.stances ?? []).toEqual([]); expect(early.problems.join()).toMatch(/Hunter needs level 5/);   // minLevel 5
    expect(progress(char({ levelLog: [], choices: { "class:skirmisher:1:stance": ["guardian"] } }), reg).options.stances).toEqual(["guardian"]);
  });
  it("unknown content is listed, not fatal", () => {
    const q = progress(char({ race: "pixie", background: "hermit", feats: ["lucky"], classes: [{ class: "skirmisher", subclass: "nope", level: 3 }] }), reg);
    expect(q.unknown).toEqual(["race:pixie", "background:hermit", "feat:lucky", "subclass:nope"]);
    expect(progress(char({ classes: [{ class: "artificer", level: 3 }] }), reg).features).toBeDefined();
  });
});

describe("bad homebrew and bad saves never crash or half-apply", () => {
  const withClass = (levels: Record<string, unknown>, more: object = {}) => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    expect(r.add("vault", "class", { name: "Odd", hitDie: 8, levels, ...more }, { path: "odd.md" })).toBeNull();
    return r;
  };
  const odd = (o: object = {}) => char({ race: undefined, subrace: undefined, background: undefined, feats: [], classes: [{ class: "odd", level: 3 }], levelLog: [], ...o });
  it("a formula naming something that does not exist drops that resource and says why", () => {
    const r = withClass({ 1: [{ op: "resource", name: "Ghost", max: "nonsense + 1" }, { op: "resource", name: "Real", max: "level" }] });
    const p = progress(odd(), r);
    expect(p.resources.map(x => x.id)).toEqual(["real"]); expect(p.problems.join()).toMatch(/Ghost: unknown name nonsense/);
  });
  it("division by zero, modify of nothing, an action that spends or saves against nothing", () => {
    const r = withClass({ 1: [{ op: "scale", name: "Bad", formula: "1 / 0" }, { op: "modify", resource: "Nope", set: 3 },
      { op: "feature", name: "Act", action: { name: "Act", cost: { resource: "Mana" }, save: { abil: "wis", dc: "Spell Power" } } }] });
    const p = progress(odd(), r);
    expect(p.scales).toEqual({});
    expect(p.problems.join("\n")).toMatch(/division by zero/); expect(p.problems.join("\n")).toMatch(/no earlier resource "Nope"/);
    expect(p.problems.join("\n")).toMatch(/unknown resource "Mana"/); expect(p.problems.join("\n")).toMatch(/unknown DC "Spell Power"/);
  });
  it("picks that are not allowed, repeated, wrong count or not even a list stay pending with a problem", () => {
    for (const bad of [["wizardry"], ["acrobatics", "acrobatics"], ["acrobatics"], "acrobatics", [1, 2]]) {
      const p = progress(char({ levelLog: [{ class: "skirmisher", level: 1, hp: { method: "roll", gained: 5 }, choices: { "class:skirmisher:1:skills": bad } }], classes: [{ class: "skirmisher", level: 1 }], race: undefined, subrace: undefined, background: undefined, feats: [] }), reg);
      expect(p.pending.map(x => x.key), JSON.stringify(bad)).toContain("class:skirmisher:1:skills");
      expect(p.proficiencies.skills, JSON.stringify(bad)).not.toContain("acrobatics");
      if (bad !== "acrobatics" && !(Array.isArray(bad) && bad.length === 1)) expect(p.problems.length).toBeGreaterThan(0);
    }
  });
  it("a subclass that belongs to another class is ignored with a problem", () => {
    const p = progress(char({ classes: [{ class: "cleric", subclass: "scholar", level: 3 }] }), reg);
    expect(p.problems.join()).toMatch(/belongs to skirmisher, not cleric/); expect(p.features.map(f => f.name)).not.toContain("Lore");
  });
  it("a subrace of another race is flagged", () => {
    expect(progress(char({ race: "elf" }), reg).problems.join()).toMatch(/belongs to skink/);
  });
});

describe("deriveCharacter consumes the progression", () => {
  const d = (o: object = {}) => deriveCharacter(char(o), { registry: reg });
  const s = d();
  it("armor class uses the better of Dex and acAbility, capped by armor", () => {
    expect(s.ac).toEqual({ value: 14, sources: ["Unarmored", "Quick Wits", "Scales"] });
    expect(d({ inventory: [{ id: "breastplate", equipped: true }] }).ac.value).toBe(14 + 2 + 1);       // max2 cap applies to Int too
    expect(d({ inventory: [{ id: "chain-mail", equipped: true }] }).ac.value).toBe(16 + 1);            // dex none: ability ignored
    expect(d({ inventory: [{ id: "leather-armor", equipped: true }] }).ac.value).toBe(11 + 3 + 1);
    expect(d({ abilities: { ...base.abilities, dex: 18 } }).ac).toEqual({ value: 10 + 4 + 1, sources: ["Unarmored", "Scales"] });
  });
  it("saves gain class proficiencies and saveBonus formulas", () => {
    expect(s.saves.int).toEqual({ mod: 3 + 3 + 3, prof: true });   // mod + prof + Formula prof
    expect(s.saves.dex).toEqual({ mod: 2 + 3, prof: true });
    expect(s.saves.wis).toEqual({ mod: 1 + 1, prof: false });     // Tough Mind +1
    expect(s.saves.str).toEqual({ mod: 0, prof: false });
  });
  it("skills and expertise come from choices; speed and darkvision from grants", () => {
    expect(s.skills.find(k => k.id === "stealth")).toMatchObject({ mod: 2 + 3 + 3, prof: true, expertise: true });
    expect(s.skills.find(k => k.id === "survival")).toMatchObject({ prof: true, expertise: false });
    expect(s.speed.value).toBe(25); expect(s.darkvision).toBe(120);
  });
  it("derived resources merge after the manual ones", () => {
    const x = d({ resources: [{ name: "Torch", max: 3, used: 1, reset: "none" }], uses: { plans: 2 } });
    expect(x.resources.map(r => [r.id, r.name, r.max, r.used, r.derived])).toEqual([["manual:0", "Torch", 3, 1, false], ["plans", "Plans", 9, 2, true], ["focus", "Focus", 3, 0, true]]);
  });
  it("crit range, ability caps, casters and class DCs", () => {
    expect(s.crit).toEqual({ range: 19, vs: "analyzed creatures" });
    expect(s.maxScores).toEqual({ str: 20, dex: 20, con: 20, int: 22, wis: 20, cha: 20 });
    expect(s.casters.map(x => [x.name, x.abil, x.dc, x.attack, x.progression])).toEqual([["Skirmisher", "int", 14, 6, "third"], ["Skirmisher", "int", 14, 6, "table"]]);
    expect(s.spellcasting).toEqual({ abil: "int", dc: 14, attack: 6 });
    expect(s.progress.dcs[0].dc).toBe(14);
  });
  it("slots combine a third caster with the subclass table; a pact table adds pact slots", () => {
    expect(s.slots).toEqual([{ level: "1", max: 6, used: 0 }]);     // third 6 -> caster level 2 -> 3 slots, plus table 3
    const pm = d({ classes: [{ class: "skirmisher", subclass: "pact-mind", level: 6 }] });
    expect(pm.slots).toEqual([{ level: "1", max: 3, used: 0 }, { level: "pact", max: 2, used: 0, pactLevel: 2 }]);
  });
  it("bad saveBonus formulas are problems, not crashes", () => {
    const r = homebrewRegistry();
    r.add("vault", "feat", { name: "Weird", grants: [{ op: "effect", effects: { saveBonus: [{ abils: ["str"], value: "bogus" }] } }] }, { path: "w.md" });
    const x = deriveCharacter(char({ feats: ["weird"] }), { registry: r });
    expect(x.saves.str.mod).toBe(0); expect(x.progress.problems.join()).toMatch(/save bonus unknown name bogus/);
  });
});

describe("legacy notes keep working unchanged", () => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  it("Thalia keeps her stored numbers; the SRD choices she never logged are pending, not invented", () => {
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    const s = deriveCharacter(p.value, { registry: r });
    expect(s.progress.pending.map(x => x.key)).toEqual(["background:acolyte:languages-pick", "class:cleric:1:skills", "class:cleric:1:spells", "class:cleric:4:asi", "class:cleric:4:spells"]);
    expect(s.progress.problems).toEqual([]);
    expect(s.progress.unknown).toEqual(["race:hill-dwarf", "subclass:life-domain"]);
    expect(s.resources[0]).toEqual({ id: "manual:0", name: "Channel Divinity", max: 1, used: 0, reset: "short", derived: false });
    expect(s.speed.value).toBe(30); expect(s.casters).toHaveLength(1);
  });
  it("a class with no operations adds nothing", () => {
    const plain = new Registry(); registerBuiltinTypes(plain);
    plain.add("vault", "class", { name: "Plain", hitDie: 8, saves: ["str", "con"] }, { path: "plain.md" });
    expect(progress(char({ race: undefined, subrace: undefined, background: undefined, feats: [], classes: [{ class: "plain", level: 5 }], levelLog: [] }), plain))
      .toMatchObject({ features: [], pending: [], resources: [], proficiencies: { saves: ["str", "con"] } });
  });
  it("the skirmisher fixture is a valid note", () => expect(skirmisher.type).toBe("5e-class"));
});
