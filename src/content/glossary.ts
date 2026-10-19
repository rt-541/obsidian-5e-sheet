import { titleCase } from "../core/words";
import { ABILS, SKILLS, type Abil } from "../core/types";

/** Short plain-words descriptions of the numbers on the sheet, written for players who do not know the rules. Our own words, never book text. */
export interface GlossaryEntry { title: string; kind: string; text: string; abil?: Abil }

export const ABIL_FULL: Record<Abil, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const ABIL_TEXT: Record<Abil, string> = {
  str: "Raw muscle: lifting, pushing, climbing, jumping and hitting hard with heavy weapons.",
  dex: "Quickness and balance: dodging, aiming, sneaking, and fighting with light or ranged weapons.",
  con: "Toughness: how much punishment you take. It adds to your hit points every level and helps you keep a spell going when hit.",
  int: "Book smarts: memory, reasoning and knowledge. Wizards cast with it.",
  wis: "Awareness and common sense: noticing things, reading people, surviving in the wild. Clerics and druids cast with it.",
  cha: "Force of personality: talking, lying, scaring and performing. Bards, sorcerers and warlocks cast with it.",
};
const SAVE_TEXT: Record<Abil, string> = {
  str: "Rolled to resist being shoved, held or crushed by something stronger than you.",
  dex: "Rolled to get out of the way of a blast, trap or falling rock.",
  con: "Rolled to shake off poison, disease and cold, and to keep a spell going when you are hit.",
  int: "Rolled to see through illusions or resist attacks on your mind.",
  wis: "Rolled to resist charm, fear and other attempts to bend your will.",
  cha: "Rolled to resist being banished or having your very self twisted.",
};
const SKILL_TEXT: Record<string, string> = {
  acrobatics: "Staying on your feet and landing well: balancing, tumbling, slipping free.",
  "animal-handling": "Calming, steering or reading an animal, such as a horse or a guard dog.",
  arcana: "What you know about magic, spells, magic items and strange planes.",
  athletics: "Raw physical effort: climbing, swimming, jumping, and shoving or grappling.",
  deception: "Lying convincingly, disguising your meaning, or keeping a straight face.",
  history: "What you remember about past events, kingdoms, wars and old legends.",
  insight: "Telling whether someone is lying or hiding something, and what they really want.",
  intimidation: "Getting your way by looking dangerous or making threats.",
  investigation: "Searching carefully and working out clues, hidden doors or how something works.",
  medicine: "Patching up wounds, stabilising a dying friend, and spotting illness.",
  nature: "What you know about plants, animals, weather and the land.",
  perception: "Spotting, hearing or smelling what is around you: the ambush, the hidden door.",
  performance: "Entertaining a crowd with music, song, acting or storytelling.",
  persuasion: "Getting your way with polite, honest or charming talk.",
  religion: "What you know about gods, rites, holy symbols and the undead.",
  "sleight-of-hand": "Quick fingers: picking pockets, palming items, planting something unseen.",
  stealth: "Moving quietly and staying out of sight.",
  survival: "Tracking, finding food and water, and not getting lost outdoors.",
};
const TERMS: Record<string, { title: string; text: string }> = {
  "ability-modifier": { title: "Ability modifier", text: "The small number that goes with each ability score. It is added to (or taken from) the d20 whenever you roll that ability." },
  "saving-throw": { title: "Saving throw", text: "A roll to resist something bad happening to you. You add your proficiency bonus on the ones your class is trained in (the filled dots)." },
  "proficiency-bonus": { title: "Proficiency bonus", text: "A bonus that grows with your level. You add it to attacks, saves and skills you are trained in, and to your spell save DC." },
  "passive-perception": { title: "Passive Perception", text: "How well you notice things without trying: 10 plus your Perception bonus. The GM compares it against hidden things and sneaking enemies." },
  initiative: { title: "Initiative", text: "A roll at the start of a fight that sets who acts first. It is a Dexterity check, so a higher number means you go earlier." },
  "armor-class": { title: "Armor Class", text: "How hard you are to hit. An attack has to roll this number or higher to land." },
  speed: { title: "Speed", text: "How many feet you can walk on your turn." },
  "hit-points": { title: "Hit points", text: "How much damage you can take. At 0 you fall unconscious and start making death saves; healing brings you back up, never above your maximum." },
  "temp-hp": { title: "Temporary hit points", text: "A buffer that soaks up damage first and vanishes when used up. It does not stack: if you get more, keep the bigger pile. Healing does not restore it." },
  "death-saves": { title: "Death saves", text: "At 0 hit points you roll one each turn: 10 or higher is a success, lower a failure. Three successes and you stabilise; three failures and you die." },
  inspiration: { title: "Inspiration", text: "A reward from the GM for good roleplaying. Spend it to roll one d20 twice and keep the better result." },
  concentration: { title: "Concentration", text: "Some spells last only while you keep your focus. Casting another such spell or being knocked out ends it, and taking damage forces a Constitution save to hold on." },
  "hit-dice": { title: "Hit dice", text: "Your healing pool: one die per level. On a short rest, spend dice to roll them, add your Constitution modifier and heal that much. A long rest gives back half your total (at least one)." },
};
const HIT_DICE_EXCURSION = "Your healing pool: one die per level. During a night's rest, spend dice to roll them, add your Constitution modifier and heal that much. A plain night gives none back; a Good Rest (3 nights in one place, or a safe haven) gives back all of them.";

/** The recharge line shown under the dice on the sheet. */
export function hitDiceRecharge(total: number, excursion: boolean): string {
  return excursion ? "Spend during a night's rest to heal. A Good Rest (3 nights in one place, or a safe haven) gives back all of them."
    : `Spend on a short rest to heal. A long rest gives back ${Math.max(1, Math.floor(total / 2))} (half your total).`;
}

/** The entry for a key such as `ability:str`, `save:wis`, `skill:athletics`, `hit-dice` (without the `glossary:` prefix), or undefined. */
export function glossaryEntry(key: string, excursion = false): GlossaryEntry | undefined {
  const [kind, id] = key.split(":");
  if (kind === "ability" && id in ABIL_TEXT) return { title: ABIL_FULL[id as Abil], kind: "Ability score", text: ABIL_TEXT[id as Abil], abil: id as Abil };
  if (kind === "save" && id in SAVE_TEXT) return { title: `${ABIL_FULL[id as Abil]} saving throw`, kind: "Saving throw", text: `${SAVE_TEXT[id as Abil]} Add your proficiency bonus if you are trained in it.`, abil: id as Abil };
  if (kind === "skill" && id in SKILLS) {
    const title = titleCase(id);
    return { title, kind: `Skill · ${ABIL_FULL[SKILLS[id]]}`, text: SKILL_TEXT[id], abil: SKILLS[id] };
  }
  const t = TERMS[key]; if (!t) return undefined;
  return { title: t.title, kind: "Rules term", text: key === "hit-dice" && excursion ? HIT_DICE_EXCURSION : t.text };
}

export const GLOSSARY_KEYS: string[] = [...ABILS.map(a => `ability:${a}`), ...ABILS.map(a => `save:${a}`), ...Object.keys(SKILLS).map(k => `skill:${k}`), ...Object.keys(TERMS)];
