import type { Notes } from "./library";

/**
 * Frontmatter of the dnd-compendium session's templates (invented homebrew, safe to commit), placed under a Homebrew/ path.
 * Bodies are single invented sentences. Used to prove that library-schema notes written by hand load as usable entries.
 */
const R = "compendium/5e/Homebrew";
export const templateNotes = (): Notes => ({
  [`${R}/Backgrounds/Forge Apprentice.md`]: { body: "A made-up background about forge work.", fm: {
    type: "5e-background", schema: 1, id: "forge-apprentice", name: "Forge Apprentice", source: "Homebrew",
    grants: [
      { op: "grant", id: "grant", proficiencies: ["skill:athletics", "skill:history", "Smith's Tools"], items: ["smiths-tools", "common-clothes", "pouch"] },
      { op: "choose", id: "languages", what: "languages", count: 1 },
      { op: "feature", id: "anvil-network", name: "Anvil Network", text: "Smiths in any town will give you a bed and a meal in exchange for a day's work at the forge." },
    ], tags: ["5e/background", "5e/source/homebrew"] } },
  [`${R}/Classes/Ember Warden/Ember Warden.md`]: { body: "A made-up class.", fm: {
    type: "5e-class", schema: 1, id: "ember-warden", name: "Ember Warden", source: "Homebrew", hitDie: 10, saves: ["str", "con"],
    proficiencies: ["Light Armor", "Medium Armor", "Shields", "Simple Weapons", "Martial Weapons"],
    skills: { count: 2, from: ["athletics", "insight", "intimidation", "perception", "survival"] },
    multiclass: { requires: { all: { str: 13 } }, proficiencies: ["Light Armor", "Medium Armor", "Shields"] },
    gold: "5d4*10",
    options: { wards: [
      { id: "ash-ward", name: "Ash Ward", text: "When an ally within 5 feet is hit, reduce the damage by your Warden Die." },
      { id: "cinder-ward", name: "Cinder Ward", text: "Your melee hits deal an extra Warden Die of fire damage.", minLevel: 5 },
    ] },
    subclassLevel: 3,
    levels: {
      1: [
        { op: "feature", id: "kindled-guard", name: "Kindled Guard", text: "As a bonus action you kindle for 1 minute: +1 AC and resistance to cold damage." },
        { op: "resource", id: "res-kindled-guard", name: "Kindled Guard", max: "prof", reset: "long" },
        { op: "scale", id: "scale-warden-die", name: "Warden Die", values: { 1: "1d4", 5: "1d6", 11: "1d8", 17: "1d10" } },
        { op: "choose", id: "wards-1", what: "option", list: "wards", count: 1 },
      ],
      2: [
        { op: "feature", id: "hearth-call", name: "Hearth Call", text: "Once per short rest you can regain {warden-die} + level hit points as a bonus action." },
        { op: "resource", id: "res-hearth-call", name: "Hearth Call", max: 1, reset: "short" },
      ],
      3: [{ op: "subclass", id: "subclass" }],
      4: [{ op: "asi", id: "asi" }],
      5: [
        { op: "feature", id: "extra-attack", name: "Extra Attack", text: "You can attack twice when you take the Attack action." },
        { op: "choose", id: "wards-5", what: "option", list: "wards", count: 1, swap: true },
      ],
    }, tags: ["5e/class", "5e/source/homebrew", "5e/class/ember-warden"] } },
  [`${R}/Classes/Ember Warden/Subclasses/Oath of the Pyre.md`]: { body: "A made-up subclass.", fm: {
    type: "5e-subclass", schema: 1, id: "oath-of-the-pyre", name: "Oath of the Pyre", source: "Homebrew", class: "ember-warden",
    levels: {
      3: [
        { op: "feature", id: "pyre-strike", name: "Pyre Strike", text: "Once per turn when you hit, add your Warden Die as fire damage." },
        { op: "grant", id: "spells-3", spells: ["burning-hands", "hellish-rebuke"] },
        { op: "dc", id: "dc-pyre", name: "Pyre", abil: "con" },
      ],
      7: [{ op: "feature", id: "smoldering-aura", name: "Smoldering Aura", text: "Creatures of your choice that start their turn within 10 feet take 2 fire damage." }],
    }, tags: ["5e/subclass", "5e/source/homebrew", "5e/class/ember-warden"] } },
  [`${R}/Conditions/Frostbitten.md`]: { body: "A made-up chill.", fm: {
    type: "5e-condition", schema: 1, id: "frostbitten", name: "Frostbitten", source: "Homebrew", condition_kind: "condition",
    effects: { dis: ["check:dex", "attack:!str"], modifiers: [{ target: "speed", value: -10 }] }, tags: ["5e/condition", "5e/source/homebrew"] } },
  [`${R}/Creatures/Ember Hound.md`]: { body: "A made-up hound.\n\n## Actions\n\n***Bite.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 7 (1d10 + 2) piercing damage plus 3 (1d6) fire damage.", fm: {
    type: "5e-creature", schema: 1, id: "ember-hound", name: "Ember Hound", source: "Homebrew", size: "Medium", creature_type: "elemental",
    alignment: "neutral evil", ac: 14, ac_note: "(natural armor)", hp: 45, hp_formula: "6d8 + 18", speed: "40 ft.",
    abilities: { str: 15, dex: 14, con: 16, int: 4, wis: 12, cha: 6 }, skills: { perception: 3 }, damage_immunities: ["fire"],
    condition_immunities: ["poisoned"], senses: "darkvision 60 ft., passive Perception 13", passive_perception: 13,
    languages: "understands Ignan but can't speak", cr: "2", cr_value: 2, xp: 450,
    tags: ["5e/creature", "5e/source/homebrew", "5e/cr/2", "5e/tier/1", "5e/type/elemental", "5e/size/medium", "5e/immune/fire"] } },
  [`${R}/Feats/Ember Adept.md`]: { body: "A made-up feat.", fm: {
    type: "5e-feat", schema: 1, id: "ember-adept", name: "Ember Adept", source: "Homebrew", prerequisite: "The ability to cast at least one spell",
    ability: [{ choose: { from: ["int", "wis", "cha"], amount: 1 } }],
    grants: [{ op: "feature", id: "ember-adept", name: "Ember Adept", text: "Increase your Intelligence, Wisdom or Charisma by 1, to a maximum of 20. When you roll fire damage for a spell, you can reroll any 1s once." }],
    tags: ["5e/feat", "5e/source/homebrew"] } },
  [`${R}/Items/Emberheart Band.md`]: { body: "While worn, this made-up ring wards against fire.", fm: {
    type: "5e-item", schema: 1, id: "emberheart-band", name: "Emberheart Band", source: "Homebrew", item_type: "Ring", rarity: "uncommon",
    attunement: true, magic: true, effects: { resist: ["fire"], note: "Once per dawn, speak the command word to deal 1d6 fire damage with your next melee hit." },
    tags: ["5e/item", "5e/item/ring", "5e/rarity/uncommon", "5e/attunement", "5e/source/homebrew"] } },
  [`${R}/Races/Emberkin.md`]: { body: "A made-up race.", fm: {
    type: "5e-race", schema: 1, id: "emberkin", name: "Emberkin", source: "Homebrew", size: ["Medium"], ability: [{ cha: 2, con: 1 }],
    grants: [
      { op: "grant", id: "grant", languages: ["Common", "Ignan"], speed: 30, darkvision: 60 },
      { op: "feature", id: "ability-score-increase", name: "Ability Score Increase", text: "Your Charisma score increases by 2, and your Constitution score increases by 1." },
      { op: "feature", id: "hearthblood", name: "Hearthblood", text: "You have resistance to fire damage.", effects: { resist: ["fire"] } },
      { op: "choose", id: "skills", what: "skills", count: 1, from: ["intimidation", "performance", "persuasion"] },
    ], tags: ["5e/race", "5e/source/homebrew"] } },
  [`${R}/Spells/Cinder Lash.md`]: { body: "A whip of embers cracks at one creature. It must make a Dexterity saving throw, taking 2d6 fire damage on a failed save, or half as much damage on a successful one.\n\n***At Higher Levels.*** When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.", fm: {
    type: "5e-spell", schema: 1, id: "cinder-lash", name: "Cinder Lash", source: "Homebrew", level: 1, school: "evocation", ritual: false,
    casting_time: "1 bonus action", range: "30 feet", components: "V, S, M (a pinch of ash)", material: "a pinch of ash", duration: "Instantaneous",
    concentration: false, classes: ["sorcerer", "wizard"],
    tags: ["5e/spell", "5e/spell/level/1", "5e/school/evocation", "5e/cast/bonus-action", "5e/class/sorcerer", "5e/class/wizard", "5e/save/dex", "5e/damage/fire", "5e/source/homebrew"] } },
});
