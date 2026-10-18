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
  parseMovementAndDefense(v, at, e, out);
  return out;
}

const whole = (n: unknown, min = 0) => typeof n === "number" && Number.isInteger(n) && n >= min;
const SENSES = ["darkvision", "darkvisionAdd", "blindsight", "tremorsense", "truesight", "telepathy"] as const;
const SPEEDS = ["fly", "swim", "climb", "burrow"] as const;

/** acFormula, armorDexMax, attacks, senses, speeds and abilityBonus. */
function parseMovementAndDefense(v: Record<string, unknown>, at: string, e: Errs, out: Effects): void {
  if (v.acFormula !== undefined) {
    const f = v.acFormula, p = `${at}.acFormula`;
    if (!isObj(f)) e.push(`${p}: must be { base, abils, noShield, withArmor }`);
    else {
      const before = e.length;
      if (!whole(f.base)) e.push(`${p}.base: must be a whole number such as 10`);
      let abils: Abil[] | undefined;
      if (f.abils !== undefined) {
        if (Array.isArray(f.abils) && f.abils.every(a => ABILS.includes(a as Abil))) abils = f.abils as Abil[]; else e.push(`${p}.abils: must be a list of abilities`);
      }
      for (const k of ["noShield", "withArmor"] as const) if (f[k] !== undefined && typeof f[k] !== "boolean") e.push(`${p}.${k}: must be true or false`);
      if (e.length === before) out.acFormula = { base: f.base as number, ...(abils ? { abils } : {}), ...(f.noShield === true ? { noShield: true } : {}), ...(f.withArmor === true ? { withArmor: true } : {}) };
    }
  }
  if (v.armorDexMax !== undefined) { if (whole(v.armorDexMax, 2) && (v.armorDexMax as number) <= 10) out.armorDexMax = v.armorDexMax as number; else e.push(`${at}.armorDexMax: must be a whole number from 2 to 10`); }
  if (v.attacks !== undefined) { const fe = checkFormula(v.attacks); if (fe) e.push(`${at}.attacks: ${fe}`); else out.attacks = v.attacks as number | string; }
  if (v.senses !== undefined) {
    if (!isObj(v.senses)) e.push(`${at}.senses: must be a mapping such as { darkvision: 60 }`);
    else {
      const s: NonNullable<Effects["senses"]> = {};
      for (const [k, n] of Object.entries(v.senses)) {
        if (!(SENSES as readonly string[]).includes(k)) e.push(`${at}.senses.${k}: unknown sense; use ${SENSES.join(", ")}`);
        else if (!whole(n, 1)) e.push(`${at}.senses.${k}: must be a distance in feet`);
        else s[k as (typeof SENSES)[number]] = n as number;
      }
      if (Object.keys(s).length) out.senses = s;
    }
  }
  if (v.speeds !== undefined) {
    if (!isObj(v.speeds)) e.push(`${at}.speeds: must be a mapping such as { fly: walk }`);
    else {
      const s: NonNullable<Effects["speeds"]> = {};
      for (const [k, n] of Object.entries(v.speeds)) {
        if ((SPEEDS as readonly string[]).includes(k)) { if (n === "walk" || whole(n, 1)) s[k as (typeof SPEEDS)[number]] = n as number | "walk"; else e.push(`${at}.speeds.${k}: must be a distance in feet or walk`); }
        else if (k === "hover") { if (typeof n === "boolean") { if (n) s.hover = true; } else e.push(`${at}.speeds.hover: must be true or false`); }
        else e.push(`${at}.speeds.${k}: unknown speed; use ${SPEEDS.join(", ")}, hover`);
      }
      if (Object.keys(s).length) out.speeds = s;
    }
  }
  if (v.abilityBonus !== undefined) {
    if (!isObj(v.abilityBonus)) e.push(`${at}.abilityBonus: must be a mapping such as { str: 4 }`);
    else {
      const b: NonNullable<Effects["abilityBonus"]> = {};
      for (const [k, f] of Object.entries(v.abilityBonus)) {
        if (!ABILS.includes(k as Abil)) { e.push(`${at}.abilityBonus.${k}: unknown ability`); continue; }
        const fe = checkFormula(f); if (fe) e.push(`${at}.abilityBonus.${k}: ${fe}`); else b[k as Abil] = f as number | string;
      }
      if (Object.keys(b).length) out.abilityBonus = b;
    }
  }
}
