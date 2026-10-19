import { readFileSync } from "node:fs";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { creatureType } from "../../src/content/types/creature";
import { blankDraft, draftToNote, freeName, joinDamage, normalizeDice, splitDamage, validateDraft } from "../../src/content/creature-note";
import { parseStatblock, STATBLOCK_TEMPLATE } from "../../src/content/statblock";

// Invented creatures only.
const CRAWLER = `Test Crawler
Small beast, unaligned
Armor Class 14 (natural armor)
Hit Points 13 (3d6 + 3)
Speed 25 ft., climb 25 ft.

STR DEX CON INT WIS CHA
8 (-1) 15 (+2) 12 (+1) 3 (-4) 11 (+0) 5 (-3)

Skills Stealth +4
Senses darkvision 30 ft., passive Perception 10
Languages -
Challenge 1/8 (25 XP)

Wall Crawl. The test crawler walks on walls and ceilings as easily as on the floor.

Silk Stride. The test crawler moves through its own silk without slowing down.

Actions
Nip. Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) piercing damage, and the target must succeed on a DC 10 Constitution saving throw or take 3 (1d6) acid damage.`;

describe("parseStatblock", () => {
  it("reads a plain-text block in the 2014 layout", () => {
    const { draft: d, unread } = parseStatblock(CRAWLER);
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ name: "Test Crawler", size: "Small", ctype: "beast", alignment: "unaligned", ac: 14, acNote: "natural armor", hpAvg: 13, hpFormula: "3d6+3", cr: "1/8", skills: { stealth: 4 } });
    expect(d.speed).toEqual({ walk: 25, climb: 25 });
    expect(d.abilities).toEqual({ str: 8, dex: 15, con: 12, int: 3, wis: 11, cha: 5 });
    expect(d.senses).toBe("darkvision 30 ft., passive Perception 10");
    expect(d.languages).toBeUndefined();
    expect(d.traits.map(t => t.name)).toEqual(["Wall Crawl", "Silk Stride"]);
    expect(d.attacks).toEqual([{ name: "Nip", toHit: 4, damage: "1d6+2 piercing", note: "Reach 5 ft., one creature. The target must succeed on a DC 10 Constitution saving throw or take 3 (1d6) acid damage." }]);
  });

  it("reads the same block inside a 5e-statblock fence", () => {
    const fenced = "Some note text\n\n```5e-statblock\n" + CRAWLER + "\n```\n\nafter";
    expect(parseStatblock(fenced)).toEqual(parseStatblock(CRAWLER));
  });

  it("reads the ability scores one per line, or interleaved with their labels", () => {
    const oneEach = CRAWLER.replace("STR DEX CON INT WIS CHA\n8 (-1) 15 (+2) 12 (+1) 3 (-4) 11 (+0) 5 (-3)", "STR\n8 (-1)\nDEX\n15 (+2)\nCON\n12 (+1)\nINT\n3 (-4)\nWIS\n11 (+0)\nCHA\n5 (-3)");
    expect(parseStatblock(oneEach).draft.abilities).toEqual(parseStatblock(CRAWLER).draft.abilities);
    const inline = CRAWLER.replace("STR DEX CON INT WIS CHA\n8 (-1) 15 (+2) 12 (+1) 3 (-4) 11 (+0) 5 (-3)", "STR 8 (-1) DEX 15 (+2) CON 12 (+1) INT 3 (-4) WIS 11 (+0) CHA 5 (-3)");
    expect(parseStatblock(inline).draft.abilities).toEqual(parseStatblock(CRAWLER).draft.abilities);
  });

  it("tolerates blank lines, unicode minus, bullets and markdown emphasis", () => {
    const messy = CRAWLER.replace(/\n/g, "\n\n").replace("(-4)", "(−4)").replace("(-3)", "(−3)").replace("Wall Crawl.", "***Wall Crawl.***").replace("Nip.", "**Nip.**")
      .replace("Armor Class", "- **Armor Class**").replace("Hit Points", "• Hit Points").replace("Challenge", "> Challenge");
    const { draft: d, unread } = parseStatblock(messy);
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ ac: 14, hpAvg: 13, cr: "1/8" });
    expect(d.abilities.int).toBe(3);
    expect(d.traits[0].name).toBe("Wall Crawl");
    expect(d.attacks[0]).toMatchObject({ name: "Nip", toHit: 4, damage: "1d6+2 piercing" });
  });

  it("takes several damage types, flat damage and negative to-hit", () => {
    const { draft: d } = parseStatblock(`Glass Beetle
Small monstrosity, neutral
Armor Class 15
Hit Points 20 (4d6 + 6)
Speed 20 ft., burrow 10 ft., fly 30 ft. (hover)
STR DEX CON INT WIS CHA
8 (-1) 12 (+1) 14 (+2) 1 (-5) 9 (-1) 3 (-4)
Damage Resistances fire, cold
Damage Immunities poison
Condition Immunities poisoned, charmed
Challenge 1 (200 XP)
Actions
Shard Sting. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d10 + 2) piercing damage plus 3 (1d6) fire damage.
Nip. Melee Weapon Attack: -1 to hit, reach 5 ft., one target. Hit: 1 piercing damage.`);
    expect(d.attacks[0]).toMatchObject({ toHit: 4, damage: "1d10+2 piercing + 1d6 fire" });
    expect(d.attacks[1]).toMatchObject({ toHit: -1, damage: "1 piercing" });
    expect(d.speed).toEqual({ walk: 20, fly: 30 });
    expect(d.extras).toContain("**Burrow speed** 10 ft.");
    expect(d).toMatchObject({ resist: ["fire", "cold"], immune: ["poison"], conditionImmune: ["poisoned", "charmed"], size: "Small", alignment: "neutral" });
  });

  it("keeps conditional resistances as text only", () => {
    const { draft: d } = parseStatblock("Stone Pup\nMedium construct, unaligned\nArmor Class 14\nHit Points 10 (3d8)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n10 (+0) 10 (+0) 10 (+0) 10 (+0) 10 (+0) 10 (+0)\nDamage Resistances bludgeoning, piercing, and slashing from nonmagical attacks");
    expect(d.resist).toEqual([]);
    expect(d.extras[0]).toContain("nonmagical");
  });

  it("reads a pure saving-throw action and keeps reactions and legendary actions as traits", () => {
    const { draft: d } = parseStatblock(`Dusk Wyrm
Large dragon, lawful neutral
Armor Class 16
Hit Points 90 (12d10 + 24)
Speed 40 ft.
STR DEX CON INT WIS CHA
18 (+4) 12 (+1) 14 (+2) 10 (+0) 10 (+0) 12 (+1)
Challenge 5 (1,800 XP)
Actions
Ash Breath (Recharge 5-6). The wyrm exhales ash in a 15-foot cone. Each creature in that area must make a DC 13 Dexterity saving throw, taking 18 (4d8) fire damage on a failed save, or half as much on a success.
Reactions
Sidestep. The wyrm halves the damage from one attack it can see.
Legendary Actions
The wyrm can take 2 legendary actions, choosing from the options below.
Tail Swipe. The wyrm makes one tail attack.`);
    expect(d.attacks).toHaveLength(1);
    expect(d.attacks[0]).toMatchObject({ name: "Ash Breath (Recharge 5-6)", save: { abil: "dex", dc: 13 }, damage: "4d8 fire" });
    expect(d.traits.map(t => t.name)).toEqual(["Sidestep (Reaction)", "Legendary actions", "Tail Swipe (Legendary action)"]);
  });

  it("joins a trait that wraps over lines but starts a new one after a sentence end", () => {
    const { draft: d } = parseStatblock(CRAWLER.replace("as easily as on the floor.", "as easily as\non the floor.\nPack Tactics. Advantage when an ally is near."));
    expect(d.traits[0].text).toMatch(/as easily as on the floor\.$/);
    expect(d.traits.map(t => t.name)).toEqual(["Wall Crawl", "Pack Tactics", "Silk Stride"]);
  });

  it("lists lines it could not read, in the player's own words", () => {
    const r = parseStatblock(CRAWLER.replace("Skills Stealth +4", "Skills Stealth +4\nthis line is nonsense that means nothing"));
    expect(r.unread).toEqual(["this line is nonsense that means nothing"]);
    const bare = parseStatblock("Nothing Useful\nwhat is this");
    expect(bare.unread).toContain("Ability scores (STR DEX CON INT WIS CHA)");
  });

  it("reads the copyable template with nothing left over", () => {
    const { draft: d, unread } = parseStatblock(STATBLOCK_TEMPLATE);
    expect(unread).toEqual([]);
    expect(d.name).toBe("Creature Name");
    expect(validateDraft(d)).toEqual([]);
    expect(d.attacks[0]).toMatchObject({ name: "Bite", toHit: 3, damage: "1d6+1 piercing" });
  });
});

describe("creature notes", () => {
  const reg = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };

  it("a parsed stat block becomes a note that round-trips through creatureType.validate", () => {
    const { draft } = parseStatblock(CRAWLER);
    expect(validateDraft(draft)).toEqual([]);
    const { id, fm, body } = draftToNote(draft);
    expect(id).toBe("test-crawler");
    const res = creatureType.validate(fm);
    expect(res.errors).toEqual([]);
    expect(res.value).toMatchObject({ name: "Test Crawler", ac: 14, hp: { average: 13, formula: "3d6+3" }, speed: { walk: 25, climb: 25 }, cr: "1/8", ctype: "beast" });
    expect(res.value!.attacks[0]).toMatchObject({ name: "Nip", toHit: 4, damage: "1d6+2 piercing" });
    expect(body).toContain("***Wall Crawl.***");
    expect(body).toContain("## Actions");
    // and the registry accepts it like a vault note
    const r = reg();
    expect(r.add("vault", "creature", fm, { path: "compendium/5e/Homebrew/Creatures/Test Crawler.md", body, sourceName: "Homebrew" })).toBeNull();
    expect(r.get("creature", "test-crawler")).toBeDefined();
  });

  it("keeps resistances, immunities and condition immunities that are plain types", () => {
    const d = blankDraft(); d.name = "Glass Beetle"; d.ac = 12; d.hpAvg = 9; d.resist = ["fire"]; d.immune = ["poison"]; d.conditionImmune = ["poisoned"];
    const { fm } = draftToNote(d);
    expect(creatureType.validate(fm)).toMatchObject({ errors: [], value: { effects: { resist: ["fire"], immune: ["poison"], conditionImmune: ["poisoned"] } } });
  });

  it("validates in plain words", () => {
    const d = blankDraft();
    expect(validateDraft(d)).toEqual(["Give the creature a name.", "Armor Class must be a whole number, like 12.", "Hit Points must be a whole number, like 9."]);
    Object.assign(d, { name: "X", ac: 12, hpAvg: 4, hpFormula: "lots", cr: "abc" }); d.attacks = [{ name: "", toHit: 2.5, damage: "big" }]; d.abilities.str = 40;
    expect(validateDraft(d)).toEqual(["Hit Point dice should look like 2d8+2 (or leave it empty).", "Strength must be a number from 1 to 30.", "Challenge should be a number like 2, or 1/2, 1/4, 1/8.",
      "Attack 1 needs a name.", "Attack 1: the to-hit bonus must be a whole number, like +3.", "Attack 1: write the damage as dice, like 1d6+1."]);
  });

  it("dice helpers", () => {
    expect(normalizeDice("3d6 + 3")).toBe("3d6+3");
    expect(joinDamage("1d6 + 1", "piercing")).toBe("1d6+1 piercing");
    expect(joinDamage("1d10+2 piercing + 1d6 fire", "")).toBe("1d10+2 piercing + 1d6 fire");
    expect(splitDamage("1d6+1 piercing")).toEqual({ dice: "1d6+1", type: "piercing" });
    expect(splitDamage("1d10+2 piercing + 1d6 fire")).toEqual({ dice: "1d10+2 piercing + 1d6 fire", type: "" });
  });

  it("freeName appends (2), (3) ...", () => {
    const taken = new Set(["Wolf", "Wolf (2)"]);
    expect(freeName("Cat", n => taken.has(n))).toBe("Cat");
    expect(freeName("Wolf", n => taken.has(n))).toBe("Wolf (3)");
  });
});

describe("README", () => {
  it("documents exactly the template the Copy template button hands out", () => {
    expect(readFileSync("README.md", "utf8")).toContain(STATBLOCK_TEMPLATE.trimEnd());
  });
});
