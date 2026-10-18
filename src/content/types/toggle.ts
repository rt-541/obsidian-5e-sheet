import { validGate } from "../../core/gates";
import { checkFormula, type Formula } from "../../core/formula";
import { isObj, type Errs } from "../check";
import { slug } from "../registry";

/** What starting a toggle spends: a resource (Rage uses, Ki points), a spell slot of at least this level, or item charges. */
export type ToggleCost = { resource: string; amount?: Formula } | { slot: number } | { charges: number };
/**
 * A state the player switches on and off (Rage, a stance, an aura). While it is on, the effects of the feature, option or item that declares it
 * apply; other effects blocks can ride it with `while: [toggle:<id>]`.
 */
export interface ToggleDef {
  id: string; cost?: ToggleCost; /** Switching one on switches the others in its group off. */ group?: string;
  /** The toggle's effects are suppressed (not cleared) while these gates fail, for example `!armor:heavy`. */
  while?: string[];
  /** A number the player sets while it is on (Sharpen the Blade +1 to +3); formulas read it as `toggle_<id>`. */
  value?: { min: number; max: number; label: string };
  /** The rest that switches it off again (default long); `never` keeps it until the player ends it. */
  endsOn: "short" | "long" | "never";
}

const whole = (v: unknown, min: number) => typeof v === "number" && Number.isInteger(v) && v >= min;

/** Validate a `toggle:` mapping; `name` is the owner's name, which gives the default id. */
export function validateToggle(v: unknown, at: string, name: string, e: Errs): ToggleDef | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) { e.push(`${at}: must be a mapping`); return undefined; }
  const before = e.length;
  const id = v.id === undefined ? slug(name) : v.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) e.push(`${at}.id: must be lowercase letters, digits and dashes`);
  const out: ToggleDef = { id: typeof id === "string" ? id : "", endsOn: "long" };
  if (v.cost !== undefined) {
    const c = v.cost;
    if (!isObj(c)) e.push(`${at}.cost: must be a mapping`);
    else if (typeof c.resource === "string" && c.resource.trim()) {
      let amount: Formula | undefined;
      if (c.amount !== undefined) { const fe = checkFormula(c.amount); if (fe) e.push(`${at}.cost.amount: ${fe}`); else amount = c.amount as Formula; }
      out.cost = { resource: c.resource.trim(), ...(amount !== undefined ? { amount } : {}) };
    } else if (c.slot !== undefined) {
      if (whole(c.slot, 1) && (c.slot as number) <= 9) out.cost = { slot: c.slot as number }; else e.push(`${at}.cost.slot: must be a spell slot level from 1 to 9`);
    } else if (c.charges !== undefined) {
      if (whole(c.charges, 1)) out.cost = { charges: c.charges as number }; else e.push(`${at}.cost.charges: must be a whole number from 1`);
    } else e.push(`${at}.cost: needs a resource, a slot or charges`);
  }
  if (v.group !== undefined) { if (typeof v.group === "string" && v.group.trim()) out.group = v.group.trim(); else e.push(`${at}.group: must be text`); }
  if (v.while !== undefined) {
    if (Array.isArray(v.while) && v.while.every(g => typeof g === "string")) {
      (v.while as string[]).forEach((g, i) => { if (!validGate(g)) e.push(`${at}.while[${i}]: unknown condition ${g}`); });
      if (v.while.length) out.while = v.while as string[];
    } else e.push(`${at}.while: must be a list of text`);
  }
  if (v.value !== undefined) {
    const x = v.value;
    if (isObj(x) && whole(x.min, 1) && whole(x.max, x.min as number) && typeof x.label === "string" && x.label.trim()) out.value = { min: x.min as number, max: x.max as number, label: x.label.trim() };
    else e.push(`${at}.value: must be { min, max, label } with whole numbers from 1 and max at least min`);
  }
  if (v.endsOn !== undefined) {
    if (v.endsOn === "short" || v.endsOn === "long" || v.endsOn === "never") out.endsOn = v.endsOn; else e.push(`${at}.endsOn: must be short, long or never`);
  }
  return e.length > before ? undefined : out;
}
