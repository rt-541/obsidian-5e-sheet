import { slug } from "../content/registry";
import type { ActionDef } from "../content/types";
import { validateAttackOption, type AttackOptionDef } from "../content/types/attack-option";
import { validateAction } from "../content/types/ops";
import { validateToggle, type ToggleDef } from "../content/types/toggle";

/** Dice as one text, or a table by level (the highest level at or below the character's applies). */
export type CustomDice = string | { byLevel: Record<number, string> };
export type CustomToggle = Partial<ToggleDef>;
export type CustomAttackOption = Omit<Partial<AttackOptionDef>, "toHit" | "onHit"> & { toHit?: CustomDice; onHit?: CustomDice };
export type CustomAction = Omit<Partial<ActionDef>, "damage" | "heal"> & { damage?: CustomDice; heal?: CustomDice };
/**
 * What a player changed about one feature or item row, kept in the note. `false` means "not a switch / not an attack option / no Use button",
 * even when the note says otherwise; an absent part means "as the note says". Inside a part, `null` removes a field the note has.
 */
export interface Customization { toggle?: CustomToggle | false; attackOption?: CustomAttackOption | false; action?: CustomAction | false }

const PARTS = ["toggle", "attackOption", "action"] as const;
const isMap = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The key a feature's customization is stored under; it equals the feature's switch reference. */
export const customizeKey = (featureKey: string) => `feature:${featureKey}`;

/**
 * Structural check only: a mapping whose only keys are toggle, attackOption and action, each a mapping or false.
 * What is inside a part is checked when the sheet is worked out, so a bad inner value never makes the sheet read-only.
 */
export function readCustomization(v: unknown, at: string, errors: string[]): Customization | undefined {
  if (!isMap(v)) { errors.push(`${at}: must be a mapping`); return undefined; }
  const out: Record<string, unknown> = {};
  let bad = false;
  for (const [k, part] of Object.entries(v)) {
    if (!(PARTS as readonly string[]).includes(k)) { errors.push(`${at}: unknown part "${k}" (use toggle, attackOption or action)`); bad = true; continue; }
    if (part !== false && !isMap(part)) { errors.push(`${at}.${k}: must be a mapping or false`); bad = true; continue; }
    out[k] = structuredClone(part);
  }
  return bad ? undefined : out as Customization;
}

export interface RowDefs { toggle?: ToggleDef; attackOption?: AttackOptionDef; action?: ActionDef }

/** The dice for a character level: a text as it is, a table's highest step at or below the level, or undefined before the first step. */
export function levelDice(v: CustomDice, level: number): string | undefined {
  if (typeof v === "string") return v;
  let best: number | undefined;
  for (const k of Object.keys(v.byLevel).map(Number)) if (k <= level && (best === undefined || k > best)) best = k;
  return best === undefined ? undefined : v.byLevel[best];
}

const DICE_FIELDS: Record<string, readonly string[]> = { toggle: [], attackOption: ["toHit", "onHit"], action: ["damage", "heal"] };

/** Put a customization over a row's own definitions, part by part. The note's objects are never changed. */
export function layerRow(name: string, note: RowDefs, mine: Customization | undefined, level: number, problem: (msg: string) => void): RowDefs & { custom?: true } {
  const out: RowDefs & { custom?: true } = { ...note };
  if (!mine) return out;
  const set = out as Record<string, unknown>;
  let warned = false;
  for (const part of PARTS) {
    const m = mine[part];
    if (m === undefined) continue;
    if (m === false) { delete out[part]; continue; }
    const mm: Record<string, unknown> = structuredClone(m);
    const gone: string[] = [];
    for (const f of DICE_FIELDS[part]) {
      if (mm[f] === undefined || mm[f] === null) continue;
      const d = levelDice(mm[f] as CustomDice, level);
      if (d === undefined) { delete mm[f]; gone.push(f); } else mm[f] = d;
    }
    const base: Record<string, unknown> = { ...(note[part] as Record<string, unknown> | undefined) };
    if (part === "attackOption") {
      if (mm.onHit !== undefined) delete base.scale;
      if (mm.scale !== undefined) delete base.onHit;
    }
    const merged: Record<string, unknown> = { ...base, ...mm };
    for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
    // a level table that has not started yet: the field is absent, and a part left with nothing to do is quietly dropped
    const idle = gone.length > 0 && (part !== "attackOption" || !(merged.toHit || merged.onHit || merged.scale || merged.reroll));
    if (idle) { delete out[part]; continue; }
    const errs: string[] = [];
    const at = `customize.${part}`;
    const v = part === "toggle" ? validateToggle(merged, at, name, errs)
      : part === "attackOption" ? validateAttackOption(merged, at, name, errs)
      : validateAction(merged, at, errs);
    if (!v || errs.length) {
      if (!warned) { warned = true; problem(`Your changes to ${name} could not be used, so the note's version is shown. Open Customize to fix or reset them.`); }
      if (note[part] === undefined) delete out[part]; else set[part] = note[part];
    } else set[part] = v;
  }
  if (PARTS.some(p => mine[p] !== undefined)) out.custom = true;
  return out;
}

/** An id for a new switch named `name` that no other switch uses: the name's slug, then slug-2, slug-3 and so on. */
export function freshToggleId(name: string, taken: readonly string[]): string {
  const base = slug(name);
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}
