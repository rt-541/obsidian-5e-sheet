import type { Effects } from "../../core/types";
import { parseDice } from "../../core/dice";
import { bool, isObj, num, oneOf, str, type Errs, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { validateEffects } from "./effects";

export interface ArmorData { base: number; dex: "full" | "max2" | "none"; stealthDis?: boolean; strReq?: number; }
export interface WeaponData { dmg: string; type: string; ab: "str" | "dex" | "finesse"; range: "melee" | "ranged"; bonus?: number; extraDamage?: string; }
export interface GrantedSpell { id: string; cost: { kind: "charges"; amount: number } | { kind: "perDay"; uses: number } | { kind: "atWill" }; level?: number; dc?: number; attack?: number; }
export interface ItemData { name: string; kind: "armor" | "shield" | "weapon" | "wondrous" | "gear" | "consumable"; rarity?: string; attunement: boolean; weight: number; /** Price in copper pieces. */ value?: number;
  armor?: ArmorData; weapon?: WeaponData; charges?: { max: number; reset: "dawn" | "short" | "long" | "none" }; heal?: string; effects: Effects; rules?: string; grants?: { spells: GrantedSpell[] }; }

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
        if (dmg) out.weapon = { dmg, type: str(w.type, "weapon.type", e) ?? "", ab: oneOf(w.ab, ["str", "dex", "finesse"] as const, "weapon.ab", e, "str")!,
          range: oneOf(w.range, ["melee", "ranged"] as const, "weapon.range", e, "melee")!,
          ...(typeof w.bonus === "number" ? { bonus: w.bonus } : {}), ...(extra ? { extraDamage: extra } : {}) };
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
    if (raw.heal !== undefined) { const h = dice(raw.heal, "heal", e); if (h) out.heal = h; }
    if (e.length || !name) return { errors: e };
    return { errors: e, value: out as ItemData };
  },
};
