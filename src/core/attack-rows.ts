import { slug } from "../content/registry";
import type { ItemData } from "../content/types";
import type { AttackStat } from "./derive";
import { averageDice, critDamageOf, parseDice } from "./dice";
import { itemWorks, modifierParts, sumModifier, type ModOpts, type SourcedEffects } from "./effects";
import type { InventoryEntry } from "./character";
import { evalFormula, fillDice } from "./formula";
import { matchesTag } from "./roll-tags";
import type { Abil, NaturalWeapon, RollTarget } from "./types";
import { abilTerm, modTerms, sgn as signed, sum } from "./why";

const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
export const NOT_PROFICIENT = "Not proficient with this weapon, so the proficiency bonus is not added.";

export interface AttackInputs {
  fx: SourcedEffects[]; mods: Record<Abil, number>; prof: number; scales: Record<string, string | number>; vars: Record<string, number>;
  items: { e: InventoryEntry; it: ItemData | undefined }[];
  weaponProf: (name: string, id: string | undefined, category: "simple" | "martial" | undefined) => boolean;
  opt: (t?: RollTarget) => ModOpts; problem: (msg: string) => void;
}

/** One attack before the rules are applied: where it came from, which abilities it may use, and what it can be called. */
interface Row {
  name: string; /** Base damage dice; `1` means the flat 1 damage of an unarmed strike. */ dmg: string; type: string; abils: Abil[]; range: "melee" | "ranged";
  bonus: number; trained: boolean; tags: string[]; itemExtra?: string; offhand?: boolean; addMod?: boolean; dieRules: string[]; notes: string[];
}

/** The better ability of the list for this character (the first one wins a tie, so finesse prefers Dex). */
const best = (abils: Abil[], m: Record<Abil, number>): Abil => abils.reduce((a, b) => (m[b] > m[a] ? b : a));
const isMonkWeapon = (id: string | undefined, w: NonNullable<ItemData["weapon"]>) =>
  id === "shortsword" || (w.category === "simple" && w.range === "melee" && !(w.props ?? []).some(p => p === "two-handed" || p === "heavy"));

/**
 * The attack rows of a character: equipped weapons, the built-in Unarmed Strike, an off-hand row when two light weapons are held, and natural weapons from effects.
 * Effects can then rewrite matching rows (weaponRule), add damage to them (extraDamage) and add crit dice (critDice).
 */
export function buildAttacks(i: AttackInputs): AttackStat[] {
  const rows: Row[] = [];
  const equipped = i.items.filter(x => x.e.equipped && x.it?.weapon);
  // "one-handed": the only melee weapon in hand and not a two-handed one (Dueling). A versatile weapon counts, since the player chooses the grip.
  const meleeInHand = equipped.filter(x => x.it!.weapon!.range === "melee").length;
  for (const { e, it } of equipped) {
    const w = it!.weapon!, works = itemWorks(e, it), bonus = works ? (w.bonus ?? 0) : 0;
    const oneHanded = w.range === "melee" && meleeInHand === 1 && !(w.props ?? []).includes("two-handed");
    rows.push({ name: it!.name, dmg: w.dmg, type: w.type, abils: w.ab === "finesse" ? ["dex", "str"] : [w.ab], range: w.range, bonus, trained: i.weaponProf(it!.name, e.id, w.category),
      tags: [...(e.id ? [e.id] : []), ...(w.props ?? []), ...(oneHanded && !(w.props ?? []).includes("one-handed") ? ["one-handed"] : []), ...(isMonkWeapon(e.id, w) ? ["monk"] : []), ...(bonus > 0 || it!.rarity ? ["magic"] : [])],
      ...(works && w.extraDamage ? { itemExtra: w.extraDamage } : {}), dieRules: [], notes: [] });
  }
  rows.push({ name: "Unarmed Strike", dmg: "1", type: "bludgeoning", abils: ["str"], range: "melee", bonus: 0, trained: true, tags: ["unarmed"], dieRules: [], notes: [] });
  // Two light melee weapons in hand: the second one also gets an off-hand attack, which has no positive ability modifier.
  const melee = rows.filter(r => r.range === "melee" && !r.tags.includes("unarmed"));
  if (melee.length >= 2 && melee[0].tags.includes("light") && melee[1].tags.includes("light")) {
    const o = melee[1];
    rows.push({ ...o, name: `${o.name} (off-hand)`, tags: [...o.tags, "offhand"], offhand: true, dieRules: [], notes: ["Bonus action, when you attack with a light weapon in your main hand."] });
  }
  const seen = new Set(rows.map(r => r.name));
  for (const s of i.fx) for (const nw of s.effects.weapons ?? []) {
    if (seen.has(nw.name)) continue;
    seen.add(nw.name);
    rows.push(natural(nw, i));
  }

  // weaponRule: first tag the row as magical, then change abilities and dice.
  const rules = i.fx.flatMap(s => (s.effects.weaponRule ?? []).map(r => ({ r, source: s.source })));
  const hit = (r: Row, match: string[]) => match.includes("all") || match.some(t => r.tags.includes(t));
  for (const { r } of rules) if (r.magical) for (const row of rows) if (hit(row, r.match) && !row.tags.includes("magic")) row.tags.push("magic");
  for (const { r, source } of rules) for (const row of rows) {
    if (!hit(row, r.match)) continue;
    if (r.abils) row.abils = [...new Set([...row.abils, ...r.abils])];
    if (r.die) row.dieRules.push(r.die);
    if (r.addMod) row.addMod = true;
    row.notes.push(...(r.note ? [`${source}: ${r.note}`] : []));
  }

  return rows.map(row => {
    const abil = best(row.abils, i.mods), target: RollTarget = { kind: "attack", abil, range: row.range, tags: row.tags };
    // The larger of the weapon's own die and any die a rule gives it.
    let dmg = row.dmg;
    for (const raw of row.dieRules) {
      const d = fillDice(raw, i.scales);
      try { if (averageDice(d) > averageDice(dmg)) dmg = d; } catch { i.problem(`${row.name}: ${raw} is not a die that can be rolled`); }
    }
    const mod = row.offhand && !row.addMod ? Math.min(0, i.mods[abil]) : i.mods[abil];
    const dm = mod + row.bonus + sumModifier(i.fx, "damage", i.opt(target)).add;
    const dmgMods = modTerms(modifierParts(i.fx, "damage", i.opt(target))), tail: string[] = [];
    const parts = [dmg === "1" ? `${Math.max(0, 1 + dm)} ${row.type}` : `${dmg}${dm ? sgn(dm) : ""} ${row.type}`];
    if (row.itemExtra) { parts.push(row.itemExtra); tail.push(`${row.itemExtra} (${row.name})`); }
    const notes = [...(row.trained ? [] : [NOT_PROFICIENT]), ...row.notes];
    for (const s of i.fx) for (const x of s.effects.extraDamage ?? []) {
      if (x.on !== undefined && !matchesTag(x.on, target)) continue;
      const dice = extraDice(x.dice, i);
      if (dice === undefined) { i.problem(`${s.source}: extra damage ${String(x.dice)} cannot be worked out`); continue; }
      parts.push(`${dice} ${x.type === "weapon" ? row.type : x.type}`);
      tail.push(`${dice} ${x.type === "weapon" ? row.type : x.type} (${s.source})`);
      if (x.per === "turn") notes.push(`${s.source}: the extra damage applies once per turn.`);
      if (x.note) notes.push(`${s.source}: ${x.note}`);
    }
    let extraCrit = 0;
    for (const s of i.fx) for (const c of s.effects.critDice ?? []) {
      if (c.on !== undefined && !matchesTag(c.on, target)) continue;
      try { extraCrit += Math.max(0, Math.floor(evalFormula(c.extra, i.vars))); } catch (x) { i.problem(`${s.source}: crit dice ${(x as Error).message}`); }
    }
    const damage = parts.join(" + "), crit = critDamageOf(damage, extraCrit);
    const toHit = i.mods[abil] + (row.trained ? i.prof : 0) + row.bonus + sumModifier(i.fx, "attack", i.opt(target)).add;
    const hitMods = modTerms(modifierParts(i.fx, "attack", i.opt(target)));
    const why = {
      hit: sum(`To hit ${signed(toHit)}`, "", [abilTerm(abil, i.mods[abil]), { label: "Proficiency", n: row.trained ? i.prof : 0, ...(row.trained ? {} : { from: "not proficient" }) },
        ...(row.bonus ? [{ n: row.bonus, from: "weapon bonus" }] : []), ...hitMods.terms], { notes: hitMods.notes }),
      damage: sum(`Damage ${dmg === "1" ? Math.max(0, 1 + dm) : `${dmg}${dm ? sgn(dm) : ""}`}`, "",
        [...(mod ? [abilTerm(abil, mod, row.offhand && !row.addMod ? "off-hand: only a penalty counts" : undefined)] : []), ...(row.bonus ? [{ n: row.bonus, from: "weapon bonus" }] : []), ...dmgMods.terms],
        { lead: dmg, tail, notes: dmgMods.notes }),
    };
    return { name: row.name, toHit, why, damage,
      ...(crit ? { critDamage: crit } : {}), target, ...(row.trained ? {} : { proficient: false as const }), ...(notes.length ? { note: notes.join(" ") } : {}) };
  });
}

/** A natural or feature weapon from the weapons keyword: it is proficient, takes the better of its abilities and any bonus formula. */
function natural(w: NaturalWeapon, i: AttackInputs): Row {
  let bonus = 0;
  if (w.bonus !== undefined) { try { bonus = Math.floor(typeof w.bonus === "number" ? w.bonus : evalFormula(w.bonus, i.vars)); } catch (x) { i.problem(`${w.name}: bonus ${(x as Error).message}`); } }
  const abils: Abil[] = w.ab === "finesse" ? ["dex", "str"] : Array.isArray(w.ab) ? w.ab : [w.ab];
  return { name: w.name, dmg: fillDice(w.dmg, i.scales), type: w.type, abils, range: w.range ?? "melee", bonus, trained: true, tags: [slug(w.name), ...(w.tag ? [w.tag] : [])], dieRules: [], notes: [] };
}

/** Extra damage dice: dice (with {scale} filled in) are used as they are, anything else is a formula worked out to a flat number. */
function extraDice(d: string | number, i: AttackInputs): string | undefined {
  if (typeof d === "string") {
    const filled = fillDice(d, i.scales);
    try { parseDice(filled); return filled; } catch { /* a formula, below */ }
  }
  try { return String(Math.max(0, Math.floor(evalFormula(d, i.vars)))); } catch { return undefined; }
}
