import { EDITIONS, EDITION_RULES, type Edition, type EditionRules } from "../core/edition";

/** One thing that differs between the editions: a title and at most two plain sentences per side, our own words. */
export interface ChangeNote { id: string; title: string; 2014: string; 2024: string }

/** Builds one note whose two sentences each come from that edition's table row. */
function fromTable(rules: Record<Edition, EditionRules>, id: string, title: string, f: (r: EditionRules) => string): ChangeNote {
  const out = { id, title, 2014: "", 2024: "" } as ChangeNote;
  for (const e of EDITIONS) out[e] = f(rules[e]);
  return out;
}

/** Facts that are not rule-table values: how a character is built, written once per side. */
const STATIC: ChangeNote[] = [
  { id: "ability-source", title: "Where ability score bonuses come from",
    2014: "Your race gives you bonuses to your ability scores.",
    2024: "Your background gives you the bonuses, and your species gives none." },
  { id: "origin-feat", title: "A feat at the start",
    2014: "A background gives skills and tools, but no feat.",
    2024: "Every background gives you a feat to start with." },
  { id: "weapon-mastery", title: "Weapon mastery",
    2014: "Weapons have no mastery properties.",
    2024: "Each weapon has a mastery property, and some classes learn to use them. The sheet shows what it does but does not apply it." },
  { id: "subclass-level", title: "When you choose a subclass",
    2014: "Each class picks its subclass at its own level.",
    2024: "Every class picks its subclass at level 3." },
];

const share = (r: EditionRules) => (r.longRestHitDice === "all" ? "all of your spent Hit Dice" : "half of your total Hit Dice (at least one)");
const rounding = (r: EditionRules) => (r.halfCasterRounding === "up" ? "round up" : "round down");

/**
 * The general changes: the static notes plus notes built from the edition table, so a changed table value changes its sentence.
 * Reads fields of each edition's row; it never compares edition names.
 */
export function generalChanges(rules: Record<Edition, EditionRules> = EDITION_RULES): ChangeNote[] {
  return [
    ...STATIC,
    fromTable(rules, "species-word", "What the word is", r => `The sheet calls the kind of people your character belongs to their ${r.raceWord.toLowerCase()}.`),
    fromTable(rules, "long-rest-hit-dice", "Hit Dice on a long rest", r => `A long rest gives back ${share(r)}.`),
    fromTable(rules, "multiclass-slots", "Spell slots for half-casters", r =>
      `A half-caster's levels ${rounding(r)} when your multiclass slots are worked out, and a lone half-caster has slots from class level ${r.halfCasterFromLevel}.`),
    fromTable(rules, "exhaustion", "Exhaustion", r => r.exhaustionHalvesHpAt === null
      ? "Each level adds a penalty, and your maximum hit points are not halved."
      : `Each level adds a specific penalty, and from level ${r.exhaustionHalvesHpAt} your maximum hit points are halved.`),
    fromTable(rules, "inspiration", "Inspiration", r => `The button is called ${r.inspiration.name}. ${r.inspiration.card.split(/(?<=[.!?])\s/)[1] ?? r.inspiration.card}`),
  ];
}
