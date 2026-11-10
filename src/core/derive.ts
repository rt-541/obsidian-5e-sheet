import type { CompanionEntry, Character, Npc } from "./character";
import type { ClassData, CreatureData, ItemData } from "../content/types";
import { collectEffects, damageTraits, itemWorks, missingIds, modifierParts, notes, sumModifier, type EffectContext, type ModOpts, type SourcedEffects } from "./effects";
import { filterGated, gateHolds, gateStateOf, NO_GATES } from "./gates";
import { abilityMod, profBonus } from "./abilities";
import { buildAttacks, NOT_PROFICIENT } from "./attack-rows";
import { attackOptionRows, type AttackOptionRow } from "./attack-options";
import { evalFormula } from "./formula";
import { emptyProgress, formulaVars, progress, type Progress, type DerivedResource } from "./progression";
import { slug } from "../content/registry";
import { matchesTag } from "./roll-tags";
import { editionRules, characterEdition } from "./edition";
import { slotTable } from "./slots";
import { titleCase } from "./words";
import { ABILS, SKILLS, type Abil, type Effects, type Modifier, type RollTarget } from "./types";
import type { ActionDef, ToggleDef } from "../content/types";
import { layerRow } from "./customize";
import { entryItem } from "./item-entry";
import { masteryOfRow } from "./mastery";
import { ABIL_LONG, abilTerm, modTerms, sgn as signed, sum, type Term } from "./why";

/** How a versatile weapon is held: its main row only. */
export interface AttackGrip { hands: 1 | 2; /** Damage dice with two hands. */ twoHanded: string; /** A shield is equipped, so two hands are not possible. */ shield: boolean; }
export interface AttackStat { name: string; toHit?: number; save?: { abil: Abil; dc: number }; damage?: string; note?: string; target: RollTarget;
  /** Set (false) only when the character lacks the weapon proficiency, so the proficiency bonus is not in toHit. */
  proficient?: false;
  /** The damage on a critical hit: dice doubled, plus any extra crit dice (Brutal Critical). Absent when the damage has no dice. */
  critDamage?: string;
  /** The same numbers in words: where the to-hit and the damage come from. */
  why?: { hit?: string; damage?: string };
  /** The inventory index of the weapon behind this row (its off-hand row too). */
  item?: number;
  /** Only on a versatile weapon's main row. */
  grip?: AttackGrip;
  /** The mastery property of a weapon the character has mastered (its note id and name). Shown on the row, never applied to a number. */
  mastery?: { id: string; name: string }; }
export { NOT_PROFICIENT };

/** "Crossbows, light" -> "light crossbow", "Simple Weapons" -> "simple weapon": lower case, singular, in the order a weapon is named. */
const weaponKey = (s: string): string => {
  let t = s.trim().toLowerCase();
  const m = /^([^,]+),\s*(.+)$/.exec(t); if (m) t = `${m[2]} ${m[1]}`;
  return t.replace(/\s+/g, " ").replace(/s$/, "");
};
/**
 * Whether a character is trained with a weapon: it has the category (Simple Weapons / Martial Weapons) or the weapon itself by name.
 * A weapon with no category, or a character whose class, race, background or feats are not all in the compendium (so what they grant is unknown),
 * gets the benefit of the doubt.
 */
export function weaponProficiency(other: string[], known: boolean) {
  const have = new Set(other.map(weaponKey));
  return (name: string, id: string | undefined, category: "simple" | "martial" | undefined): boolean => {
    if (!known || !category) return true;
    return have.has(`${category} weapon`) || have.has(weaponKey(name)) || (id !== undefined && have.has(weaponKey(id.replace(/-/g, " "))));
  };
}
export interface ResourceRow { id: string; name: string; max: number; used: number; reset: "short" | "long" | "dawn" | "none"; derived: boolean; source?: string; refill?: DerivedResource["refill"]; unlimited?: string; }
/** A switch on the sheet (Rage, a stance, a flame aura): `on` is what the note says, `suppressed` means it is on but its own conditions fail right now. */
export interface ToggleRow {
  id: string; name: string; source: string; /** What a tap on the name opens: `feature:<key>` or `item:<id>`. */ ref: string; text?: string; def: ToggleDef; effects: Effects; on: boolean; suppressed: boolean;
  /** The number set while it is on (a value toggle), else 1 when on. */
  value: number; /** Set for a toggle that belongs to an inventory item. */ itemIndex?: number;
}
export interface CasterStat { name: string; abil: Abil; dc: number; attack: number; progression: string; }
export interface ActorStats {
  kind: "character" | "companion" | "npc"; name: string; label: string;
  abilities: Record<Abil, number>; mods: Record<Abil, number>; prof: number; level: number;
  ac: { value: number; sources: string[] }; speed: { value: number; sources: string[]; other: string };
  hp: { current: number; max: number; temp: number; maxReduced: boolean };
  /** Max HP after every additive bonus, before halving or zeroing effects; what a long rest heals to. */
  hpFull: number;
  saves: Record<Abil, { mod: number; prof: boolean }>;
  /** The Constitution save to keep concentrating: the Con save plus anything that applies only to concentration (War Caster, Bladesong). */
  concentrationSave: number;
  skills: { id: string; abil: Abil; mod: number; prof: boolean; expertise: boolean }[];
  /** Ability check totals (ability modifier plus check modifiers), the same numbers the roll buttons use. */
  checks: Record<Abil, number>;
  /** Attacks per Attack action (Extra Attack): 1 unless a feature says more. */
  attacksPerAction: number;
  /** Senses in feet from race, features and items (darkvision, blindsight, tremorsense, truesight, telepathy). */
  senses: Partial<Record<"darkvision" | "blindsight" | "tremorsense" | "truesight" | "telepathy", number>>;
  /** Conditions (and `disease`) this actor cannot have. */
  conditionImmune: string[];
  initiative: number; passivePerception: number; passives: { perception: number; investigation: number; insight: number }; attacks: AttackStat[];
  spellcasting?: { abil: Abil; dc: number; attack: number };
  slots: { level: string; max: number; used: number; pactLevel?: number }[];
  hitDice: { die: string; max: number; used: number }[];
  carry: { weight: number; capacity: number };
  traits: { resist: string[]; immune: string[]; vulnerable: string[] };
  notes: { source: string; text: string }[]; effects: SourcedEffects[]; missing: string[]; attunedCount: number;
  toggles: ToggleRow[];
  /** Every number in words, by key: ac, speed, hp, initiative, carry, spell-dc, spell-attack, save:<abil>, check:<abil>, skill:<id>, passive:<skill>, dc:<id>. */
  why: Record<string, string>;
  /** Manual resources followed by those derived from class operations. */
  resources: ResourceRow[]; casters: CasterStat[];
  /** Attack options (declared by features and items, and extra-damage switches) for the Attack options card. */
  attackOptions: AttackOptionRow[];
  /** Use buttons on inventory rows (from a row's customization), for items that work. `index` is the inventory position. */
  itemActions: { index: number; name: string; action: ActionDef }[];
  /** Features, scales, class DCs, pending choices and so on, replayed from race, background, feats and class levels. */
  progress: Progress;
  /** Lowest weapon crit range from effects, if any; vs is a note only. */
  crit?: { range: number; vs?: string };
  /** Ability score caps (20 unless a feature raises one). */
  maxScores: Record<Abil, number>; darkvision?: number;
  /** Languages from race, background and class choices plus the manual list on the note (characters only). */
  languages?: string[];
}

export { abilityMod, profBonus };
/** Derived languages first, then manual ones, without case-insensitive duplicates. */
export function mergeLanguages(...lists: string[][]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const l of lists.flat()) { const k = l.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(l.trim()); } }
  return out;
}
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const mods = (a: Record<Abil, number>) => Object.fromEntries(ABILS.map(k => [k, abilityMod(a[k])])) as Record<Abil, number>;

function speedOf(base: number, fx: SourcedEffects[], o: ModOpts = {}) {
  const m = sumModifier(fx, "speed", o); let v = base + m.add;
  if (m.half) v = Math.floor(v / 2); if (m.zero) v = 0;
  return { value: Math.max(0, v), sources: m.sources };
}
function hpFullOf(max0: number, fx: SourcedEffects[], o: ModOpts = {}) { return Math.max(0, max0 + sumModifier(fx, "hpMax", o).add); }
function hpOf(max0: number, current: number, temp: number, fx: SourcedEffects[], o: ModOpts = {}) {
  const m = sumModifier(fx, "hpMax", o), full = Math.max(0, max0 + m.add), half = m.half, max = m.zero ? 0 : half ? Math.floor(full / 2) : full;
  return { current: Math.min(current, max), max, temp, maxReduced: half };
}

/**
 * The save DC an action names: a whole number, the word "spell" (the first caster's spell save DC), or a class DC by name or slug.
 * `label` names where the number comes from ("DC 13", "spell save DC", "<Name> save DC").
 */
export function actionDc(st: ActorStats, dc: string): { dc: number; label: string } | undefined {
  const t = dc.trim();
  if (/^\d+$/.test(t)) return { dc: Number(t), label: `DC ${Number(t)}` };
  if (t.toLowerCase() === "spell") return st.casters[0] ? { dc: st.casters[0].dc, label: "spell save DC" } : undefined;
  const d = st.progress.dcs.find(x => x.name.toLowerCase() === t.toLowerCase() || x.id === slug(t));
  return d ? { dc: d.dc, label: `${d.name} save DC` } : undefined;
}

export function deriveCharacter(c: Character, ctx: EffectContext): ActorStats {
  const r = ctx.registry, prog = progress(c, r);
  const level = c.classes.reduce((a, k) => a + k.level, 0), prof = profBonus(level);
  const classData = c.classes.map(k => ({ k, d: r.get<ClassData>("class", k.class)?.data }));
  const missing = [...missingIds(c, r), ...classData.filter(x => !x.d).map(x => `class:${x.k.class}`)];
  const problem = (msg: string) => { if (!prog.problems.includes(msg)) prog.problems.push(msg); };
  // Each inventory row may carry its own switch and attack option; the registry's item data is copied, never changed.
  const items = c.inventory.map(e => {
    const reg = entryItem(e, r);
    if (!reg) return { e, it: undefined };
    const l = layerRow(reg.name, { toggle: reg.toggle, attackOption: reg.attackOption }, e.customize, level, problem);
    const it: ItemData = { ...reg }; delete it.toggle; delete it.attackOption;
    if (l.toggle) it.toggle = l.toggle;
    if (l.attackOption) it.attackOption = l.attackOption;
    return { e, it };
  });
  // Effects blocks with a `while` gate (armor, shield, two weapons, a toggle, concentrating) count only while the gate holds.
  const gates = gateStateOf(items, c.active, !!c.concentration);
  const fx = filterGated([...collectEffects(c, ctx), ...prog.effects], gates);
  const toggleRow = (id: string, name: string, source: string, ref: string, def: ToggleDef, effects: Effects, text?: string, itemIndex?: number): ToggleRow => {
    const v = c.active[id], on = v !== undefined && v !== false && v !== 0 && v !== "";
    return { id, name, source, ref, def, effects, on, suppressed: on && !(def.while ?? []).every(g => gateHolds(g, gates)), value: typeof v === "number" ? v : on ? 1 : 0,
      ...(text !== undefined ? { text } : {}), ...(itemIndex !== undefined ? { itemIndex } : {}) };
  };
  const toggles: ToggleRow[] = [...prog.toggles.map(t => toggleRow(t.id, t.name, t.source, `feature:${t.key}`, t.def, t.effects, t.text)),
    ...items.flatMap(({ e, it }, i) => it?.toggle && itemWorks(e, it) && !prog.toggles.some(t => t.id === it.toggle!.id) ? [toggleRow(it.toggle.id, it.name, "Item", `item:${e.id}`, it.toggle, it.effects, it.rules, i)] : [])];

  const vars0 = { ...formulaVars(c, prog.scales), ...Object.fromEntries(prog.dcs.map(d => [`dc_${d.id.replace(/-/g, "_")}`, d.dc])),
    ...Object.fromEntries(Object.entries(c.active).map(([k, v]) => [`toggle_${k.replace(/-/g, "_")}`, typeof v === "number" ? v : v ? 1 : 0])) };
  const maxScores = Object.fromEntries(ABILS.map(a => [a, Math.max(20, ...fx.filter(s => s.effects.maxScore?.abil === a).map(s => s.effects.maxScore!.max))])) as Record<Abil, number>;
  // abilityBonus raises a score before the modifier is worked out, up to the score maximum.
  const scores = { ...c.abilities };
  for (const s of fx) for (const [a, f] of Object.entries(s.effects.abilityBonus ?? {})) {
    try { scores[a as Abil] = Math.min(maxScores[a as Abil], scores[a as Abil] + Math.floor(evalFormula(f, vars0))); }
    catch (x) { problem(`${s.source}: ${a} bonus ${(x as Error).message}`); }
  }
  const m = mods(scores);
  const vars = { ...vars0, ...m };
  const opt = (t?: RollTarget): ModOpts => ({ vars, problem, ...(t ? { t } : {}) });

  const armor = items.find(x => x.it?.armor && itemWorks(x.e, x.it));
  // acAbility replaces Dex in the AC formula (still capped by the armor); the best of Dex and the granted ability is used.
  let acAbil: Abil = "dex"; let acFrom: string | undefined;
  for (const s of fx) if (s.effects.acAbility && m[s.effects.acAbility] > m[acAbil]) { acAbil = s.effects.acAbility; acFrom = s.source; }
  // Medium armor allows +2 Dex unless a feature raises the cap (the highest wins).
  const dexCap = Math.max(2, ...fx.map(s => s.effects.armorDexMax ?? 0));
  const dexA = armor?.it?.armor?.dex === "none" ? 0 : armor?.it?.armor?.dex === "max2" ? Math.min(m[acAbil], dexCap) : m[acAbil];
  const acMod = sumModifier(fx, "ac", opt());
  let acBecause: string | undefined;
  const acParts = modTerms(modifierParts(fx, "ac", opt()));
  const ac = { value: (armor ? armor.it!.armor!.base : 10) + dexA + acMod.add, sources: [armor ? armor.it!.name : "Unarmored", ...(acFrom ? [acFrom] : []), ...(armor && dexCap > 2 && armor.it!.armor!.dex === "max2" ? [fx.find(s => s.effects.armorDexMax === dexCap)!.source] : []), ...acMod.sources] };
  const dexNote = armor?.it?.armor?.dex === "max2" && m[acAbil] > dexCap ? `medium armor adds at most +${dexCap}` : acFrom;
  let acTerms: Term[] = [armor ? { n: armor.it!.armor!.base, from: armor.it!.name } : { n: 10, from: "no armor" },
    ...(armor?.it?.armor?.dex === "none" ? [] : [abilTerm(acAbil, dexA, dexNote)]), ...acParts.terms];
  // An alternate base (Unarmored Defense, Draconic Resilience) competes with the normal formula; the highest wins.
  for (const s of fx) {
    const f = s.effects.acFormula; if (!f || (armor && !f.withArmor) || (f.noShield && gates.shield)) continue;
    const value = f.base + (f.abils ?? []).reduce((a, k) => a + m[k], 0) + acMod.add;
    if (value > ac.value) {
      ac.value = value; ac.sources = [s.source, ...acMod.sources];
      acTerms = [{ n: f.base }, ...(f.abils ?? []).map(k => abilTerm(k, m[k])), ...acParts.terms]; acBecause = s.source;
    }
  }
  const why: Record<string, string> = {};
  why.ac = sum("AC", ac.value, acTerms, { ...(acBecause ? { because: acBecause } : {}), notes: acParts.notes });

  // Half proficiency (Jack of All Trades) on matching checks the character is not proficient in; sources do not stack.
  const halfOf = (t: RollTarget): number => {
    let best = 0;
    for (const s of fx) { const h = s.effects.halfProf; if (h && h.on.some(tag => matchesTag(tag, t))) best = Math.max(best, h.roundUp ? Math.ceil(prof / 2) : Math.floor(prof / 2)); }
    return best;
  };
  const saveProf = new Set<Abil>([...c.proficiencies.saves, ...prog.proficiencies.saves]);
  const skillProf = new Set([...c.proficiencies.skills, ...prog.proficiencies.skills]), expertiseProf = new Set([...c.proficiencies.expertise, ...prog.proficiencies.expertise]);
  const bonusVars = vars;
  const saveFormulaTerms = (a: Abil): Term[] => {
    const out: Term[] = [];
    for (const s of fx) for (const b of s.effects.saveBonus ?? []) if (b.abils.includes(a)) {
      try { out.push({ n: Math.floor(evalFormula(b.value, bonusVars)), from: s.source }); } catch (x) { const msg = `${s.source}: save bonus ${(x as Error).message}`; if (!prog.problems.includes(msg)) prog.problems.push(msg); }
    }
    return out;
  };
  const saveFormula = (a: Abil) => saveFormulaTerms(a).reduce((t, x) => t + x.n, 0);
  const saveMod = (a: Abil, concentration = false) => m[a] + (saveProf.has(a) ? prof : 0) + sumModifier(fx, "save", opt({ kind: "save", abil: a, ...(concentration ? { concentration: true } : {}) })).add + saveFormula(a);
  const saves = Object.fromEntries(ABILS.map(a => [a, { mod: saveMod(a), prof: saveProf.has(a) }])) as ActorStats["saves"];
  for (const a of ABILS) {
    const mp = modTerms(modifierParts(fx, "save", opt({ kind: "save", abil: a })));
    why[`save:${a}`] = sum(`${ABIL_LONG[a]} save ${signed(saves[a].mod)}`, "", [abilTerm(a, m[a]), ...(saveProf.has(a) ? [{ label: "Proficiency", n: prof }] : []), ...mp.terms, ...saveFormulaTerms(a)], { notes: mp.notes });
  }
  /** The terms of a skill or check number: ability, proficiency, expertise, half proficiency and check bonuses. */
  const checkTerms = (t: RollTarget, abil: Abil, p: boolean, ex: boolean): { terms: Term[]; notes: string[] } => {
    const half = p || ex ? 0 : halfOf(t), mp = modTerms(modifierParts(fx, "check", opt(t)));
    return { terms: [abilTerm(abil, m[abil]), ...(p || ex ? [{ label: "Proficiency", n: prof }] : []), ...(ex ? [{ label: "Expertise", n: prof }] : []), ...(half ? [{ label: "Half proficiency", n: half }] : []), ...mp.terms], notes: mp.notes };
  };
  const skills = Object.entries(SKILLS).map(([id, abil]) => {
    const p = skillProf.has(id), ex = expertiseProf.has(id);
    const t: RollTarget = { kind: "skill", abil, skill: id };
    const mod = m[abil] + (p ? prof : 0) + (ex ? prof : 0) + (p || ex ? 0 : halfOf(t)) + sumModifier(fx, "check", opt(t)).add, w = checkTerms(t, abil, p, ex);
    why[`skill:${id}`] = sum(`${titleCase(id)} ${signed(mod)}`, "", w.terms, { notes: w.notes });
    return { id, abil, mod, prof: p, expertise: ex };
  });
  const checks = Object.fromEntries(ABILS.map(a => [a, m[a] + halfOf({ kind: "check", abil: a }) + sumModifier(fx, "check", opt({ kind: "check", abil: a })).add])) as Record<Abil, number>;
  for (const a of ABILS) { const w = checkTerms({ kind: "check", abil: a }, a, false, false); why[`check:${a}`] = sum(`${ABIL_LONG[a]} check ${signed(checks[a])}`, "", w.terms, { notes: w.notes }); }
  const weaponProf = weaponProficiency(prog.proficiencies.other, classData.length > 0 && classData.every(x => x.d) && prog.unknown.length === 0);
  const attacks = buildAttacks({ fx, shield: items.some(x => x.e.equipped && x.it?.kind === "shield"), mods: m, prof, scales: prog.scales, vars, items, weaponProf, opt, problem, extraOff: new Set(c.optionsOff ?? []),
    masteryOf: (e, it) => masteryOfRow(c, ctx.registry, e, it) });
  const casters: CasterStat[] = prog.spellcasting.map(e => ({ name: e.className, abil: e.abil, progression: e.progression,
    dc: 8 + prof + m[e.abil] + sumModifier(fx, "spellDC", opt()).add, attack: prof + m[e.abil] + sumModifier(fx, "spellAttack", opt()).add }));
  if (casters[0]) {
    const c0 = casters[0], dcp = modTerms(modifierParts(fx, "spellDC", opt())), atp = modTerms(modifierParts(fx, "spellAttack", opt()));
    why["spell-dc"] = sum("Spell save DC", c0.dc, [{ n: 8 }, { label: "Proficiency", n: prof }, abilTerm(c0.abil, m[c0.abil]), ...dcp.terms], { notes: dcp.notes });
    why["spell-attack"] = sum(`Spell attack ${signed(c0.attack)}`, "", [{ label: "Proficiency", n: prof }, abilTerm(c0.abil, m[c0.abil]), ...atp.terms], { notes: atp.notes });
  }
  for (const d of prog.dcs) why[`dc:${d.id}`] = sum(`${d.name} save DC`, d.dc, [{ n: 8 }, { label: "Proficiency", n: prof }, abilTerm(d.abil, d.dc - 8 - prof)]);
  const spellcasting = casters[0] ? { abil: casters[0].abil, dc: casters[0].dc, attack: casters[0].attack } : undefined;
  const slots = slotTable(prog.spellcasting.map(e => ({ level: e.level, progression: e.progression, ...(e.table ? { table: e.table } : {}) })), editionRules(characterEdition(c)))
    .map(s => ({ ...s, used: Math.min(c.spellSlots[s.level]?.used ?? 0, s.max) }));
  const dice = new Map<string, number>();
  for (const x of classData) if (x.d) dice.set(`d${x.d.hitDie}`, (dice.get(`d${x.d.hitDie}`) ?? 0) + x.k.level);
  const hitDice = [...dice].map(([die, max]) => ({ die, max, used: Math.min(c.hitDice[die]?.used ?? 0, max) }));
  const itemActions = c.inventory.flatMap((e, index) => {
    const { it } = items[index], name = it?.name ?? e.name ?? "";
    if (e.id ? !(it && itemWorks(e, it)) : e.qty <= 0) return [];
    const action = layerRow(name, {}, e.customize, level, problem).action;
    return action ? [{ index, name, action }] : [];
  });
  const weight = items.reduce((a, x) => a + (x.it?.weight ?? x.e.weight ?? 0) * x.e.qty, 0);
  const carryMod = sumModifier(fx, "carry", opt());
  const passive = (skill: string) => 10 + skills.find(k => k.id === skill)!.mod + sumModifier(fx, "passive", opt({ kind: "passive", skill })).add;
  const passives = { perception: passive("perception"), investigation: passive("investigation"), insight: passive("insight") };
  for (const [id, abil] of [["perception", "wis"], ["investigation", "int"], ["insight", "wis"]] as const) {
    const t: RollTarget = { kind: "skill", abil, skill: id }, w = checkTerms(t, abil, skillProf.has(id), expertiseProf.has(id)), pp = modTerms(modifierParts(fx, "passive", opt({ kind: "passive", skill: id })));
    why[`passive:${id}`] = sum(`Passive ${titleCase(id)}`, passives[id], [{ n: 10 }, ...w.terms, ...pp.terms], { notes: [...w.notes, ...pp.notes] });
  }
  const resources: ResourceRow[] = [...c.resources.map((x, i) => ({ id: `manual:${i}`, name: x.name, max: x.max, used: x.used, reset: x.reset, derived: false })),
    ...prog.resources.map(x => ({ ...x, derived: true }))];
  const crits = fx.filter(s => s.effects.critRange !== undefined).sort((a, b) => a.effects.critRange! - b.effects.critRange!);
  const speedBase = speedOf(prog.speed ?? c.baseSpeed, fx, opt());
  const sp = modTerms(modifierParts(fx, "speed", opt()));
  why.speed = sum("Speed", speedBase.value, [{ label: "Base", n: prog.speed ?? c.baseSpeed }, ...sp.terms], { notes: sp.notes });
  const hpp = modTerms(modifierParts(fx, "hpMax", opt()));
  why.hp = sum("Max HP", hpOf(c.hp.max, c.hp.current, c.hp.temp, fx, opt()).max, [{ label: "Hit points from levels", n: c.hp.max }, ...hpp.terms], { notes: hpp.notes });
  const ip = modTerms([...modifierParts(fx, "initiative", opt({ kind: "initiative", abil: "dex" })), ...modifierParts(fx, "check", opt({ kind: "initiative", abil: "dex" }))]);
  const ih = halfOf({ kind: "initiative", abil: "dex" });
  const initiative = m.dex + ih + sumModifier(fx, "initiative", opt({ kind: "initiative", abil: "dex" })).add + sumModifier(fx, "check", opt({ kind: "initiative", abil: "dex" })).add;
  why.initiative = sum(`Initiative ${signed(initiative)}`, "", [abilTerm("dex", m.dex), ...(ih ? [{ label: "Half proficiency", n: ih }] : []), ...ip.terms], { notes: ip.notes });
  const cm = modTerms(modifierParts(fx, "carry", opt())), capacity = Math.max(0, scores.str * 15 + carryMod.add) * (carryMod.double ? 2 : 1) / (carryMod.half ? 2 : 1);
  why.carry = `Carrying capacity ${capacity} lb = Str ${scores.str} x 15${cm.terms.map(t => `${t.n < 0 ? " - " : " + "}${Math.abs(t.n)} (${t.from})`).join("")}${carryMod.double ? " doubled" : ""}${carryMod.half ? " halved" : ""}`;
  // Extra movement modes: the best of each; "walk" means the walking speed.
  const modes: string[] = []; let hover = false;
  for (const k of ["fly", "swim", "climb", "burrow"] as const) {
    const all = fx.flatMap(s => s.effects.speeds?.[k] !== undefined ? [s.effects.speeds[k] === "walk" ? speedBase.value : s.effects.speeds[k] as number] : []);
    if (all.length) modes.push(`${k} ${Math.max(...all)}`);
  }
  for (const s of fx) if (s.effects.speeds?.hover) hover = true;
  // darkvisionAdd only adds to darkvision another source already gives; without one the block's own darkvision applies.
  const senses: ActorStats["senses"] = {};
  const plain = Math.max(prog.darkvision ?? 0, ...fx.filter(s => s.effects.senses?.darkvisionAdd === undefined).map(s => s.effects.senses?.darkvision ?? 0));
  let dv = plain;
  for (const s of fx) { const e = s.effects.senses; if (e?.darkvisionAdd !== undefined) dv = plain > 0 ? dv + e.darkvisionAdd : Math.max(dv, e.darkvision ?? 0); }
  if (dv > 0) senses.darkvision = dv;
  for (const k of ["blindsight", "tremorsense", "truesight", "telepathy"] as const) {
    const n = Math.max(0, ...fx.map(s => s.effects.senses?.[k] ?? 0)); if (n > 0) senses[k] = n;
  }
  let attacksPerAction = 1;
  for (const s of fx) if (s.effects.attacks !== undefined) {
    try { attacksPerAction = Math.max(attacksPerAction, Math.floor(evalFormula(s.effects.attacks, vars))); } catch (x) { problem(`${s.source}: attacks ${(x as Error).message}`); }
  }
  return {
    kind: "character", name: c.name, label: c.classes.map(k => `${k.class} ${k.level}`).join(" / "),
    abilities: scores, mods: m, prof, level, ac, speed: { ...speedBase, other: modes.join(", ") + (hover && modes.some(x => x.startsWith("fly")) ? " (hover)" : "") },
    attacksPerAction, senses, conditionImmune: [...new Set(fx.flatMap(s => s.effects.conditionImmune ?? []))],
    hp: hpOf(c.hp.max, c.hp.current, c.hp.temp, fx, opt()), hpFull: hpFullOf(c.hp.max, fx, opt()), saves, concentrationSave: saveMod("con", true), skills, checks,
    initiative, why,
    passivePerception: passives.perception, passives, attacks,
    ...(spellcasting ? { spellcasting } : {}), slots, hitDice,
    carry: { weight, capacity },
    traits: damageTraits(fx), notes: notes(fx), effects: fx, missing, attunedCount: c.inventory.filter(e => e.attuned).length,
    toggles, resources, casters, itemActions, attackOptions: attackOptionRows(c, prog.attackOptions, items, fx, resources, prog.scales, level, vars), progress: prog, maxScores, ...(crits[0] ? { crit: { range: crits[0].effects.critRange!, ...(crits[0].effects.critVs ? { vs: crits[0].effects.critVs } : {}) } } : {}),
    languages: mergeLanguages(prog.languages, c.languages),
    ...(senses.darkvision !== undefined ? { darkvision: senses.darkvision } : {}),
  };
}

export function deriveCreature(b: CreatureData, st: { name: string; hp: { max?: number; current?: number; temp: number }; conditions: Record<string, number>; modifiers: Modifier[] },
  kind: "companion" | "npc", ctx: EffectContext, label = b.name): ActorStats {
  const fx = filterGated([...(Object.keys(b.effects).length ? [{ source: b.name, effects: b.effects }] : []), ...collectEffects({ conditions: st.conditions, modifiers: st.modifiers }, ctx)], NO_GATES);
  const m = mods(b.abilities), checkAdd = sumModifier(fx, "check").add, saveAdd = sumModifier(fx, "save").add, atkAdd = sumModifier(fx, "attack").add;
  const max = st.hp.max ?? b.hp.average;
  const acMod = sumModifier(fx, "ac");
  return {
    kind, name: st.name, label, attacksPerAction: 1, senses: {}, conditionImmune: [...new Set(fx.flatMap(s => s.effects.conditionImmune ?? []))], abilities: b.abilities, mods: m, prof: 0, level: 0, concentrationSave: (b.saves.con ?? m.con) + saveAdd,
    ac: { value: b.ac + acMod.add, sources: [b.name, ...acMod.sources] },
    speed: { ...speedOf(b.speed.walk, fx), other: (["fly", "swim", "climb"] as const).filter(k => b.speed[k]).map(k => `${k} ${b.speed[k]}`).join(", ") },
    hp: hpOf(max, st.hp.current ?? max, st.hp.temp, fx), hpFull: hpFullOf(max, fx),
    saves: Object.fromEntries(ABILS.map(a => [a, { mod: (b.saves[a] ?? m[a]) + saveAdd, prof: a in b.saves }])) as ActorStats["saves"],
    skills: Object.entries(b.skills).map(([id, v]) => ({ id, abil: SKILLS[id] ?? "wis", mod: v + checkAdd, prof: true, expertise: false })),
    checks: Object.fromEntries(ABILS.map(a => [a, m[a] + checkAdd])) as Record<Abil, number>,
    initiative: m.dex + sumModifier(fx, "initiative").add + checkAdd,
    passivePerception: 10 + (b.skills.perception ?? m.wis) + checkAdd, passives: { perception: 10 + (b.skills.perception ?? m.wis) + checkAdd, investigation: 10 + (b.skills.investigation ?? m.int) + checkAdd, insight: 10 + (b.skills.insight ?? m.wis) + checkAdd },
    attacks: b.attacks.map(a => ({ name: a.name, ...(a.toHit !== undefined ? { toHit: a.toHit + atkAdd } : {}), ...(a.save ? { save: a.save } : {}),
      ...(a.damage ? { damage: a.damage } : {}), ...(a.note ? { note: a.note } : {}), target: { kind: "attack" } })),
    slots: [], hitDice: [], carry: { weight: 0, capacity: b.abilities.str * 15 }, traits: damageTraits(fx), notes: notes(fx), effects: fx,
    missing: missingIds({ conditions: st.conditions }, ctx.registry), attunedCount: 0,
    toggles: [], resources: [], casters: [], attackOptions: [], itemActions: [], why: {}, progress: emptyProgress(), maxScores: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
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
