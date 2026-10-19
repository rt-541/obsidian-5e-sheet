import { checkDice } from "../../core/dice";
import { validRollTarget } from "../../core/roll-tags";
import { isObj, type Errs } from "../check";
import { slug } from "../registry";

/**
 * A switch that adds dice to attacks while it is on (a focus-style die on the roll, extra damage on a hit, a damage reroll).
 * The feature, option or item that declares it owns the switch.
 */
export interface AttackOptionDef {
  id: string;
  /** Dice added to every matching attack roll while on; spends on the roll. */ toHit?: string;
  /** Dice added to damage when the attack hits; may hold {scale} placeholders. */ onHit?: string;
  /** On-hit dice by level of the owner (class level for class features, total level otherwise); exclusive with onHit. */ scale?: Record<number, string>;
  /** Weapon damage dice rolled twice, higher total kept. */ reroll?: boolean;
  /** Each use spends 1 of this resource; the switch turns off when none is left. */ resource?: string;
  /** Applies to the next qualifying roll, then switches itself off. */ oncePerTurn?: boolean;
  /** Roll tag it applies to; default "attack". */ on?: string;
}

/** Validate an `attackOption:` mapping; `name` is the owner's name, which gives the default id. */
export function validateAttackOption(v: unknown, at: string, name: string, e: Errs): AttackOptionDef | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) { e.push(`${at}: must be a mapping`); return undefined; }
  const before = e.length;
  const id = v.id === undefined ? slug(name) : v.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) e.push(`${at}.id: must be lowercase letters, digits and dashes`);
  const out: AttackOptionDef = { id: typeof id === "string" ? id : "" };
  for (const k of ["toHit", "onHit"] as const) {
    if (v[k] === undefined) continue;
    if (checkDice(v[k])) out[k] = v[k] as string; else e.push(`${at}.${k}: must be dice like 1d4`);
  }
  if (v.scale !== undefined) {
    const s = v.scale;
    const ok = isObj(s) && Object.keys(s).length > 0 && Object.entries(s).every(([k, d]) => /^\d+$/.test(k) && +k >= 1 && +k <= 20 && checkDice(d));
    if (ok) out.scale = Object.fromEntries(Object.entries(s as Record<string, string>).map(([k, d]) => [+k, d]));
    else e.push(`${at}.scale: must map levels 1 to 20 to dice like 2d4`);
  }
  if (v.onHit !== undefined && v.scale !== undefined) e.push(`${at}: use onHit or scale, not both`);
  for (const k of ["reroll", "oncePerTurn"] as const) {
    if (v[k] === undefined) continue;
    if (typeof v[k] === "boolean") { if (v[k]) out[k] = true; } else e.push(`${at}.${k}: must be true or false`);
  }
  if (v.resource !== undefined) { if (typeof v.resource === "string" && v.resource.trim()) out.resource = v.resource.trim(); else e.push(`${at}.resource: must be text`); }
  if (v.on !== undefined) {
    if (typeof v.on === "string" && validRollTarget(v.on)) out.on = v.on; else e.push(`${at}.on: unknown roll tag ${String(v.on)}`);
  }
  if (!out.toHit && !out.onHit && !out.scale && !out.reroll && e.length === before) e.push(`${at}: needs toHit, onHit, scale or reroll`);
  return e.length > before ? undefined : out;
}
