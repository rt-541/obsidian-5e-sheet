export type Abil = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILS: Abil[] = ["str", "dex", "con", "int", "wis", "cha"];
export const SKILLS: Record<string, Abil> = {
  acrobatics: "dex", "animal-handling": "wis", arcana: "int", athletics: "str", deception: "cha",
  history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis",
  nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int",
  "sleight-of-hand": "dex", stealth: "dex", survival: "wis",
};
export type RollKind = "attack" | "check" | "skill" | "save" | "initiative" | "death-save" | "march" | "navigation";
export interface RollTarget { kind: RollKind; abil?: Abil; skill?: string; range?: "melee" | "ranged"; }
export type ModTarget = "ac" | "speed" | "hpMax" | "carry" | "save" | "attack" | "damage" | "spellDC" | "spellAttack" | "check" | "initiative";
export interface Modifier { target: ModTarget; value: number | "half" | "zero"; source?: string; }
export interface Effects {
  adv?: string[]; dis?: string[]; autofail?: string[]; modifiers?: Modifier[];
  resist?: string[]; immune?: string[]; vulnerable?: string[]; note?: string;
}
export type Rng = () => number;            // returns [0, 1)
export type RollMode = "normal" | "adv" | "dis";
export interface RollResult {
  title: string; total: number | "fail"; natural?: number; dice: number[]; detail: string;
  crit: boolean; fumble: boolean; sources: { adv: string[]; dis: string[]; fail: string[] };
}
