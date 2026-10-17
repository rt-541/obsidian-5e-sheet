import { ABILS, SKILLS, type Abil, type Effects, type Modifier, type ModTarget, type SaveBonus } from "../../core/types";
import { checkFormula } from "../../core/formula";
import { isObj, strList, type Errs } from "../check";

const MOD_TARGETS: ModTarget[] = ["ac", "speed", "hpMax", "carry", "save", "attack", "damage", "spellDC", "spellAttack", "check", "initiative"];
const KINDS = ["attack", "check", "skill", "save", "initiative", "death-save", "march", "navigation"];

/** attack | attack:str | attack:!str | attack:melee | attack:ranged | check[:abil] | skill:<skill> | save[:abil] | initiative | death-save | march | navigation */
export function validRollTarget(t: string): boolean {
  const [kind, q] = t.split(":");
  if (!KINDS.includes(kind)) return false;
  if (q === undefined) return kind !== "skill";
  if (kind === "skill") return q in SKILLS;
  if (kind === "attack") return ABILS.includes(q.replace(/^!/, "") as never) || q === "melee" || q === "ranged";
  if (kind === "check" || kind === "save") return ABILS.includes(q as never);
  return false;
}

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
      v.modifiers.forEach((m: unknown, i: number) => {
        const p = `${at}.modifiers[${i}]`;
        if (!isObj(m)) { e.push(`${p}: must be a mapping`); return; }
        const okT = typeof m.target === "string" && (MOD_TARGETS as string[]).includes(m.target);
        const okV = (typeof m.value === "number" && Number.isFinite(m.value)) || m.value === "half" || m.value === "zero";
        if (!okV) e.push(`${p}.value: must be a number, half or zero`);
        if (!okT) e.push(`${p}.target: unknown target ${String(m.target)}`);
        if (okT && okV) mods.push({ target: m.target as ModTarget, value: m.value as Modifier["value"], ...(typeof m.source === "string" ? { source: m.source } : {}) });
      });
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
  if (v.maxScore !== undefined) {
    const m = v.maxScore;
    if (!isObj(m) || !ABILS.includes(m.abil as Abil) || typeof m.max !== "number" || !Number.isInteger(m.max) || m.max < 20 || m.max > 30) e.push(`${at}.maxScore: must be { abil, max } with max from 20 to 30`);
    else out.maxScore = { abil: m.abil as Abil, max: m.max };
  }
  return out;
}
