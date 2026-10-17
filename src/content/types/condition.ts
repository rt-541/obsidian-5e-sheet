import type { Effects } from "../../core/types";
import { isObj, num, str, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { validateEffects } from "./effects";

export interface ConditionData { name: string; levels?: number; effects: Effects; levelEffects?: Effects[]; rules?: string; category: "condition" | "injury"; }

export const conditionType = (category: "condition" | "injury"): TypeDef<ConditionData> => ({
  type: category,
  validate(raw: Raw) {
    const errors: string[] = [];
    const name = str(raw.name, "name", errors);
    const levels = num(raw.levels, "levels", errors, true);
    const effects = validateEffects(raw.effects, "effects", errors);
    let levelEffects: Effects[] | undefined;
    if (raw.levelEffects !== undefined) {
      if (!Array.isArray(raw.levelEffects)) errors.push("levelEffects: must be a list");
      else levelEffects = raw.levelEffects.map((x, i) => validateEffects(isObj(x) ? x : x ?? {}, `levelEffects[${i}]`, errors));
    }
    const rules = typeof raw.rules === "string" ? raw.rules : undefined;
    if (errors.length || !name) return { errors };
    return { errors, value: { name, effects, category, ...(levels ? { levels } : {}), ...(levelEffects ? { levelEffects } : {}), ...(rules ? { rules } : {}) } };
  },
});
