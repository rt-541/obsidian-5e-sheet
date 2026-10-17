import { parseDice } from "../../core/dice";
import { ABILS, type Abil } from "../../core/types";
import { bool, isObj, oneOf, str, strList, type Errs, type Raw } from "../check";
import type { TypeDef } from "../registry";

export interface SpellData {
  name: string; level: number;              // 0 = cantrip .. 9
  school: string; castingTime: string; range: string; components: string[]; material?: string;
  duration: string; concentration: boolean; ritual: boolean; classes: string[];
  attack?: "melee" | "ranged";
  save?: { abil: Abil; onSuccess: "half" | "none" };
  damage?: { type: string; bySlot?: Record<string, string>; byCharLevel?: Record<string, string> };
  heal?: { bySlot: Record<string, string> };   // dice may contain the token MOD (spellcasting modifier)
  higherLevel?: string; rules?: string;
}

/** Dice with the MOD token allowed: "1d8 + MOD" and "1d8+MOD" are the same. Returns the normalised text. */
const spellDice = (v: unknown, at: string, e: Errs): string | undefined => {
  if (typeof v !== "string" || !v.trim()) { e.push(`${at}: must be text`); return undefined; }
  const norm = v.replace(/\s*\+\s*/g, "+").replace(/\s*-\s*/g, "-").trim();
  try { parseDice(norm.replace(/MOD/g, "0")); return norm; } catch { e.push(`${at}: bad dice: ${v}`); return undefined; }
};
const table = (v: unknown, at: string, e: Errs): Record<string, string> | undefined => {
  if (v === undefined) return undefined;
  if (!isObj(v)) { e.push(`${at}: must be a mapping`); return undefined; }
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(v)) { const n = spellDice(d, `${at}.${k}`, e); if (n) out[k] = n; }
  return Object.keys(out).length ? out : undefined;
};
const COMPONENTS = ["V", "S", "M"];

export const spellType: TypeDef<SpellData> = {
  type: "spell",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e);
    let level = 0;
    if (typeof raw.level === "number" && Number.isInteger(raw.level) && raw.level >= 0 && raw.level <= 9) level = raw.level;
    else e.push("level: must be a whole number from 0 to 9");
    const components = strList(raw.components, "components", e);
    components.forEach((c, i) => { if (!COMPONENTS.includes(c)) e.push(`components[${i}]: must be V, S or M`); });
    const out: SpellData = { name: name ?? "", level, school: str(raw.school, "school", e, true) ?? "", castingTime: str(raw.castingTime, "castingTime", e, true) ?? "",
      range: str(raw.range, "range", e, true) ?? "", components: components.filter(c => COMPONENTS.includes(c)), duration: str(raw.duration, "duration", e, true) ?? "",
      concentration: bool(raw.concentration, "concentration", e), ritual: bool(raw.ritual, "ritual", e), classes: strList(raw.classes, "classes", e) };
    if (typeof raw.material === "string" && raw.material) out.material = raw.material;
    if (raw.attack !== undefined) { const a = oneOf(raw.attack, ["melee", "ranged"] as const, "attack", e); if (a) out.attack = a; }
    if (raw.save !== undefined) {
      if (!isObj(raw.save)) e.push("save: must be a mapping");
      else {
        const abil = oneOf(raw.save.abil, ABILS, "save.abil", e), onSuccess = oneOf(raw.save.onSuccess, ["half", "none"] as const, "save.onSuccess", e, "none")!;
        if (abil) out.save = { abil, onSuccess };
      }
    }
    if (raw.damage !== undefined) {
      if (!isObj(raw.damage)) e.push("damage: must be a mapping");
      else {
        const type = str(raw.damage.type, "damage.type", e), bySlot = table(raw.damage.bySlot, "damage.bySlot", e), byCharLevel = table(raw.damage.byCharLevel, "damage.byCharLevel", e);
        if (type) out.damage = { type, ...(bySlot ? { bySlot } : {}), ...(byCharLevel ? { byCharLevel } : {}) };
      }
    }
    if (raw.heal !== undefined) {
      if (!isObj(raw.heal)) e.push("heal: must be a mapping");
      else { const bySlot = table(raw.heal.bySlot, "heal.bySlot", e); if (bySlot) out.heal = { bySlot }; }
    }
    if (typeof raw.higherLevel === "string" && raw.higherLevel) out.higherLevel = raw.higherLevel;
    if (typeof raw.rules === "string" && raw.rules) out.rules = raw.rules;
    if (e.length || !name) return { errors: e };
    return { errors: e, value: out };
  },
};
