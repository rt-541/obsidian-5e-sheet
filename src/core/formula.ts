/**
 * Formula: a number, or a string using identifiers (prof, level, total, str..cha, scale names with `_` for `-`),
 * numbers, `+ - * /`, parentheses and floor(), max(), min(). Evaluated by a small recursive-descent parser;
 * there is no eval and no property access, so homebrew text can never run code.
 */
export type Formula = number | string;

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { t: "fn"; name: "floor" | "max" | "min"; args: Node[] };

export class FormulaError extends Error {}

const MAX_LEN = 200, MAX_DEPTH = 24;
const FNS = ["floor", "max", "min"] as const;
const cache = new Map<string, Node | string>();

function parse(src: string): Node {
  if (src.length > MAX_LEN) throw new FormulaError(`formula is longer than ${MAX_LEN} characters`);
  let i = 0, depth = 0;
  const peek = () => { while (i < src.length && src[i] === " ") i++; return src[i]; };
  const enter = () => { if (++depth > MAX_DEPTH) throw new FormulaError("formula is nested too deeply"); };
  function expr(): Node {
    enter();
    let a = term();
    for (let c = peek(); c === "+" || c === "-"; c = peek()) { i++; a = { t: "bin", op: c, a, b: term() }; }
    depth--; return a;
  }
  function term(): Node {
    let a = unary();
    for (let c = peek(); c === "*" || c === "/"; c = peek()) { i++; a = { t: "bin", op: c, a, b: unary() }; }
    return a;
  }
  function unary(): Node { if (peek() === "-") { i++; enter(); const a = unary(); depth--; return { t: "neg", a }; } return primary(); }
  function primary(): Node {
    const c = peek();
    if (c === undefined) throw new FormulaError("formula ends too early");
    if (c === "(") { i++; const e = expr(); if (peek() !== ")") throw new FormulaError("missing )"); i++; return e; }
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return { t: "num", v: +num[0] }; }
    const id = /^[a-z_][a-z0-9_]*/.exec(src.slice(i));
    if (!id) throw new FormulaError(`unexpected "${c}"`);
    i += id[0].length;
    if (peek() === "(") {
      if (!(FNS as readonly string[]).includes(id[0])) throw new FormulaError(`unknown function ${id[0]}`);
      i++; const args: Node[] = [];
      if (peek() !== ")") for (;;) { args.push(expr()); if (peek() === ",") { i++; continue; } break; }
      if (peek() !== ")") throw new FormulaError("missing )");
      i++;
      const name = id[0] as (typeof FNS)[number];
      if (name === "floor" ? args.length !== 1 : args.length < 1) throw new FormulaError(`${name}() has the wrong number of arguments`);
      return { t: "fn", name, args };
    }
    return { t: "var", name: id[0] };
  }
  const root = expr();
  if (peek() !== undefined) throw new FormulaError(`unexpected "${src[i]}"`);
  return root;
}

function compile(f: Formula): Node {
  if (typeof f === "number") { if (!Number.isFinite(f)) throw new FormulaError("not a finite number"); return { t: "num", v: f }; }
  if (typeof f !== "string") throw new FormulaError("must be a number or a formula");
  const hit = cache.get(f);
  if (typeof hit === "string") throw new FormulaError(hit);
  if (hit) return hit;
  try { const n = parse(f); if (cache.size < 500) cache.set(f, n); return n; }
  catch (x) { const m = x instanceof FormulaError ? x.message : "bad formula"; if (cache.size < 500) cache.set(f, m); throw new FormulaError(m); }
}

/** null when the formula is valid, otherwise a short reason. */
export function checkFormula(f: unknown): string | null {
  if (typeof f !== "number" && typeof f !== "string") return "must be a number or a formula";
  try { compile(f); return null; } catch (x) { return x instanceof FormulaError ? x.message : "bad formula"; }
}

function names(n: Node, out: Set<string>) {
  if (n.t === "var") out.add(n.name); else if (n.t === "neg") names(n.a, out);
  else if (n.t === "bin") { names(n.a, out); names(n.b, out); } else if (n.t === "fn") n.args.forEach(a => names(a, out));
}
export function formulaNames(f: Formula): string[] { const s = new Set<string>(); try { names(compile(f), s); } catch { /* invalid */ } return [...s]; }

export function evalFormula(f: Formula, vars: Record<string, number>): number {
  const run = (n: Node): number => {
    switch (n.t) {
      case "num": return n.v;
      case "var": { if (!Object.prototype.hasOwnProperty.call(vars, n.name)) throw new FormulaError(`unknown name ${n.name}`); return vars[n.name]; }
      case "neg": return -run(n.a);
      case "bin": {
        const a = run(n.a), b = run(n.b);
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        if (b === 0) throw new FormulaError("division by zero");
        return a / b;
      }
      case "fn": {
        const v = n.args.map(run);
        return n.name === "floor" ? Math.floor(v[0]) : n.name === "max" ? Math.max(...v) : Math.min(...v);
      }
    }
  };
  return run(compile(f));
}

/** Fill {scale-id} placeholders in a dice string; an unknown placeholder is left as written. */
export function fillDice(expr: string, scales: Record<string, string | number>): string {
  return expr.replace(/\{([a-z0-9-]+)\}/g, (m, id: string) => (Object.prototype.hasOwnProperty.call(scales, id) ? String(scales[id]) : m));
}
export const hasPlaceholder = (expr: string) => /\{[a-z0-9-]+\}/.test(expr);
