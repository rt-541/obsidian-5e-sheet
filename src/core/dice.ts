import type { RollMode, RollResult, Rng } from "./types";

const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const die = (faces: number, rng: Rng) => 1 + Math.floor(rng() * faces);

export function seeded(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function rollD20(o: { title: string; mod: number; mode: RollMode; adv?: string[]; dis?: string[]; fail?: string[]; rng?: Rng; critRange?: number; critNote?: string[] }): RollResult {
  const rng = o.rng ?? Math.random, adv = o.adv ?? [], dis = o.dis ?? [], fail = o.fail ?? [];
  const sources = { adv, dis, fail };
  if (fail.length) return { title: o.title, total: "fail", dice: [], detail: `Automatic failure (${fail.join(", ")})`, crit: false, fumble: false, sources };
  const hasAdv = o.mode === "adv" || adv.length > 0, hasDis = o.mode === "dis" || dis.length > 0;
  let dice: number[], natural: number, how = "";
  if (hasAdv && !hasDis) { dice = [die(20, rng), die(20, rng)]; natural = Math.max(...dice); how = ` adv [${dice.join(", ")}]`; }
  else if (hasDis && !hasAdv) { dice = [die(20, rng), die(20, rng)]; natural = Math.min(...dice); how = ` dis [${dice.join(", ")}]`; }
  else { dice = [die(20, rng)]; natural = dice[0]; if (hasAdv && hasDis) how = " adv+dis cancel"; }
  const why = [...adv.map(s => "adv: " + s), ...dis.map(s => "dis: " + s)].join(", ");
  const range = Math.min(20, o.critRange ?? 20), crit = natural >= range;
  const hint = [...(crit && natural < 20 ? [`critical hit: you crit on ${range}-20`] : []), ...(o.critNote ?? [])];
  return { title: o.title, total: natural + o.mod, natural, dice, detail: `d20(${natural})${how} ${sgn(o.mod)}${why ? ` (${why})` : ""}${hint.length ? ` - ${hint.join("; ")}` : ""}`,
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
