import { ABILS, type Abil } from "../core/types";
import { parseDice } from "../core/dice";
import { slug } from "./registry";

/** A creature as the "Add custom creature" form and the stat-block reader hold it, before it is written to a note. */
export interface DraftAttack { name: string; toHit?: number; save?: { abil: Abil; dc: number }; /** Dice with their type, e.g. "1d6+1 piercing". */ damage?: string; note?: string }
export interface Draft {
  name: string; size: string; ctype: string; alignment?: string;
  ac?: number; acNote?: string; hpAvg?: number; hpFormula?: string;
  speed: { walk?: number; climb?: number; fly?: number; swim?: number };
  abilities: Record<Abil, number>; saves: Partial<Record<Abil, number>>; skills: Record<string, number>;
  senses?: string; languages?: string; cr?: string;
  resist: string[]; immune: string[]; vulnerable: string[]; conditionImmune: string[];
  /** Lines the sheet has no field for (burrow speed, languages ...): kept in the note's text. */
  extras: string[];
  attacks: DraftAttack[]; traits: { name: string; text: string }[];
}

export const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
export const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
export const ABIL_NAMES: Record<Abil, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export function blankDraft(): Draft {
  return { name: "", size: "Medium", ctype: "beast", speed: { walk: 30 }, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {}, skills: {}, resist: [], immune: [], vulnerable: [], conditionImmune: [], extras: [], attacks: [], traits: [] };
}

/** Tidy dice the way the sheet reads them: "2d8 + 2" becomes "2d8+2", and extra damage parts are joined with " + ". */
export function normalizeDice(s: string): string {
  return s.trim().toLowerCase().replace(/(\d)\s*([+-])\s*(\d)/g, "$1$2$3").replace(/([a-z]{3,})\s*\+\s*/g, "$1 + ").replace(/\s+/g, " ");
}
/** The damage text stored on an attack: dice plus their type ("1d6+1" and "piercing" give "1d6+1 piercing"). */
export function joinDamage(dice: string, type: string): string {
  const d = normalizeDice(dice);
  return d && type && !/\s[a-z]+/.test(d) ? `${d} ${type}` : d;
}
/** Split stored damage back into the form's two boxes. Several parts stay together in the dice box. */
export function splitDamage(damage: string | undefined): { dice: string; type: string } {
  const m = /^(\S+) ([a-z]+)$/.exec(damage ?? "");
  return m ? { dice: m[1], type: m[2] } : { dice: damage ?? "", type: "" };
}
const damageOk = (d: string) => { try { parseDice(d); return true; } catch { return false; } };
const FORMULA = /^\d{1,2}d\d{1,3}(\s*[+-]\s*\d{1,3})?$/;

/** Problems with a draft, in plain words. Empty means it can be saved. */
export function validateDraft(d: Draft): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Give the creature a name.");
  if (d.ac === undefined || !Number.isInteger(d.ac) || d.ac < 1 || d.ac > 40) e.push("Armor Class must be a whole number, like 12.");
  if (d.hpAvg === undefined || !Number.isInteger(d.hpAvg) || d.hpAvg < 1) e.push("Hit Points must be a whole number, like 9.");
  if (d.hpFormula && !FORMULA.test(d.hpFormula.trim())) e.push("Hit Point dice should look like 2d8+2 (or leave it empty).");
  for (const a of ABILS) { const v = d.abilities[a]; if (!Number.isInteger(v) || v < 1 || v > 30) e.push(`${ABIL_NAMES[a]} must be a number from 1 to 30.`); }
  for (const k of ["walk", "climb", "fly", "swim"] as const) { const v = d.speed[k]; if (v !== undefined && (!Number.isInteger(v) || v < 0)) e.push(`The ${k} speed must be a number of feet, like 30.`); }
  if (d.cr !== undefined && d.cr !== "" && !/^(\d{1,2}|1\/[248])$/.test(d.cr)) e.push("Challenge should be a number like 2, or 1/2, 1/4, 1/8.");
  d.attacks.forEach((a, i) => {
    const n = a.name.trim() || `Attack ${i + 1}`;
    if (!a.name.trim()) e.push(`Attack ${i + 1} needs a name.`);
    if (a.toHit !== undefined && !Number.isInteger(a.toHit)) e.push(`${n}: the to-hit bonus must be a whole number, like +3.`);
    if (a.damage && !damageOk(a.damage)) e.push(`${n}: write the damage as dice, like 1d6+1.`);
  });
  d.traits.forEach((t, i) => { if (!t.name.trim() && t.text.trim()) e.push(`Trait ${i + 1} needs a name.`); });
  return e;
}

const known = new Set(DAMAGE_TYPES);
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The note's frontmatter (the plugin's native creature fields) and a readable markdown body. */
export function draftToNote(d: Draft): { id: string; fm: Record<string, unknown>; body: string } {
  const name = d.name.trim(), id = slug(name);
  const speed: Record<string, number> = { walk: d.speed.walk ?? 0 };
  for (const k of ["climb", "fly", "swim"] as const) if (d.speed[k]) speed[k] = d.speed[k]!;
  const effects: Record<string, string[]> = {};
  const res = d.resist.filter(x => known.has(x)), imm = d.immune.filter(x => known.has(x)), vul = d.vulnerable.filter(x => known.has(x));
  if (res.length) effects.resist = res;
  if (imm.length) effects.immune = imm;
  if (vul.length) effects.vulnerable = vul;
  if (d.conditionImmune.length) effects.conditionImmune = d.conditionImmune;
  const fm: Record<string, unknown> = { type: "5e-creature", schema: 1, id, name, source: "Homebrew", size: d.size, ctype: d.ctype.trim() || "creature",
    ac: d.ac, hp: { average: d.hpAvg, formula: (d.hpFormula ?? "").trim() }, speed, abilities: { ...d.abilities } };
  if (Object.keys(d.saves).length) fm.saves = { ...d.saves };
  if (Object.keys(d.skills).length) fm.skills = { ...d.skills };
  if (d.senses?.trim()) fm.senses = d.senses.trim();
  if (d.cr?.trim()) fm.cr = d.cr.trim();
  if (d.attacks.length) fm.attacks = d.attacks.map(a => ({ name: a.name.trim(), ...(a.toHit !== undefined ? { toHit: a.toHit } : {}), ...(a.save ? { save: a.save } : {}),
    ...(a.damage ? { damage: a.damage } : {}), ...(a.note?.trim() ? { note: a.note.trim() } : {}) }));
  const traits = d.traits.filter(t => t.name.trim());
  if (traits.length) fm.traits = traits.map(t => ({ name: t.name.trim(), text: t.text.trim() }));
  if (Object.keys(effects).length) fm.effects = effects;
  fm.tags = ["5e/creature", "5e/source/homebrew"];
  return { id, fm, body: draftBody(d, traits) };
}

function draftBody(d: Draft, traits: { name: string; text: string }[]): string {
  const speeds = [`${d.speed.walk ?? 0} ft.`, ...(["climb", "fly", "swim"] as const).filter(k => d.speed[k]).map(k => `${k} ${d.speed[k]} ft.`)].join(", ");
  const lines = [`*${[d.size, d.ctype.trim() || "creature"].join(" ")}${d.alignment ? `, ${d.alignment}` : ""}*`, "",
    `**Armor Class** ${d.ac}${d.acNote ? ` (${d.acNote})` : ""}  `, `**Hit Points** ${d.hpAvg}${d.hpFormula?.trim() ? ` (${d.hpFormula.trim()})` : ""}  `, `**Speed** ${speeds}  `, "",
    ABILS.map(a => `**${a.toUpperCase()}** ${d.abilities[a]}`).join(" · ")];
  const info: string[] = [];
  const list = (label: string, v: string) => { if (v) info.push(`**${label}** ${v}  `); };
  list("Saving Throws", ABILS.filter(a => d.saves[a] !== undefined).map(a => `${capFirst(a)} ${sgn(d.saves[a]!)}`).join(", "));
  list("Skills", Object.entries(d.skills).map(([k, v]) => `${capFirst(k.replace(/-/g, " "))} ${sgn(v)}`).join(", "));
  list("Senses", d.senses?.trim() ?? ""); list("Languages", d.languages?.trim() ?? ""); list("Challenge", d.cr?.trim() ?? "");
  if (info.length) lines.push("", ...info);
  if (d.extras.length) lines.push("", ...d.extras.map(x => `${x}  `));
  if (traits.length) lines.push("", "## Traits", "", ...traits.map(t => `***${t.name.trim().replace(/\.$/, "")}.*** ${t.text.trim()}`.trim()).flatMap(x => [x, ""]).slice(0, -1));
  if (d.attacks.length) lines.push("", "## Actions", "", ...d.attacks.map(a => {
    const bits = [a.toHit !== undefined ? `${sgn(a.toHit)} to hit.` : "", a.save ? `DC ${a.save.dc} ${ABIL_NAMES[a.save.abil]} saving throw.` : "", a.damage ? `Hit: ${a.damage} damage.` : "", a.note?.trim() ?? ""].filter(Boolean);
    return `***${a.name.trim().replace(/\.$/, "")}.*** ${bits.join(" ")}`.trim() + "\n";
  }));
  return lines.join("\n").trim();
}

/** `Name`, `Name (2)`, `Name (3)` ... the first name for which `taken` is false. */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let i = 2; i < 1000; i++) if (!taken(`${name} (${i})`)) return `${name} (${i})`;
  throw new Error(`Too many creatures called ${name}`);
}
