/** Edition vocabulary: which rules a character or content entry belongs to. The table of rules that differ is below. */
export type Edition = "2014" | "2024";
export const EDITIONS: readonly Edition[] = ["2014", "2024"];

/** `"2014"`, `2014`, `"2024"` and `2024` read as editions; anything else is no edition. */
export function readEdition(v: unknown): Edition | undefined {
  const s = typeof v === "number" ? String(v) : v;
  return s === "2014" || s === "2024" ? s : undefined;
}
export const otherEdition = (e: Edition): Edition => (e === "2014" ? "2024" : "2014");
/** A character with no recorded edition plays the 2014 rules. */
export const characterEdition = (c: { edition?: Edition }): Edition => c.edition ?? "2014";

/** Every rule the sheet computes that differs by edition. Nothing else in the code may branch on an edition name. */
export interface EditionRules {
  id: Edition; label: string;
  raceWord: "Race" | "Species";
  /** Hit Dice a long rest gives back. */
  longRestHitDice: "half" | "all";
  /** Each half-caster's share of the multiclass slot level. */
  halfCasterRounding: "down" | "up";
  /** Class level from which a lone half-caster has slots. */
  halfCasterFromLevel: 1 | 2;
  /** Exhaustion level from which max HP is halved until the next rest; null when the edition has no such effect. */
  exhaustionHalvesHpAt: number | null;
  /** Button name and card text, our own words. */
  inspiration: { name: string; card: string };
}

export const EDITION_RULES: Record<Edition, EditionRules> = {
  "2014": {
    id: "2014", label: "2014 rules",
    raceWord: "Race",
    longRestHitDice: "half",
    halfCasterRounding: "down",
    halfCasterFromLevel: 2,
    exhaustionHalvesHpAt: 4,
    // The card text is today's glossary text, kept word for word.
    inspiration: { name: "Inspiration", card: "A reward from the GM for good roleplaying. Spend it to roll one d20 twice and keep the better result." },
  },
  "2024": {
    id: "2024", label: "2024 rules",
    raceWord: "Species",              // XPHB races.json (species entries)
    longRestHitDice: "all",           // XPHB variantrules "Long Rest" (p370)
    halfCasterRounding: "up",         // book-xphb "Spell Slots" (p45)
    halfCasterFromLevel: 1,           // class-paladin and class-ranger XPHB, spell slot rows at class level 1
    exhaustionHalvesHpAt: null,       // XPHB conditionsdiseases "Exhaustion" (p365): no max HP effect; a long rest restores full HP
    inspiration: { name: "Heroic Inspiration", card: "A reward for heroic play. Spend it to reroll any die and keep the new roll. You can hold only one: if you earn another while holding one, pass it to a player who has none, or it is wasted." },  // XPHB variantrules "Heroic Inspiration" (p368)
  },
};
/** The rules table for an edition; no edition is 2014. */
export const editionRules = (e: Edition | undefined): EditionRules => EDITION_RULES[e ?? "2014"];
