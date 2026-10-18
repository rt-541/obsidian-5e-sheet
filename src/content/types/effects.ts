import { ABILS, type Abil, type Effects, type Modifier, type SaveBonus } from "../../core/types";
import { validGate } from "../../core/gates";
import { parseModifier } from "../../core/modifier";
import { validRollTarget } from "../../core/roll-tags";
import { checkFormula } from "../../core/formula";
import { isObj, strList, type Errs } from "../check";

export { validRollTarget };

export function validateEffects(v: unknown, at: string, e: Errs): Effects {
  if (v === undefined) return {};
  if (!isObj(v)) { e.push(`${at}: must be a mapping`); return {}; }
  const out: Effects = {};
  for (const k of ["adv", "dis", "autofail"] as const) {
    const list = strList(v[k], `${at}.${k}`, e);
    list.forEach((t, i) => { if (!validRollTarget(t)) e.push(`${at}.${k}[${i}]: unknown roll target ${t}`); });
    if (list.length) out[k] = list.filter(validRollTarget);
  }
  for (const k of ["resist", "immune", "vulnerable"] as const) { const l = strList(v[k], `${at}.${k}`, e); if (l.length) out[k] = l; }
  if (v.note !== undefined) { if (typeof v.note === "string") out.note = v.note; else e.push(`${at}.note: must be text`); }
  if (v.modifiers !== undefined) {
    if (!Array.isArray(v.modifiers)) e.push(`${at}.modifiers: must be a list`);
    else {
      const mods: Modifier[] = [];
      v.modifiers.forEach((m: unknown, i: number) => { const p = parseModifier(m, `${at}.modifiers[${i}]`, e); if (p) mods.push(p); });
      if (mods.length) out.modifiers = mods;
    }
  }
  if (v.acAbility !== undefined) {
    if (ABILS.includes(v.acAbility as Abil)) out.acAbility = v.acAbility as Abil; else e.push(`${at}.acAbility: must be one of ${ABILS.join(", ")}`);
  }
  if (v.saveBonus !== undefined) {
    if (!Array.isArray(v.saveBonus)) e.push(`${at}.saveBonus: must be a list`);
    else {
      const list: SaveBonus[] = [];
      v.saveBonus.forEach((b: unknown, i: number) => {
        const p = `${at}.saveBonus[${i}]`;
        if (!isObj(b)) { e.push(`${p}: must be a mapping`); return; }
        const abils = Array.isArray(b.abils) ? b.abils : [];
        const okA = abils.length > 0 && abils.every(a => ABILS.includes(a as Abil));
        if (!okA) e.push(`${p}.abils: must be a non-empty list of abilities`);
        const fe = checkFormula(b.value);
        if (fe) e.push(`${p}.value: ${fe}`);
        if (okA && !fe) list.push({ abils: abils as Abil[], value: b.value as number | string });
      });
      if (list.length) out.saveBonus = list;
    }
  }
  if (v.critRange !== undefined) {
    if (typeof v.critRange === "number" && Number.isInteger(v.critRange) && v.critRange >= 2 && v.critRange <= 20) out.critRange = v.critRange;
    else e.push(`${at}.critRange: must be a whole number from 2 to 20`);
  }
  if (v.critVs !== undefined) { if (typeof v.critVs === "string") out.critVs = v.critVs; else e.push(`${at}.critVs: must be text`); }
  if (v.critOn !== undefined) { if (typeof v.critOn === "string" && validRollTarget(v.critOn)) out.critOn = v.critOn; else e.push(`${at}.critOn: unknown roll tag ${String(v.critOn)}`); }
  if (v.while !== undefined) {
    const list = strList(v.while, `${at}.while`, e);
    list.forEach((g, i) => { if (!validGate(g)) e.push(`${at}.while[${i}]: unknown condition ${g}`); });
    if (list.length) out.while = list;
  }
  if (v.conditionImmune !== undefined) { const l = strList(v.conditionImmune, `${at}.conditionImmune`, e); if (l.length) out.conditionImmune = l; }
  if (v.maxScore !== undefined) {
    const m = v.maxScore;
    if (!isObj(m) || !ABILS.includes(m.abil as Abil) || typeof m.max !== "number" || !Number.isInteger(m.max) || m.max < 20 || m.max > 30) e.push(`${at}.maxScore: must be { abil, max } with max from 20 to 30`);
    else out.maxScore = { abil: m.abil as Abil, max: m.max };
  }
  return out;
}
