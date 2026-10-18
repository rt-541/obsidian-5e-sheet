import { hasPlaceholder } from "./formula";
import type { RollMode, RollResult, Rng } from "./types";

const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const die = (faces: number, rng: Rng) => 1 + Math.floor(rng() * faces);

export function seeded(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function rollD20(o: { title: string; mod: number; mode: RollMode; adv?: string[]; dis?: string[]; fail?: string[]; rng?: Rng; critRange?: number; critNote?: string[];
  /** A die at or below this is rolled again once and the new roll is kept (Halfling Lucky). */ reroll?: number;
  /** A die below this counts as this (Reliable Talent). */ min?: number; /** Who gave the reroll or minimum, for the roll log. */ ruleNotes?: string[] }): RollResult {
  const rng = o.rng ?? Math.random, adv = o.adv ?? [], dis = o.dis ?? [], fail = o.fail ?? [];
  const sources = { adv, dis, fail };
  if (fail.length) return { title: o.title, total: "fail", dice: [], detail: `Automatic failure (${fail.join(", ")})`, crit: false, fumble: false, sources };
  const hasAdv = o.mode === "adv" || adv.length > 0, hasDis = o.mode === "dis" || dis.length > 0;
  const rerolled: string[] = [];
  const d20 = () => { const first = die(20, rng); if (o.reroll !== undefined && first <= o.reroll) { const again = die(20, rng); rerolled.push(`${first}->${again}`); return again; } return first; };
  let dice: number[], natural: number, how = "";
  if (hasAdv && !hasDis) { dice = [d20(), d20()]; natural = Math.max(...dice); how = ` adv [${dice.join(", ")}]`; }
  else if (hasDis && !hasAdv) { dice = [d20(), d20()]; natural = Math.min(...dice); how = ` dis [${dice.join(", ")}]`; }
  else { dice = [d20()]; natural = dice[0]; if (hasAdv && hasDis) how = " adv+dis cancel"; }
  const rolled = natural;
  if (o.min !== undefined && natural < o.min) natural = o.min;
  const ruleText = [...(rerolled.length ? [`rerolled ${rerolled.join(", ")}`] : []), ...(natural !== rolled ? [`${rolled} counts as ${natural}`] : [])];
  const because = ruleText.length && o.ruleNotes?.length ? ` (${ruleText.join("; ")}: ${o.ruleNotes.join(", ")})` : ruleText.length ? ` (${ruleText.join("; ")})` : "";
  const why = [...adv.map(s => "adv: " + s), ...dis.map(s => "dis: " + s)].join(", ");
  const range = Math.min(20, o.critRange ?? 20), crit = natural >= range;
  const hint = [...(crit && natural < 20 ? [`critical hit: you crit on ${range}-20`] : []), ...(o.critNote ?? [])];
  return { title: o.title, total: natural + o.mod, natural, dice, detail: `d20(${natural})${how}${because} ${sgn(o.mod)}${why ? ` (${why})` : ""}${hint.length ? ` - ${hint.join("; ")}` : ""}`,
    crit, fumble: natural === 1, sources };
}

const TERM = /^(?:(\d{1,2})d(\d{1,3})([+-]\d{1,3})?|(\d{1,3}))(?:\s+([a-z]+))?$/;
export function parseDice(expr: string) {
  return expr.split(" + ").map(t => {
    const m = TERM.exec(t.trim());
    if (!m) throw new Error("bad dice: " + expr);
    const out: { n: number; faces: number; bonus: number; label?: string } = m[4] !== undefined
      ? { n: 0, faces: 0, bonus: +m[4] }
      : { n: +m[1], faces: +m[2], bonus: +(m[3] ?? 0) };
    if (m[4] === undefined && (out.n < 1 || out.faces < 1)) throw new Error("bad dice: " + expr);
    if (m[5]) out.label = m[5];
    return out;
  });
}

export function rollDice(title: string, expr: string, rng: Rng = Math.random): RollResult {
  const terms = parseDice(expr), dice: number[] = [], parts: string[] = []; let total = 0;
  for (const t of terms) {
    const rs = Array.from({ length: t.n }, () => die(t.faces, rng)); dice.push(...rs);
    total += rs.reduce((a, b) => a + b, 0) + t.bonus;
    parts.push(t.n ? `${t.n}d${t.faces}${t.bonus ? sgn(t.bonus) : ""}${t.label ? " " + t.label : ""}: [${rs.join(", ")}]` : `${t.bonus}${t.label ? " " + t.label : ""}`);
  }
  return { title, total, dice, detail: parts.join("  "), crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } };
}

/** Dice with optional {scale} placeholders: valid when it parses with each placeholder as a count or as a die. */
export function checkDice(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  const ok = (s: string) => { try { parseDice(s); return true; } catch { return false; } };
  if (!hasPlaceholder(v)) return ok(v);
  return ok(v.replace(/\{[a-z0-9-]+\}/g, "1")) || ok(v.replace(/\{[a-z0-9-]+\}/g, "1d6"));
}

/** Average roll of a dice expression (flat numbers count as themselves); used to pick the larger of two dice. */
export function averageDice(expr: string): number {
  return parseDice(expr).reduce((a, t) => a + t.n * (t.faces + 1) / 2 + t.bonus, 0);
}

/**
 * The same damage on a critical hit: every die count doubles, flat bonuses do not, and `extra` more dice of the first die's size are added
 * (Brutal Critical). Returns undefined when the expression has no dice.
 */
export function critDamageOf(expr: string, extra = 0): string | undefined {
  const terms = parseDice(expr);
  if (!terms.some(t => t.n > 0)) return undefined;
  return terms.map((t, idx) => {
    if (!t.n) return `${t.bonus}${t.label ? " " + t.label : ""}`;
    const n = t.n * 2 + (idx === 0 ? extra : 0);
    return `${n}d${t.faces}${t.bonus ? sgn(t.bonus) : ""}${t.label ? " " + t.label : ""}`;
  }).join(" + ");
}
