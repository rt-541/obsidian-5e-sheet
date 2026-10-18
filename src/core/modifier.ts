import { checkFormula, formulaNames } from "./formula";
import { validRollTarget } from "./roll-tags";
import type { Modifier, ModTarget } from "./types";

export const MOD_TARGETS: ModTarget[] = ["ac", "speed", "hpMax", "carry", "save", "attack", "damage", "spellDC", "spellAttack", "check", "initiative", "passive"];
export const MOD_KEYWORDS = ["half", "zero", "double"];
const STATIC_NAMES = ["prof", "level", "total", "str", "dex", "con", "int", "wis", "cha"];
export const MOD_VALUE_HELP = "must be a number, half, zero, double or a formula";

/** True when the value is a number, half / zero / double, or a formula that can work. */
export function okModifierValue(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string") return false;
  if (MOD_KEYWORDS.includes(v)) return true;
  if (checkFormula(v)) return false;
  // A lone word that is neither a known name nor scale-looking (no underscore) is almost certainly a typo.
  const t = v.trim();
  return !(/^[a-z_][a-z0-9_]*$/.test(t) && !STATIC_NAMES.includes(t) && !formulaNames(t).some(n => n.includes("_")));
}

/** Validate one modifier mapping; problems are pushed to `errs` as `${at}.field: ...`. */
export function parseModifier(m: unknown, at: string, errs: string[]): Modifier | undefined {
  if (typeof m !== "object" || m === null || Array.isArray(m)) { errs.push(`${at}: must be a mapping`); return undefined; }
  const r = m as Record<string, unknown>;
  const okT = typeof r.target === "string" && (MOD_TARGETS as string[]).includes(r.target);
  const okV = okModifierValue(r.value);
  if (!okV) errs.push(`${at}.value: ${MOD_VALUE_HELP}`);
  if (!okT) errs.push(`${at}.target: unknown target ${String(r.target)}`);
  let ok = okT && okV;
  if (ok && r.value === "double" && r.target !== "carry") { errs.push(`${at}.value: double only works on carry`); ok = false; }
  if (r.on !== undefined && (typeof r.on !== "string" || !validRollTarget(r.on))) { errs.push(`${at}.on: unknown roll tag ${String(r.on)}`); ok = false; }
  if (!ok) return undefined;
  return { target: r.target as ModTarget, value: r.value as number | string, ...(typeof r.on === "string" ? { on: r.on } : {}), ...(typeof r.source === "string" ? { source: r.source } : {}) };
}
