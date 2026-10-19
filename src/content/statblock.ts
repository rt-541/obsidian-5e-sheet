import { ABILS, type Abil } from "../core/types";
import { blankDraft, DAMAGE_TYPES, normalizeDice, type Draft, type DraftAttack } from "./creature-note";

/** A blank stat block in the standard layout, as a fenced block a note can hold. The "Copy template" button hands this out. */
export const STATBLOCK_TEMPLATE = [
  "```5e-statblock", "Creature Name", "Medium beast, unaligned", "Armor Class 12 (natural armor)", "Hit Points 9 (2d8)", "Speed 30 ft., climb 20 ft.", "",
  "STR DEX CON INT WIS CHA", "10 (+0) 12 (+1) 10 (+0) 2 (-4) 10 (+0) 4 (-3)", "",
  "Skills Perception +2, Stealth +4", "Senses darkvision 60 ft., passive Perception 12", "Languages --", "Challenge 1/4 (50 XP)", "",
  "Trait Name. Say what the trait does.", "", "Actions", "Bite. Melee Weapon Attack: +3 to hit, reach 5 ft., one creature. Hit: 4 (1d6 + 1) piercing damage.", "```", ""].join("\n");

export interface StatblockResult { draft: Draft; /** Lines that could not be understood, as written. */ unread: string[] }

const SIZE = /^(tiny|small|medium|large|huge|gargantuan)\b\s*(.*)$/i;
const SECTION = /^(actions|bonus actions|reactions|legendary actions|lair actions|traits)\.?$/i;
const SECTION_TAG: Record<string, string> = { "bonus actions": "Bonus action", reactions: "Reaction", "legendary actions": "Legendary action", "lair actions": "Lair action" };
const LABELS = "STR|DEX|CON|INT|WIS|CHA";
const ABIL_TOKEN = new RegExp(`\\b(${LABELS})\\b|(\\d{1,2})\\s*\\(\\s*[+-]?\\d+\\s*\\)|\\b(\\d{1,2})\\b`, "gi");
const FULL_ABIL: Record<string, Abil> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const SMALL_WORDS = new Set(["of", "the", "a", "an", "and", "to", "in", "on", "or", "at", "for", "from", "with"]);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fenceBody(text: string): string {
  const m = /```+[ \t]*5e-statblock[^\n]*\n([\s\S]*?)(?:\n[ \t]*```+|$)/i.exec(text) ?? /^\s*```+[^\n]*\n([\s\S]*?)(?:\n[ \t]*```+|$)/.exec(text);
  return m ? m[1] : text;
}

function cleanLine(raw: string): string {
  return raw.replace(/[​-‍﻿]/g, "").replace(/ /g, " ").replace(/[−–—‒]/g, "-")
    .replace(/\*+/g, "").replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "").replace(/^[\s>#•·▪●◦■□\-+]+/, "").replace(/\s+/g, " ").trim();
}

const num = (s: string) => parseInt(s.replace("+", ""), 10);
function damageClauses(text: string): { dice: string; type: string; end: number }[] {
  const out: { dice: string; type: string; end: number }[] = [];
  const re = /(\d+)(?:\s*\(\s*([^)]*?)\s*\))?\s+([a-z]+)\s+damage/gi;
  for (const m of text.matchAll(re)) {
    const type = m[3].toLowerCase(); if (!DAMAGE_TYPES.includes(type)) continue;
    const dice = m[2] && /\dd\d/i.test(m[2]) ? normalizeDice(m[2]) : m[1];
    out.push({ dice, type, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

function parseAction(name: string, text: string): DraftAttack | undefined {
  const atk = /(?:melee|ranged)(?: or (?:melee|ranged))?\s+(?:weapon|spell)\s+attack:?\s*([+-]\s?\d+)\s+to hit,?\s*(.*)/i.exec(text);
  const dc = /\bDC\s*(\d+)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+sav/i.exec(text);
  if (atk) {
    const rest = atk[2], hi = rest.search(/\bhit:/i);
    const reach = (hi >= 0 ? rest.slice(0, hi) : "").replace(/[\s.,]+$/, "").trim();
    const hit = hi >= 0 ? rest.slice(hi).replace(/^hit:\s*/i, "") : rest;
    const dcAt = hit.search(/\bDC\s*\d+/i), head = dcAt >= 0 ? hit.slice(0, dcAt) : hit;
    const clauses = damageClauses(head), last = clauses.at(-1);
    const tail = (last ? hit.slice(last.end) : hit).replace(/^[\s,.;]+(?:and |plus )?/i, "").trim();
    const note = [reach ? cap(reach) : "", cap(tail)].filter(Boolean).join(". ");
    return { name, toHit: num(atk[1].replace(/\s/g, "")), ...(clauses.length ? { damage: clauses.map(c => `${c.dice} ${c.type}`).join(" + ") } : {}), ...(note ? { note } : {}) };
  }
  if (dc) {
    const after = damageClauses(text.slice(dc.index ?? 0));
    return { name, save: { abil: FULL_ABIL[dc[2].toLowerCase()], dc: +dc[1] }, ...(after.length ? { damage: after.map(c => `${c.dice} ${c.type}`).join(" + ") } : {}), note: text };
  }
  return undefined;
}

/** A paragraph's "Name. text": the name is a few capitalised words. */
function paraStart(line: string): { name: string; text: string } | undefined {
  const m = /^([A-Z0-9][^.:]{0,70}?(?:\s*\([^)]*\))?)\.(?:\s+(\S.*)|\s*)$/.exec(line);
  if (!m) return undefined;
  const words = m[1].replace(/\([^)]*\)/g, "").trim().split(/\s+/);
  if (words.length > 8 || !words.every(w => /^[A-Z0-9]/.test(w) || SMALL_WORDS.has(w.toLowerCase()) || /^[(\d]/.test(w))) return undefined;
  if (!m[2] && words.length > 5) return undefined;
  return { name: m[1].trim(), text: m[2] ?? "" };
}

const damageWords = (v: string): string[] | undefined => {
  if (/nonmagical|non-magical|from|that aren|not made|while/i.test(v)) return undefined;
  const toks = v.toLowerCase().split(/[,;]|\band\b/).map(s => s.trim()).filter(Boolean);
  return toks.length && toks.every(t => DAMAGE_TYPES.includes(t)) ? toks : undefined;
};

/** Read a stat block (plain text in the 2014 layout, or the same text in a 5e-statblock fence) into a creature draft. */
export function parseStatblock(text: string): StatblockResult {
  const d = blankDraft(); d.speed = {};
  const unread: string[] = [];
  const lines = fenceBody(text).split(/\r?\n/).map(cleanLine);
  type Para = { section: string; name: string; text: string };
  const paras: Para[] = [];
  let section = "traits", cur: Para | undefined, prevBlank = true, sawName = false;
  const abilLabs: string[] = [], abilScores: number[] = [];
  let inAbil = false;

  const key = (label: RegExp, fn: (v: string) => void) => (line: string) => { const m = label.exec(line); if (!m) return false; fn(m[1].trim()); return true; };
  const keyed = [
    key(/^armor class\s+(.*)$/i, v => { const m = /^(\d+)\s*(?:\((.*?)\))?/.exec(v); if (m) { d.ac = +m[1]; if (m[2]) d.acNote = m[2]; } else unread.push(`Armor Class ${v}`); }),
    key(/^hit points\s+(.*)$/i, v => { const m = /^(\d+)\s*(?:\((.*?)\))?/.exec(v); if (m) { d.hpAvg = +m[1]; if (m[2]) d.hpFormula = normalizeDice(m[2]); } else unread.push(`Hit Points ${v}`); }),
    key(/^speed\s+(.*)$/i, v => {
      for (const part of v.split(/,\s*(?![^()]*\))/)) {
        const m = /^(?:(burrow|climb|fly|swim|walk)\s+)?(\d+)\s*(?:ft\.?|feet)/i.exec(part.trim());
        if (!m) { unread.push(`Speed ${part.trim()}`); continue; }
        const k = (m[1] ?? "walk").toLowerCase();
        if (k === "burrow") d.extras.push(`**Burrow speed** ${m[2]} ft.`); else d.speed[k as "walk"] = +m[2];
      }
    }),
    key(/^saving throws\s+(.*)$/i, v => { for (const m of v.matchAll(/(str|dex|con|int|wis|cha)\w*\s*([+-]?\d+)/gi)) d.saves[m[1].toLowerCase() as Abil] = num(m[2]); }),
    key(/^skills\s+(.*)$/i, v => { for (const m of v.matchAll(/([A-Za-z][A-Za-z ]*?)\s*([+-]\d+)/g)) d.skills[m[1].trim().toLowerCase().replace(/\s+/g, "-")] = num(m[2]); }),
    key(/^damage vulnerabilities\s+(.*)$/i, v => { d.extras.push(`**Damage Vulnerabilities** ${v}`); d.vulnerable.push(...(damageWords(v) ?? [])); }),
    key(/^damage resistances\s+(.*)$/i, v => { d.extras.push(`**Damage Resistances** ${v}`); d.resist.push(...(damageWords(v) ?? [])); }),
    key(/^damage immunities\s+(.*)$/i, v => { d.extras.push(`**Damage Immunities** ${v}`); d.immune.push(...(damageWords(v) ?? [])); }),
    key(/^condition immunities\s+(.*)$/i, v => { d.extras.push(`**Condition Immunities** ${v}`); d.conditionImmune.push(...v.toLowerCase().split(/[,;]|\band\b/).map(s => s.trim()).filter(s => /^[a-z]+$/.test(s))); }),
    key(/^senses\s+(.*)$/i, v => { d.senses = v; }),
    key(/^languages\s+(.*)$/i, v => { if (!/^[-\s]*$/.test(v)) d.languages = v; }),
    key(/^(?:challenge|cr)\s+(\d+(?:\/\d+)?)\b.*$/i, v => { d.cr = v; }),
    key(/^(proficiency bonus|initiative|passive perception)\b(.*)$/i, () => { /* derived, not stored */ }),
  ];

  const tryKeys = (line: string) => keyed.some(k => k(line));
  const hasLabel = (line: string) => /\b(STR|DEX|CON|INT|WIS|CHA)\b/i.test(line);
  const onlyAbilTokens = (line: string) => line.replace(ABIL_TOKEN, "").replace(/[\s|,]/g, "") === "" && [...line.matchAll(ABIL_TOKEN)].length > 0;
  let sawSize = false;

  for (const line of lines) {
    if (!line || /^[|:\s-]+$/.test(line)) { prevBlank = true; continue; }
    const wasBlank = prevBlank; prevBlank = false;
    if (!sawName) { sawName = true; if (!tryKeys(line)) d.name = line.replace(/\.$/, ""); continue; }
    if (abilScores.length < 6 && (inAbil || hasLabel(line)) && onlyAbilTokens(line)) {
      inAbil = true;
      for (const m of line.matchAll(ABIL_TOKEN)) { if (m[1]) abilLabs.push(m[1].toLowerCase()); else abilScores.push(+(m[2] ?? m[3])); }
      if (abilScores.length >= 6) inAbil = false;
      continue;
    }
    inAbil = false;
    if (!sawSize && !paras.length) {
      const m = SIZE.exec(line);
      if (m && !tryKeys(line)) {
        sawSize = true;
        const [typ, ...al] = m[2].split(/,\s*/);
        d.size = cap(m[1].toLowerCase()); d.ctype = typ.trim().toLowerCase() || "creature"; if (al.length) d.alignment = al.join(", ").trim();
        continue;
      }
    }
    const sec = SECTION.exec(line);
    if (sec) { section = sec[1].toLowerCase(); cur = undefined; continue; }
    if (section === "traits" && tryKeys(line)) continue;
    const start = paraStart(line);
    const endsSentence = !cur || /[.!?)"'”]$/.test(cur.text);
    if (start && (wasBlank || endsSentence)) { cur = { section, ...start }; paras.push(cur); continue; }
    if (cur && cur.section === section) { cur.text = `${cur.text} ${line}`.trim(); continue; }
    if (section === "legendary actions") { cur = { section, name: "Legendary actions", text: line }; paras.push(cur); continue; }
    unread.push(line);
  }

  if (abilScores.length) {
    const order = abilLabs.length === 6 ? (abilLabs as Abil[]) : ABILS;
    abilScores.slice(0, 6).forEach((s, i) => { if (order[i]) d.abilities[order[i]] = s; });
    if (abilScores.length < 6) unread.push(`Ability scores: found only ${abilScores.length} of 6`);
  } else unread.push("Ability scores (STR DEX CON INT WIS CHA)");

  for (const p of paras) {
    const text = p.text.trim();
    if (p.section === "actions" || p.section === "bonus actions") {
      const a = parseAction(p.name, text);
      if (a) { d.attacks.push(p.section === "bonus actions" ? { ...a, name: `${a.name} (Bonus action)` } : a); continue; }
    }
    const tag = SECTION_TAG[p.section];
    d.traits.push({ name: tag && !/^legendary actions$/i.test(p.name) ? `${p.name} (${tag})` : p.name, text });
  }
  return { draft: d, unread };
}
