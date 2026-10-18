import type { Registry } from "../content/registry";
import { slug } from "../content/registry";
import type { ActionDef, ClassData, FeatData, GrantsData, Op, OptionDef, Progression, Reset, SubclassData, SubraceData, TableRow, ToggleDef } from "../content/types";
import { abilityMod, profBonus } from "./abilities";
import type { Character } from "./character";
import { gatedByToggle, type SourcedEffects } from "./effects";
import { evalFormula, isUnlimitedWord, UNLIMITED, type Formula } from "./formula";
import { ABILS, SKILLS, type Abil, type Effects } from "./types";

export interface FeatureRow {
  /** `<source>:<level>:<op id>`; the same key a choice for this op is stored under. */
  key: string; source: string; sourceKind: "race" | "subrace" | "background" | "feat" | "class" | "subclass" | "option";
  level: number; name: string; text?: string; effects: Effects; action?: ActionDef; toggle?: ToggleDef;
}
export interface DerivedResource {
  id: string; name: string; max: number; used: number; reset: Reset; source: string;
  refill?: { on: "short"; amount: number; oncePer?: "long" };
  /** Non-numeric max ("Unlimited"): no pips, never runs out. `max` is 0 and `used` stays 0. */
  unlimited?: string;
}
export interface DcRow { id: string; name: string; base: Abil; alt?: Abil; abil: Abil; dc: number; attack: number; source: string; }
export interface CasterEntry {
  class: string; className: string; from: "class" | "subclass"; abil: Abil; progression: Progression; level: number;
  table?: Record<number, TableRow>; list?: string; cantrips?: number; known?: number;
}
export interface PendingChoice { key: string; source: string; level: number; op: Op; label: string; }
export interface Progress {
  features: FeatureRow[]; resources: DerivedResource[]; scales: Record<string, string | number>; dcs: DcRow[];
  proficiencies: { saves: Abil[]; skills: string[]; expertise: string[]; other: string[] };
  languages: string[]; speed?: number; darkvision?: number;
  options: Record<string, string[]>; spellcasting: CasterEntry[];
  grantedSpells: { id: string; source: string }[]; grantedItems: { id: string; source: string }[];
  pending: PendingChoice[]; effects: SourcedEffects[];
  /** Every switch a feature or option declares (Rage, a stance); its effects are in `effects` only while it is on. */
  toggles: DeclaredToggle[];
  /** Content ids the character names that are not in the compendium (race:x, feat:y, subclass:z). */
  unknown: string[];
  /** Bad homebrew that was skipped: formulas that do not evaluate, picks that are not allowed, and so on. */
  problems: string[];
}

/** A switch declared by a feature or option: `effects` count only while it is on. */
export interface DeclaredToggle { id: string; name: string; source: string; text?: string; def: ToggleDef; effects: Effects; }

export const emptyProgress = (): Progress => ({
  features: [], resources: [], scales: {}, dcs: [], proficiencies: { saves: [], skills: [], expertise: [], other: [] }, languages: [],
  options: {}, spellcasting: [], grantedSpells: [], grantedItems: [], pending: [], effects: [], toggles: [], unknown: [], problems: [],
});

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const underscore = (id: string) => id.replace(/-/g, "_");

/** Variables a Formula may use: prof, total, level, str..cha modifiers, and numeric scales (hyphens as underscores). */
export function formulaVars(c: Character, scales: Record<string, string | number>, level?: number): Record<string, number> {
  const total = c.classes.reduce((a, k) => a + k.level, 0), out: Record<string, number> = {};
  for (const [id, v] of Object.entries(scales)) { const n = typeof v === "number" ? v : v.trim() !== "" ? Number(v) : NaN; if (Number.isFinite(n)) out[underscore(id)] = n; }
  for (const a of ABILS) out[a] = abilityMod(c.abilities[a]);
  return Object.assign(out, { prof: profBonus(total), total, level: level ?? total });
}

interface ScaleDef { id: string; name: string; values?: Record<number, string | number>; formula?: Formula; varLevel: number; }
interface ResDef { id: string; name: string; max: Formula; reset: Reset; refill?: DerivedResource["refill"] & { amountF: Formula }; varLevel: number; source: string; }
interface DcDef { id: string; name: string; base: Abil; alt?: Abil; varLevel: number; source: string; }
interface Src {
  kind: FeatureRow["sourceKind"]; label: string; keyBase: string; classId?: string; classLevel: number; level: number;
  options?: Record<string, OptionDef[]>; fallbackOptions?: Record<string, OptionDef[]>; subclass?: string | undefined;
}

export function progress(c: Character, registry: Registry): Progress {
  const out = emptyProgress();
  const total = c.classes.reduce((a, k) => a + k.level, 0);
  const scaleDefs = new Map<string, ScaleDef>(), resDefs = new Map<string, ResDef>(), dcDefs = new Map<string, DcDef>();
  const casters = new Map<string, CasterEntry>();
  const seen = { skills: new Set<string>(), expertise: new Set<string>(), other: new Set<string>(), saves: new Set<Abil>(), langs: new Set<string>() };

  const choice = (key: string, cls?: string, level?: number): unknown => {
    const exact = cls === undefined ? undefined : c.levelLog.find(x => x.class === cls && x.level === level);
    if (exact && own(exact.choices, key)) return exact.choices[key];
    for (const x of c.levelLog) if (own(x.choices, key)) return x.choices[key];
    return own(c.choices, key) ? c.choices[key] : undefined;
  };
  const problem = (m: string) => { if (!out.problems.includes(m)) out.problems.push(m); };
  const addProf = (list: string[]) => {
    for (const p of list) {
      const m = /^(skill|save|expertise):(.+)$/.exec(p);
      if (m?.[1] === "skill") { if (m[2] in SKILLS) seen.skills.add(m[2]); else problem(`unknown skill ${m[2]}`); }
      else if (m?.[1] === "expertise") { if (m[2] in SKILLS) seen.expertise.add(m[2]); else problem(`unknown skill ${m[2]}`); }
      else if (m?.[1] === "save") { if (ABILS.includes(m[2] as Abil)) seen.saves.add(m[2] as Abil); else problem(`unknown save ${m[2]}`); }
      else seen.other.add(p);
    }
  };
  const feature = (src: Src, key: string, name: string, text: string | undefined, effects: Effects, action: ActionDef | undefined, kind = src.kind, toggle?: ToggleDef) => {
    out.features.push({ key, source: src.label, sourceKind: kind, level: src.level, name, effects, ...(text !== undefined ? { text } : {}), ...(action ? { action } : {}), ...(toggle ? { toggle } : {}) });
    if (toggle) {
      if (out.toggles.some(t => t.id === toggle.id)) problem(`${name}: another switch is already called "${toggle.id}"`);
      else out.toggles.push({ id: toggle.id, name, source: src.label, def: toggle, effects, ...(text !== undefined ? { text } : {}) });
    }
    if (Object.keys(effects).length) out.effects.push({ source: name, effects: toggle ? gatedByToggle(effects, toggle) : effects });
  };

  function run(ops: Op[], src: Src) {
    for (const op of ops) {
      const key = `${src.keyBase}:${src.kind === "race" || src.kind === "subrace" || src.kind === "background" || src.kind === "feat" ? "" : `${src.level}:`}${op.id}`;
      switch (op.op) {
        case "grant":
          addProf(op.proficiencies);
          op.languages.forEach(l => seen.langs.add(l));
          op.spells.forEach(id => out.grantedSpells.push({ id, source: src.label }));
          op.items.forEach(id => out.grantedItems.push({ id, source: src.label }));
          if (op.speed !== undefined) out.speed = op.speed;
          if (op.darkvision !== undefined) out.darkvision = Math.max(out.darkvision ?? 0, op.darkvision);
          break;
        case "feature":
          // an optional feature is only there when the level-up (or the note's choices) says it was taken
          if (!op.optional || choice(key, src.classId, src.level) === true) feature(src, key, op.name, op.text, op.effects, op.action, undefined, op.toggle);
          break;
        case "effect": if (Object.keys(op.effects).length) out.effects.push({ source: src.label, effects: op.effects }); break;
        case "resource": {
          const id = slug(op.name);
          resDefs.set(id, { id, name: op.name, max: op.max, reset: op.reset, varLevel: src.classLevel, source: src.label,
            ...(op.refill ? { refill: { on: "short" as const, amount: 0, amountF: op.refill.amount, ...(op.refill.oncePer ? { oncePer: "long" as const } : {}) } } : {}) });
          break;
        }
        case "scale": {
          const id = slug(op.name);
          scaleDefs.set(id, { id, name: op.name, varLevel: src.classLevel, ...(op.values ? { values: op.values } : {}), ...(op.formula !== undefined ? { formula: op.formula } : {}) });
          break;
        }
        case "dc": {
          const id = slug(op.name);
          dcDefs.set(id, { id, name: op.name, base: op.abil, varLevel: src.classLevel, source: src.label, ...(op.alt ? { alt: op.alt } : {}) });
          break;
        }
        case "modify": {
          if (op.resource !== undefined) {
            const d = resDefs.get(slug(op.resource));
            if (d) d.max = op.set; else problem(`${src.label}: modify finds no earlier resource "${op.resource}"`);
          } else if (op.scale !== undefined) {
            const d = scaleDefs.get(slug(op.scale));
            if (d) { d.formula = op.set; delete d.values; } else problem(`${src.label}: modify finds no earlier scale "${op.scale}"`);
          }
          break;
        }
        case "spellcasting": {
          const cls = src.classId ?? "";
          const row = op.progression === "table" ? tableAt(op.table, src.classLevel) : undefined;
          casters.set(`${cls}:${src.kind}`, { class: cls, className: classNameOf(cls), from: src.kind === "subclass" ? "subclass" : "class", abil: op.abil,
            progression: op.progression, level: src.classLevel, ...(op.table ? { table: op.table } : {}), ...(op.list ? { list: op.list } : {}),
            ...(row?.cantrips !== undefined ? { cantrips: row.cantrips } : {}), ...(row?.known !== undefined ? { known: row.known } : {}) });
          break;
        }
        case "subclass":
          if (!src.subclass) out.pending.push({ key, source: src.label, level: src.level, op, label: "Choose a subclass" });
          break;
        case "asi": {
          const v = choice(key, src.classId, src.level);
          const ok = isObj(v) && (typeof v.feat === "string" || isObj(v.abilities));
          if (v !== undefined && !ok) problem(`${src.label}: the saved Ability Score Improvement pick is not understood`);
          if (!ok) out.pending.push({ key, source: src.label, level: src.level, op, label: "Ability Score Improvement or feat" });
          break;
        }
        case "spells": {
          const v = choice(key, src.classId, src.level);
          if (!isStrs(v)) out.pending.push({ key, source: src.label, level: src.level, op, label: op.count || op.cantrips ? `Learn ${[op.cantrips ? `${op.cantrips} cantrips` : "", op.count ? `${op.count} spells` : ""].filter(Boolean).join(" and ")}` : "Spells" });
          break;
        }
        case "choose": {
          const label = op.what === "option" ? `Choose ${op.count} (${op.list})` : `Choose ${op.count} ${op.what}`;
          const v = choice(key, src.classId, src.level);
          const pend = () => out.pending.push({ key, source: src.label, level: src.level, op, label });
          if (!isStrs(v) || v.length !== op.count) { if (v !== undefined) problem(`${src.label}: the saved pick for ${op.id} does not have ${op.count} entries`); pend(); break; }
          let defs: OptionDef[] | undefined;
          if (op.what === "option") {
            defs = src.options?.[op.list ?? ""] ?? src.fallbackOptions?.[op.list ?? ""];
            if (!defs) { problem(`${src.label}: no options list called ${op.list}`); pend(); break; }
          }
          const allowed = defs ? defs.map(d => d.id) : op.from ?? (op.what === "skills" || op.what === "expertise" ? Object.keys(SKILLS) : undefined);
          const bad = v.find(x => allowed && !allowed.includes(x));
          if (bad !== undefined || new Set(v).size !== v.length) { problem(`${src.label}: ${bad !== undefined ? `"${bad}" is not an allowed pick` : "picks must be different"} for ${op.id}`); pend(); break; }
          if (op.what === "skills") v.forEach(s => seen.skills.add(s));
          else if (op.what === "expertise") v.forEach(s => seen.expertise.add(s));
          else if (op.what === "tools") v.forEach(s => seen.other.add(s));
          else if (op.what === "languages") v.forEach(s => seen.langs.add(s));
          else {
            const list = op.list!;
            for (const id of v) {
              const d = defs!.find(x => x.id === id)!;
              if (d.minLevel !== undefined && d.minLevel > src.classLevel) { problem(`${src.label}: ${d.name} needs level ${d.minLevel}`); continue; }
              (out.options[list] ??= []).push(id);
              feature(src, `${key}:${id}`, d.name, d.text, d.effects, d.action, "option", d.toggle);
            }
          }
          break;
        }
      }
    }
  }

  const classNameOf = (id: string) => registry.get<ClassData>("class", id)?.data.name ?? id;
  const tableAt = (t: Record<number, TableRow> | undefined, level: number): TableRow | undefined => {
    let best = 0; for (const k of Object.keys(t ?? {})) { const n = Number(k); if (n <= level && n > best) best = n; }
    return best ? t![best] : undefined;
  };
  const originSrc = (kind: "race" | "subrace" | "background" | "feat", id: string, name: string): Src =>
    ({ kind, label: `${kind[0].toUpperCase()}${kind.slice(1)}: ${name}`, keyBase: `${kind}:${id}`, classLevel: total, level: 0 });
  const origin = <T extends GrantsData>(kind: "race" | "subrace" | "background" | "feat", id: string | undefined) => {
    if (!id) return undefined;
    const e = registry.get<T>(kind, id);
    if (!e) { out.unknown.push(`${kind}:${id}`); return undefined; }
    run(e.data.grants, originSrc(kind, id, e.data.name));
    return e;
  };

  origin("race", c.race);
  if (c.subrace) {
    const e = origin<SubraceData>("subrace", c.subrace);
    if (e && c.race && e.data.race !== c.race) problem(`subrace ${e.data.name} belongs to ${e.data.race}, not ${c.race}`);
  }
  origin("background", c.background);
  for (const f of c.feats) origin<FeatData>("feat", f);

  c.classes.forEach((k, idx) => {
    const e = registry.get<ClassData>("class", k.class);
    if (!e) return;
    const d = e.data, n = k.level;
    const sub = k.subclass ? registry.get<SubclassData>("subclass", k.subclass) : undefined;
    if (k.subclass && !sub) out.unknown.push(`subclass:${k.subclass}`);
    if (sub && sub.data.class !== k.class) problem(`subclass ${sub.data.name} belongs to ${sub.data.class}, not ${k.class}`);
    const goodSub = sub && sub.data.class === k.class ? sub : undefined;
    const base = { kind: "class" as const, keyBase: `class:${k.class}`, classId: k.class, classLevel: n, ...(d.options ? { options: d.options } : {}), subclass: k.subclass };
    if (d.spellcasting) casters.set(`${k.class}:class`, { class: k.class, className: d.name, from: "class", abil: d.spellcasting.abil, progression: d.spellcasting.progression, level: n });
    for (let L = 1; L <= n; L++) {
      const src: Src = { ...base, label: `${d.name} ${L}`, level: L };
      if (L === 1) {
        if (idx === 0) {
          d.saves.forEach(s => seen.saves.add(s));
          addProf(d.proficiencies ?? []);
          if (d.skills) run([{ id: "skills", op: "choose", what: "skills", from: d.skills.from, count: d.skills.count, swap: false }], src);
        } else addProf(d.multiclass?.proficiencies ?? []);
      }
      run(d.levels?.[L] ?? [], src);
      if (goodSub) {
        const ssrc: Src = { ...src, kind: "subclass", keyBase: `subclass:${k.subclass}`, label: `${goodSub.data.name} (${d.name} ${L})`,
          ...(goodSub.data.options ? { options: goodSub.data.options } : {}), ...(d.options ? { fallbackOptions: d.options } : {}) };
        run(goodSub.data.levels[L] ?? [], ssrc);
      }
    }
  });

  // Evaluate scales in definition order, then resources, class DCs.
  for (const d of scaleDefs.values()) {
    try {
      if (isUnlimitedWord(d.formula)) out.scales[d.id] = UNLIMITED;
      else if (d.formula !== undefined) out.scales[d.id] = evalFormula(d.formula, formulaVars(c, out.scales, d.varLevel));
      else if (d.values) {
        let best = 0; for (const k of Object.keys(d.values)) { const n = Number(k); if (n <= d.varLevel && n > best) best = n; }
        if (best) out.scales[d.id] = d.values[best];
      }
    } catch (x) { problem(`scale ${d.name}: ${(x as Error).message}`); }
  }
  const vars = (level: number) => formulaVars(c, out.scales, level);
  /** A max that is the word Unlimited, or names a scale whose value is non-numeric text, makes the resource unlimited. */
  const unlimitedOf = (f: Formula): string | undefined => {
    if (isUnlimitedWord(f)) return UNLIMITED;
    if (typeof f !== "string") return undefined;
    const name = f.trim();
    for (const [sid, v] of Object.entries(out.scales)) if (underscore(sid) === name && typeof v === "string" && v.trim() && !Number.isFinite(Number(v))) return v.trim();
    return undefined;
  };
  for (const d of resDefs.values()) {
    const text = unlimitedOf(d.max);
    if (text) { out.resources.push({ id: d.id, name: d.name, max: 0, used: 0, reset: d.reset, source: d.source, unlimited: text }); continue; }
    try {
      const max = Math.max(0, Math.floor(evalFormula(d.max, vars(d.varLevel))));
      const r: DerivedResource = { id: d.id, name: d.name, max, used: Math.min(Math.max(0, c.uses[d.id] ?? 0), max), reset: d.reset, source: d.source };
      if (d.refill) r.refill = { on: "short", amount: Math.max(0, Math.floor(evalFormula(d.refill.amountF, vars(d.varLevel)))), ...(d.refill.oncePer ? { oncePer: "long" as const } : {}) };
      out.resources.push(r);
    } catch (x) { problem(`resource ${d.name}: ${(x as Error).message}`); }
  }
  for (const d of dcDefs.values()) {
    const useAlt = !!d.alt && c.choices[`dc.${d.id}.alt`] === true, abil = useAlt ? d.alt! : d.base;
    const prof = profBonus(total), mod = abilityMod(c.abilities[abil]);
    out.dcs.push({ id: d.id, name: d.name, base: d.base, ...(d.alt ? { alt: d.alt } : {}), abil, dc: 8 + prof + mod, attack: prof + mod, source: d.source });
  }
  // Cross-checks the validators cannot make: an action may spend or save against things defined elsewhere.
  for (const f of out.features) {
    const a = f.action; if (!a) continue;
    if (a.cost && "resource" in a.cost && !out.resources.some(r => r.id === slug((a.cost as { resource: string }).resource))) problem(`${f.name}: action spends unknown resource "${(a.cost as { resource: string }).resource}"`);
    if (a.save && !out.dcs.some(x => x.id === slug(a.save!.dc))) problem(`${f.name}: action uses unknown DC "${a.save.dc}"`);
  }

  out.proficiencies = { saves: [...seen.saves], skills: [...seen.skills], expertise: [...seen.expertise], other: [...seen.other] };
  out.languages = [...seen.langs];
  const order = (e: CasterEntry) => c.classes.findIndex(k => k.class === e.class) * 2 + (e.from === "class" ? 0 : 1);
  out.spellcasting = [...casters.values()].sort((a, b) => order(a) - order(b));
  return out;
}
