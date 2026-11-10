import { parseNote, type Character } from "../../src/core/character";
import { compareCharacter, counterpartOf, swapEdition, type CompareGroup } from "../../src/core/edition-compare";
import { explainChange } from "../../src/core/level-diff";
import { compareRegistry } from "../fixtures/edition-compare";
import { pc, srdRegistry } from "../fixtures/overlay";

const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const make = (o: Record<string, unknown> = {}): Character => {
  const p = parseNote({ type: "5e-character", schema: 1, name: "Pip", abilities: SCORES, hp: { max: 20, current: 20, temp: 0 }, classes: [{ class: "lantern-keeper", level: 3 }], ...o });
  if (p.kind !== "character") throw new Error("not a character");
  return p.value;
};
const text = (g: { lines: string[] }[]) => g.flatMap(x => x.lines).join("\n");
const group = (groups: CompareGroup[], start: string) => groups.find(g => g.title.startsWith(start))!;

describe("explainChange with a second context", () => {
  it("keeps the old result when no second context is given", () => {
    const R = srdRegistry(), ctx = { registry: R }, c = pc("barbarian", 4, { str: 16, con: 14 });
    expect(explainChange(c, c, ctx)).toEqual(explainChange(c, c, ctx, ctx));
  });
});

describe("counterpartOf and swapEdition", () => {
  it("pairs by replaces first and by id second", async () => {
    const { r } = await compareRegistry();
    const lantern = r.getAll("class", "lantern-keeper").find(e => e.edition === "2014")!;
    expect(counterpartOf(r, "class", lantern, "2024")!.id).toBe("beacon-warden");
    const glint = r.getAll("spell", "glint").find(e => e.edition === "2014")!;
    expect(counterpartOf(r, "spell", glint, "2024")!.edition).toBe("2024");
    const hush = r.getAll("spell", "hush").find(e => e.edition === "2014")!;
    expect(counterpartOf(r, "spell", hush, "2024")).toBeUndefined();
    const dusk = r.get("subclass", "dusk")!;
    expect(counterpartOf(r, "subclass", dusk, "2024")).toBeUndefined();
  });
  it("swaps ids and flips the edition, and lists what has no counterpart", async () => {
    const { r } = await compareRegistry();
    const c = make({ classes: [{ class: "lantern-keeper", subclass: "dusk", level: 3 }], race: "fenling", spells: [{ id: "glint", prepared: true }, { id: "hush", prepared: false }], feats: ["keen"] });
    const s = swapEdition(c, r);
    expect(s.value.edition).toBe("2024");
    expect(s.value.classes[0].class).toBe("beacon-warden");
    expect(s.value.classes[0].subclass).toBe("dusk@2014");
    expect(s.value.spells.map(x => x.id)).toEqual(["glint", "hush@2014"]);
    expect(s.unmatched).toEqual([{ type: "subclass", ref: "dusk" }, { type: "spell", ref: "hush" }]);
    expect(c.edition).toBeUndefined();   // the original is untouched
  });
});

describe("compareCharacter", () => {
  it("says what differs in plain sentences", async () => {
    const { r } = await compareRegistry();
    const c = make({ classes: [{ class: "lantern-keeper", level: 3 }] });
    const { groups, missingLibrary } = await compareCharacter(c, r);
    expect(missingLibrary).toBeUndefined();
    const cls = group(groups, "Class: Lantern-keeper");
    expect(cls.title).toBe("Class: Lantern-keeper (levels 1 to 3)");
    expect(cls.lines).toContain("In the 2024 books this is Beacon-warden");
    expect(cls.lines).toContain("Hit die: d8 in the 2014 books, d10 in the 2024 books");
    expect(cls.lines).toContain("Dim Vision comes at level 3 in the 2014 books and level 2 in the 2024 books");
    // level 4 and 5 features are beyond the character
    expect(cls.lines.join("\n")).not.toContain("Flare"); expect(cls.lines.join("\n")).not.toContain("Shutter");
    const all = text(groups);
    expect(all).toMatch(/Saving throw training only under the 2024 rules: Strength/);
    expect(all).toMatch(/Saving throw training only under the 2014 rules: Constitution/);
    expect(all).toMatch(/Lantern oil 2 → 3/);
  });
  it("Show all levels compares every class to level 20", async () => {
    const { r } = await compareRegistry();
    const { groups } = await compareCharacter(make(), r, { allLevels: true });
    const cls = group(groups, "Class: Lantern-keeper");
    expect(cls.title).toBe("Class: Lantern-keeper (all levels, 1 to 20)");
    expect(cls.lines).toContain("Features only the 2024 books have: Flare");
    expect(cls.lines).toContain("Features only the 2014 books have: Shutter");
  });
  it("covers species, background, feats, spells and equipped weapons from data differences", async () => {
    const { r } = await compareRegistry();
    const c = make({ race: "fenling", background: "scribe", feats: ["keen"], spells: [{ id: "glint", prepared: true }],
      inventory: [{ id: "tin-blade", qty: 1, equipped: true, attuned: false }, { id: "tin-blade", qty: 1, equipped: false, attuned: false }] });
    const { groups } = await compareCharacter(c, r);
    const sp = group(groups, "Race: Fenling").lines;
    expect(sp).toContain("Ability bonuses: +2 Constitution in the 2014 books, none in the 2024 books");
    expect(sp).toContain("Features only the 2024 books have: Glide");
    expect(sp).toContain("Speed: 25 ft in the 2014 books, 30 ft in the 2024 books");
    expect(sp).toContain("Darkvision: 60 ft in the 2014 books, none in the 2024 books");
    expect(group(groups, "Background: Scribe").lines[0]).toMatch(/^Ability bonuses: none in the 2014 books, a choice of \+2 and \+1 or \+1, \+1 and \+1 across abilities you choose in the 2024 books$/);
    expect(group(groups, "Feat: Keen").lines).toContain("Earliest level you can take it: 1 in the 2014 books, 4 in the 2024 books");
    const spell = group(groups, "Spell: Glint").lines;
    expect(spell).toEqual(expect.arrayContaining(["Spell level: level 1 in the 2014 books, level 2 in the 2024 books", "Casting time: 1 action in the 2014 books, 1 bonus action in the 2024 books",
      "Range: 30 feet in the 2014 books, 60 feet in the 2024 books", "Duration: Instantaneous in the 2014 books, 1 minute in the 2024 books", "Damage dice: 2d6 in the 2014 books, 3d6 in the 2024 books"]));
    const w = groups.filter(g => g.title.startsWith("Weapon:"));
    expect(w).toHaveLength(1);   // the unequipped copy is not compared
    expect(w[0].lines).toEqual(["Damage dice: 1d6 in the 2014 books, 1d8 in the 2024 books", "Weapon mastery property: none in the 2014 books, Snag in the 2024 books"]);
  });
  it("a thing with no counterpart says so in the spec's words", async () => {
    const { r } = await compareRegistry();
    const c = make({ classes: [{ class: "lantern-keeper", subclass: "dusk", level: 3 }], spells: [{ id: "hush", prepared: true }] });
    const { groups } = await compareCharacter(c, r);
    expect(group(groups, "Subclass: Dusk").lines).toEqual(["The 2024 books have no version of this subclass; your table can keep using the 2014 one"]);
    expect(group(groups, "Spell: Hush").lines).toEqual(["The 2024 books have no version of this spell; your table can keep using the 2014 one"]);
  });
  it("a 2024 character looks back at 2014 and a brought-in row pairs by its own entry", async () => {
    const { r } = await compareRegistry();
    const c = make({ edition: "2024", classes: [{ class: "beacon-warden", level: 2 }], spells: [{ id: "glint", prepared: true }, { id: "glint@2014", prepared: false }, { id: "hush@2014", prepared: false }] });
    const { groups } = await compareCharacter(c, r);
    expect(group(groups, "Class: Beacon-warden").lines).toContain("In the 2014 books this is Lantern-keeper");
    const glints = groups.filter(g => g.title === "Spell: Glint");
    expect(glints.map(g => g.key)).toEqual(["spell:glint", "spell:glint@2014"]);
    expect(glints[0].pair!.own.edition).toBe("2024"); expect(glints[1].pair!.own.edition).toBe("2014");
    expect(glints[1].lines).toContain("Spell level: level 1 in the 2014 books, level 2 in the 2024 books");
    expect(glints[0].lines).toContain("Spell level: level 2 in the 2024 books, level 1 in the 2014 books");
    expect(group(groups, "Spell: Hush").lines).toEqual(["The 2024 books have no version of this spell; your table can keep using the 2014 one"]);
  });
  const spellFm = (id: string, name: string, level: number, extra: Record<string, unknown> = {}) => ({ type: "5e-spell", schema: 1, id, name, level, school: "evocation", ritual: false, casting_time: "1 action", range: "30 feet", components: "V, S",
    duration: "Instantaneous", concentration: false, classes: ["wizard"], tags: ["5e/spell"], ...extra });
  it("a hand-made note with no edition is used under both editions and is not paired", async () => {
    const { r } = await compareRegistry({ extra: { "compendium/5e/Homebrew/Spells/Glint.md": { fm: spellFm("glint", "Glint", 1, { source: "Homebrew" }), body: "Our own glint." } } });
    for (const edition of [undefined, "2024"]) {
      const c = make({ ...(edition ? { edition } : {}), classes: [{ class: edition ? "beacon-warden" : "lantern-keeper", level: 2 }], spells: [{ id: "glint", prepared: true }] });
      const { groups } = await compareCharacter(c, r);
      const g = group(groups, "Spell: Glint");
      expect(g.lines).toEqual(["Your own note for this spell has no edition, so the sheet uses it under both the 2014 and 2024 rules"]);
      expect(g.pair).toBeUndefined();
      expect(swapEdition(c, r).unmatched).toEqual([]);
    }
    const glint = r.get("spell", "glint")!;
    expect(counterpartOf(r, "spell", glint, "2024")).toBeUndefined(); expect(counterpartOf(r, "spell", glint, "2014")).toBeUndefined();
  });
  it("a library note over a bundled SRD id pairs as the library notes, from either edition", async () => {
    const extra = {
      "compendium/5e/WotC/Spells/Hollow-bolt.md": { fm: spellFm("hollow-bolt", "Hollow Bolt", 2, { source: "TST", edition: "2014" }), body: "Invented older text." },
      "compendium/5e/WotC 2024/Spells/Hollow-bolt.md": { fm: spellFm("hollow-bolt", "Hollow Bolt", 3, { source: "TST", edition: "2024" }), body: "Invented newer text." },
    };
    const { r } = await compareRegistry({ extra });
    expect(r.add("srd", "spell", { id: "hollow-bolt", name: "Hollow Bolt", level: 2, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V", "S"], duration: "Instantaneous", concentration: false, ritual: false, classes: ["wizard"], text: "Invented bundled text." }, { edition: "2014" })).toBeNull();
    expect(r.forEdition("2014").get("spell", "hollow-bolt")!.source).toBe("srd");
    for (const [edition, owner, other] of [[undefined, "2014", "2024"], ["2024", "2024", "2014"]] as const) {
      const c = make({ ...(edition ? { edition } : {}), classes: [{ class: edition ? "beacon-warden" : "lantern-keeper", level: 2 }], spells: [{ id: "hollow-bolt", prepared: true }] });
      const g = group((await compareCharacter(c, r)).groups, "Spell: Hollow Bolt");
      expect(g.pair!.own.source).toBe("vault"); expect(g.pair!.own.edition).toBe(owner);
      expect(g.pair!.other.source).toBe("vault"); expect(g.pair!.other.edition).toBe(other);
      expect(await r.bodyOf(g.pair!.own)).toBe(owner === "2014" ? "Invented older text." : "Invented newer text.");
    }
  });
  it("the whole-sheet groups say which side is which and read as a comparison", async () => {
    const { r } = await compareRegistry();
    const { groups } = await compareCharacter(make(), r);
    const i = groups.findIndex(g => g.title === "Your whole sheet, both ways");
    expect(i).toBeGreaterThan(-1);
    expect(groups[i].lines).toEqual(["Left of each arrow: your sheet under the 2014 rules. Right of it: the same character under the 2024 rules."]);
    expect(groups.slice(i + 1).map(g => g.title)).toContain("Numbers that differ");
    const all = text(groups.slice(i));
    expect(all).toMatch(/Saving throw training only under the 2024 rules: Strength/);
    expect(all).toMatch(/Saving throw training only under the 2014 rules: Constitution/);
    expect(all).not.toMatch(/ lost: /);
    const back = await compareCharacter(make({ edition: "2024", classes: [{ class: "beacon-warden", level: 2 }] }), r);
    expect(text(back.groups)).toContain("Left of each arrow: your sheet under the 2024 rules. Right of it: the same character under the 2014 rules.");
  });
  it("skips notes of a source the campaign switched off", async () => {
    const { r } = await compareRegistry();
    const lantern = r.getAll("class", "lantern-keeper").find(e => e.edition === "2014")!;
    const warden = r.getAll("class", "beacon-warden")[0];
    expect(counterpartOf(r, "class", lantern, "2024", { [warden.sourceName]: false })).toBeUndefined();
    expect(counterpartOf(r, "class", lantern, "2024", { Elsewhere: false })).toBe(warden);
  });
  it("reads only the notes it pairs (Review Focus 5)", async () => {
    const { r, vault } = await compareRegistry();
    vault.reads.length = 0;
    const c = make({ spells: [{ id: "glint", prepared: true }, { id: "hush", prepared: false }], inventory: [{ id: "tin-blade", qty: 1, equipped: true, attuned: false }] });
    await compareCharacter(c, r, { allLevels: true });
    // glint pairs (2 notes) and the tin-blade pairs (2 notes); hush has no counterpart, so it is not opened; the 25 padding spells never are
    const paired = 4;
    expect(vault.reads.length).toBeLessThanOrEqual(paired);
    expect(vault.reads.some(p => p.includes("Pad-"))).toBe(false);
    expect(vault.reads.some(p => p.includes("Hush"))).toBe(false);
  });
  it("with no other library it says so and returns no groups", async () => {
    const { r } = await compareRegistry({ no2024: true });
    const out = await compareCharacter(make(), r);
    expect(out).toEqual({ groups: [], missingLibrary: "2024" });
  });
  it("a class with no hit die or an empty level table does not throw", async () => {
    const { r } = await compareRegistry();
    const bw = r.get<{ hitDie?: number; levels?: unknown }>("class", "beacon-warden@2024")!;
    const lk = r.get<{ hitDie?: number; levels?: unknown }>("class", "lantern-keeper@2014")!;
    const keep = [bw.data, lk.data];
    try {
      bw.data = { ...bw.data, hitDie: undefined, levels: {} } as typeof bw.data;
      const a = await compareCharacter(make(), r, { allLevels: true });
      expect(group(a.groups, "Class: Lantern-keeper").lines).toContain("Hit die: d8 in the 2014 books, none in the 2024 books");
      lk.data = { ...lk.data, hitDie: undefined, levels: undefined } as typeof lk.data;
      const b = await compareCharacter(make(), r);
      expect(b.groups.length).toBeGreaterThan(0);
    } finally { bw.data = keep[0] as typeof bw.data; lk.data = keep[1] as typeof lk.data; }
  });
  it("a reference neither edition has is skipped, not thrown on", async () => {
    const { r } = await compareRegistry();
    const { groups } = await compareCharacter(make({ feats: ["ghostfeat"], spells: [{ id: "ghostspell", prepared: false }] }), r);
    expect(groups.some(g => g.title.includes("ghost"))).toBe(false);
  });
});
