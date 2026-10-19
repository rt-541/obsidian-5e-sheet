import { parseDice } from "../core/dice";
import { slug } from "./registry";
import type { ItemData } from "./types";

/** A blank item in the usual layout, as a fenced block a note can hold. The "Copy template" button hands this out. */
export const ITEM_TEMPLATE = [
  "```5e-item", "Item Name", "Wondrous item, rare (requires attunement)", "Weight: 1 lb.", "Cost: 500 gp", "",
  "Say what the item does here.", "", "The item has 3 charges. It regains 1d3 expended charges daily at dawn.", "```", ""].join("\n");

export type ItemKind = ItemData["kind"];
export const ITEM_KINDS: { id: ItemKind; label: string }[] = [
  { id: "gear", label: "Gear" }, { id: "consumable", label: "Potion, scroll or other one-use item" }, { id: "wondrous", label: "Magic item" },
  { id: "weapon", label: "Weapon" }, { id: "armor", label: "Armor" }, { id: "shield", label: "Shield" },
];
export const RARITIES = ["", "common", "uncommon", "rare", "very rare", "legendary", "artifact"] as const;
export const CHARGE_RESETS = [{ id: "dawn", label: "at dawn" }, { id: "short", label: "after a short rest" }, { id: "long", label: "after a long rest" }, { id: "none", label: "never" }] as const;
export type ChargeReset = (typeof CHARGE_RESETS)[number]["id"];

/** An item as the import reader and the item form hold it, before it is written to a note. */
export interface ItemDraft {
  name: string; kind: ItemKind;
  /** The ordinary item a weapon or armor is a version of ("longsword", "plate"); its dice or armor class are copied from the compendium when it has it. */
  base?: string;
  rarity?: string; attunement: boolean; /** "by a wizard" */ attunementNote?: string;
  weight?: number; /** Price in copper pieces. */ value?: number; heal?: string;
  charges?: { max: number; reset: ChargeReset };
  attackBonus?: number; damageBonus?: number; acBonus?: number;
  description: string;
}
export const blankItemDraft = (): ItemDraft => ({ name: "", kind: "gear", attunement: false, description: "" });
export interface ItemBlockResult { draft: ItemDraft; /** Lines that could not be understood, as written. */ unread: string[] }

const KIND_OF: Record<string, ItemKind> = {
  "wondrous item": "wondrous", "wondrous items": "wondrous", weapon: "weapon", armor: "armor", armour: "armor", shield: "shield", potion: "consumable", scroll: "consumable",
  ammunition: "consumable", ring: "wondrous", rod: "wondrous", staff: "wondrous", wand: "wondrous", "adventuring gear": "gear", gear: "gear",
};
/** "Wondrous item, rare (requires attunement)", "Weapon (longsword), uncommon", "Armor (plate)": the kind, an optional (base), then after a comma the rarity. A name such as "Ring of Protection" does not match. */
const TYPE = /^(wondrous items?|weapon|armou?r|shield|potion|scroll|ring|rod|staff|wand|ammunition|adventuring gear|gear)\b\s*(?:\(([^)]*)\))?\s*(?:,\s*(.*))?$/i;
const RARITY = /\b(very rare|uncommon|common|rare|legendary|artifact)\b/i;
const COPPER: Record<string, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

function fenceBody(text: string): string {
  const m = /```+[ \t]*5e-item[^\n]*\n([\s\S]*?)(?:\n?[ \t]*```+|$)/i.exec(text) ?? /^\s*```+[^\n]*\n([\s\S]*?)(?:\n?[ \t]*```+|$)/.exec(text);
  return m ? m[1] : text;
}
/** One line with markdown bold and italics, bullets, odd spaces and the unicode minus sign cleaned away. */
function cleanLine(raw: string): string {
  return raw.replace(/[​-‍﻿]/g, "").replace(/ /g, " ").replace(/[−–—‒]/g, "-")
    .replace(/\*+/g, "").replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "").replace(/^[\s>#•·▪●◦■□\-+]+/, "").replace(/\s+/g, " ").trim();
}

/** Read an item pasted as plain text (or as a ```5e-item``` block) in the usual layout. Never throws; what it cannot read comes back in `unread`. */
export function parseItemBlock(text: string): ItemBlockResult {
  const lines = fenceBody(text).split(/\r?\n/).map(cleanLine);
  const d = blankItemDraft(), unread: string[] = [], rest: string[] = [];
  let i = 0;
  while (i < lines.length && !lines[i]) i++;
  if (i < lines.length && !TYPE.test(lines[i])) d.name = lines[i++];
  // the type line is among the next few lines: "Wondrous item, rare (requires attunement by a wizard)"; anything before it is unread
  const seen: number[] = [];
  let at = -1;
  for (let j = i; j < lines.length && seen.length < 4; j++) { if (!lines[j]) continue; seen.push(j); if (TYPE.test(lines[j])) { at = j; break; } }
  if (at >= 0) {
    for (const j of seen) if (j < at) unread.push(lines[j]);
    const line = lines[at], m = TYPE.exec(line)!;
    const word = m[1].toLowerCase(), inner = (m[2] ?? "").trim();
    d.kind = KIND_OF[word] ?? "gear";
    if (d.kind === "armor" && /^shield$/i.test(inner)) d.kind = "shield";
    const innerAtt = /^requires attunement/i.test(inner);
    if ((d.kind === "weapon" || d.kind === "armor") && inner && !innerAtt) d.base = inner.toLowerCase();
    const tail = `${innerAtt ? inner : ""} ${m[3] ?? ""}`, att = /requires attunement(?:\s+by\s+([^)]*))?/i.exec(tail), r = RARITY.exec(tail.replace(/\(.*$/, ""));
    if (r) d.rarity = r[1].toLowerCase();
    if (att) { d.attunement = true; if (att[1]?.trim()) d.attunementNote = `by ${att[1].trim()}`; }
    const leftover = tail.replace(/\(.*?\)/g, "").replace(/requires attunement(\s+by\s+[^),]*)?/i, "").replace(RARITY, "").replace(/[\s,;.]+/g, " ").trim();
    if (leftover) unread.push(line);
    i = at + 1;
  }
  for (; i < lines.length; i++) rest.push(lines[i]);

  const paras: string[] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.length) paras.push(cur.join(" ")); cur = []; };
  for (const line of rest) {
    if (!line) { flush(); continue; }
    const w = /^weight:?\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b\.?$/i.exec(line);
    if (w) { d.weight = Number(w[1]); continue; }
    const c = /^(?:cost|value|price):?\s*([\d,]+(?:\.\d+)?)\s*(pp|gp|ep|sp|cp)\b\.?$/i.exec(line);
    if (c) { d.value = Math.round(Number(c[1].replace(/,/g, "")) * COPPER[c[2].toLowerCase()]); continue; }
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s*\S/.test(line) && line.length <= 70 && !/\.\s+\S/.test(line)) { unread.push(line); continue; }
    cur.push(line);
  }
  flush();
  d.description = paras.join("\n\n");

  const all = paras.join(" ");
  const ch = /\b(?:has|with)\s+(\d+)\s+charges?\b/i.exec(all);
  if (ch) {
    const reset: ChargeReset = /regains?[^.]*\bdawn\b/i.test(all) ? "dawn" : /regains?[^.]*short rest/i.test(all) ? "short" : /regains?[^.]*long rest/i.test(all) ? "long" : "none";
    d.charges = { max: Number(ch[1]), reset };
  }
  const bonus = /\+(\d+)\s+bonus\s+to\s+(attack and damage|attack|damage)\b/i.exec(all);
  if (bonus) {
    const n = Number(bonus[1]), what = bonus[2].toLowerCase();
    if (what !== "damage") d.attackBonus = n;
    if (what !== "attack") d.damageBonus = n;
  }
  const ac = /\+(\d+)\s+bonus\s+to\s+(?:your\s+)?(?:AC|armor class)\b/i.exec(all);
  if (ac) d.acBonus = Number(ac[1]);
  const heal = /\bregains?\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+hit points\b/i.exec(all);
  if (heal) d.heal = heal[1].replace(/\s+/g, "");
  return { draft: d, unread };
}

/** Problems with an item draft, in plain words. Empty means it can be saved. */
export function validateItemDraft(d: ItemDraft): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Give the item a name.");
  if (d.weight !== undefined && (!Number.isFinite(d.weight) || d.weight < 0)) e.push("Weight is in pounds: use a number like 2 or 0.5, or leave it empty.");
  if (d.charges && (!Number.isInteger(d.charges.max) || d.charges.max < 1)) e.push("Charges must be a whole number, 1 or more (or leave it empty).");
  for (const [k, label] of [["attackBonus", "attack"], ["damageBonus", "damage"], ["acBonus", "Armor Class"]] as const) {
    const v = d[k]; if (v !== undefined && (!Number.isInteger(v) || v < -5 || v > 10)) e.push(`The ${label} bonus must be a whole number, like 1.`);
  }
  if (d.heal) { try { parseDice(d.heal); } catch { e.push("Healing should be dice, like 2d4+2."); } }
  return e;
}

const sgnWord = (n: number) => (n >= 0 ? `+${n}` : String(n));
/** The line under the name, in the usual layout. */
export function typeLine(d: ItemDraft): string {
  const kind = { gear: "Adventuring gear", consumable: "Potion or scroll", wondrous: "Wondrous item", weapon: "Weapon", armor: "Armor", shield: "Armor (shield)" }[d.kind];
  const base = (d.kind === "weapon" || d.kind === "armor") && d.base ? ` (${d.base})` : "";
  return `${kind}${base}${d.rarity ? `, ${d.rarity}` : ""}${d.attunement ? ` (requires attunement${d.attunementNote ? ` ${d.attunementNote}` : ""})` : ""}`;
}

/**
 * The note's frontmatter (the plugin's native item fields) and a readable markdown body. A weapon or armor with a base takes its dice or armor class
 * from that ordinary item when `find` knows it; otherwise it becomes a magic item whose bonuses still count while it is worn or wielded.
 */
export function draftToItemNote(d: ItemDraft, find?: (id: string) => ItemData | undefined): { id: string; fm: Record<string, unknown>; body: string } {
  const name = d.name.trim(), id = slug(name);
  const base = d.base ? [slug(d.base), slug(`${d.base} armor`)].map(k => find?.(k)).find(Boolean) : undefined;
  const mods: { target: string; value: number }[] = [];
  let kind: ItemKind = d.kind;
  const fm: Record<string, unknown> = { type: "5e-item", schema: 1, id, name, source: "Homebrew" };
  const note: string[] = [];
  if (kind === "weapon") {
    const same = d.attackBonus !== undefined && d.attackBonus === d.damageBonus;
    if (base?.weapon) { fm.weapon = { ...base.weapon, ...(same && d.attackBonus ? { bonus: d.attackBonus } : {}) }; if (!same) { if (d.attackBonus) mods.push({ target: "attack", value: d.attackBonus }); if (d.damageBonus) mods.push({ target: "damage", value: d.damageBonus }); } }
    else { kind = "wondrous"; if (d.base) note.push(`Based on: ${d.base}`); if (d.attackBonus) mods.push({ target: "attack", value: d.attackBonus }); if (d.damageBonus) mods.push({ target: "damage", value: d.damageBonus }); }
  } else {
    if (d.attackBonus) mods.push({ target: "attack", value: d.attackBonus });
    if (d.damageBonus) mods.push({ target: "damage", value: d.damageBonus });
  }
  if (kind === "armor") {
    if (base?.armor) fm.armor = { ...base.armor }; else { kind = "wondrous"; if (d.base) note.push(`Based on: ${d.base}`); }
  }
  if (kind === "shield") mods.push({ target: "ac", value: 2 + (d.acBonus ?? 0) });
  else if (d.acBonus) mods.push({ target: "ac", value: d.acBonus });
  fm.kind = kind;
  if (d.rarity) fm.rarity = d.rarity;
  fm.attunement = d.attunement;
  fm.weight = d.weight ?? base?.weight ?? 0;
  if (d.value !== undefined) fm.value = d.value;
  if (mods.length) fm.effects = { modifiers: mods };
  if (d.charges) fm.charges = { max: d.charges.max, reset: d.charges.reset };
  if (d.heal) fm.heal = d.heal;
  const text = [d.description.trim(), ...note].filter(Boolean).join("\n\n");
  if (text) fm.rules = text;
  fm.tags = ["5e/item", "5e/source/homebrew"];
  const extra = [d.acBonus && kind !== "shield" ? `${sgnWord(d.acBonus)} to AC` : "", d.charges ? `${d.charges.max} charges` : ""].filter(Boolean);
  const body = [`# ${name}`, "", `*${typeLine(d)}*`, ...(extra.length ? ["", extra.join(" · ")] : []), ...(text ? ["", text] : [])].join("\n");
  return { id, fm, body };
}
