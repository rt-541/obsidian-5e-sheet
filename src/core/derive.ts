import type { CompanionEntry, Character, Npc } from "./character";
import type { ClassData, CreatureData, ItemData } from "../content/types";
import { collectEffects, damageTraits, itemWorks, missingIds, notes, sumModifier, type EffectContext, type SourcedEffects } from "./effects";
import { slotTable } from "./slots";
import { ABILS, SKILLS, type Abil, type Modifier, type RollTarget } from "./types";

export interface AttackStat { name: string; toHit?: number; save?: { abil: Abil; dc: number }; damage?: string; note?: string; target: RollTarget; }
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
}

export const abilityMod = (s: number) => Math.floor((s - 10) / 2);
export const profBonus = (level: number) => Math.ceil(Math.max(level, 1) / 4) + 1;
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
  const r = ctx.registry, fx = collectEffects(c, ctx), m = mods(c.abilities);
  const level = c.classes.reduce((a, k) => a + k.level, 0), prof = profBonus(level);
  const classData = c.classes.map(k => ({ k, d: r.get<ClassData>("class", k.class)?.data }));
  const missing = [...missingIds(c, r), ...classData.filter(x => !x.d).map(x => `class:${x.k.class}`)];
  const items = c.inventory.map(e => ({ e, it: e.id ? r.get<ItemData>("item", e.id)?.data : undefined }));

  const armor = items.find(x => x.it?.armor && itemWorks(x.e, x.it));
  const dexA = armor?.it?.armor?.dex === "none" ? 0 : armor?.it?.armor?.dex === "max2" ? Math.min(m.dex, 2) : m.dex;
  const acMod = sumModifier(fx, "ac");
  const ac = { value: (armor ? armor.it!.armor!.base : 10) + dexA + acMod.add, sources: [armor ? armor.it!.name : "Unarmored", ...acMod.sources] };

  const saveAdd = sumModifier(fx, "save").add, checkAdd = sumModifier(fx, "check").add;
  const saves = Object.fromEntries(ABILS.map(a => { const p = c.proficiencies.saves.includes(a); return [a, { mod: m[a] + (p ? prof : 0) + saveAdd, prof: p }]; })) as ActorStats["saves"];
  const skills = Object.entries(SKILLS).map(([id, abil]) => {
    const p = c.proficiencies.skills.includes(id), ex = c.proficiencies.expertise.includes(id);
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
  const caster = classData.find(x => x.d?.spellcasting);
  const spellcasting = caster ? { abil: caster.d!.spellcasting!.abil, dc: 8 + prof + m[caster.d!.spellcasting!.abil] + sumModifier(fx, "spellDC").add,
    attack: prof + m[caster.d!.spellcasting!.abil] + sumModifier(fx, "spellAttack").add } : undefined;
  const slots = slotTable(classData.map(x => ({ level: x.k.level, progression: x.d?.spellcasting?.progression })))
    .map(s => ({ ...s, used: Math.min(c.spellSlots[s.level]?.used ?? 0, s.max) }));
  const dice = new Map<string, number>();
  for (const x of classData) if (x.d) dice.set(`d${x.d.hitDie}`, (dice.get(`d${x.d.hitDie}`) ?? 0) + x.k.level);
  const hitDice = [...dice].map(([die, max]) => ({ die, max, used: Math.min(c.hitDice[die]?.used ?? 0, max) }));
  const weight = items.reduce((a, x) => a + (x.it?.weight ?? x.e.weight ?? 0) * x.e.qty, 0);
  const carryHalf = sumModifier(fx, "carry").half;
  const perception = skills.find(k => k.id === "perception")!.mod;
  return {
    kind: "character", name: c.name, label: c.classes.map(k => `${k.class} ${k.level}`).join(" / "),
    abilities: c.abilities, mods: m, prof, level, ac, speed: { ...speedOf(c.baseSpeed, fx), other: "" },
    hp: hpOf(c.hp.max, c.hp.current, c.hp.temp, fx), saves, skills,
    initiative: m.dex + sumModifier(fx, "initiative").add, passivePerception: 10 + perception, attacks,
    ...(spellcasting ? { spellcasting } : {}), slots, hitDice,
    carry: { weight, capacity: c.abilities.str * 15 / (carryHalf ? 2 : 1) },
    traits: damageTraits(fx), notes: notes(fx), effects: fx, missing, attunedCount: c.inventory.filter(e => e.attuned).length,
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
