import { str, type Raw } from "../check";
import type { TypeDef } from "../registry";

/** A weapon mastery property: a name and its rules text. Weapons point at one by id; the sheet shows the text and never applies it. */
export interface MasteryData { name: string; rules?: string; }

export const masteryType: TypeDef<MasteryData> = {
  type: "mastery",
  validate(raw: Raw) {
    const errors: string[] = [];
    const name = str(raw.name, "name", errors);
    const rules = typeof raw.rules === "string" && raw.rules.trim() ? raw.rules : undefined;
    if (errors.length || !name) return { errors };
    return { errors, value: { name, ...(rules ? { rules } : {}) } };
  },
};
