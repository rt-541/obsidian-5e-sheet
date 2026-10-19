import type { Abil, RollMode } from "./types";

/** The rule key for "I roll my own dice". Defined here once; src/rules re-exports it. */
export const OWN_DICE = "own-dice";

/** Layers in resolveRules order (plugin defaults, campaign, character); the last one that sets it wins; default off. */
export function ownDiceOn(layers: (Record<string, boolean> | undefined)[]): boolean {
  let on = false;
  for (const l of layers) if (l && OWN_DICE in l) on = !!l[OWN_DICE];
  return on;
}

/** "1d8+3 slashing + 1d6 fire" -> "1d8 + 3 slashing + 1d6 fire". */
export function spaced(expr: string): string {
  return expr.replace(/\s*([+-])\s*/g, " $1 ").replace(/\s+/g, " ").trim();
}

export interface Extra { dice: string; name: string; spent?: string }

const extraText = (e: Extra): string => `${e.dice} for ${e.name}${e.spent ? ` (${e.spent})` : ""}`;

export function d20Words(o: { mod: number; mode: RollMode | "cancel"; extras?: Extra[]; fail?: string[]; reroll?: number; min?: number; critRange?: number }): string {
  if (o.fail?.length) return `Automatic failure (${o.fail.join(", ")}): nothing to roll.`;
  const m = o.mod === 0 ? "" : o.mod > 0 ? `+ ${o.mod}` : `- ${-o.mod}`;
  let s: string;
  if (o.mode === "adv" || o.mode === "dis") s = `Roll 2d20, keep the ${o.mode === "adv" ? "higher" : "lower"}${m ? `, ${m}` : ""}`;
  else if (o.mode === "cancel") s = `Roll 1d20${m ? ` ${m}` : ""} (advantage and disadvantage cancel)`;
  else s = `Roll 1d20${m ? ` ${m}` : ""}`;
  for (const e of o.extras ?? []) s += `, plus ${extraText(e)}`;
  const notes: string[] = [];
  if (o.reroll != null) notes.push(`If the d20 shows ${o.reroll} or lower, roll it again once and keep the new roll.`);
  if (o.min != null) notes.push(`A d20 below ${o.min} counts as ${o.min}.`);
  if (o.critRange != null) notes.push(`You crit on ${o.critRange}-20.`);
  return notes.length ? `${s}. ${notes.join(" ")}` : s;
}

export function damageWords(o: { expr: string; extras?: Extra[]; reroll?: string; weaponNote?: string }): string {
  const parts = spaced(o.expr).split(/ \+ (?=\d+d\d)/);
  const base = parts[0] + (o.weaponNote ? ` (${o.weaponNote})` : "");
  const rest = parts.slice(1);
  let s: string;
  if (o.reroll) {
    s = `Roll ${base} twice and keep the higher total (${o.reroll})`;
    if (rest.length) s += `, then add ${rest.join(" + ")}`;
  } else {
    s = `Roll ${[base, ...rest].join(" + ")}`;
  }
  for (const e of o.extras ?? []) s += ` + ${extraText(e)}`;
  return s;
}

export function saveWords(abil: Abil, dc: number): string {
  return `They roll a ${abil.toUpperCase()} save against DC ${dc}`;
}
