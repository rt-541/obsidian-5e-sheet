import type { Effects } from "../../core/types";
import { slug } from "../registry";
import { isObj, type Errs } from "../check";
import { validateEffects } from "../types/effects";
import { validateAction, validateOps, validateOptions, type ActionDef, type Op, type OptionDef } from "../types/ops";
import { validateToggle, type ToggleDef } from "../types/toggle";
import raw from "./mechanics.json";

/**
 * Built-in mechanics: numbers and switches for features whose source note has none (the SRD text, the WotC library, most homebrew).
 * The data is plain JSON checked by the same validators as notes. A feature or option row asks for its entry by `<kind>:<owner>:<feature>`;
 * the entry fills only the fields the note leaves empty, so a note that declares its own mechanics always wins.
 */
export type OverlayKind = "class" | "subclass" | "race" | "subrace" | "feat" | "background" | "option" | "item" | "condition";
/** `at`: the op only runs once the character has this many levels (class level for class features, total level for race and feat features). */
export interface OverlayOp { op: Op; at?: number; }
export interface OverlayEntry {
  key: string; /** What the switch is called on the sheet when the feature's own name is long ("Wild Shape (CR 1/4 or below, ...)"). */ name?: string; effects: Effects; toggle?: ToggleDef; action?: ActionDef;
  /** Option lists the entry's `choose` ops pick from (Draconic Ancestry has no class to hold them). */
  options?: Record<string, OptionDef[]>; ops: OverlayOp[];
}

let enabled = true;
/** The plugin setting "Built-in mechanics" (on by default). */
export const setBuiltinMechanics = (on: boolean) => { enabled = on; };
export const builtinMechanicsOn = () => enabled;

const KINDS: OverlayKind[] = ["class", "subclass", "race", "subrace", "feat", "background", "option", "item", "condition"];

/** A name as the keys spell it: no apostrophes, lower case, words joined by dashes. */
export const overlaySlug = (s: string): string => slug(s.replace(/['’`]/g, ""));

const OWNER_PREFIX = /^(?:oath-of-the-|oath-of-|path-of-the-|path-of-|way-of-the-|way-of-|college-of-|school-of-|circle-of-the-|circle-of-|order-of-the-|order-of-|the-)/;
const OWNER_SUFFIX = /-(?:bloodline|domain|patron|tradition|magic)$/;
/** Class, subclass, race and option-list ids from the SRD, the library and homebrew name the same thing in different ways (`path-of-the-berserker`, `berserker`). */
export function overlayOwner(id: string): string {
  const s = overlaySlug(id);
  if (s === "*") return s;
  const t = s.replace(OWNER_PREFIX, "").replace(OWNER_SUFFIX, "");
  return t || s;
}

/** The slugs a feature name can be looked up under, most exact first: with and without a source tag or count in brackets, and after a `Name: ` prefix. */
export function overlayNames(name: string, id?: string): string[] {
  const out: string[] = [];
  const add = (s: string) => { const v = overlaySlug(s); if (v && !out.includes(v)) out.push(v); };
  const bare = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  add(name); add(name.replace(/\s*\([A-Z]{2,6}\)\s*$/, "")); add(bare(name));
  const after = /^[^:]+:\s*(.+)$/.exec(name)?.[1];
  if (after) { add(after); add(bare(after)); }
  if (id) add(id);
  return out;
}

const idOf = (key: string) => {
  const m = /^([a-z]+):([^:]*):([a-z0-9-]+)$/.exec(key);
  return m && (KINDS as string[]).includes(m[1]) ? { kind: m[1] as OverlayKind, owner: m[2], feature: m[3] } : undefined;
};
const composite = (kind: OverlayKind, owner: string, feature: string) => `${kind}|${owner === "" ? "" : overlayOwner(owner)}|${feature}`;

let loaded: { entries: Map<string, OverlayEntry>; problems: string[] } | undefined;

function build(): NonNullable<typeof loaded> {
  const entries = new Map<string, OverlayEntry>(), problems: string[] = [];
  const data = raw as { entries: Record<string, unknown> };
  for (const [key, v] of Object.entries(data.entries)) {
    const at = key, e: Errs = [], id = idOf(key);
    if (!id) { problems.push(`${key}: the key must look like kind:owner:feature`); continue; }
    if (!isObj(v)) { problems.push(`${key}: must be a mapping`); continue; }
    const effects = validateEffects(v.effects, `${at}.effects`, e);
    const toggle = validateToggle(v.toggle, `${at}.toggle`, id.feature, e);
    const action = validateAction(v.action, `${at}.action`, e);
    const options = validateOptions(v.options, `${at}.options`, e);
    // Ops are written as plain ops, optionally with `at`. They are checked as subclass ops: a pick from another class's list or the entry's own is fine.
    const rawOps = Array.isArray(v.ops) ? v.ops as unknown[] : [];
    if (v.ops !== undefined && !Array.isArray(v.ops)) e.push(`${at}.ops: must be a list`);
    const atOf = rawOps.map(o => (isObj(o) && typeof o.at === "number" ? o.at : undefined));
    const plain = rawOps.map(o => { if (!isObj(o)) return o; const { at: _at, ...rest } = o; return rest; });
    const ops = validateOps(plain.length ? plain : undefined, `${at}.ops`, { kind: "subclass", options: Object.fromEntries(Object.entries(options).map(([k, l]) => [k, l.length])) }, e);
    if (ops.length !== plain.length && !e.length) e.push(`${at}.ops: an op was dropped`);
    if (e.length) { problems.push(...e.map(m => `${key}: ${m}`)); continue; }
    const entry: OverlayEntry = { key, ...(typeof v.name === "string" && v.name.trim() ? { name: v.name.trim() } : {}), effects, ops: ops.map((op, i) => ({ op, ...(atOf[i] !== undefined ? { at: atOf[i] } : {}) })),
      ...(toggle ? { toggle } : {}), ...(action ? { action } : {}), ...(Object.keys(options).length ? { options } : {}) };
    if (!Object.keys(effects).length && !toggle && !action && !ops.length) { problems.push(`${key}: the entry changes nothing`); continue; }
    entries.set(composite(id.kind, id.owner, id.feature), entry);
  }
  return { entries, problems };
}
const load = () => (loaded ??= build());

/** Every entry, for tests and tools. */
export const overlayEntries = (): OverlayEntry[] => [...load().entries.values()];
/** Entries that failed validation (empty when the bundled data is sound; a test checks it). */
export const overlayProblems = (): string[] => load().problems;
export const overlayKeys = (): string[] => [...load().entries.values()].map(e => e.key);

/**
 * The built-in entry for a feature, option or item. `owners` are tried in order, then the `*` owner. A subrace trait is also looked up as a race trait.
 * Feats, backgrounds, items and conditions have no owner.
 */
export function findOverlay(kind: OverlayKind, owners: string[], name: string, id?: string): OverlayEntry | undefined {
  if (!enabled) return undefined;
  const { entries } = load();
  const kinds: OverlayKind[] = kind === "subrace" ? ["subrace", "race"] : [kind];
  const own = kind === "feat" || kind === "background" || kind === "item" || kind === "condition" ? [""] : [...owners.filter(Boolean), "*"];
  for (const n of overlayNames(name, id)) for (const k of kinds) for (const o of own) {
    const hit = entries.get(composite(k, o, n));
    if (hit) return hit;
  }
  return undefined;
}

/** An option list some overlay entry brings (Draconic Ancestry), found by its list name. */
export function overlayOptionList(list: string): OptionDef[] | undefined {
  for (const e of load().entries.values()) if (e.options?.[list]) return e.options[list];
  return undefined;
}
