import { ABILS, SKILLS, type Effects, type Modifier, type ModTarget } from "../../core/types";
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
  return out;
}
