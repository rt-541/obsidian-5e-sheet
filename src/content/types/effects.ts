import { ABILS, type Abil, type CritDice, type D20Rule, type Effects, type ExtraDamage, type Modifier, type NaturalWeapon, type SaveBonus, type SpellDamageBonus, type WeaponRule } from "../../core/types";
import { validGate } from "../../core/gates";
import { parseModifier } from "../../core/modifier";
import { validRollTarget } from "../../core/roll-tags";
import { checkFormula } from "../../core/formula";
import { checkDice } from "../../core/dice";
import { isObj, strList, type Errs } from "../check";

export { validRollTarget };

export function validateEffects(v: unknown, at: string, e: Errs): Effects {
  if (v === undefined) return {};
  if (!isObj(v)) { e.push(`${at}: must be a mapping`); return {}; }
  const out: Effects = {};
  for (const k of ["adv", "dis", "autofail"] as const) {
    const list = strList(v[k], `${at}.${k}`, e);
    list.forEach((t, i) => { if (!validRollTarget(t)) e.push(`${at}.${k}[${i}]: unknown roll target ${t}`); });
    if (list.length) out[k] = list.filter(validRollTarget);
  }
  for (const k of ["resist", "immune", "vulnerable"] as const) { const l = strList(v[k], `${at}.${k}`, e); if (l.length) out[k] = l; }
  if (v.note !== undefined) { if (typeof v.note === "string") out.note = v.note; else e.push(`${at}.note: must be text`); }
  if (v.modifiers !== undefined) {
    if (!Array.isArray(v.modifiers)) e.push(`${at}.modifiers: must be a list`);
    else {
      const mods: Modifier[] = [];
      v.modifiers.forEach((m: unknown, i: number) => { const p = parseModifier(m, `${at}.modifiers[${i}]`, e); if (p) mods.push(p); });
      if (mods.length) out.modifiers = mods;
    }
  }
  if (v.acAbility !== undefined) {
    if (ABILS.includes(v.acAbility as Abil)) out.acAbility = v.acAbility as Abil; else e.push(`${at}.acAbility: must be one of ${ABILS.join(", ")}`);
  }
  if (v.saveBonus !== undefined) {
    if (!Array.isArray(v.saveBonus)) e.push(`${at}.saveBonus: must be a list`);
    else {
      const list: SaveBonus[] = [];
      v.saveBonus.forEach((b: unknown, i: number) => {
        const p = `${at}.saveBonus[${i}]`;
        if (!isObj(b)) { e.push(`${p}: must be a mapping`); return; }
        const abils = Array.isArray(b.abils) ? b.abils : [];
        const okA = abils.length > 0 && abils.every(a => ABILS.includes(a as Abil));
        if (!okA) e.push(`${p}.abils: must be a non-empty list of abilities`);
        const fe = checkFormula(b.value);
        if (fe) e.push(`${p}.value: ${fe}`);
        if (okA && !fe) list.push({ abils: abils as Abil[], value: b.value as number | string });
      });
      if (list.length) out.saveBonus = list;
    }
  }
  if (v.critRange !== undefined) {
    if (typeof v.critRange === "number" && Number.isInteger(v.critRange) && v.critRange >= 2 && v.critRange <= 20) out.critRange = v.critRange;
    else e.push(`${at}.critRange: must be a whole number from 2 to 20`);
  }
  if (v.critVs !== undefined) { if (typeof v.critVs === "string") out.critVs = v.critVs; else e.push(`${at}.critVs: must be text`); }
  if (v.critOn !== undefined) { if (typeof v.critOn === "string" && validRollTarget(v.critOn)) out.critOn = v.critOn; else e.push(`${at}.critOn: unknown roll tag ${String(v.critOn)}`); }
  if (v.while !== undefined) {
    const list = strList(v.while, `${at}.while`, e);
    list.forEach((g, i) => { if (!validGate(g)) e.push(`${at}.while[${i}]: unknown condition ${g}`); });
    if (list.length) out.while = list;
  }
  if (v.conditionImmune !== undefined) { const l = strList(v.conditionImmune, `${at}.conditionImmune`, e); if (l.length) out.conditionImmune = l; }
  if (v.maxScore !== undefined) {
    const m = v.maxScore;
    if (!isObj(m) || !ABILS.includes(m.abil as Abil) || typeof m.max !== "number" || !Number.isInteger(m.max) || m.max < 20 || m.max > 30) e.push(`${at}.maxScore: must be { abil, max } with max from 20 to 30`);
    else out.maxScore = { abil: m.abil as Abil, max: m.max };
  }
  parseMovementAndDefense(v, at, e, out);
  parseCombat(v, at, e, out);
  return out;
}

const whole = (n: unknown, min = 0) => typeof n === "number" && Number.isInteger(n) && n >= min;
const SENSES = ["darkvision", "darkvisionAdd", "blindsight", "tremorsense", "truesight", "telepathy"] as const;
const SPEEDS = ["fly", "swim", "climb", "burrow"] as const;

/** acFormula, armorDexMax, attacks, senses, speeds and abilityBonus. */
function parseMovementAndDefense(v: Record<string, unknown>, at: string, e: Errs, out: Effects): void {
  if (v.acFormula !== undefined) {
    const f = v.acFormula, p = `${at}.acFormula`;
    if (!isObj(f)) e.push(`${p}: must be { base, abils, noShield, withArmor }`);
    else {
      const before = e.length;
      if (!whole(f.base)) e.push(`${p}.base: must be a whole number such as 10`);
      let abils: Abil[] | undefined;
      if (f.abils !== undefined) {
        if (Array.isArray(f.abils) && f.abils.every(a => ABILS.includes(a as Abil))) abils = f.abils as Abil[]; else e.push(`${p}.abils: must be a list of abilities`);
      }
      for (const k of ["noShield", "withArmor"] as const) if (f[k] !== undefined && typeof f[k] !== "boolean") e.push(`${p}.${k}: must be true or false`);
      if (e.length === before) out.acFormula = { base: f.base as number, ...(abils ? { abils } : {}), ...(f.noShield === true ? { noShield: true } : {}), ...(f.withArmor === true ? { withArmor: true } : {}) };
    }
  }
  if (v.armorDexMax !== undefined) { if (whole(v.armorDexMax, 2) && (v.armorDexMax as number) <= 10) out.armorDexMax = v.armorDexMax as number; else e.push(`${at}.armorDexMax: must be a whole number from 2 to 10`); }
  if (v.attacks !== undefined) { const fe = checkFormula(v.attacks); if (fe) e.push(`${at}.attacks: ${fe}`); else out.attacks = v.attacks as number | string; }
  if (v.senses !== undefined) {
    if (!isObj(v.senses)) e.push(`${at}.senses: must be a mapping such as { darkvision: 60 }`);
    else {
      const s: NonNullable<Effects["senses"]> = {};
      for (const [k, n] of Object.entries(v.senses)) {
        if (!(SENSES as readonly string[]).includes(k)) e.push(`${at}.senses.${k}: unknown sense; use ${SENSES.join(", ")}`);
        else if (!whole(n, 1)) e.push(`${at}.senses.${k}: must be a distance in feet`);
        else s[k as (typeof SENSES)[number]] = n as number;
      }
      if (Object.keys(s).length) out.senses = s;
    }
  }
  if (v.speeds !== undefined) {
    if (!isObj(v.speeds)) e.push(`${at}.speeds: must be a mapping such as { fly: walk }`);
    else {
      const s: NonNullable<Effects["speeds"]> = {};
      for (const [k, n] of Object.entries(v.speeds)) {
        if ((SPEEDS as readonly string[]).includes(k)) { if (n === "walk" || whole(n, 1)) s[k as (typeof SPEEDS)[number]] = n as number | "walk"; else e.push(`${at}.speeds.${k}: must be a distance in feet or walk`); }
        else if (k === "hover") { if (typeof n === "boolean") { if (n) s.hover = true; } else e.push(`${at}.speeds.hover: must be true or false`); }
        else e.push(`${at}.speeds.${k}: unknown speed; use ${SPEEDS.join(", ")}, hover`);
      }
      if (Object.keys(s).length) out.speeds = s;
    }
  }
  if (v.abilityBonus !== undefined) {
    if (!isObj(v.abilityBonus)) e.push(`${at}.abilityBonus: must be a mapping such as { str: 4 }`);
    else {
      const b: NonNullable<Effects["abilityBonus"]> = {};
      for (const [k, f] of Object.entries(v.abilityBonus)) {
        if (!ABILS.includes(k as Abil)) { e.push(`${at}.abilityBonus.${k}: unknown ability`); continue; }
        const fe = checkFormula(f); if (fe) e.push(`${at}.abilityBonus.${k}: ${fe}`); else b[k as Abil] = f as number | string;
      }
      if (Object.keys(b).length) out.abilityBonus = b;
    }
  }
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const isList = (x: unknown): x is unknown[] => Array.isArray(x);
const abilList = (x: unknown): Abil[] | undefined => (isList(x) && x.length > 0 && x.every(a => ABILS.includes(a as Abil)) ? (x as Abil[]) : undefined);
/** Dice, a {scale} placeholder, or a Formula such as `prof`. */
const diceOrFormula = (x: unknown) => typeof x === "number" ? Number.isFinite(x) : typeof x === "string" && (checkDice(x) || checkFormula(x) === null);
const tag = (x: unknown) => typeof x === "string" && validRollTarget(x);

/** Each entry of a list-valued keyword is checked on its own; the good ones are kept and every bad one is reported. */
function eachOf<T>(v: unknown, at: string, e: Errs, one: (x: Record<string, unknown>, p: string) => T | undefined): T[] {
  if (!isList(v)) { e.push(`${at}: must be a list`); return []; }
  const out: T[] = [];
  v.forEach((x, i) => { if (!isObj(x)) { e.push(`${at}[${i}]: must be a mapping`); return; } const r = one(x, `${at}[${i}]`); if (r) out.push(r); });
  return out;
}

/** weaponRule, weapons, extraDamage, critDice, spellDamage, halfProf and d20Rule. */
function parseCombat(v: Record<string, unknown>, at: string, e: Errs, out: Effects): void {
  if (v.weaponRule !== undefined) {
    const list = eachOf<WeaponRule>(v.weaponRule, `${at}.weaponRule`, e, (x, p) => {
      const before = e.length;
      if (!(isList(x.match) && x.match.length > 0 && x.match.every(m => typeof m === "string" && (m === "all" || ID.test(m))))) e.push(`${p}.match: must be a list such as [monk, unarmed, offhand] or [all]`);
      const abils = x.abils === undefined ? undefined : abilList(x.abils); if (x.abils !== undefined && !abils) e.push(`${p}.abils: must be a list of abilities`);
      if (x.die !== undefined && !checkDice(x.die)) e.push(`${p}.die: must be dice such as 1d6 or {martial-arts-die}`);
      for (const k of ["magical", "addMod"] as const) if (x[k] !== undefined && typeof x[k] !== "boolean") e.push(`${p}.${k}: must be true or false`);
      if (x.note !== undefined && typeof x.note !== "string") e.push(`${p}.note: must be text`);
      if (x.abils === undefined && x.die === undefined && x.magical === undefined && x.addMod === undefined) e.push(`${p}: change something (abils, die, magical or addMod)`);
      if (e.length > before) return undefined;
      return { match: x.match as string[], ...(abils ? { abils } : {}), ...(typeof x.die === "string" ? { die: x.die.trim() } : {}), ...(x.magical === true ? { magical: true } : {}),
        ...(x.addMod === true ? { addMod: true } : {}), ...(typeof x.note === "string" ? { note: x.note } : {}) };
    });
    if (list.length) out.weaponRule = list;
  }
  if (v.weapons !== undefined) {
    const list = eachOf<NaturalWeapon>(v.weapons, `${at}.weapons`, e, (x, p) => {
      const before = e.length;
      if (typeof x.name !== "string" || !x.name.trim()) e.push(`${p}.name: must be text`);
      if (!checkDice(x.dmg)) e.push(`${p}.dmg: must be dice such as 1d6 or {scale-id}`);
      if (typeof x.type !== "string" || !x.type.trim()) e.push(`${p}.type: must be a damage type such as slashing`);
      const ab = x.ab === "finesse" || ABILS.includes(x.ab as Abil) ? x.ab as Abil | "finesse" : abilList(x.ab);
      if (!ab) e.push(`${p}.ab: must be an ability, finesse, or a list of abilities`);
      if (x.range !== undefined && x.range !== "melee" && x.range !== "ranged") e.push(`${p}.range: must be melee or ranged`);
      if (x.bonus !== undefined && !(typeof x.bonus === "number" ? Number.isFinite(x.bonus) : checkFormula(x.bonus) === null)) e.push(`${p}.bonus: must be a number or a formula`);
      if (x.tag !== undefined && !(typeof x.tag === "string" && ID.test(x.tag))) e.push(`${p}.tag: must be lowercase letters, digits and dashes`);
      if (e.length > before) return undefined;
      return { name: (x.name as string).trim(), dmg: (x.dmg as string).trim(), type: (x.type as string).trim(), ab: ab!, ...(x.range ? { range: x.range as "melee" | "ranged" } : {}),
        ...(x.bonus !== undefined ? { bonus: x.bonus as number | string } : {}), ...(typeof x.tag === "string" ? { tag: x.tag } : {}) };
    });
    if (list.length) out.weapons = list;
  }
  if (v.extraDamage !== undefined) {
    const list = eachOf<ExtraDamage>(v.extraDamage, `${at}.extraDamage`, e, (x, p) => {
      const before = e.length;
      if (!diceOrFormula(x.dice)) e.push(`${p}.dice: must be dice such as 1d8, a {scale-id}, or a formula such as prof`);
      if (typeof x.type !== "string" || !x.type.trim()) e.push(`${p}.type: must be a damage type such as radiant, or weapon`);
      if (x.on !== undefined && !tag(x.on)) e.push(`${p}.on: unknown roll tag ${String(x.on)}`);
      if (x.per !== undefined && x.per !== "turn" && x.per !== "hit") e.push(`${p}.per: must be turn or hit`);
      if (x.note !== undefined && typeof x.note !== "string") e.push(`${p}.note: must be text`);
      if (e.length > before) return undefined;
      return { dice: x.dice as string | number, type: (x.type as string).trim(), ...(typeof x.on === "string" ? { on: x.on } : {}), ...(x.per ? { per: x.per as "turn" | "hit" } : {}), ...(typeof x.note === "string" ? { note: x.note } : {}) };
    });
    if (list.length) out.extraDamage = list;
  }
  if (v.critDice !== undefined) {
    const list = eachOf<CritDice>(v.critDice, `${at}.critDice`, e, (x, p) => {
      const before = e.length, fe = checkFormula(x.extra);
      if (fe) e.push(`${p}.extra: ${fe}`);
      if (x.on !== undefined && !tag(x.on)) e.push(`${p}.on: unknown roll tag ${String(x.on)}`);
      return e.length > before ? undefined : { extra: x.extra as number | string, ...(typeof x.on === "string" ? { on: x.on } : {}) };
    });
    if (list.length) out.critDice = list;
  }
  if (v.spellDamage !== undefined) {
    const list = eachOf<SpellDamageBonus>(v.spellDamage, `${at}.spellDamage`, e, (x, p) => {
      const before = e.length;
      if (!diceOrFormula(x.add)) e.push(`${p}.add: must be dice such as 1d6 or a formula such as cha`);
      for (const k of ["spell", "school", "class"] as const) if (x[k] !== undefined && !(typeof x[k] === "string" && x[k])) e.push(`${p}.${k}: must be text`);
      if (x.level !== undefined && !(typeof x.level === "number" && Number.isInteger(x.level) && x.level >= 0 && x.level <= 9)) e.push(`${p}.level: must be a spell level from 0 to 9`);
      if (x.damageType !== undefined && !(isList(x.damageType) && x.damageType.length > 0 && x.damageType.every(t => typeof t === "string" && t))) e.push(`${p}.damageType: must be a list of damage types`);
      if (x.perBeam !== undefined && typeof x.perBeam !== "boolean") e.push(`${p}.perBeam: must be true or false`);
      if (e.length > before) return undefined;
      return { add: x.add as string | number, ...(typeof x.spell === "string" ? { spell: x.spell } : {}), ...(typeof x.level === "number" ? { level: x.level } : {}),
        ...(typeof x.school === "string" ? { school: x.school } : {}), ...(x.damageType ? { damageType: x.damageType as string[] } : {}), ...(typeof x.class === "string" ? { class: x.class } : {}),
        ...(x.perBeam === true ? { perBeam: true } : {}) };
    });
    if (list.length) out.spellDamage = list;
  }
  if (v.halfProf !== undefined) {
    const h = v.halfProf, p = `${at}.halfProf`;
    if (!isObj(h)) e.push(`${p}: must be { on, roundUp }`);
    else {
      const before = e.length;
      if (!(isList(h.on) && h.on.length > 0 && h.on.every(tag))) e.push(`${p}.on: must be a list of roll tags such as [check, initiative]`);
      if (h.roundUp !== undefined && typeof h.roundUp !== "boolean") e.push(`${p}.roundUp: must be true or false`);
      if (e.length === before) out.halfProf = { on: h.on as string[], ...(h.roundUp === true ? { roundUp: true } : {}) };
    }
  }
  if (v.d20Rule !== undefined) {
    const list = eachOf<D20Rule>(v.d20Rule, `${at}.d20Rule`, e, (x, p) => {
      const before = e.length;
      if (!tag(x.on)) e.push(`${p}.on: unknown roll tag ${String(x.on)}`);
      if (x.min !== undefined && !(typeof x.min === "number" && Number.isInteger(x.min) && x.min >= 2 && x.min <= 20)) e.push(`${p}.min: must be a whole number from 2 to 20`);
      if (x.reroll !== undefined && !(typeof x.reroll === "number" && Number.isInteger(x.reroll) && x.reroll >= 1 && x.reroll <= 19)) e.push(`${p}.reroll: must be a whole number from 1 to 19`);
      if (x.proficient !== undefined && typeof x.proficient !== "boolean") e.push(`${p}.proficient: must be true or false`);
      if (x.min === undefined && x.reroll === undefined) e.push(`${p}: give min or reroll`);
      if (e.length > before) return undefined;
      return { on: x.on as string, ...(typeof x.min === "number" ? { min: x.min } : {}), ...(typeof x.reroll === "number" ? { reroll: x.reroll } : {}), ...(x.proficient === true ? { proficient: true } : {}) };
    });
    if (list.length) out.d20Rule = list;
  }
}
