export type Abil = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILS: Abil[] = ["str", "dex", "con", "int", "wis", "cha"];
export const SKILLS: Record<string, Abil> = {
  acrobatics: "dex", "animal-handling": "wis", arcana: "int", athletics: "str", deception: "cha",
  history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis",
  nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int",
  "sleight-of-hand": "dex", stealth: "dex", survival: "wis",
};
export type RollKind = "attack" | "check" | "skill" | "save" | "initiative" | "death-save" | "march" | "navigation" | "passive";
export interface RollTarget {
  kind: RollKind; abil?: Abil; skill?: string; range?: "melee" | "ranged";
  /** Attack rows: what the weapon is (its id and properties such as light, thrown, monk), so a rule can aim at "weapon:thrown". */
  tags?: string[];
  /** A Constitution save made to keep concentrating. */
  concentration?: boolean;
}
export type ModTarget = "ac" | "speed" | "hpMax" | "carry" | "save" | "attack" | "damage" | "spellDC" | "spellAttack" | "check" | "initiative" | "passive";
/**
 * value: a number, `half`, `zero`, `double` (carry only), or a Formula (text such as `prof` or `floor(level / 2)`).
 * on: only applies to rolls or rows that match this tag (see core/roll-tags); `+` joins tags, all must match.
 */
export interface Modifier { target: ModTarget; value: number | string; on?: string; source?: string; }
export interface SaveBonus { abils: Abil[]; value: number | string; }
export interface Effects {
  adv?: string[]; dis?: string[]; autofail?: string[]; modifiers?: Modifier[];
  resist?: string[]; immune?: string[]; vulnerable?: string[]; note?: string;
  /** Use this ability instead of Dex in the AC formula (still capped by the armor worn). */
  acAbility?: Abil;
  /** Bonus to saves of the listed abilities; value is a Formula (see core/formula). */
  saveBonus?: SaveBonus[];
  /** Weapon attacks crit on this natural roll or higher; critVs is the condition, shown as a note only. */
  critRange?: number; critVs?: string;
  /** Raises the ability score cap (default 20). */
  maxScore?: { abil: Abil; max: number };
  /** The whole block applies only while every gate holds: armor:none|worn|light|medium|heavy, shield:none|worn, wield:dual, toggle:<id>, concentrating; `!` negates. */
  while?: string[];
  /** Limits critRange to rolls matching this tag (for example attack:melee). */
  critOn?: string;
  /** Conditions (ids, or `disease`) that cannot be put on the actor. */
  conditionImmune?: string[];
  /** An alternate way to work out armor class: base plus the listed ability modifiers (Unarmored Defense). Used without body armor unless withArmor; noShield turns it off while a shield is worn. */
  acFormula?: { base: number; abils?: Abil[]; noShield?: boolean; withArmor?: boolean };
  /** Raises the Dex cap of medium armor to this number (Medium Armor Master). */
  armorDexMax?: number;
  /** Attacks per Attack action; the highest source wins (Extra Attack). Number or Formula. */
  attacks?: number | string;
  /** Senses in feet. darkvisionAdd is added only to darkvision the character already has. */
  senses?: { darkvision?: number; darkvisionAdd?: number; blindsight?: number; tremorsense?: number; truesight?: number; telepathy?: number };
  /** Movement speeds in feet; `walk` means the walking speed. */
  speeds?: { fly?: number | "walk"; swim?: number | "walk"; climb?: number | "walk"; burrow?: number | "walk"; hover?: boolean };
  /** Added to the ability score before the modifier is worked out (capped by the score maximum). Each value is a Formula. */
  abilityBonus?: Partial<Record<Abil, number | string>>;
  /** Changes how matching attack rows are worked out (Martial Arts, Ki-Empowered Strikes, Two-Weapon Fighting). */
  weaponRule?: WeaponRule[];
  /** Adds attack rows for natural or feature weapons (Bite, Claws, Psychic Blades). */
  weapons?: NaturalWeapon[];
  /** Extra damage appended to matching attack rows (Divine Strike, Hex Warrior's curse). */
  extraDamage?: ExtraDamage[];
  /** Extra weapon damage dice rolled on a critical hit (Brutal Critical, Savage Attacks). */
  critDice?: CritDice[];
  /** Extra damage added to matching spells (Agonizing Blast, Empowered Evocation). */
  spellDamage?: SpellDamageBonus[];
  /** Half the proficiency bonus on checks the character is not proficient in (Jack of All Trades). */
  halfProf?: { on: string[]; roundUp?: boolean };
  /** Rules about the d20 itself: reroll low rolls, treat low rolls as a minimum (Reliable Talent, Halfling Lucky). */
  d20Rule?: D20Rule[];
}
/** match: weapon tags (`monk`, `unarmed`, `offhand`, `pact`, `magic`, a weapon property or a weapon id) or `all`. */
export interface WeaponRule { match: string[]; abils?: Abil[]; die?: string; magical?: boolean; addMod?: boolean; note?: string; }
/** ab: one ability, `finesse` (the better of Dex and Str) or a list (the best of them). */
export interface NaturalWeapon { name: string; dmg: string; type: string; ab: Abil | "finesse" | Abil[]; range?: "melee" | "ranged"; bonus?: number | string; tag?: string; }
/** dice: dice, a {scale} placeholder or a Formula; type `weapon` uses the damage type of the weapon hit. */
export interface ExtraDamage { dice: string | number; type: string; on?: string; per?: "turn" | "hit"; note?: string; }
export interface CritDice { extra: number | string; on?: string; }
export interface SpellDamageBonus { spell?: string; level?: number; school?: string; damageType?: string[]; class?: string; add: number | string; perBeam?: boolean; }
export interface D20Rule { on: string; min?: number; reroll?: number; proficient?: boolean; }
export type Rng = () => number;            // returns [0, 1)
export type RollMode = "normal" | "adv" | "dis";
export interface RollResult {
  title: string; total: number | "fail"; natural?: number; dice: number[]; detail: string;
  crit: boolean; fumble: boolean; sources: { adv: string[]; dis: string[]; fail: string[] };
  /** Own-dice play: what the player rolled and typed in, instead of the app rolling. */
  own?: { total?: number };
}
