import { ABILS, SKILLS, type Abil } from "../../core/types";
import { isObj, num, oneOf, str, type Errs, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { validateLevels, validateOptions, type OptionDef, type Op } from "./ops";

export type AbilReq = Partial<Record<Abil, number>>;
export interface ClassData {
  name: string; hitDie: number; saves: Abil[]; spellcasting?: { abil: Abil; progression: "full" | "half" | "third" | "pact" };
  /** First class only: armor, weapon, tool and `skill:`/`save:` proficiency strings. */
  proficiencies?: string[];
  /** First class only: pick `count` skills from `from`. */
  skills?: { count: number; from: string[] };
  multiclass?: { requires?: { any?: AbilReq[]; all?: AbilReq }; proficiencies: string[] };
  /** Starting equipment: one list of item ids per choice (A/B), or starting gold as dice such as 4d4*10. */
  equipment?: string[][]; gold?: string;
  options?: Record<string, OptionDef[]>; subclassLevel?: number; levels?: Record<number, Op[]>;
}

export function abilReq(v: unknown, at: string, e: Errs): AbilReq {
  const out: AbilReq = {};
  if (!isObj(v)) { e.push(`${at}: must be a mapping such as { str: 13 }`); return out; }
  for (const [k, n] of Object.entries(v)) {
    if (!ABILS.includes(k as Abil)) e.push(`${at}.${k}: unknown ability`);
    else if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 30) out[k as Abil] = n;
    else e.push(`${at}.${k}: must be a score from 1 to 30`);
  }
  return out;
}
const textList = (v: unknown, at: string, e: Errs): string[] | undefined => {
  if (v === undefined) return undefined;
  if (Array.isArray(v) && v.every(x => typeof x === "string" && x.trim())) return (v as string[]).map(x => x.trim());
  e.push(`${at}: must be a list of text`); return undefined;
};

export const classType: TypeDef<ClassData> = {
  type: "class",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e), hitDie = num(raw.hitDie, "hitDie", e);
    if (hitDie !== undefined && !(Number.isInteger(hitDie) && hitDie >= 2 && hitDie <= 20)) e.push("hitDie: must be a whole number from 2 to 20");
    const saves: Abil[] = [];
    if (raw.saves !== undefined) {
      if (!Array.isArray(raw.saves)) e.push("saves: must be a list of abilities");
      else for (const s of raw.saves) { if (ABILS.includes(s as Abil)) saves.push(s as Abil); else e.push(`saves: unknown ability ${String(s)}`); }
    }
    let spellcasting: ClassData["spellcasting"];
    if (isObj(raw.spellcasting)) spellcasting = { abil: oneOf(raw.spellcasting.abil, ABILS, "spellcasting.abil", e, "int")!,
      progression: oneOf(raw.spellcasting.progression, ["full", "half", "third", "pact"] as const, "spellcasting.progression", e, "full")! };
    const extra: Partial<ClassData> = {};
    const prof = textList(raw.proficiencies, "proficiencies", e); if (prof) extra.proficiencies = prof;
    if (raw.skills !== undefined) {
      const s = raw.skills;
      if (!isObj(s)) e.push("skills: must be { count, from }");
      else {
        const from = textList(s.from, "skills.from", e) ?? [];
        from.forEach((k, i) => { if (!(k in SKILLS)) e.push(`skills.from[${i}]: unknown skill ${k}`); });
        const count = s.count;
        if (!(typeof count === "number" && Number.isInteger(count) && count >= 1)) e.push("skills.count: must be a whole number from 1");
        else if (count > from.length) e.push(`skills.count: ${count} is more than the ${from.length} skills listed`);
        else extra.skills = { count, from };
      }
    }
    if (raw.multiclass !== undefined) {
      const m = raw.multiclass;
      if (!isObj(m)) e.push("multiclass: must be a mapping");
      else {
        const mc: NonNullable<ClassData["multiclass"]> = { proficiencies: textList(m.proficiencies, "multiclass.proficiencies", e) ?? [] };
        if (m.requires !== undefined) {
          if (!isObj(m.requires)) e.push("multiclass.requires: must be a mapping");
          else {
            const req: NonNullable<NonNullable<ClassData["multiclass"]>["requires"]> = {};
            if (m.requires.any !== undefined) {
              if (!Array.isArray(m.requires.any)) e.push("multiclass.requires.any: must be a list");
              else req.any = m.requires.any.map((x, i) => abilReq(x, `multiclass.requires.any[${i}]`, e));
            }
            if (m.requires.all !== undefined) req.all = abilReq(m.requires.all, "multiclass.requires.all", e);
            mc.requires = req;
          }
        }
        extra.multiclass = mc;
      }
    }
    if (raw.equipment !== undefined) {
      if (Array.isArray(raw.equipment) && raw.equipment.every(l => Array.isArray(l) && l.every(x => typeof x === "string"))) extra.equipment = raw.equipment as string[][];
      else e.push("equipment: must be a list of item lists");
    }
    if (raw.gold !== undefined) {
      if (typeof raw.gold === "string" && /^\d{1,2}d\d{1,3}(\s*\*\s*\d{1,4})?$/.test(raw.gold.trim())) extra.gold = raw.gold.trim();
      else e.push("gold: must be dice such as 4d4*10");
    }
    if (raw.subclassLevel !== undefined) {
      if (typeof raw.subclassLevel === "number" && Number.isInteger(raw.subclassLevel) && raw.subclassLevel >= 1 && raw.subclassLevel <= 20) extra.subclassLevel = raw.subclassLevel;
      else e.push("subclassLevel: must be a level from 1 to 20");
    }
    const options = validateOptions(raw.options, "options", e);
    if (Object.keys(options).length) extra.options = options;
    const levels = validateLevels(raw.levels, "levels", { kind: "class", options: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, v.length])) }, e);
    if (Object.keys(levels).length) extra.levels = levels;
    if (e.length || !name || !hitDie) return { errors: e };
    return { errors: e, value: { name, hitDie, saves, ...(spellcasting ? { spellcasting } : {}), ...extra } };
  },
};
