import type { Effects } from "../../core/types";
import { parseDice } from "../../core/dice";
import { bool, isObj, num, oneOf, str, type Errs, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { validateEffects } from "./effects";
import { findOverlay } from "../overlay";
import { optOut } from "./ops";
import { validateToggle, type ToggleDef } from "./toggle";
import { validateAttackOption, type AttackOptionDef } from "./attack-option";

export interface ArmorData { base: number; dex: "full" | "max2" | "none"; stealthDis?: boolean; strReq?: number; }
export interface WeaponData { dmg: string; type: string; ab: "str" | "dex" | "finesse"; range: "melee" | "ranged"; bonus?: number; extraDamage?: string;
  /** Weapon category; a character needs the matching proficiency (Simple Weapons, Martial Weapons, or the weapon by name) to add the proficiency bonus. */
  category?: "simple" | "martial";
  /** Properties that rules can aim at with weapon:<property> (light, heavy, thrown, versatile, two-handed, one-handed). */
  props?: string[];
  /** The damage dice when a versatile weapon is held in two hands. Left out: the dice in the "Versatile (1d10)" property, or the next die size up. */
  versatile?: string; }
export interface GrantedSpell { id: string; cost: { kind: "charges"; amount: number } | { kind: "perDay"; uses: number } | { kind: "atWill" }; level?: number; dc?: number; attack?: number; }
export interface ItemData { name: string; kind: "armor" | "shield" | "weapon" | "wondrous" | "gear" | "consumable"; rarity?: string; attunement: boolean; weight: number; /** Price in copper pieces. */ value?: number;
  armor?: ArmorData; weapon?: WeaponData; charges?: { max: number; reset: "dawn" | "short" | "long" | "none" }; heal?: string; effects: Effects; rules?: string; grants?: { spells: GrantedSpell[] };
  /** A switch the player turns on and off; the item's effects count only while it is on (and the item works). */ toggle?: ToggleDef;
  /** Dice this item adds to attacks while its switch is on. */ attackOption?: AttackOptionDef;
  /** false: the built-in mechanics never fill this item in. */ overlay?: false;
  /** Key of the built-in entry that filled in this item's switch or effects (the sheet shows a "built-in" badge). */ builtIn?: string; }

const whole = (v: unknown, at: string, e: Errs): number | undefined => {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1) return v;
  e.push(`${at}: must be a whole number from 1`); return undefined;
};
const KINDS = ["armor", "shield", "weapon", "wondrous", "gear", "consumable"] as const;
const dice = (v: unknown, at: string, e: Errs): string | undefined => {
  const s = str(v, at, e); if (!s) return undefined;
  try { parseDice(s); return s; } catch (err) { e.push(`${at}: ${(err as Error).message}`); return undefined; }
};

export const itemType: TypeDef<ItemData> = {
  type: "item",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e);
    const kind = oneOf(raw.kind, KINDS, "kind", e, "gear");
    const out: Partial<ItemData> = { name, kind, attunement: bool(raw.attunement, "attunement", e), weight: num(raw.weight, "weight", e, true) ?? 0,
      effects: validateEffects(raw.effects, "effects", e) };
    if (typeof raw.rarity === "string") out.rarity = raw.rarity;
    const value = num(raw.value, "value", e, true); if (value !== undefined && value >= 0) out.value = value;
    if (typeof raw.rules === "string") out.rules = raw.rules;
    if (raw.armor !== undefined) {
      if (!isObj(raw.armor)) e.push("armor: must be a mapping");
      else out.armor = { base: num(raw.armor.base, "armor.base", e) ?? 10, dex: oneOf(raw.armor.dex, ["full", "max2", "none"] as const, "armor.dex", e, "full")!,
        ...(raw.armor.stealthDis === true ? { stealthDis: true } : {}), ...(typeof raw.armor.strReq === "number" ? { strReq: raw.armor.strReq } : {}) };
    }
    if (raw.weapon !== undefined) {
      if (!isObj(raw.weapon)) e.push("weapon: must be a mapping");
      else {
        const w = raw.weapon, dmg = dice(w.dmg, "weapon.dmg", e);
        const extra = w.extraDamage === undefined ? undefined : dice(w.extraDamage, "weapon.extraDamage", e);
        const versatile = w.versatile === undefined ? undefined : dice(w.versatile, "weapon.versatile", e);
        if (dmg) out.weapon = { dmg, type: str(w.type, "weapon.type", e) ?? "", ab: oneOf(w.ab, ["str", "dex", "finesse"] as const, "weapon.ab", e, "str")!,
          range: oneOf(w.range, ["melee", "ranged"] as const, "weapon.range", e, "melee")!,
          ...(typeof w.bonus === "number" ? { bonus: w.bonus } : {}), ...(extra ? { extraDamage: extra } : {}), ...(versatile ? { versatile } : {}),
          ...(w.category === "simple" || w.category === "martial" ? { category: w.category } : {}),
          ...(Array.isArray(w.props) && w.props.every(x => typeof x === "string") && w.props.length ? { props: w.props as string[] } : {}) };
        if (w.category !== undefined && w.category !== "simple" && w.category !== "martial") e.push("weapon.category: must be simple or martial");
      }
    }
    if (raw.charges !== undefined) {
      if (!isObj(raw.charges)) e.push("charges: must be a mapping");
      else out.charges = { max: num(raw.charges.max, "charges.max", e) ?? 0, reset: oneOf(raw.charges.reset, ["dawn", "short", "long", "none"] as const, "charges.reset", e, "none")! };
    }
    if (raw.grants !== undefined) {
      if (!isObj(raw.grants)) e.push("grants: must be a mapping");
      else if (raw.grants.spells !== undefined) {
        if (!Array.isArray(raw.grants.spells)) e.push("grants.spells: must be a list");
        else {
          const spells: GrantedSpell[] = [];
          raw.grants.spells.forEach((g: unknown, i: number) => {
            const at = `grants.spells[${i}]`;
            if (!isObj(g)) { e.push(`${at}: must be a mapping`); return; }
            const before = e.length, id = str(g.id, `${at}.id`, e);
            const kinds = (["charges", "perDay", "atWill"] as const).filter(k => g[k] !== undefined);
            if (kinds.length > 1) e.push(`${at}: use only one of charges, perDay or atWill`);
            let cost: GrantedSpell["cost"] = { kind: "atWill" };
            if (kinds.length === 1 && kinds[0] === "charges") {
              const n = whole(g.charges, `${at}.charges`, e);
              if (!raw.charges || !isObj(raw.charges)) e.push(`${at}: charges needs the item to have charges`);
              if (n !== undefined) cost = { kind: "charges", amount: n };
            } else if (kinds.length === 1 && kinds[0] === "perDay") {
              const n = whole(g.perDay, `${at}.perDay`, e); if (n !== undefined) cost = { kind: "perDay", uses: n };
            } else if (kinds.length === 1) bool(g.atWill, `${at}.atWill`, e);
            const extra: Partial<GrantedSpell> = {};
            for (const k of ["level", "dc", "attack"] as const) if (g[k] !== undefined) { const n = num(g[k], `${at}.${k}`, e); if (n !== undefined) extra[k] = n; }
            if (id && e.length === before) spells.push({ id, cost, ...extra });
          });
          if (spells.length) out.grants = { spells };
        }
      }
    }
    if (raw.toggle !== undefined) { const t = validateToggle(raw.toggle, "toggle", name ?? "", e); if (t) out.toggle = t; }
    if (raw.attackOption !== undefined) { const a = validateAttackOption(raw.attackOption, "attackOption", name ?? "", e); if (a) out.attackOption = a; }
    if (raw.heal !== undefined) { const h = dice(raw.heal, "heal", e); if (h) out.heal = h; }
    const overlay = optOut(raw.overlay, "overlay", e); if (overlay === false) out.overlay = overlay;
    if (e.length || !name) return { errors: e };
    // Built-in mechanics fill in an item whose note has no effects and no switch of its own; the note always wins.
    const hit = overlay !== false && name && !Object.keys(out.effects ?? {}).length && !out.toggle && !out.attackOption ? findOverlay("item", [], name) : undefined;
    if (hit) { out.effects = hit.effects; if (hit.toggle) out.toggle = hit.toggle; if (hit.attackOption) out.attackOption = hit.attackOption; out.builtIn = hit.key; }
    return { errors: e, value: out as ItemData };
  },
};

/** A weapon with the versatile property: it can be held in one hand or two. */
export const isVersatile = (w: WeaponData): boolean => (w.props ?? []).some(p => /^versatile\b/i.test(p));
const NEXT_DIE: Record<string, string> = { "4": "6", "6": "8", "8": "10", "10": "12", "12": "12" };
/** The damage dice with two hands: the weapon's own versatile dice, the dice written in its property ("Versatile (1d10)"), or its single die one size up. */
export function versatileDie(w: WeaponData): string {
  if (w.versatile) return w.versatile;
  for (const p of w.props ?? []) { const m = /^versatile\b.*?\((\d*d\d+(?:\s*[+-]\s*\d+)?)\)/i.exec(p); if (m) return m[1].replace(/\s+/g, ""); }
  const m = /^(\d*)d(\d+)$/.exec(w.dmg);
  return m && NEXT_DIE[m[2]] ? `${m[1]}d${NEXT_DIE[m[2]]}` : w.dmg;
}
