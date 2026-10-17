import { ABILS, type Abil } from "../../core/types";
import { isObj, num, oneOf, str, type Raw } from "../check";
import type { TypeDef } from "../registry";

export interface ClassData { name: string; hitDie: number; saves: Abil[]; spellcasting?: { abil: Abil; progression: "full" | "half" | "third" | "pact" }; }

export const classType: TypeDef<ClassData> = {
  type: "class",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e), hitDie = num(raw.hitDie, "hitDie", e);
    const saves = Array.isArray(raw.saves) ? raw.saves.filter((s): s is Abil => ABILS.includes(s as Abil)) : [];
    let spellcasting: ClassData["spellcasting"];
    if (isObj(raw.spellcasting)) spellcasting = { abil: oneOf(raw.spellcasting.abil, ABILS, "spellcasting.abil", e, "int")!,
      progression: oneOf(raw.spellcasting.progression, ["full", "half", "third", "pact"] as const, "spellcasting.progression", e, "full")! };
    if (e.length || !name || !hitDie) return { errors: e };
    return { errors: e, value: { name, hitDie, saves, ...(spellcasting ? { spellcasting } : {}) } };
  },
};
