import { sourceLabel, type Registry } from "../content/registry";
import type { AbilReq, ClassData, FeatData, Op, OptionDef, SpellData, SubclassData } from "../content/types";
import { abilityMod } from "./abilities";
import type { Character, HpMethod, LevelEntry } from "./character";
import { deriveCharacter } from "./derive";
import { progress, type PendingChoice, type Progress } from "./progression";
import { slotTable } from "./slots";
import { ABILS, SKILLS, type Abil, type Rng } from "./types";

/** Experience needed to reach level n + 1 (index 0 = level 1), 2014 rules. */
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const MAX_TOTAL_LEVEL = 20;
export function levelFromXp(xp: number): number {
  let level = 1;
  XP_THRESHOLDS.forEach((t, i) => { if (xp >= t) level = i + 1; });
  return level;
}
/** Progress from the current level's threshold to the next one; `next` is absent at level 20. */
export function xpProgress(xp: number, level: number): { from: number; next?: number; pct: number; ready: boolean } {
  const lvl = Math.min(Math.max(level, 1), MAX_TOTAL_LEVEL), from = XP_THRESHOLDS[lvl - 1], next = XP_THRESHOLDS[lvl];
  const pct = next === undefined ? 100 : Math.max(0, Math.min(100, Math.round(100 * (xp - from) / (next - from))));
  return { from, ...(next !== undefined ? { next } : {}), pct, ready: levelFromXp(xp) > level };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const totalLevel = (c: Character) => c.classes.reduce((a, k) => a + k.level, 0);
const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;

// ---------------------------------------------------------------- which class can be taken

export interface LevelOption { class: string; name: string; /** Source badge text. */ source: string; /** Class level after this level. */ level: number; current: boolean; allowed: boolean; reasons: string[]; }

const reqText = (r: AbilReq) => Object.entries(r).map(([a, n]) => `${ABIL_NAME[a as Abil]} ${n}`).join(" and ");
const reqMet = (r: AbilReq, c: Character) => Object.entries(r).every(([a, n]) => c.abilities[a as Abil] >= (n as number));
/** Why `c` does not meet a class's multiclass prerequisite (empty when it does). */
function requirementProblems(d: ClassData, c: Character, verb: string): string[] {
  const req = d.multiclass?.requires, out: string[] = [];
  if (!req) return out;
  if (req.all && !reqMet(req.all, c)) out.push(`${verb} needs ${reqText(req.all)}`);
  if (req.any?.length && !req.any.some(r => reqMet(r, c))) out.push(`${verb} needs ${req.any.map(reqText).join(" or ")}`);
  return out;
}

/**
 * Classes the character can take a level in: the ones it has, plus others whose multiclass prerequisite is met.
 * As in the 2014 rules, both the class being left and the class being taken must be satisfied.
 */
export function levelOptions(c: Character, registry: Registry): LevelOption[] {
  const all = registry.list<ClassData>("class"), mine = c.classes.map(k => k.class);
  const ordered = [...mine.flatMap(id => all.filter(e => e.id === id)), ...all.filter(e => !mine.includes(e.id))];
  const full = totalLevel(c) >= MAX_TOTAL_LEVEL;
  return ordered.map(e => {
    const have = c.classes.find(k => k.class === e.id), reasons: string[] = [];
    if (full) reasons.push("Characters stop at level 20");
    if (!have && c.classes.length) {
      reasons.push(...requirementProblems(e.data, c, `Multiclassing into ${e.name}`));
      for (const k of c.classes) { const d = registry.get<ClassData>("class", k.class)?.data; if (d) reasons.push(...requirementProblems(d, c, `Leaving ${d.name}`)); }
    }
    return { class: e.id, name: e.name, source: sourceLabel(e), level: (have?.level ?? 0) + 1, current: !!have, allowed: reasons.length === 0, reasons };
  });
}

// ---------------------------------------------------------------- steps

export interface StepOption { id: string; name: string; /** Source badge text. */ source?: string; text?: string; level?: number; school?: string; /** Why it cannot be picked. */ disabled?: string; }
export type Step =
  | { kind: "hp"; key: "hp"; label: string; die: number; conMod: number; average: number; first: boolean }
  | { kind: "subclass"; key: string; label: string; source: string; options: StepOption[] }
  | { kind: "asi"; key: string; label: string; source: string; maxScores: Record<Abil, number> }
  | { kind: "pick"; key: string; label: string; source: string; what: "skills" | "expertise" | "tools" | "languages" | "option"; count: number; /** Option list name when `what` is option. */ list?: string; options: StepOption[]; /** No list to choose from: type the names. */ free: boolean }
  | { kind: "spells"; key: string; label: string; source: string; count: number; cantrips: number; swap: number; maxLevel: number; options: StepOption[] };
export interface LevelPlan { class: string; className: string; /** Class level after this level. */ level: number; total: number; first: boolean; steps: Step[]; }
export interface LevelAnswers {
  hp?: { method: "roll" | "average"; roll?: number };
  /** Picks keyed like the level log: `<source>:<level>:<op id>`; spells swaps under `<key>:swap` as { out, in }[]. */
  choices: Record<string, unknown>;
}
export type LevelResult = { value: Character; entry: LevelEntry; summary: string[] } | { error: string };

export const averageHp = (die: number) => Math.floor(die / 2) + 1;
export const rollHitDie = (die: number, rng: Rng = Math.random) => 1 + Math.floor(rng() * die);

type Mode = { kind: "level"; classId: string } | { kind: "resolve" };
interface Env { registry: Registry; cand: Character; prog: Progress; mode: Mode; }

const classOfKey = (key: string) => /^class:([^:]+):\d+:/.exec(key)?.[1];
function optionLists(env: Env, key: string): Record<string, OptionDef[]> | undefined {
  const m = /^(class|subclass):([^:]+):/.exec(key); if (!m) return undefined;
  const reg = env.registry;
  if (m[1] === "class") return reg.get<ClassData>("class", m[2])?.data.options;
  const sub = reg.get<SubclassData>("subclass", m[2])?.data, owner = env.cand.classes.find(k => k.subclass === m[2]);
  return { ...(owner ? reg.get<ClassData>("class", owner.class)?.data.options : undefined), ...sub?.options };
}
const classLevelOf = (env: Env, key: string) => {
  const m = /^(class|subclass):([^:]+):/.exec(key); if (!m) return 0;
  return (m[1] === "class" ? env.cand.classes.find(k => k.class === m[2]) : env.cand.classes.find(k => k.subclass === m[2]))?.level ?? 0;
};

function spellOptions(env: Env, op: Extract<Op, { op: "spells" }>, maxLevel: number): StepOption[] {
  const owned = new Set(env.cand.spells.map(s => s.id)), schools = op.schools?.map(s => s.toLowerCase());
  return env.registry.list<SpellData>("spell")
    .filter(e => (Array.isArray(op.from) ? op.from.includes(e.id) : e.data.classes.includes(op.from)) && (!schools || schools.includes(e.data.school.toLowerCase())))
    .map(e => ({ id: e.id, name: e.name, source: sourceLabel(e), level: e.data.level, school: e.data.school, text: e.data.level === 0 ? `${e.data.school} cantrip` : `Level ${e.data.level} ${e.data.school}`,
      ...(owned.has(e.id) ? { disabled: "Already known" } : e.data.level > maxLevel ? { disabled: `Needs a level ${e.data.level} slot` } : {}) }));
}
/** 2014 (PHB p.164): spells known and prepared are worked out per class as if single-classed, so the cap comes from the leveling class's own entry. */
function maxSpellLevel(env: Env, key: string): number {
  const prog = env.prog, m = /^(class|subclass):([^:]+):/.exec(key);
  const owner = m ? (m[1] === "class" ? m[2] : env.cand.classes.find(k => k.subclass === m[2])?.class) : undefined;
  const mine = prog.spellcasting.filter(e => e.class === owner);
  const own = mine.filter(e => e.from === (m?.[1] === "subclass" ? "subclass" : "class"));
  const entries = own.length ? own : mine.length ? mine : prog.spellcasting;
  const rows = slotTable(entries.map(e => ({ level: e.level, progression: e.progression, ...(e.table ? { table: e.table } : {}) })));
  const levels = rows.filter(r => r.max > 0).map(r => r.level === "pact" ? r.pactLevel ?? 0 : Number(r.level));
  return levels.length ? Math.max(...levels) : 9;
}

function stepOf(p: PendingChoice, env: Env, maxScores: () => Record<Abil, number>): Step | undefined {
  const { op, key } = p, base = { key, label: p.label, source: p.source };
  const c = env.cand, prog = env.prog;
  switch (op.op) {
    case "subclass": {
      const cls = classOfKey(key); if (!cls) return undefined;
      const options = env.registry.list<SubclassData>("subclass").filter(e => e.data.class === cls).map(e => ({ id: e.id, name: e.name, source: sourceLabel(e) }));
      return options.length ? { kind: "subclass", ...base, options } : undefined;
    }
    case "asi": return { kind: "asi", ...base, maxScores: maxScores() };
    case "spells": {
      const maxLevel = maxSpellLevel(env, key);
      const options = spellOptions(env, op, maxLevel);
      return { kind: "spells", ...base, count: op.count, cantrips: op.cantrips ?? 0, swap: op.swap ?? 0, maxLevel, options };
    }
    case "choose": {
      let options: StepOption[] = [], free = false;
      if (op.what === "option") {
        const defs = optionLists(env, key)?.[op.list ?? ""]; if (!defs) return undefined;
        const lvl = classLevelOf(env, key);
        options = defs.map(d => ({ id: d.id, name: d.name, ...(d.text !== undefined ? { text: d.text } : {}),
          ...(d.minLevel !== undefined && d.minLevel > lvl ? { disabled: `Needs level ${d.minLevel}` } : prog.options[op.list!]?.includes(d.id) ? { disabled: "Already chosen" } : {}) }));
      } else {
        const from = op.from ?? (op.what === "skills" || op.what === "expertise" ? Object.keys(SKILLS) : undefined);
        free = from === undefined;
        const have = op.what === "skills" ? new Set([...c.proficiencies.skills, ...prog.proficiencies.skills]) : op.what === "expertise" ? new Set([...c.proficiencies.expertise, ...prog.proficiencies.expertise])
          : op.what === "languages" ? new Set(prog.languages) : new Set(prog.proficiencies.other);
        options = (from ?? []).map(id => ({ id, name: titleCase(id), ...(have.has(id) && env.mode.kind !== "resolve" ? { disabled: op.what === "skills" ? "Already proficient" : "Already have" } : {}) }));
      }
      return { kind: "pick", ...base, what: op.what, count: op.count, ...(op.list !== undefined ? { list: op.list } : {}), options, free };
    }
    default: return undefined;
  }
}

interface Planned { env: Env; steps: Step[]; ops: Map<string, PendingChoice>; first: boolean; className: string; level: number; die: number; }

/** Build the candidate (class level raised, subclass and feat answers applied so their follow-up steps appear) and its steps. */
function plan(c: Character, mode: Mode, registry: Registry, choices: Record<string, unknown>): Planned | { error: string } {
  const cand = structuredClone(c);
  let className = "", level = 0, die = 0, first = false;
  if (mode.kind === "level") {
    const cd = registry.get<ClassData>("class", mode.classId);
    if (!cd) return { error: `Unknown class ${mode.classId}` };
    if (totalLevel(c) >= MAX_TOTAL_LEVEL) return { error: "Characters stop at level 20" };
    first = c.classes.length === 0; className = cd.name; die = cd.data.hitDie;
    let k = cand.classes.find(x => x.class === mode.classId);
    if (k) k.level++; else { k = { class: mode.classId, level: 1 }; cand.classes.push(k); }
    level = k.level;
  }
  const addedFeats: string[] = [], mine = new Map<string, PendingChoice>();
  const inScope = (p: PendingChoice) => {
    if (mode.kind === "resolve") return true;
    const sub = cand.classes.find(k => k.class === mode.classId)?.subclass;
    return p.key.startsWith(`class:${mode.classId}:${level}:`) || (!!sub && p.key.startsWith(`subclass:${sub}:${level}:`)) || addedFeats.some(f => p.key.startsWith(`feat:${f}:`));
  };
  let prog = progress(cand, registry);
  for (let pass = 0; pass < 4; pass++) {
    for (const p of prog.pending) if (inScope(p) && !mine.has(p.key)) mine.set(p.key, p);
    let changed = false;
    for (const p of [...mine.values()]) {
      const v = choices[p.key];
      if (p.op.op === "subclass" && typeof v === "string") {
        const cls = classOfKey(p.key), k = cand.classes.find(x => x.class === cls), sd = registry.get<SubclassData>("subclass", v);
        if (k && !k.subclass && sd && sd.data.class === cls) { k.subclass = v; changed = true; }
      }
      if (p.op.op === "asi" && isObj(v) && typeof v.feat === "string" && !cand.feats.includes(v.feat) && registry.get<FeatData>("feat", v.feat)) { cand.feats.push(v.feat); addedFeats.push(v.feat); changed = true; }
    }
    if (!changed) break;
    prog = progress(cand, registry);
  }
  const env: Env = { registry, cand, prog, mode };
  let scores: Record<Abil, number> | undefined;
  const maxScores = () => (scores ??= deriveCharacter(cand, { registry }).maxScores);
  const steps: Step[] = [];
  if (mode.kind === "level") {
    const conMod = abilityMod(c.abilities.con);
    steps.push({ kind: "hp", key: "hp", label: first ? "Hit points (first level)" : "Hit points", die, conMod, average: averageHp(die), first });
  }
  for (const p of mine.values()) { const s = stepOf(p, env, maxScores); if (s) steps.push(s); }
  return { env, steps, ops: mine, first, className, level, die };
}

/** What choosing a class level asks: HP, then every asking op for the new class level (and its subclass and feat follow-ups). */
export function planLevel(c: Character, classId: string, registry: Registry, choices: Record<string, unknown> = {}): LevelPlan | { error: string } {
  const p = plan(c, { kind: "level", classId }, registry, choices);
  if ("error" in p) return p;
  return { class: classId, className: p.className, level: p.level, total: totalLevel(c) + 1, first: p.first, steps: p.steps };
}
/** Steps for every choice the note still has pending (legacy notes, or a subclass chosen later). */
export function planResolve(c: Character, registry: Registry, choices: Record<string, unknown> = {}): Step[] {
  const p = plan(c, { kind: "resolve" }, registry, choices);
  return "error" in p ? [] : p.steps;
}

// ---------------------------------------------------------------- validation and application

const optionName = (s: { options: StepOption[] }, id: string) => s.options.find(o => o.id === id)?.name ?? titleCase(id);
interface Taken { skills: Set<string>; expertise: Set<string>; languages: Set<string>; tools: Set<string>; /** Picks made in this answer (resolve mode only checks against these). */ picked: Set<string>; }

/** Check one step's answer against the step; returns the error, or the normalized answer. */
function checkStep(s: Exclude<Step, { kind: "hp" }>, v: unknown, env: Env, taken: Taken): { error: string } | { ok: unknown } {
  const label = `${s.source}: ${s.label}`;
  if (v === undefined) return { error: `${label} still needs an answer` };
  switch (s.kind) {
    case "subclass": {
      if (typeof v !== "string" || !s.options.some(o => o.id === v)) return { error: `${label}: pick one of the listed subclasses` };
      return { ok: v };
    }
    case "asi": {
      if (!isObj(v)) return { error: `${label}: pick abilities or a feat` };
      if (typeof v.feat === "string") {
        if (!env.registry.get<FeatData>("feat", v.feat)) return { error: `${label}: unknown feat ${v.feat}` };
        if (env.cand.feats.filter(f => f === v.feat).length > 1) return { error: `${label}: ${v.feat} is already taken` };
        return { ok: { feat: v.feat } };
      }
      if (!isObj(v.abilities)) return { error: `${label}: pick abilities or a feat` };
      const entries = Object.entries(v.abilities).filter(([, n]) => n !== 0);
      const amounts = entries.map(([, n]) => n).sort().join();
      if (!entries.every(([a, n]) => ABILS.includes(a as Abil) && (n === 1 || n === 2)) || !(amounts === "2" || amounts === "1,1")) return { error: `${label}: add +2 to one ability or +1 to two` };
      for (const [a, n] of entries) {
        const abil = a as Abil, to = env.cand.abilities[abil] + (n as number);
        if (env.mode.kind === "level" && to > s.maxScores[abil]) return { error: `${label}: ${ABIL_NAME[abil]} cannot go above ${s.maxScores[abil]}` };
      }
      return { ok: { abilities: Object.fromEntries(entries) } };
    }
    case "pick": {
      if (!isStrs(v) || v.length !== s.count) return { error: `${label}: pick exactly ${s.count}` };
      if (new Set(v).size !== v.length) return { error: `${label}: picks must be different` };
      for (const id of v) {
        const o = s.options.find(x => x.id === id);
        if (!s.free && !o) return { error: `${label}: "${id}" is not one of the choices` };
        if (s.free && !id.trim()) return { error: `${label}: a pick is empty` };
        if (o?.disabled) return { error: `${label}: ${o.name} is not available (${o.disabled.toLowerCase()})` };
        const set = s.what === "skills" ? taken.skills : s.what === "expertise" ? taken.expertise : s.what === "languages" ? taken.languages : s.what === "tools" ? taken.tools : undefined;
        if (env.mode.kind === "resolve" ? taken.picked.has(`${s.what}:${id}`) : set?.has(id)) return { error: `${label}: ${optionName(s, id)} is already chosen` };
      }
      v.forEach(x => taken.picked.add(`${s.what}:${x}`));
      if (s.what === "skills") v.forEach(x => taken.skills.add(x)); else if (s.what === "expertise") v.forEach(x => taken.expertise.add(x));
      else if (s.what === "languages") v.forEach(x => taken.languages.add(x)); else if (s.what === "tools") v.forEach(x => taken.tools.add(x));
      return { ok: v };
    }
    case "spells": {
      if (!isStrs(v)) return { error: `${label}: pick spells` };
      if (new Set(v).size !== v.length) return { error: `${label}: picks must be different` };
      let cantrips = 0, spells = 0;
      for (const id of v) {
        const o = s.options.find(x => x.id === id);
        if (!o) return { error: `${label}: "${id}" is not on the list` };
        if (o.disabled) return { error: `${label}: ${o.name} is not available (${o.disabled.toLowerCase()})` };
        if (o.level === 0) cantrips++; else spells++;
      }
      if (cantrips !== s.cantrips || spells !== s.count) return { error: `${label}: pick ${s.cantrips} cantrip${s.cantrips === 1 ? "" : "s"} and ${s.count} spell${s.count === 1 ? "" : "s"}` };
      return { ok: v };
    }
  }
}

function checkSwaps(s: Extract<Step, { kind: "spells" }>, v: unknown, env: Env): { error: string } | { ok: { out: string; in: string }[] } {
  if (v === undefined) return { ok: [] };
  const label = `${s.source}: swap`;
  if (!Array.isArray(v) || v.length > s.swap || !v.every(x => isObj(x) && typeof x.out === "string" && typeof x.in === "string")) return { error: `${label}: swap at most ${s.swap} spell${s.swap === 1 ? "" : "s"}` };
  const pairs = v as { out: string; in: string }[], known = new Set(env.cand.spells.map(x => x.id)), outs = new Set<string>(), ins = new Set<string>();
  for (const p of pairs) {
    const o = s.options.find(x => x.id === p.in);
    if (!known.has(p.out) || outs.has(p.out)) return { error: `${label}: ${p.out} is not a spell you can swap out` };
    if (!o || o.disabled || ins.has(p.in)) return { error: `${label}: ${p.in} is not available` };
    outs.add(p.out); ins.add(p.in);
  }
  return { ok: pairs };
}

/** Validate every step's answer and write the effects of the answers into `value`; returns what to record in the log. */
function commitSteps(steps: Step[], choices: Record<string, unknown>, env: Env, value: Character, c: Character): { record: Record<string, unknown>; summary: string[] } | { error: string } {
  const taken: Taken = { skills: new Set([...c.proficiencies.skills, ...env.prog.proficiencies.skills]), expertise: new Set([...c.proficiencies.expertise, ...env.prog.proficiencies.expertise]),
    languages: new Set(env.prog.languages), tools: new Set(env.prog.proficiencies.other), picked: new Set() };
  const asked = steps.filter((s): s is Exclude<Step, { kind: "hp" }> => s.kind !== "hp");
  // expertise may use skills picked in the same level, so skills are checked first
  const order = [...asked.filter(s => !(s.kind === "pick" && s.what === "expertise")), ...asked.filter(s => s.kind === "pick" && s.what === "expertise")];
  const record: Record<string, unknown> = {}, summary: string[] = [], added: string[] = [], swaps: unknown[] = [];
  for (const s of order) {
    const r = checkStep(s, choices[s.key], env, taken);
    if ("error" in r) return r;
    if (s.kind === "pick" && s.what === "expertise") {
      const bad = (r.ok as string[]).find(id => !taken.skills.has(id));
      if (bad !== undefined) return { error: `${s.source}: expertise needs a skill you are proficient in (${titleCase(bad)})` };
    }
    record[s.key] = r.ok;
    if (s.kind === "subclass") summary.push(`Subclass: ${optionName(s, r.ok as string)}`);
    else if (s.kind === "pick") summary.push(`${s.what === "option" ? titleCase(s.list ?? "choice") : titleCase(s.what)}: ${(r.ok as string[]).map(id => optionName(s, id)).join(", ")}`);
    else if (s.kind === "asi") {
      const a = r.ok as { feat?: string; abilities?: Record<string, number> };
      if (a.feat) summary.push(`Feat: ${env.registry.get<FeatData>("feat", a.feat)?.name ?? a.feat}`);
      else { if (env.mode.kind === "level") for (const [k, n] of Object.entries(a.abilities ?? {})) value.abilities[k as Abil] += n; summary.push(Object.entries(a.abilities ?? {}).map(([k, n]) => `${sgn(n)} ${ABIL_NAME[k as Abil]}`).join(", ")); }
    } else if (s.kind === "spells") {
      const ids = r.ok as string[], sw = checkSwaps(s, choices[`${s.key}:swap`], env);
      if ("error" in sw) return sw;
      for (const id of ids) { value.spells.push({ id, prepared: false }); added.push(id); }
      for (const p of sw.ok) {
        const i = value.spells.findIndex(x => x.id === p.out);
        swaps.push({ out: p.out, in: p.in, prepared: value.spells[i].prepared });
        value.spells[i] = { id: p.in, prepared: false };
      }
      if (sw.ok.length) record[`${s.key}:swap`] = sw.ok;
      summary.push(`Spells: ${[...ids, ...sw.ok.map(p => p.in)].map(id => optionName(s, id)).join(", ") || "none"}`);
    }
  }
  if (added.length) record["+spells"] = added;
  if (swaps.length) record["+swaps"] = swaps;
  return { record, summary };
}

const grantItems = (registry: Registry, c: Character, classId: string, level: number): string[] => {
  const out: string[] = [], k = c.classes.find(x => x.class === classId);
  const ops = [...(registry.get<ClassData>("class", classId)?.data.levels?.[level] ?? []),
    ...(k?.subclass ? registry.get<SubclassData>("subclass", k.subclass)?.data.levels[level] ?? [] : [])];
  for (const op of ops) if (op.op === "grant") out.push(...op.items);
  return out;
};
const featItems = (registry: Registry, feat: string): string[] =>
  (registry.get<FeatData>("feat", feat)?.data.grants ?? []).flatMap(op => op.op === "grant" ? op.items : []);

/** Apply one class level. Pure: on any problem returns { error } and the character is untouched. */
export function applyLevel(c: Character, pl: Pick<LevelPlan, "class">, answers: LevelAnswers, registry: Registry, rng: Rng = Math.random): LevelResult {
  const choices = answers.choices ?? {};
  const p = plan(c, { kind: "level", classId: pl.class }, registry, choices);
  if ("error" in p) return p;
  const { env, steps } = p, value = env.cand, hpStep = steps[0] as Extract<Step, { kind: "hp" }>;
  let method: HpMethod, gained: number;
  if (p.first) { method = "first"; gained = p.die; }
  else if (answers.hp?.method === "average") { method = "average"; gained = averageHp(p.die); }
  else if (answers.hp?.method === "roll") {
    method = "roll"; gained = answers.hp.roll ?? rollHitDie(p.die, rng);
    if (!Number.isInteger(gained) || gained < 1 || gained > p.die) return { error: `A d${p.die} roll must be from 1 to ${p.die}` };
  } else return { error: "Choose Roll or Average for hit points" };

  const done = commitSteps(steps, choices, env, value, c);
  if ("error" in done) return done;
  const oldMod = hpStep.conMod, newMod = abilityMod(value.abilities.con), total = totalLevel(value);
  const added = Math.max(1, gained + oldMod) + (newMod - oldMod) * total;
  value.hp = { ...value.hp, max: c.hp.max + added, current: c.hp.current + added };

  const record = done.record, summary = [`${p.className} ${p.level} (character level ${total})`,
    `HP +${added} (${method === "roll" ? `rolled ${gained}` : method === "first" ? `d${p.die}` : `average ${gained}`} ${sgn(oldMod)} CON${newMod !== oldMod ? `, CON modifier ${sgn(newMod - oldMod)} on ${total} levels` : ""})`, ...done.summary];
  const sub = value.classes.find(k => k.class === pl.class)?.subclass;
  if (sub && !c.classes.find(k => k.class === pl.class)?.subclass) record["+subclass"] = sub;
  const items = [...grantItems(registry, value, pl.class, p.level), ...value.feats.filter(f => !c.feats.includes(f)).flatMap(f => featItems(registry, f))];
  for (const id of items) value.inventory.push({ id, qty: 1, equipped: false, attuned: false });
  if (items.length) { record["+items"] = items; summary.push(`Gained: ${items.join(", ")}`); }

  const entry: LevelEntry = { class: pl.class, level: p.level, hp: { method, die: p.die, gained, added }, choices: record };
  value.levelLog = [...value.levelLog, entry];
  const before = progress(c, registry), after = progress(value, registry);
  const fresh = after.problems.filter(m => !before.problems.includes(m));
  if (fresh.length) return { error: `This level would break the class: ${fresh[0]}` };
  const open = steps.filter(s => s.kind !== "hp" && after.pending.some(q => q.key === s.key));
  if (open.length) return { error: `${open[0].kind === "hp" ? "" : open[0].label} is not fully answered` };
  const known = new Set(before.features.map(f => f.key)), names = after.features.filter(f => !known.has(f.key)).map(f => f.name);
  if (names.length) summary.push(`New features: ${names.join(", ")}`);
  return { value, entry, summary };
}

/** Record answers to pending choices without adding a level (legacy notes, or a subclass picked later). */
export function applyResolve(c: Character, answers: LevelAnswers, registry: Registry): { value: Character; summary: string[] } | { error: string } {
  const choices = answers.choices ?? {};
  const p = plan(c, { kind: "resolve" }, registry, choices);
  if ("error" in p) return p;
  const { env } = p, value = env.cand;
  if (!p.steps.length) return { error: "Nothing is waiting for a choice" };
  // one answered item at a time is fine: only the steps that have an answer are checked
  const steps = p.steps.filter(s => s.key in choices);
  if (!steps.length) return { error: `${p.steps[0].kind === "hp" ? "" : p.steps[0].label} still needs an answer` };
  const done = commitSteps(steps, choices, env, value, c);
  if ("error" in done) return done;
  for (const s of steps) if (s.kind !== "subclass" && s.kind !== "hp" && s.key in done.record) value.choices[s.key] = done.record[s.key];
  for (const s of steps) if (s.kind === "spells" && `${s.key}:swap` in done.record) value.choices[`${s.key}:swap`] = done.record[`${s.key}:swap`];
  const before = progress(c, registry), after = progress(value, registry);
  const fresh = after.problems.filter(m => !before.problems.includes(m));
  if (fresh.length) return { error: `That choice is not allowed: ${fresh[0]}` };
  return { value, summary: done.summary };
}

/** Reverse the last applied level exactly: class level, subclass, HP, ability points, feat, spells and items it added. */
export function undoLevel(c: Character, registry: Registry): { value: Character; summary: string[] } | { error: string } {
  const entry = c.levelLog[c.levelLog.length - 1];
  if (!entry) return { error: "There is no applied level to undo" };
  const i = c.classes.findIndex(k => k.class === entry.class);
  if (i < 0 || c.classes[i].level !== entry.level) return { error: `The last log entry (${entry.class} ${entry.level}) does not match the class levels` };
  const v = structuredClone(c), before = progress(c, registry);
  v.levelLog.pop();
  const ch = entry.choices, summary = [`Undid ${entry.class} ${entry.level}`];
  // spells first (swaps back in place), then the ones that were added
  const swaps = Array.isArray(ch["+swaps"]) ? ch["+swaps"] as { out: string; in: string; prepared: boolean }[] : [];
  for (const s of [...swaps].reverse()) { const j = v.spells.findIndex(x => x.id === s.in); if (j >= 0) v.spells[j] = { id: s.out, prepared: s.prepared }; }
  for (const id of isStrs(ch["+spells"]) ? ch["+spells"] : []) {
    const j = v.spells.map(x => x.id).lastIndexOf(id);
    if (j >= 0) { v.spells.splice(j, 1); v.mainSpells = v.mainSpells.filter(k => k !== id); }
  }
  for (const id of isStrs(ch["+items"]) ? ch["+items"] : []) { const j = v.inventory.map(x => x.id).lastIndexOf(id); if (j >= 0) v.inventory.splice(j, 1); }
  for (const val of Object.values(ch)) {
    if (!isObj(val)) continue;
    if (typeof val.feat === "string") { const j = v.feats.lastIndexOf(val.feat); if (j >= 0) v.feats.splice(j, 1); }
    else if (isObj(val.abilities)) for (const [a, n] of Object.entries(val.abilities)) if (ABILS.includes(a as Abil) && typeof n === "number") v.abilities[a as Abil] = Math.max(1, v.abilities[a as Abil] - n);
  }
  // HP: entries from applyLevel know what they added; hand-written ones fall back to gained + CON (recorded = the whole amount)
  const added = entry.hp.added ?? (entry.hp.method === "recorded" ? entry.hp.gained : Math.max(1, entry.hp.gained + abilityMod(c.abilities.con)));
  v.hp.max = Math.max(0, c.hp.max - added);
  v.hp.current = Math.min(v.hp.max, Math.max(c.hp.current > 0 ? 1 : 0, c.hp.current - added));
  if (typeof ch["+subclass"] === "string" && v.classes[i].subclass === ch["+subclass"]) delete v.classes[i].subclass;
  if (entry.level <= 1) v.classes.splice(i, 1); else v.classes[i].level--;
  // used counts of resources that existed only because of this level go with it
  const after = progress(v, registry), keep = new Set(after.resources.map(r => r.id));
  for (const r of before.resources) if (!keep.has(r.id)) delete v.uses[r.id];
  const gone = before.features.filter(f => !after.features.some(x => x.key === f.key)).map(f => f.name);
  if (gone.length) summary.push(`Lost features: ${gone.join(", ")}`);
  summary.push(`HP -${added}`);
  return { value: v, summary };
}
