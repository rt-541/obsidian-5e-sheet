import type { Rng } from "./types";

export type RollScheme = "4d6-drop-lowest" | "3d6" | "1d20" | "2d20-drop-lowest" | "3d6-and-1d20";

/** The five ways to roll ability scores, in the order the builder lists them. */
export const ROLL_SCHEMES: { id: RollScheme; label: string; text: string }[] = [
  { id: "4d6-drop-lowest", label: "4d6, drop the lowest", text: "Roll four six-sided dice six times and drop the lowest die of each roll." },
  { id: "3d6", label: "3d6", text: "Roll three six-sided dice six times and add them up each time." },
  { id: "1d20", label: "1d20", text: "Roll one twenty-sided die six times." },
  { id: "2d20-drop-lowest", label: "2d20, drop the lowest", text: "Roll two twenty-sided dice six times and drop the lower die of each roll." },
  { id: "3d6-and-1d20", label: "Four 3d6 and two 1d20", text: "Roll three six-sided dice four times, then one twenty-sided die twice." },
];

/** One roll: every die in the order rolled, the one die left out (if any), the total that counts, and the dice named ("4d6", "3d6", "1d20", "2d20"). */
export interface ScoreRoll { dice: number[]; dropped?: number; total: number; expr: string }

const die = (faces: number, rng: Rng) => 1 + Math.floor(rng() * faces);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function one(n: number, faces: number, dropLowest: boolean, rng: Rng): ScoreRoll {
  const dice = Array.from({ length: n }, () => die(faces, rng)), expr = `${n}d${faces}`;
  if (!dropLowest) return { dice, total: sum(dice), expr };
  const dropped = Math.min(...dice);
  return { dice, dropped, total: sum(dice) - dropped, expr };
}

/** Six rolls for the chosen way; the mixed way gives its four 3d6 rolls first, then its two 1d20 rolls. */
export function rollScores(scheme: RollScheme, rng: Rng = Math.random): ScoreRoll[] {
  const make = (n: number, faces: number, drop: boolean, times: number) => Array.from({ length: times }, () => one(n, faces, drop, rng));
  switch (scheme) {
    case "4d6-drop-lowest": return make(4, 6, true, 6);
    case "3d6": return make(3, 6, false, 6);
    case "1d20": return make(1, 20, false, 6);
    case "2d20-drop-lowest": return make(2, 20, true, 6);
    case "3d6-and-1d20": return [...make(3, 6, false, 4), ...make(1, 20, false, 2)];
  }
}

/** "4d6: 6, 5, 3, 1, dropped the 1 = 14", "3d6: 4, 4, 2 = 10", "1d20: 17". */
export function describeRoll(r: ScoreRoll): string {
  const dice = r.dice.join(", ");
  if (r.dropped !== undefined) return `${r.expr}: ${dice}, dropped the ${r.dropped} = ${r.total}`;
  return r.dice.length === 1 ? `${r.expr}: ${dice}` : `${r.expr}: ${dice} = ${r.total}`;
}

/** The rolled totals, highest first. */
export const rolledTotals = (rolls: ScoreRoll[]): number[] => rolls.map(r => r.total).sort((a, b) => b - a);
