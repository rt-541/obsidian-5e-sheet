import { ABILS, type Abil, type Effects } from "../../core/types";
import { parseDice } from "../../core/dice";
import { isObj, num, str, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { validateEffects } from "./effects";

export interface CreatureAttack { name: string; toHit?: number; save?: { abil: Abil; dc: number }; damage?: string; note?: string; }
export interface CreatureData { name: string; size: string; ctype: string; ac: number; hp: { average: number; formula: string };
  speed: { walk: number; fly?: number; swim?: number; climb?: number }; abilities: Record<Abil, number>;
  saves: Partial<Record<Abil, number>>; skills: Record<string, number>; senses?: string; cr?: string;
  attacks: CreatureAttack[]; traits: { name: string; text: string }[]; effects: Effects; rules?: string; environment?: string[]; copiedFrom?: string; }

export const creatureType: TypeDef<CreatureData> = {
  type: "creature",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e), size = str(raw.size, "size", e, true) ?? "Medium", ctype = str(raw.ctype, "ctype", e, true) ?? "creature";
    const ac = num(raw.ac, "ac", e);
    const hpRaw = isObj(raw.hp) ? raw.hp : {};
    const hp = { average: num(hpRaw.average, "hp.average", e) ?? 1, formula: typeof hpRaw.formula === "string" ? hpRaw.formula : "" };
    const sp = isObj(raw.speed) ? raw.speed : {};
    const speed: CreatureData["speed"] = { walk: num(sp.walk, "speed.walk", e, true) ?? 0 };
    for (const k of ["fly", "swim", "climb"] as const) if (typeof sp[k] === "number") speed[k] = sp[k] as number;
    const ab = isObj(raw.abilities) ? raw.abilities : {};
    const abilities = Object.fromEntries(ABILS.map(a => [a, num(ab[a], `abilities.${a}`, e) ?? 10])) as Record<Abil, number>;
    const saves: Partial<Record<Abil, number>> = {};
    if (isObj(raw.saves)) for (const a of ABILS) if (typeof raw.saves[a] === "number") saves[a] = raw.saves[a] as number;
    const skills: Record<string, number> = {};
    if (isObj(raw.skills)) for (const [k, v] of Object.entries(raw.skills)) if (typeof v === "number") skills[k] = v;
    const attacks: CreatureAttack[] = [];
    if (Array.isArray(raw.attacks)) raw.attacks.forEach((a: unknown, i: number) => {
      if (!isObj(a)) { e.push(`attacks[${i}]: must be a mapping`); return; }
      const at: CreatureAttack = { name: str(a.name, `attacks[${i}].name`, e) ?? "?" };
      if (typeof a.toHit === "number") at.toHit = a.toHit;
      if (isObj(a.save) && ABILS.includes(a.save.abil as Abil) && typeof a.save.dc === "number") at.save = { abil: a.save.abil as Abil, dc: a.save.dc };
      if (a.damage !== undefined) { try { parseDice(String(a.damage)); at.damage = String(a.damage); } catch (err) { e.push(`attacks[${i}].damage: ${(err as Error).message}`); } }
      if (typeof a.note === "string") at.note = a.note;
      attacks.push(at);
    });
    const traits = Array.isArray(raw.traits) ? raw.traits.filter(isObj).map(t => ({ name: String(t.name ?? ""), text: String(t.text ?? "") })) : [];
    const effects = validateEffects(raw.effects, "effects", e);
    const env = (Array.isArray(raw.environment) ? raw.environment : typeof raw.environment === "string" ? [raw.environment] : []).filter((x): x is string => typeof x === "string" && !!x.trim());
    if (e.length || !name || ac === undefined) return { errors: e };
    return { errors: e, value: { name, size, ctype, ac, hp, speed, abilities, saves, skills, attacks, traits, effects,
      ...(typeof raw.senses === "string" ? { senses: raw.senses } : {}), ...(typeof raw.cr === "string" ? { cr: raw.cr } : {}),
      ...(typeof raw.rules === "string" ? { rules: raw.rules } : {}),
      ...(env.length ? { environment: env } : {}), ...(typeof raw.copied_from === "string" && raw.copied_from.trim() ? { copiedFrom: raw.copied_from.trim() } : {}) } };
  },
};
