import type { CompanionEntry, Character, Npc } from "./character";
import type { ClassData, CreatureData, ItemData } from "../content/types";
import { collectEffects, damageTraits, itemWorks, missingIds, notes, sumModifier, type EffectContext, type SourcedEffects } from "./effects";
import { abilityMod, profBonus } from "./abilities";
import { evalFormula } from "./formula";
import { emptyProgress, formulaVars, progress, type Progress, type DerivedResource } from "./progression";
import { slotTable } from "./slots";
import { ABILS, SKILLS, type Abil, type Modifier, type RollTarget } from "./types";

export interface AttackStat { name: string; toHit?: number; save?: { abil: Abil; dc: number }; damage?: string; note?: string; target: RollTarget; }
export interface ResourceRow { id: string; name: string; max: number; used: number; reset: "short" | "long" | "dawn" | "none"; derived: boolean; source?: string; refill?: DerivedResource["refill"]; unlimited?: string; }
export interface CasterStat { name: string; abil: Abil; dc: number; attack: number; progression: string; }
export interface ActorStats {
  kind: "character" | "companion" | "npc"; name: string; label: string;
  abilities: Record<Abil, number>; mods: Record<Abil, number>; prof: number; level: number;
  ac: { value: number; sources: string[] }; speed: { value: number; sources: string[]; other: string };
  hp: { current: number; max: number; temp: number; maxReduced: boolean };
  saves: Record<Abil, { mod: number; prof: boolean }>;
  skills: { id: string; abil: Abil; mod: number; prof: boolean; expertise: boolean }[];
  initiative: number; passivePerception: number; attacks: AttackStat[];
  spellcasting?: { abil: Abil; dc: number; attack: number };
  slots: { level: string; max: number; used: number; pactLevel?: number }[];
  hitDice: { die: string; max: number; used: number }[];
  carry: { weight: number; capacity: number };
  traits: { resist: string[]; immune: string[]; vulnerable: string[] };
  notes: { source: string; text: string }[]; effects: SourcedEffects[]; missing: string[]; attunedCount: number;
  /** Manual resources followed by those derived from class operations. */
  resources: ResourceRow[]; casters: CasterStat[];
  /** Features, scales, class DCs, pending choices and so on, replayed from race, background, feats and class levels. */
  progress: Progress;
  /** Lowest weapon crit range from effects, if any; vs is a note only. */
  crit?: { range: number; vs?: string };
  /** Ability score caps (20 unless a feature raises one). */
  maxScores: Record<Abil, number>; darkvision?: number;
}

export { abilityMod, profBonus };
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const mods = (a: Record<Abil, number>) => Object.fromEntries(ABILS.map(k => [k, abilityMod(a[k])])) as Record<Abil, number>;

function speedOf(base: number, fx: SourcedEffects[]) {
  const m = sumModifier(fx, "speed"); let v = base + m.add;
  if (m.half) v = Math.floor(v / 2); if (m.zero) v = 0;
  return { value: Math.max(0, v), sources: m.sources };
}
function hpOf(max0: number, current: number, temp: number, fx: SourcedEffects[]) {
  const half = sumModifier(fx, "hpMax").half, max = half ? Math.floor(max0 / 2) : max0;
  return { current: Math.min(current, max), max, temp, maxReduced: half };
}

export function deriveCharacter(c: Character, ctx: EffectContext): ActorStats {
  const r = ctx.registry, prog = progress(c, r), fx = [...collectEffects(c, ctx), ...prog.effects], m = mods(c.abilities);
  const level = c.classes.reduce((a, k) => a + k.level, 0), prof = profBonus(level);
  const classData = c.classes.map(k => ({ k, d: r.get<ClassData>("class", k.class)?.data }));
  const missing = [...missingIds(c, r), ...classData.filter(x => !x.d).map(x => `class:${x.k.class}`)];
  const items = c.inventory.map(e => ({ e, it: e.id ? r.get<ItemData>("item", e.id)?.data : undefined }));

  const armor = items.find(x => x.it?.armor && itemWorks(x.e, x.it));
  // acAbility replaces Dex in the AC formula (still capped by the armor); the best of Dex and the granted ability is used.
  let acAbil: Abil = "dex"; let acFrom: string | undefined;
  for (const s of fx) if (s.effects.acAbility && m[s.effects.acAbility] > m[acAbil]) { acAbil = s.effects.acAbility; acFrom = s.source; }
  const dexA = armor?.it?.armor?.dex === "none" ? 0 : armor?.it?.armor?.dex === "max2" ? Math.min(m[acAbil], 2) : m[acAbil];
  const acMod = sumModifier(fx, "ac");
  const ac = { value: (armor ? armor.it!.armor!.base : 10) + dexA + acMod.add, sources: [armor ? armor.it!.name : "Unarmored", ...(acFrom ? [acFrom] : []), ...acMod.sources] };

  const saveAdd = sumModifier(fx, "save").add, checkAdd = sumModifier(fx, "check").add;
  const saveProf = new Set<Abil>([...c.proficiencies.saves, ...prog.proficiencies.saves]);
  const skillProf = new Set([...c.proficiencies.skills, ...prog.proficiencies.skills]), expertiseProf = new Set([...c.proficiencies.expertise, ...prog.proficiencies.expertise]);
  const bonusVars = formulaVars(c, prog.scales);
  const saveFormula = (a: Abil) => {
    let add = 0;
    for (const s of fx) for (const b of s.effects.saveBonus ?? []) if (b.abils.includes(a)) {
      try { add += Math.floor(evalFormula(b.value, bonusVars)); } catch (x) { const msg = `${s.source}: save bonus ${(x as Error).message}`; if (!prog.problems.includes(msg)) prog.problems.push(msg); }
    }
    return add;
  };
  const saves = Object.fromEntries(ABILS.map(a => { const p = saveProf.has(a); return [a, { mod: m[a] + (p ? prof : 0) + saveAdd + saveFormula(a), prof: p }]; })) as ActorStats["saves"];
  const skills = Object.entries(SKILLS).map(([id, abil]) => {
    const p = skillProf.has(id), ex = expertiseProf.has(id);
    return { id, abil, mod: m[abil] + (p ? prof : 0) + (ex ? prof : 0) + checkAdd, prof: p, expertise: ex };
  });
  const atkAdd = sumModifier(fx, "attack").add, dmgAdd = sumModifier(fx, "damage").add;
  const attacks: AttackStat[] = items.filter(x => x.e.equipped && x.it?.weapon).map(({ e, it }) => {
    const w = it!.weapon!, works = itemWorks(e, it), bonus = works ? (w.bonus ?? 0) : 0;
    const abil: Abil = w.ab === "finesse" ? (m.dex >= m.str ? "dex" : "str") : w.ab;
    const dm = m[abil] + bonus + dmgAdd;
    return { name: it!.name, toHit: m[abil] + prof + bonus + atkAdd, damage: `${w.dmg}${dm ? sgn(dm) : ""} ${w.type}${works && w.extraDamage ? " + " + w.extraDamage : ""}`,
      target: { kind: "attack", abil, range: w.range } };
  });
  const casters: CasterStat[] = prog.spellcasting.map(e => ({ name: e.className, abil: e.abil, progression: e.progression,
    dc: 8 + prof + m[e.abil] + sumModifier(fx, "spellDC").add, attack: prof + m[e.abil] + sumModifier(fx, "spellAttack").add }));
  const spellcasting = casters[0] ? { abil: casters[0].abil, dc: casters[0].dc, attack: casters[0].attack } : undefined;
  const slots = slotTable(prog.spellcasting.map(e => ({ level: e.level, progression: e.progression, ...(e.table ? { table: e.table } : {}) })))
    .map(s => ({ ...s, used: Math.min(c.spellSlots[s.level]?.used ?? 0, s.max) }));
  const dice = new Map<string, number>();
  for (const x of classData) if (x.d) dice.set(`d${x.d.hitDie}`, (dice.get(`d${x.d.hitDie}`) ?? 0) + x.k.level);
  const hitDice = [...dice].map(([die, max]) => ({ die, max, used: Math.min(c.hitDice[die]?.used ?? 0, max) }));
  const weight = items.reduce((a, x) => a + (x.it?.weight ?? x.e.weight ?? 0) * x.e.qty, 0);
  const carryHalf = sumModifier(fx, "carry").half;
  const perception = skills.find(k => k.id === "perception")!.mod;
  const resources: ResourceRow[] = [...c.resources.map((x, i) => ({ id: `manual:${i}`, name: x.name, max: x.max, used: x.used, reset: x.reset, derived: false })),
    ...prog.resources.map(x => ({ ...x, derived: true }))];
  const crits = fx.filter(s => s.effects.critRange !== undefined).sort((a, b) => a.effects.critRange! - b.effects.critRange!);
  const maxScores = Object.fromEntries(ABILS.map(a => [a, Math.max(20, ...fx.filter(s => s.effects.maxScore?.abil === a).map(s => s.effects.maxScore!.max))])) as Record<Abil, number>;
  return {
    kind: "character", name: c.name, label: c.classes.map(k => `${k.class} ${k.level}`).join(" / "),
    abilities: c.abilities, mods: m, prof, level, ac, speed: { ...speedOf(prog.speed ?? c.baseSpeed, fx), other: "" },
    hp: hpOf(c.hp.max, c.hp.current, c.hp.temp, fx), saves, skills,
    initiative: m.dex + sumModifier(fx, "initiative").add, passivePerception: 10 + perception, attacks,
    ...(spellcasting ? { spellcasting } : {}), slots, hitDice,
    carry: { weight, capacity: c.abilities.str * 15 / (carryHalf ? 2 : 1) },
    traits: damageTraits(fx), notes: notes(fx), effects: fx, missing, attunedCount: c.inventory.filter(e => e.attuned).length,
    resources, casters, progress: prog, maxScores, ...(crits[0] ? { crit: { range: crits[0].effects.critRange!, ...(crits[0].effects.critVs ? { vs: crits[0].effects.critVs } : {}) } } : {}),
    ...(prog.darkvision !== undefined ? { darkvision: prog.darkvision } : {}),
  };
}

export function deriveCreature(b: CreatureData, st: { name: string; hp: { max?: number; current?: number; temp: number }; conditions: Record<string, number>; modifiers: Modifier[] },
  kind: "companion" | "npc", ctx: EffectContext, label = b.name): ActorStats {
  const fx = [...(Object.keys(b.effects).length ? [{ source: b.name, effects: b.effects }] : []), ...collectEffects({ conditions: st.conditions, modifiers: st.modifiers }, ctx)];
  const m = mods(b.abilities), checkAdd = sumModifier(fx, "check").add, saveAdd = sumModifier(fx, "save").add, atkAdd = sumModifier(fx, "attack").add;
  const max = st.hp.max ?? b.hp.average;
  const acMod = sumModifier(fx, "ac");
  return {
    kind, name: st.name, label, abilities: b.abilities, mods: m, prof: 0, level: 0,
    ac: { value: b.ac + acMod.add, sources: [b.name, ...acMod.sources] },
    speed: { ...speedOf(b.speed.walk, fx), other: (["fly", "swim", "climb"] as const).filter(k => b.speed[k]).map(k => `${k} ${b.speed[k]}`).join(", ") },
    hp: hpOf(max, st.hp.current ?? max, st.hp.temp, fx),
    saves: Object.fromEntries(ABILS.map(a => [a, { mod: (b.saves[a] ?? m[a]) + saveAdd, prof: a in b.saves }])) as ActorStats["saves"],
    skills: Object.entries(b.skills).map(([id, v]) => ({ id, abil: SKILLS[id] ?? "wis", mod: v + checkAdd, prof: true, expertise: false })),
    initiative: m.dex + sumModifier(fx, "initiative").add, passivePerception: 10 + (b.skills.perception ?? m.wis),
    attacks: b.attacks.map(a => ({ name: a.name, ...(a.toHit !== undefined ? { toHit: a.toHit + atkAdd } : {}), ...(a.save ? { save: a.save } : {}),
      ...(a.damage ? { damage: a.damage } : {}), ...(a.note ? { note: a.note } : {}), target: { kind: "attack" } })),
    slots: [], hitDice: [], carry: { weight: 0, capacity: b.abilities.str * 15 }, traits: damageTraits(fx), notes: notes(fx), effects: fx,
    missing: missingIds({ conditions: st.conditions }, ctx.registry), attunedCount: 0,
    resources: [], casters: [], progress: emptyProgress(), maxScores: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
  };
}

export function deriveCompanion(e: CompanionEntry, ctx: EffectContext): ActorStats | undefined {
  const b = ctx.registry.get<CreatureData>("creature", e.creature)?.data; if (!b) return undefined;
  return deriveCreature(b, { name: e.name, hp: e.hp, conditions: e.conditions, modifiers: [] }, "companion", ctx, `${b.name} (${e.kind})`);
}
export function deriveNpc(n: Npc, ctx: EffectContext): ActorStats | undefined {
  const b = ctx.registry.get<CreatureData>("creature", n.creature)?.data; if (!b) return undefined;
  return deriveCreature(b, n, "npc", ctx);
}
