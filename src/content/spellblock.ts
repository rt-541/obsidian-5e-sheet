import { DAMAGE_TYPES } from "./creature-note";
import { slug } from "./registry";
import { blankSpellDraft, SCHOOLS, type SpellDraft } from "./spell-note";
import type { Abil } from "../core/types";

/** A blank spell in the standard layout, as a fenced block a note can hold. The "Copy template" button hands this out. */
export const SPELLBLOCK_TEMPLATE = [
  "```5e-spell", "Spell Name", "1st-level evocation", "Casting Time: 1 action", "Range: 60 feet", "Components: V, S, M (a pinch of ash)", "Duration: Concentration, up to 1 minute",
  "Say what the spell does. Write damage and saving throws the way the books do, like 2d6 fire damage and a Dexterity saving throw, and the sheet fills in the dice for you.", "",
  "At Higher Levels. Say what changes when it is cast with a higher level slot.", "", "Classes: Wizard, Sorcerer", "```", ""].join("\n");

export interface SpellblockResult { draft: SpellDraft; /** Lines that could not be understood, as written. */ unread: string[] }

const FULL_ABIL: Record<string, Abil> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const FIELD = /^(casting time|range|components|duration)\b\s*[:.]?\s*(.*)$/i;
const LEVEL = /^(?:(\d)(?:st|nd|rd|th)[- ]level|level\s+(\d))\s+([a-z]+)(.*)$/i;
const CANTRIP = /^([a-z]+)\s+cantrip(.*)$/i;
const CLASSES = /^(?:spell lists?|classes|class list)\s*[:.]\s*(.*)$/i;
const HIGHER = /^at higher levels?\s*[:.]?\s*(.*)$/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fenceBody(text: string): string {
  const m = /```+[ \t]*5e-spell[^\n]*\n([\s\S]*?)(?:\n[ \t]*```+|$)/i.exec(text) ?? /^\s*```+[^\n]*\n([\s\S]*?)(?:\n[ \t]*```+|$)/.exec(text);
  return m ? m[1] : text;
}
/** One line without markdown emphasis, bullets, quote marks or odd spaces. */
function clean(raw: string): string {
  return raw.replace(/[​-‍﻿]/g, "").replace(/ /g, " ").replace(/\*+/g, "").replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
    .replace(/^[\s>#•·▪●◦■□\-+]+/, "").replace(/\s+/g, " ").trim();
}

/** Read one spell pasted in the usual 2014 layout (or a ```5e-spell block). Never throws: what it cannot read goes to `unread`. */
export function parseSpellblock(source: string): SpellblockResult {
  const d = blankSpellDraft(), unread: string[] = [];
  d.v = d.s = d.m = false; d.range = ""; d.castingTime = ""; d.duration = "";
  const lines = fenceBody(source).split(/\r?\n/).map(l => ({ raw: l.trim(), text: clean(l) }));
  const seen = new Set<string>();
  let started = false, haveName = false, desc = false, mode: "desc" | "higher" = "desc";
  const paras: Record<"desc" | "higher", string[]> = { desc: [], higher: [] };
  let open = false;   // the last line added to a paragraph, so the next line continues it
  const add = (m: "desc" | "higher", t: string) => { const p = paras[m]; if (open && p.length) p[p.length - 1] += ` ${t}`; else p.push(t); open = true; };

  for (const { raw, text } of lines) {
    if (!text) { open = false; if (desc && mode === "higher") mode = "desc"; continue; }
    const cls = CLASSES.exec(text);
    if (cls) { d.classes = cls[1].split(/\s*(?:,|;|\band\b|\/)\s*/i).map(slug).filter(Boolean); seen.add("classes"); open = false; continue; }
    if (!desc) {
      if (!haveName && !LEVEL.test(text) && !CANTRIP.test(text) && !FIELD.test(text)) { d.name = text.replace(/\.$/, ""); haveName = true; started = true; continue; }
      const lv = LEVEL.exec(text), ct = CANTRIP.exec(text);
      if ((lv || ct) && !seen.has("level")) {
        const school = cap((lv ? lv[3] : ct![1]).toLowerCase()), rest = lv ? lv[4] : ct![2];
        d.level = lv ? parseInt(lv[1] ?? lv[2], 10) : 0; d.ritual = /ritual/i.test(rest);
        if (SCHOOLS.includes(school)) d.school = school; else unread.push(raw);
        seen.add("level"); started = true; continue;
      }
      const f = FIELD.exec(text);
      if (f && (f[2] || /[:.]/.test(text.slice(f[1].length, f[1].length + 2)))) {
        const key = f[1].toLowerCase(), val = f[2].trim(); seen.add(key); started = true;
        if (key === "casting time") d.castingTime = val;
        else if (key === "range") d.range = val;
        else if (key === "duration") {
          const c = /^concentration\b[,;:]?\s*(.*)$/i.exec(val);
          if (c) { d.concentration = true; d.duration = c[1] ? cap(c[1]) : "Concentration"; } else d.duration = val;
        } else {
          const m = /\(([\s\S]*)\)\s*$/.exec(val), letters = (m ? val.slice(0, m.index) : val).toUpperCase();
          d.v = /\bV\b/.test(letters) || /\bVERBAL\b/.test(letters); d.s = /\bS\b/.test(letters) || /\bSOMATIC\b/.test(letters); d.m = /\bM\b/.test(letters) || /\bMATERIAL\b/.test(letters);
          if (m && m[1].trim()) { d.material = m[1].trim(); d.m = true; }
          if (!d.v && !d.s && !d.m && val) unread.push(raw);
        }
        continue;
      }
      // A short unknown line while the header is still incomplete is a header line we do not know ("Source: PHB"); anything longer is the text.
      const headerOpen = started && !(seen.has("casting time") && seen.has("range") && seen.has("components") && seen.has("duration"));
      if (!started || (headerOpen && text.length <= 40 && !/[.!?]$/.test(text))) { unread.push(raw); continue; }
      desc = true; mode = "desc";
    }
    const h = HIGHER.exec(text);
    if (h) { mode = "higher"; open = false; if (h[1]) add("higher", h[1]); continue; }
    add(mode, text);
  }
  d.description = paras.desc.join("\n\n"); d.higherLevel = paras.higher.join("\n\n");
  if (!haveName) unread.unshift("(no spell name found)");
  if (!seen.has("level")) unread.push("(no level and school line found, like '1st-level evocation' or 'Evocation cantrip')");
  detect(d);
  return { draft: d, unread };
}

/** Fill in attack, save, damage and healing when the text states them plainly. Anything unclear is left for the player to set. */
function detect(d: SpellDraft): void {
  const t = d.description;
  if (/ranged spell attack/i.test(t)) d.attack = "ranged"; else if (/melee spell attack/i.test(t)) d.attack = "melee";
  const sv = new RegExp(`\\b(${Object.keys(FULL_ABIL).join("|")})\\s+saving\\s+throw`, "i").exec(t);
  if (sv) { d.save = FULL_ABIL[sv[1].toLowerCase()]; d.onSuccess = /half as much damage|half damage|half the damage/i.test(t) ? "half" : "none"; }
  for (const m of t.matchAll(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-z]+)\s+damage/gi)) {
    const type = m[2].toLowerCase();
    if (DAMAGE_TYPES.includes(type)) { d.dice = m[1].replace(/\s+/g, ""); d.dtype = type; break; }
  }
  if (d.level >= 1) {
    const sentence = t.split(/(?<=[.!?])\s+/).find(x => /\b(regains?|restores?|heals?)\b/i.test(x) && /hit points/i.test(x));
    const dice = sentence && /(\d+d\d+(?:\s*[+-]\s*\d+)?)/.exec(sentence);
    if (sentence && dice) { d.heal = dice[1].replace(/\s+/g, ""); d.healMod = /spellcasting ability modifier/i.test(sentence); }
  }
}
