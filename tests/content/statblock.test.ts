import { readFileSync } from "node:fs";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { creatureType } from "../../src/content/types/creature";
import { blankDraft, draftToNote, freeName, joinDamage, normalizeDice, splitDamage, validateDraft } from "../../src/content/creature-note";
import { parseStatblock, STATBLOCK_TEMPLATE } from "../../src/content/statblock";

// Invented creatures only.
const SPIDER = `Test Spider
Medium beast, unaligned
Armor Class 13 (natural armor)
Hit Points 11 (2d8 + 2)
Speed 30 ft., climb 30 ft.

STR DEX CON INT WIS CHA
12 (+1) 16 (+3) 12 (+1) 2 (-4) 10 (+0) 4 (-3)

Skills Stealth +5
Senses blindsight 10 ft., darkvision 60 ft., passive Perception 10
Languages -
Challenge 1/4 (50 XP)

Spider Climb. The spider can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.

Web Walker. The spider ignores movement restrictions caused by webbing.

Actions
Bite. Melee Weapon Attack: +3 to hit, reach 5 ft., one creature. Hit: 4 (1d6 + 1) piercing damage, and the target must make a DC 11 Constitution saving throw, taking 9 (2d8) poison damage on a failed save, or half as much damage on a successful one.`;

describe("parseStatblock", () => {
  it("reads a plain-text block in the 2014 layout", () => {
    const { draft: d, unread } = parseStatblock(SPIDER);
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ name: "Test Spider", size: "Medium", ctype: "beast", alignment: "unaligned", ac: 13, acNote: "natural armor", hpAvg: 11, hpFormula: "2d8+2", cr: "1/4", skills: { stealth: 5 } });
    expect(d.speed).toEqual({ walk: 30, climb: 30 });
    expect(d.abilities).toEqual({ str: 12, dex: 16, con: 12, int: 2, wis: 10, cha: 4 });
    expect(d.senses).toBe("blindsight 10 ft., darkvision 60 ft., passive Perception 10");
    expect(d.languages).toBeUndefined();
    expect(d.traits.map(t => t.name)).toEqual(["Spider Climb", "Web Walker"]);
    expect(d.attacks).toEqual([{ name: "Bite", toHit: 3, damage: "1d6+1 piercing", note: "Reach 5 ft., one creature. The target must make a DC 11 Constitution saving throw, taking 9 (2d8) poison damage on a failed save, or half as much damage on a successful one." }]);
  });

  it("reads the same block inside a 5e-statblock fence", () => {
    const fenced = "Some note text\n\n```5e-statblock\n" + SPIDER + "\n```\n\nafter";
    expect(parseStatblock(fenced)).toEqual(parseStatblock(SPIDER));
  });

  it("reads the ability scores one per line, or interleaved with their labels", () => {
    const oneEach = SPIDER.replace("STR DEX CON INT WIS CHA\n12 (+1) 16 (+3) 12 (+1) 2 (-4) 10 (+0) 4 (-3)", "STR\n12 (+1)\nDEX\n16 (+3)\nCON\n12 (+1)\nINT\n2 (-4)\nWIS\n10 (+0)\nCHA\n4 (-3)");
    expect(parseStatblock(oneEach).draft.abilities).toEqual(parseStatblock(SPIDER).draft.abilities);
    const inline = SPIDER.replace("STR DEX CON INT WIS CHA\n12 (+1) 16 (+3) 12 (+1) 2 (-4) 10 (+0) 4 (-3)", "STR 12 (+1) DEX 16 (+3) CON 12 (+1) INT 2 (-4) WIS 10 (+0) CHA 4 (-3)");
    expect(parseStatblock(inline).draft.abilities).toEqual(parseStatblock(SPIDER).draft.abilities);
  });

  it("tolerates blank lines, unicode minus, bullets and markdown emphasis", () => {
    const messy = SPIDER.replace(/\n/g, "\n\n").replace("(-4)", "(−4)").replace("(-3)", "(−3)").replace("Spider Climb.", "***Spider Climb.***").replace("Bite.", "**Bite.**")
      .replace("Armor Class", "- **Armor Class**").replace("Hit Points", "• Hit Points").replace("Challenge", "> Challenge");
    const { draft: d, unread } = parseStatblock(messy);
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ ac: 13, hpAvg: 11, cr: "1/4" });
    expect(d.abilities.int).toBe(2);
    expect(d.traits[0].name).toBe("Spider Climb");
    expect(d.attacks[0]).toMatchObject({ name: "Bite", toHit: 3, damage: "1d6+1 piercing" });
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
    const { draft: d } = parseStatblock(SPIDER.replace("without needing to make an ability check.", "without needing to\nmake an ability check.\nPack Tactics. Advantage when an ally is near."));
    expect(d.traits[0].text).toMatch(/without needing to make an ability check\.$/);
    expect(d.traits.map(t => t.name)).toEqual(["Spider Climb", "Pack Tactics", "Web Walker"]);
  });

  it("lists lines it could not read, in the player's own words", () => {
    const r = parseStatblock(SPIDER.replace("Skills Stealth +5", "Skills Stealth +5\nthis line is nonsense that means nothing"));
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
    const { draft } = parseStatblock(SPIDER);
    expect(validateDraft(draft)).toEqual([]);
    const { id, fm, body } = draftToNote(draft);
    expect(id).toBe("test-spider");
    const res = creatureType.validate(fm);
    expect(res.errors).toEqual([]);
    expect(res.value).toMatchObject({ name: "Test Spider", ac: 13, hp: { average: 11, formula: "2d8+2" }, speed: { walk: 30, climb: 30 }, cr: "1/4", ctype: "beast" });
    expect(res.value!.attacks[0]).toMatchObject({ name: "Bite", toHit: 3, damage: "1d6+1 piercing" });
    expect(body).toContain("***Spider Climb.***");
    expect(body).toContain("## Actions");
    // and the registry accepts it like a vault note
    const r = reg();
    expect(r.add("vault", "creature", fm, { path: "compendium/5e/Homebrew/Creatures/Test Spider.md", body, sourceName: "Homebrew" })).toBeNull();
    expect(r.get("creature", "test-spider")).toBeDefined();
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
    expect(normalizeDice("2d8 + 2")).toBe("2d8+2");
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
