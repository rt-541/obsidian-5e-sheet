import { checkFormula, isUnlimitedWord, UNLIMITED, type Formula } from "../../core/formula";
import { checkDice } from "../../core/dice";
import { ABILS, SKILLS, type Abil, type Effects } from "../../core/types";
import { bool, isObj, type Errs, type Raw } from "../check";
import { slug } from "../registry";
import { validateEffects } from "./effects";
import { validateToggle, type ToggleDef } from "./toggle";

export type Reset = "short" | "long" | "dawn" | "none";
export const RESET_VALUES = ["short", "long", "dawn", "none"] as const;

export interface ActionDef {
  name: string; text?: string;
  cost?: { resource: string; amount?: Formula } | { selfDamage: string };
  attack?: Formula; save?: { abil: Abil; dc: string }; damage?: string; heal?: string;
}
export interface OptionDef { id: string; name: string; text?: string; minLevel?: number; effects: Effects; action?: ActionDef;
  /** false: the built-in mechanics never fill this option in. */ overlay?: false;
  /** A switch the player turns on and off; the effects count only while it is on. */ toggle?: ToggleDef; }
/** One row of a custom spellcasting table: slots[0] is the number of 1st-level slots. */
export interface TableRow { cantrips?: number; known?: number; slots?: number[]; pact?: { slots: number; level: number }; }
export type Progression = "full" | "half" | "third" | "pact" | "table";

interface Base { id: string; }
export type Op =
  | (Base & { op: "grant"; proficiencies: string[]; languages: string[]; spells: string[]; items: string[]; speed?: number; darkvision?: number; /** Extra movement modes (fly, swim, climb, burrow); same as the speeds effect. */ speeds?: NonNullable<Effects["speeds"]> })
  | (Base & { op: "feature"; name: string; text?: string; effects: Effects; action?: ActionDef; /** Not applied unless the player takes it (the level-up asks). */ optional?: boolean; /** A switch the player turns on and off; the effects count only while it is on. */ toggle?: ToggleDef;
      /** false: the built-in mechanics never fill this feature in. */ overlay?: false })
  | (Base & { op: "resource"; name: string; max: Formula; reset: Reset; refill?: { on: "short"; amount: Formula; oncePer?: "long" } })
  | (Base & { op: "scale"; name: string; values?: Record<number, string | number>; formula?: Formula })
  | (Base & { op: "dc"; name: string; abil: Abil; alt?: Abil })
  | (Base & { op: "modify"; resource?: string; scale?: string; set: Formula })
  | (Base & { op: "choose"; what: "skills" | "expertise" | "tools" | "languages" | "option"; from?: string[]; list?: string; count: number; swap: boolean })
  | (Base & { op: "subclass" })
  | (Base & { op: "asi" })
  | (Base & { op: "spells"; count: number; cantrips?: number; from: string | string[]; swap?: number; schools?: string[] })
  | (Base & { op: "spellcasting"; abil: Abil; progression: Progression; table?: Record<number, TableRow>; list?: string })
  | (Base & { op: "effect"; effects: Effects });
export type OpName = Op["op"];
export const OP_NAMES: OpName[] = ["grant", "feature", "resource", "scale", "dc", "modify", "choose", "subclass", "asi", "spells", "spellcasting", "effect"];

export interface OpsCtx {
  kind: "class" | "subclass" | "grants";
  /** Option list name -> number of options, for the note's own `options`. */
  options: Record<string, number>;
}
const MAX_LEVEL = 20, MAX_OPS = 60;

const whole = (v: unknown, min = 0) => typeof v === "number" && Number.isInteger(v) && v >= min;
const texts = (v: unknown, at: string, e: Errs): string[] => {
  if (v === undefined) return [];
  if (Array.isArray(v) && v.every(x => typeof x === "string" && x.trim())) return (v as string[]).map(x => x.trim());
  e.push(`${at}: must be a list of text`); return [];
};
const optText = (v: unknown, at: string, e: Errs): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  e.push(`${at}: must be text`); return undefined;
};
const reqName = (v: unknown, at: string, e: Errs): string => {
  if (typeof v === "string" && v.trim()) return v.trim();
  e.push(`${at}: must be text`); return "";
};
const formula = (v: unknown, at: string, e: Errs): Formula => {
  const err = checkFormula(v);
  if (err) { e.push(`${at}: ${err}`); return 0; }
  return isUnlimitedWord(v) ? UNLIMITED : v as Formula;
};
const abil = (v: unknown, at: string, e: Errs): Abil => {
  if (ABILS.includes(v as Abil)) return v as Abil;
  e.push(`${at}: must be one of ${ABILS.join(", ")}`); return "str";
};

export { checkDice };
const dice = (v: unknown, at: string, e: Errs): string => {
  if (checkDice(v)) return (v as string).trim();
  e.push(`${at}: must be dice such as 1d6+2 or {scale-id}`); return "";
};

/** `overlay: false` switches the built-in mechanics off for the thing that carries it; `true` or absent leaves them on. */
export function optOut(v: unknown, at: string, e: Errs): false | undefined {
  if (v === undefined || v === true) return undefined;
  if (v === false) return false;
  e.push(`${at}: must be true or false`); return undefined;
}

export function validateAction(v: unknown, at: string, e: Errs): ActionDef | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) { e.push(`${at}: must be a mapping`); return undefined; }
  const out: ActionDef = { name: reqName(v.name, `${at}.name`, e) };
  const text = optText(v.text, `${at}.text`, e); if (text !== undefined) out.text = text;
  if (v.cost !== undefined) {
    if (!isObj(v.cost)) e.push(`${at}.cost: must be a mapping`);
    else if (typeof v.cost.resource === "string" && v.cost.resource.trim()) {
      out.cost = { resource: v.cost.resource.trim(), ...(v.cost.amount !== undefined ? { amount: formula(v.cost.amount, `${at}.cost.amount`, e) } : {}) };
    } else if (v.cost.selfDamage !== undefined) out.cost = { selfDamage: dice(v.cost.selfDamage, `${at}.cost.selfDamage`, e) };
    else e.push(`${at}.cost: needs a resource or selfDamage`);
  }
  if (v.attack !== undefined) out.attack = formula(v.attack, `${at}.attack`, e);
  if (v.save !== undefined) {
    if (!isObj(v.save)) e.push(`${at}.save: must be a mapping`);
    else out.save = { abil: abil(v.save.abil, `${at}.save.abil`, e), dc: reqName(v.save.dc, `${at}.save.dc`, e) };
  }
  if (v.damage !== undefined) out.damage = dice(v.damage, `${at}.damage`, e);
  if (v.heal !== undefined) out.heal = dice(v.heal, `${at}.heal`, e);
  return out;
}

export function validateOptions(v: unknown, at: string, e: Errs): Record<string, OptionDef[]> {
  if (v === undefined) return {};
  if (!isObj(v)) { e.push(`${at}: must be a mapping of option lists`); return {}; }
  const out: Record<string, OptionDef[]> = {};
  for (const [list, raw] of Object.entries(v)) {
    const p = `${at}.${list}`;
    if (!Array.isArray(raw) || raw.length === 0) { e.push(`${p}: must be a non-empty list`); continue; }
    const seen = new Set<string>(), opts: OptionDef[] = [];
    raw.forEach((o: unknown, i: number) => {
      const q = `${p}[${i}]`;
      if (!isObj(o)) { e.push(`${q}: must be a mapping`); return; }
      const name = reqName(o.name, `${q}.name`, e);
      const id = typeof o.id === "string" && o.id ? o.id : slug(name);
      if (id && seen.has(id)) e.push(`${q}: duplicate option id ${id}`); seen.add(id);
      const def: OptionDef = { id, name, effects: validateEffects(o.effects, `${q}.effects`, e) };
      const text = optText(o.text, `${q}.text`, e); if (text !== undefined) def.text = text;
      if (o.minLevel !== undefined) { if (whole(o.minLevel, 1) && (o.minLevel as number) <= MAX_LEVEL) def.minLevel = o.minLevel as number; else e.push(`${q}.minLevel: must be a level from 1 to ${MAX_LEVEL}`); }
      const action = validateAction(o.action, `${q}.action`, e); if (action) def.action = action;
      const toggle = validateToggle(o.toggle, `${q}.toggle`, name, e); if (toggle) def.toggle = toggle;
      const overlay = optOut(o.overlay, `${q}.overlay`, e); if (overlay === false) def.overlay = overlay;
      opts.push(def);
    });
    out[list] = opts;
  }
  return out;
}

function validateTable(v: unknown, at: string, e: Errs): Record<number, TableRow> | undefined {
  if (!isObj(v)) { e.push(`${at}: must be a mapping of class level to row`); return undefined; }
  const out: Record<number, TableRow> = {};
  for (const [k, row] of Object.entries(v)) {
    const lvl = Number(k), p = `${at}.${k}`;
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > MAX_LEVEL) { e.push(`${p}: level must be from 1 to ${MAX_LEVEL}`); continue; }
    if (!isObj(row)) { e.push(`${p}: must be a mapping`); continue; }
    const r: TableRow = {};
    for (const f of ["cantrips", "known"] as const) if (row[f] !== undefined) { if (whole(row[f])) r[f] = row[f] as number; else e.push(`${p}.${f}: must be a whole number`); }
    if (row.slots !== undefined) {
      if (Array.isArray(row.slots) && row.slots.length <= 9 && row.slots.every(n => whole(n))) r.slots = row.slots as number[];
      else e.push(`${p}.slots: must be up to 9 whole numbers (1st-level slots first)`);
    }
    if (row.pact !== undefined) {
      if (isObj(row.pact) && whole(row.pact.slots) && whole(row.pact.level, 1) && (row.pact.level as number) <= 9) r.pact = { slots: row.pact.slots as number, level: row.pact.level as number };
      else e.push(`${p}.pact: must be { slots, level } with level 1 to 9`);
    }
    if (!r.slots && !r.pact) e.push(`${p}: needs slots or pact`);
    out[lvl] = r;
  }
  return out;
}

function validateOp(raw: unknown, at: string, index: number, ctx: OpsCtx, e: Errs): Op | undefined {
  if (!isObj(raw)) { e.push(`${at}: must be a mapping`); return undefined; }
  const name = raw.op;
  if (typeof name !== "string" || !OP_NAMES.includes(name as OpName)) { e.push(`${at}.op: unknown op ${JSON.stringify(name)}; use one of ${OP_NAMES.join(", ")}`); return undefined; }
  if (raw.id !== undefined && !(typeof raw.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(raw.id))) { e.push(`${at}.id: must be lowercase letters, digits and dashes`); return undefined; }
  const id = typeof raw.id === "string" ? raw.id : `${name}-${index}`;
  const before = e.length;
  const done = (op: Op): Op | undefined => (e.length > before ? undefined : op);
  switch (name as OpName) {
    case "grant": {
      const speed = raw.speed, dv = raw.darkvision, speeds = raw.speeds !== undefined ? validateEffects({ speeds: raw.speeds }, at, e).speeds : undefined;
      if (speed !== undefined && !whole(speed)) e.push(`${at}.speed: must be a whole number`);
      if (dv !== undefined && !whole(dv)) e.push(`${at}.darkvision: must be a whole number`);
      return done({ id, op: "grant", proficiencies: texts(raw.proficiencies, `${at}.proficiencies`, e), languages: texts(raw.languages, `${at}.languages`, e),
        spells: texts(raw.spells, `${at}.spells`, e), items: texts(raw.items, `${at}.items`, e),
        ...(whole(speed) ? { speed: speed as number } : {}), ...(whole(dv) ? { darkvision: dv as number } : {}), ...(speeds ? { speeds } : {}) });
    }
    case "feature": {
      const n = reqName(raw.name, `${at}.name`, e), text = optText(raw.text, `${at}.text`, e);
      const effects = validateEffects(raw.effects, `${at}.effects`, e), action = validateAction(raw.action, `${at}.action`, e);
      const optional = bool(raw.optional, `${at}.optional`, e);
      const toggle = validateToggle(raw.toggle, `${at}.toggle`, n, e);
      const overlay = optOut(raw.overlay, `${at}.overlay`, e);
      return done({ id, op: "feature", name: n, effects, ...(text !== undefined ? { text } : {}), ...(action ? { action } : {}), ...(optional ? { optional } : {}), ...(toggle ? { toggle } : {}), ...(overlay === false ? { overlay } : {}) });
    }
    case "resource": {
      const n = reqName(raw.name, `${at}.name`, e), max = formula(raw.max, `${at}.max`, e);
      let reset: Reset = "long";
      if (raw.reset !== undefined) { if (RESET_VALUES.includes(raw.reset as Reset)) reset = raw.reset as Reset; else e.push(`${at}.reset: must be ${RESET_VALUES.join(", ")}`); }
      let refill: { on: "short"; amount: Formula; oncePer?: "long" } | undefined;
      if (raw.refill !== undefined) {
        if (!isObj(raw.refill) || raw.refill.on !== "short") e.push(`${at}.refill: must be { on: short, amount }`);
        else {
          refill = { on: "short", amount: formula(raw.refill.amount, `${at}.refill.amount`, e) };
          if (raw.refill.oncePer !== undefined) { if (raw.refill.oncePer === "long") refill.oncePer = "long"; else e.push(`${at}.refill.oncePer: must be long`); }
        }
      }
      return done({ id, op: "resource", name: n, max, reset, ...(refill ? { refill } : {}) });
    }
    case "scale": {
      const n = reqName(raw.name, `${at}.name`, e);
      if ((raw.values === undefined) === (raw.formula === undefined)) e.push(`${at}: give either values or formula`);
      let values: Record<number, string | number> | undefined, f: Formula | undefined;
      if (raw.formula !== undefined) f = formula(raw.formula, `${at}.formula`, e);
      if (raw.values !== undefined) {
        if (!isObj(raw.values) || Object.keys(raw.values).length === 0) e.push(`${at}.values: must be a mapping of level to value`);
        else {
          values = {};
          for (const [k, x] of Object.entries(raw.values)) {
            const lvl = Number(k);
            if (!Number.isInteger(lvl) || lvl < 1 || lvl > MAX_LEVEL) e.push(`${at}.values.${k}: level must be from 1 to ${MAX_LEVEL}`);
            else if (typeof x === "number" ? Number.isFinite(x) : typeof x === "string" && x.trim()) values[lvl] = x as string | number;
            else e.push(`${at}.values.${k}: must be text or a number`);
          }
        }
      }
      return done({ id, op: "scale", name: n, ...(values ? { values } : {}), ...(f !== undefined ? { formula: f } : {}) });
    }
    case "dc": {
      const n = reqName(raw.name, `${at}.name`, e), a = abil(raw.abil, `${at}.abil`, e);
      return done({ id, op: "dc", name: n, abil: a, ...(raw.alt !== undefined ? { alt: abil(raw.alt, `${at}.alt`, e) } : {}) });
    }
    case "modify": {
      if ((raw.resource === undefined) === (raw.scale === undefined)) e.push(`${at}: give either resource or scale`);
      const set = formula(raw.set, `${at}.set`, e);
      const r = raw.resource !== undefined ? reqName(raw.resource, `${at}.resource`, e) : undefined;
      const s = raw.scale !== undefined ? reqName(raw.scale, `${at}.scale`, e) : undefined;
      return done({ id, op: "modify", set, ...(r ? { resource: r } : {}), ...(s ? { scale: s } : {}) });
    }
    case "choose": {
      const WHAT = ["skills", "expertise", "tools", "languages", "option"] as const;
      if (!WHAT.includes(raw.what as never)) e.push(`${at}.what: must be one of ${WHAT.join(", ")}`);
      const what = raw.what as (typeof WHAT)[number];
      if (!whole(raw.count, 1)) e.push(`${at}.count: must be a whole number from 1`);
      const count = whole(raw.count, 1) ? (raw.count as number) : 1;
      const from = raw.from !== undefined ? texts(raw.from, `${at}.from`, e) : undefined;
      let size = from?.length;
      if (from && what === "skills") from.forEach((s, i) => { if (!(s in SKILLS)) e.push(`${at}.from[${i}]: unknown skill ${s}`); });
      let list: string | undefined;
      if (what === "option") {
        list = typeof raw.list === "string" && raw.list ? raw.list : undefined;
        if (!list) e.push(`${at}.list: option picks need the name of an options list`);
        else if (ctx.options[list] !== undefined) size = ctx.options[list];
        else if (ctx.kind !== "subclass") e.push(`${at}.list: no options list called ${list}`);
        if (from) e.push(`${at}.from: option picks use list, not from`);
      } else if (raw.list !== undefined) e.push(`${at}.list: only valid for what: option`);
      if (size !== undefined && count > size) e.push(`${at}.count: ${count} is more than the ${size} choices available`);
      if (raw.swap !== undefined && typeof raw.swap !== "boolean") e.push(`${at}.swap: must be true or false`);
      return done({ id, op: "choose", what, count, swap: raw.swap === true, ...(from ? { from } : {}), ...(list ? { list } : {}) });
    }
    case "subclass":
      if (ctx.kind !== "class") e.push(`${at}: the subclass op only belongs in a class`);
      return done({ id, op: "subclass" });
    case "asi":
      if (ctx.kind === "grants") e.push(`${at}: the asi op only belongs in class or subclass levels`);
      return done({ id, op: "asi" });
    case "spells": {
      if (!whole(raw.count)) e.push(`${at}.count: must be a whole number`);
      if (raw.cantrips !== undefined && !whole(raw.cantrips)) e.push(`${at}.cantrips: must be a whole number`);
      if (raw.swap !== undefined && !whole(raw.swap)) e.push(`${at}.swap: must be a whole number`);
      let from: string | string[] = "";
      if (typeof raw.from === "string" && raw.from) from = raw.from;
      else if (Array.isArray(raw.from) && raw.from.length && raw.from.every(x => typeof x === "string")) from = raw.from as string[];
      else e.push(`${at}.from: must be a class id or a list of spell ids`);
      const schools = raw.schools !== undefined ? texts(raw.schools, `${at}.schools`, e) : undefined;
      return done({ id, op: "spells", count: whole(raw.count) ? (raw.count as number) : 0, from,
        ...(whole(raw.cantrips) ? { cantrips: raw.cantrips as number } : {}), ...(whole(raw.swap) ? { swap: raw.swap as number } : {}), ...(schools ? { schools } : {}) });
    }
    case "spellcasting": {
      const a = abil(raw.abil, `${at}.abil`, e);
      const PROG: Progression[] = ["full", "half", "third", "pact", "table"];
      if (!PROG.includes(raw.progression as Progression)) e.push(`${at}.progression: must be one of ${PROG.join(", ")}`);
      const progression = raw.progression as Progression;
      let table: Record<number, TableRow> | undefined;
      if (progression === "table") { if (raw.table === undefined) e.push(`${at}.table: required when progression is table`); else table = validateTable(raw.table, `${at}.table`, e); }
      else if (raw.table !== undefined) e.push(`${at}.table: only valid when progression is table`);
      if (raw.list !== undefined && typeof raw.list !== "string") e.push(`${at}.list: must be text`);
      return done({ id, op: "spellcasting", abil: a, progression, ...(table ? { table } : {}), ...(typeof raw.list === "string" ? { list: raw.list } : {}) });
    }
    case "effect":
      return done({ id, op: "effect", effects: validateEffects(raw.effects, `${at}.effects`, e) });
  }
}

/** Validate a flat list of ops. Bad ops add errors; the caller rejects the whole note if any were added. */
export function validateOps(v: unknown, at: string, ctx: OpsCtx, e: Errs): Op[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) { e.push(`${at}: must be a list of ops`); return []; }
  if (v.length > MAX_OPS) { e.push(`${at}: more than ${MAX_OPS} ops`); return []; }
  const out: Op[] = [], seen = new Set<string>();
  v.forEach((raw, i) => {
    const op = validateOp(raw, `${at}[${i}]`, i, ctx, e);
    if (!op) return;
    if (seen.has(op.id)) e.push(`${at}[${i}]: duplicate op id ${op.id}`);
    seen.add(op.id); out.push(op);
  });
  return out;
}

/** `levels: { "<n>": Op[] }` with n from 1 to 20. */
export function validateLevels(v: unknown, at: string, ctx: OpsCtx, e: Errs): Record<number, Op[]> {
  if (v === undefined) return {};
  if (!isObj(v)) { e.push(`${at}: must be a mapping of level to ops`); return {}; }
  const out: Record<number, Op[]> = {};
  for (const [k, list] of Object.entries(v as Raw)) {
    const lvl = Number(k);
    if (!/^\d+$/.test(k) || lvl < 1 || lvl > MAX_LEVEL) { e.push(`${at}.${k}: level must be a whole number from 1 to ${MAX_LEVEL}`); continue; }
    out[lvl] = validateOps(list, `${at}.${k}`, ctx, e);
  }
  return out;
}
