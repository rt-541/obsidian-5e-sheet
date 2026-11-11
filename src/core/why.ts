import type { ModPart } from "./effects";
import type { Abil } from "./types";

/** One piece of a number: "Dex 4", "10 (no armor)", "2 (Rage)". `n` may be negative; it prints as " - Dex 1". */
export interface Term { label?: string; n: number; from?: string; }

export const ABIL_SHORT: Record<Abil, string> = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };
export const ABIL_LONG: Record<Abil, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;

/** An ability modifier as a term ("Dex 4"). */
export const abilTerm = (a: Abil, n: number, from?: string): Term => ({ label: ABIL_SHORT[a], n, ...(from ? { from } : {}) });
/** The numeric modifiers that apply, as terms named after their source ("2 (Rage)"). Halving and the like come back as notes. */
export function modTerms(parts: ModPart[]): { terms: Term[]; notes: string[] } {
  const terms: Term[] = [], notes: string[] = [];
  for (const p of parts) {
    if (p.kind === "add") { if (p.amount !== 0) terms.push({ n: p.amount, from: p.source }); }
    else notes.push(`${p.kind === "half" ? "Halved" : p.kind === "zero" ? "Set to 0" : "Doubled"} by ${p.source}.`);
  }
  return { terms, notes };
}

const one = (t: Term, first: boolean): string => {
  const body = `${t.label ? `${t.label} ` : ""}${first ? t.n : Math.abs(t.n)}${t.from ? ` (${t.from})` : ""}`;
  return first ? body : `${t.n < 0 ? " - " : " + "}${body}`;
};
/** "AC 17 = 10 + Dex 4 + Wis 3 (Unarmored Defense)": the title and total, then each term. `because` closes the line, `notes` follow as sentences. */
export function sum(title: string, total: number | string, terms: Term[], opts: { because?: string; notes?: string[]; lead?: string; tail?: string[] } = {}): string {
  const body = (opts.lead ?? "") + (terms.map((t, i) => one(t, !opts.lead && i === 0)).join("") || (opts.lead ? "" : "0")) + (opts.tail ?? []).map(x => ` + ${x}`).join("");
  return `${title}${total === "" ? "" : ` ${total}`} = ${body}${opts.because ? ` (${opts.because})` : ""}${(opts.notes ?? []).map(n => ` ${n}`).join("")}`;
}
export { sgn };
