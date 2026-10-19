import type { ActionDef } from "../content/types";
import type { AttackOptionDef } from "../content/types/attack-option";
import type { ToggleDef } from "../content/types/toggle";

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
