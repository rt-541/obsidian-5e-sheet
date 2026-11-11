import { parseDice } from "../core/dice";
import type { Abil } from "../core/types";
import { normalizeDice } from "./creature-note";
import { slug } from "./registry";
import type { SpellData } from "./types/spell";

/** A spell as the "Create a spell" form and the spell-block reader hold it, before it is written to a note. Numbers and dice stay text until validated. */
export interface SpellDraft {
  name: string; level: number; school: string; castingTime: string; range: string;
  v: boolean; s: boolean; m: boolean; material: string;
  duration: string; concentration: boolean; ritual: boolean; classes: string[];
  /** The rules text. Goes in the note's body. */
  description: string; higherLevel: string;
  attack: "" | "melee" | "ranged";
  /** Damage dice at the spell's own level (a cantrip: at level 1 of the caster) and their type. */
  dice: string; dtype: string;
  /** Healing dice, and whether the caster's spellcasting modifier is added. */
  heal: string; healMod: boolean;
  /** The target makes a saving throw against the caster's spell save DC. */
  save: "" | Abil; onSuccess: "half" | "none";
}

export const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
export const LEVEL_LABELS = ["Cantrip", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];

export function blankSpellDraft(): SpellDraft {
  return { name: "", level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet", v: true, s: true, m: false, material: "", duration: "Instantaneous",
    concentration: false, ritual: false, classes: [], description: "", higherLevel: "", attack: "", dice: "", dtype: "", heal: "", healMod: false, save: "", onSuccess: "none" };
}

const diceOk = (d: string) => { try { parseDice(d); return true; } catch { return false; } };

/** Problems with a draft, in plain words. Empty means it can be saved. */
export function validateSpellDraft(d: SpellDraft): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Give the spell a name.");
  if (!Number.isInteger(d.level) || d.level < 0 || d.level > 9) e.push("Pick a level from Cantrip to 9th level.");
  if (!SCHOOLS.includes(d.school)) e.push("Pick a school of magic.");
  if (!d.castingTime.trim()) e.push("Say how long it takes to cast, like 1 action.");
  if (!d.range.trim()) e.push("Say how far it reaches, like 60 feet or Self.");
  if (!d.duration.trim()) e.push("Say how long it lasts, like Instantaneous or 1 minute.");
  if (d.m && !d.material.trim()) e.push("You ticked Material: say what the material is, or untick it.");
  if (!d.description.trim()) e.push("Describe what the spell does.");
  if (d.dice.trim()) {
    if (!diceOk(normalizeDice(d.dice))) e.push("Write the damage as dice, like 2d6 or 1d8+2.");
    if (!d.dtype) e.push("Pick the kind of damage (fire, cold ...).");
  } else if (d.dtype) e.push("You picked a damage type but no damage dice. Add the dice or clear the type.");
  if (d.heal.trim()) {
    if (!diceOk(normalizeDice(d.heal))) e.push("Write the healing as dice, like 1d8.");
    if (d.level < 1) e.push("Healing needs a spell of 1st level or higher.");
  }
  if (d.save && !d.dice.trim() && !d.heal.trim() && d.onSuccess === "half") e.push("'Half damage on a success' only makes sense when the spell has damage dice.");
  return e;
}

const norm = (s: string) => normalizeDice(s).replace(/\s+/g, "");

/** The note's frontmatter (the plugin's native spell fields) and its body (the rules text). */
export function spellDraftToNote(d: SpellDraft): { id: string; fm: Record<string, unknown>; body: string } {
  const name = d.name.trim(), id = slug(name);
  const fm: Record<string, unknown> = { type: "5e-spell", schema: 1, id, name, source: "Homebrew", ...Object.fromEntries(Object.entries(spellMechanics(d)).filter(([, v]) => v !== null)), tags: ["5e/spell", "5e/source/homebrew"] };
  return { id, fm, body: d.description.trim() };
}

/** The spell fields that the form owns: what an edit rewrites in an existing note. `null` marks a field to remove. */
export function spellMechanics(d: SpellDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: d.name.trim(), level: d.level, school: d.school, castingTime: d.castingTime.trim(), range: d.range.trim(),
    components: [d.v ? "V" : "", d.s ? "S" : "", d.m ? "M" : ""].filter(Boolean),
    material: d.m && d.material.trim() ? d.material.trim() : null,
    duration: d.duration.trim(), concentration: d.concentration, ritual: d.ritual, classes: [...d.classes],
    attack: d.attack || null, save: null, damage: null, heal: null, higherLevel: d.higherLevel.trim() || null,
  };
  if (d.save) out.save = { abil: d.save, onSuccess: d.dice.trim() ? d.onSuccess : "none" };
  if (d.dice.trim()) {
    const dice = norm(d.dice);
    out.damage = { type: d.dtype, ...(d.level >= 1 ? { bySlot: { [String(d.level)]: dice } } : { byCharLevel: { "1": dice } }) };
  }
  if (d.heal.trim()) out.heal = { bySlot: { [String(Math.max(1, d.level))]: norm(d.heal) + (d.healMod ? "+MOD" : "") } };
  return out;
}
/** Every key spellMechanics may write (an edit clears the ones the new draft leaves out). */
export const MECHANIC_KEYS = ["name", "level", "school", "castingTime", "range", "components", "material", "duration", "concentration", "ritual", "classes", "attack", "save", "damage", "heal", "higherLevel"];

/** A form draft for an existing spell. `rules` is the description unless `withoutText` (a copy of a library spell keeps only its mechanics). */
export function spellDataToDraft(data: SpellData, opts: { withoutText?: boolean; description?: string } = {}): SpellDraft {
  const first = (t: Record<string, string> | undefined, level: number) => {
    if (!t) return "";
    const k = Object.keys(t).map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const pick = t[String(level)] ?? t[String(k[0])] ?? "";
    return pick;
  };
  const heal = first(data.heal?.bySlot, Math.max(1, data.level));
  const dmg = data.damage ? (data.level >= 1 ? first(data.damage.bySlot, data.level) || first(data.damage.byCharLevel, 1) : first(data.damage.byCharLevel, 1) || first(data.damage.bySlot, 1)) : "";
  return { ...blankSpellDraft(), name: data.name, level: data.level, school: data.school, castingTime: data.castingTime, range: data.range,
    v: data.components.includes("V"), s: data.components.includes("S"), m: data.components.includes("M"), material: data.material ?? "",
    duration: data.duration, concentration: data.concentration, ritual: data.ritual, classes: [...data.classes],
    description: opts.withoutText ? "" : (opts.description ?? data.rules ?? ""), higherLevel: opts.withoutText ? "" : data.higherLevel ?? "",
    attack: data.attack ?? "", dice: dmg, dtype: data.damage?.type ?? "", heal: heal.replace(/\s*\+\s*MOD$/, "").replace(/^MOD$/, ""), healMod: /MOD/.test(heal),
    save: data.save?.abil ?? "", onSuccess: data.save?.onSuccess ?? "none" };
}
