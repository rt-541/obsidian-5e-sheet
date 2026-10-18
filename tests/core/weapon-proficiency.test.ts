import { newCharacter, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { homebrewRegistry } from "../fixtures/homebrew";

const weaponFeat = { type: "5e-feat", name: "Blade Training", grants: [{ op: "grant", proficiencies: ["Longswords"] }] };
const reg = homebrewRegistry([weaponFeat]);
reg.add("vault", "item", { name: "Plain stick", kind: "weapon", weapon: { dmg: "1d4", type: "bludgeoning", ab: "str", range: "melee" } }, { path: "s.md" });
reg.add("vault", "item", { name: "Flaming longsword", kind: "weapon", weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee", bonus: 1, category: "martial" } }, { path: "f.md" });

const who = (classes: Character["classes"], gear: string[], o: Partial<Character> = {}): Character => ({
  ...newCharacter("T"), abilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, classes,
  inventory: gear.map(id => ({ id, qty: 1, equipped: true, attuned: false })), ...o });
const atk = (c: Character, name: string) => deriveCharacter(c, { registry: reg }).attacks.find(a => a.name === name)!;
// level 1: proficiency bonus +2, Strength 14 gives +2
const WITH = 4, WITHOUT = 2, DEX_WITH = 2, DEX_WITHOUT = 0;

describe("weapon proficiency", () => {
  it("a Fighter is proficient with simple and martial weapons", () => {
    const c = who([{ class: "fighter", level: 1 }], ["longsword", "club"]);
    expect(atk(c, "Longsword").toHit).toBe(WITH); expect(atk(c, "Club").toHit).toBe(WITH);
    expect(atk(c, "Longsword").note).toBeUndefined();
  });
  it("a Cleric has simple weapons but not martial ones, and the attack says why", () => {
    const c = who([{ class: "cleric", level: 1 }], ["mace", "longsword"]);
    expect(atk(c, "Mace").toHit).toBe(WITH);
    const l = atk(c, "Longsword");
    expect(l.toHit).toBe(WITHOUT); expect(l.proficient).toBe(false);
    expect(l.note).toBe("Not proficient with this weapon, so the proficiency bonus is not added.");
  });
  it("a Wizard knows its named weapons, including the 'Crossbows, light' spelling", () => {
    const c = who([{ class: "wizard", level: 1 }], ["dagger", "light-crossbow", "mace"]);
    expect(atk(c, "Dagger").toHit).toBeGreaterThan(WITHOUT);                      // finesse picks the better of Str and Dex
    expect(atk(c, "Light crossbow").toHit).toBe(DEX_WITH);                         // Dexterity 10 adds nothing
    expect(atk(c, "Mace").toHit).toBe(WITHOUT);
  });
  it("a Bard's rapier is named, its longbow is not", () => {
    const c = who([{ class: "bard", level: 1 }], ["rapier", "longbow"]);
    expect(atk(c, "Rapier").toHit).toBe(WITH); expect(atk(c, "Longbow").toHit).toBe(DEX_WITHOUT);
  });
  it("a race can name weapons: dwarves are trained with the warhammer", () => {
    const c = who([{ class: "cleric", level: 1 }], ["warhammer"], { race: "dwarf" });
    expect(atk(c, "Warhammer").toHit).toBe(WITH);
    expect(atk(who([{ class: "cleric", level: 1 }], ["warhammer"]), "Warhammer").toHit).toBe(WITHOUT);
  });
  it("a feat that grants a weapon proficiency counts", () => {
    const c = who([{ class: "wizard", level: 1 }], ["longsword"], { feats: ["blade-training"] });
    expect(atk(c, "Longsword").toHit).toBe(WITH);
  });
  it("a second class adds its multiclass weapon proficiencies", () => {
    const c = who([{ class: "wizard", level: 1 }, { class: "fighter", level: 1 }], ["longsword"]);
    expect(atk(c, "Longsword").toHit).toBe(WITH);                                    // total level 2 is still +2 proficiency
  });
  it("a magic weapon's bonus still counts when the character is not proficient", () => {
    const c = who([{ class: "cleric", level: 1 }], ["flaming-longsword"]);
    expect(atk(c, "Flaming longsword").toHit).toBe(WITHOUT + 1); expect(atk(c, "Flaming longsword").proficient).toBe(false);
  });
  it("a weapon with no category, or a character whose class is not in the compendium, gets the benefit of the doubt", () => {
    expect(atk(who([{ class: "wizard", level: 1 }], ["plain-stick"]), "Plain stick").toHit).toBe(WITH);
    expect(atk(who([{ class: "mystery-class", level: 1 }], ["longsword"]), "Longsword").toHit).toBe(WITH);
    expect(atk(who([], ["longsword"]), "Longsword").toHit).toBe(WITH);
    // a race the compendium does not have might grant weapons, so nothing is taken away
    expect(atk(who([{ class: "cleric", level: 1 }], ["longsword"], { race: "hill-dwarf" }), "Longsword").toHit).toBe(WITH);
  });
});
