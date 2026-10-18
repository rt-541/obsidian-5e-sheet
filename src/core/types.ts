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
}
export type Rng = () => number;            // returns [0, 1)
export type RollMode = "normal" | "adv" | "dis";
export interface RollResult {
  title: string; total: number | "fail"; natural?: number; dice: number[]; detail: string;
  crit: boolean; fumble: boolean; sources: { adv: string[]; dis: string[]; fail: string[] };
}
