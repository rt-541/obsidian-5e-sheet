import { parseDice } from "../core/dice";
import { ABILS, type Abil } from "../core/types";
import { recognizeVariant } from "./item-variant";

/**
 * Library adapter: maps notes written by the dnd-compendium generator (snake_case schema 1, under compendium/5e/WotC)
 * to the plugin's content data. Two stages so the startup index never reads a note body:
 *   libraryMeta  - frontmatter and tags only (cheap, run for every note at startup)
 *   libraryBody  - adds what only the text knows (damage dice, attacks, rules text); run lazily when an entry is opened
 * Anything that fails validation afterwards becomes a reference-only entry, never a compendium problem.
 */
export type Raw = Record<string, unknown>;
export interface LibraryMeta { raw: Raw; book?: string; needsReview?: string[]; }

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tagList = (fm: Raw): string[] => (Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === "string") : []);
const put = (o: Raw, k: string, v: unknown) => { if (v !== undefined) o[k] = v; };

const ITEM_KINDS: Record<string, string> = {
  weapon: "weapon", armor: "armor", shield: "shield", "wondrous item": "wondrous", potion: "consumable", scroll: "consumable", ammunition: "consumable",
  ring: "wondrous", rod: "wondrous", staff: "wondrous", wand: "wondrous",
};
const DAMAGE_TYPES = new Set(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);

function components(v: unknown): string[] {
  const head = (text(v) ?? "").split("(")[0];
  return head.split(",").map(s => s.trim().toUpperCase()).filter(s => s === "V" || s === "S" || s === "M");
}
function speed(v: unknown): Raw {
  const s = text(v) ?? "", out: Raw = {};
  const walk = /^\s*(\d+)\s*ft/i.exec(s);
  out.walk = walk ? Number(walk[1]) : 0;
  for (const m of ["fly", "swim", "climb"]) { const x = new RegExp(`\\b${m}\\s+(\\d+)`, "i").exec(s); if (x) out[m] = Number(x[1]); }
  return out;
}

export function libraryMeta(type: string, fm: Raw): LibraryMeta {
  const raw: Raw = {};
  put(raw, "id", text(fm.id)); put(raw, "name", text(fm.name));
  const tags = tagList(fm);
  switch (type) {
    case "spell": {
      raw.level = fm.level; put(raw, "school", text(fm.school) && cap(text(fm.school)!)); put(raw, "castingTime", text(fm.casting_time));
      put(raw, "range", text(fm.range)); raw.components = components(fm.components); put(raw, "material", text(fm.material));
      put(raw, "duration", text(fm.duration)); raw.concentration = fm.concentration === true; raw.ritual = fm.ritual === true;
      raw.classes = Array.isArray(fm.classes) ? fm.classes.filter((c): c is string => typeof c === "string") : [];
      const save = tags.map(t => /^5e\/save\/([a-z]{3})$/.exec(t)?.[1]).find((a): a is Abil => !!a && ABILS.includes(a as Abil));
      if (save) raw.save = { abil: save, onSuccess: "none" };
      const dmg = tags.map(t => /^5e\/damage\/([a-z]+)$/.exec(t)?.[1]).find(Boolean);
      if (dmg) raw.damage = { type: dmg };
      break;
    }
    case "item": {
      // The importer writes the plugin-native kind, weapon, armor, effects and charges where the data has them.
      raw.kind = text(fm.kind) ?? ITEM_KINDS[(text(fm.item_type) ?? "").toLowerCase()] ?? "gear";
      put(raw, "rarity", text(fm.rarity)); raw.attunement = fm.attunement === true;
      if (typeof fm.weight === "number") raw.weight = fm.weight;
      if (typeof fm.value === "number") raw.value = fm.value;
      for (const k of ["weapon", "armor", "effects", "charges", "attackOption", "variant"] as const) if (isObj(fm[k])) raw[k] = fm[k];
      if (text(fm.heal)) raw.heal = text(fm.heal);
      break;
    }
    case "creature": {
      put(raw, "size", text(fm.size)); put(raw, "ctype", text(fm.creature_type)); raw.ac = fm.ac;
      raw.hp = { average: fm.hp, ...(text(fm.hp_formula) ? { formula: text(fm.hp_formula) } : {}) };
      raw.speed = speed(fm.speed); raw.abilities = isObj(fm.abilities) ? fm.abilities : undefined;
      put(raw, "saves", isObj(fm.saves) ? fm.saves : undefined); put(raw, "skills", isObj(fm.skills) ? fm.skills : undefined);
      put(raw, "senses", text(fm.senses));
      const env = Array.isArray(fm.environment) ? fm.environment : text(fm.environment) ? [text(fm.environment)] : [];
      if (env.length) raw.environment = env;
      put(raw, "copied_from", text(fm.copied_from));
      const cr = fm.cr === undefined ? undefined : String(fm.cr); put(raw, "cr", cr);
      break;
    }
    case "condition": case "injury": if (text(fm.condition_kind)?.toLowerCase() === "disease") raw.kind = "disease"; break;
    default: break;   // conditions: name only here, effects come from a bundled SRD condition of the same id (see VaultLoader)
  }
  const review = Array.isArray(fm.needs_review) ? fm.needs_review.filter((x): x is string => typeof x === "string") : [];
  return { raw, ...(text(fm.source) ? { book: text(fm.source) } : {}), ...(review.length ? { needsReview: review } : {}) };
}

/** Wikilinks to plain text, embeds dropped, generator heading / meta lines / source footer removed. */
export function cleanBody(body: string): string {
  let t = body.replace(/\r/g, "");
  const foot = t.lastIndexOf("\n---\n"); if (foot >= 0 && /^\s*\*Source:/.test(t.slice(foot + 5))) t = t.slice(0, foot);
  t = t.replace(/!\[\[[^\]]*\]\]/g, "").replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, (_m, p: string) => p.split("/").pop() ?? p);
  const lines = t.split("\n"); let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (/^# /.test(lines[i] ?? "")) i++;
  while (i < lines.length && !lines[i].trim()) i++;
  if (/^\*[^*].*\*\s*$/.test(lines[i] ?? "")) i++;          // *1st-level abjuration* / *Wondrous item, rare*
  while (i < lines.length && (!lines[i].trim() || /^\*\*(Casting Time|Range|Components|Duration):\*\*/.test(lines[i]))) i++;
  return lines.slice(i).join("\n").trim();
}

const norm = (d: string) => d.replace(/\s+/g, "");
const dice = (d: string) => { try { parseDice(norm(d).replace(/MOD/g, "0")); return true; } catch { return false; } };
const ordinalSlots = (from: number): number[] => Array.from({ length: Math.max(0, 9 - from + 1) }, (_, i) => from + i);
/** "3d8" at slot 3 plus "1d8 per slot above" -> slots 3..9. Only when the die matches and there is no flat part. */
function bySlot(level: number, base: string, inc: string | undefined): Record<string, string> {
  const out: Record<string, string> = { [String(level)]: base };
  const b = /^(\d+)d(\d+)(\+MOD)?$/.exec(norm(base)), i = inc ? /^(\d+)d(\d+)$/.exec(norm(inc)) : null;
  if (b && i && b[2] === i[2]) for (const s of ordinalSlots(level + 1)) out[String(s)] = `${Number(b[1]) + Number(i[1]) * (s - level)}d${b[2]}${b[3] ?? ""}`;
  return out;
}

function spellFromBody(raw: Raw, body: string): Raw {
  const out: Raw = { ...raw };
  const paras = cleanBody(body).split(/\n\s*\n/);
  const hi = paras.findIndex(p => /^\W*At Higher Levels\b/i.test(p));
  const higher = hi >= 0 ? paras[hi].replace(/^\W*At Higher Levels\W*/i, "").trim() : undefined;
  const main = paras.filter((_p, k) => k !== hi).join("\n\n").trim();
  if (main) out.rules = main;
  if (higher) out.higherLevel = higher;
  const level = typeof raw.level === "number" ? raw.level : 0;
  const inc = (re: RegExp) => re.exec(higher ?? "")?.[1];

  const melee = /melee spell attack/i.test(main), ranged = /ranged spell attack/i.test(main);
  if (melee !== ranged) out.attack = melee ? "melee" : "ranged";
  if (/half as much damage|half damage/i.test(main) && isObj(out.save)) out.save = { ...out.save, onSuccess: "half" };

  const tagType = isObj(raw.damage) ? String(raw.damage.type) : undefined;
  const hits = [...main.matchAll(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-z]+)\s+damage/gi)]
    .map(m => ({ d: norm(m[1]), t: m[2].toLowerCase() })).filter(h => DAMAGE_TYPES.has(h.t) && (!tagType || h.t === tagType) && dice(h.d));
  const uniq = new Set(hits.map(h => h.d));
  if (level > 0 && uniq.size === 1) {
    const type = tagType ?? hits[0].t;
    out.damage = { type, bySlot: bySlot(level, hits[0].d, inc(/damage increases by (\d+d\d+)/i)) };
  } else if (level === 0 && uniq.size === 1) {
    // Cantrips: "increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10)";
    // without that sentence (a cantrip that adds beams instead) the dice stay the same at every tier.
    const base = hits[0].d, tiers = /5th level \((\d+d\d+)\),\s*11th level \((\d+d\d+)\),?\s*and 17th level \((\d+d\d+)\)/i.exec(main);
    out.damage = { type: tagType ?? hits[0].t, byCharLevel: { "1": base, "5": tiers ? norm(tiers[1]) : base, "11": tiers ? norm(tiers[2]) : base, "17": tiers ? norm(tiers[3]) : base } };
  }
  const heal = /regains? (?:a number of )?hit points equal to (\d+d\d+)(\s*\+\s*your spellcasting ability modifier)?/i.exec(main);
  if (heal && level > 0) out.heal = { bySlot: bySlot(level, `${heal[1]}${heal[2] ? "+MOD" : ""}`, inc(/healing increases by (\d+d\d+)/i)) };
  return out;
}

const ABIL_NAMES: Record<string, Abil> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
/** Attack-like entries of the `## Actions` section: "+N to hit", "Hit: X (NdM + K) type damage", "DC N <Ability> saving throw". */
export function creatureAttacks(body: string): Raw[] {
  const m = /^## Actions\s*$/m.exec(body); if (!m) return [];
  const rest = body.slice(m.index + m[0].length), end = rest.search(/^## /m);
  const section = end >= 0 ? rest.slice(0, end) : rest;
  const parts = section.split(/^\*\*\*(.+?)\.\*\*\*\s*/m);   // [pre, name, text, name, text...]
  const out: Raw[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const name = parts[i].trim(), t = parts[i + 1];
    const a: Raw = { name };
    const hit = /([+-]\d+) to hit/i.exec(t); if (hit) a.toHit = Number(hit[1]);
    const dm = /Hit:\*?\s*\d+\s*\(([^)]+)\)\s*([a-z]+)?\s*damage/i.exec(t);
    if (dm && dice(dm[1])) { a.damage = norm(dm[1]); if (dm[2]) a.note = dm[2].toLowerCase(); }
    else { const flat = /Hit:\*?\s*(\d+)\s+([a-z]+)\s+damage/i.exec(t); if (flat) { a.damage = flat[1]; a.note = flat[2].toLowerCase(); } }   // "Hit: 1 slashing damage"
    const sv = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(t);
    if (sv) a.save = { abil: ABIL_NAMES[sv[2].toLowerCase()], dc: Number(sv[1]) };
    if (a.toHit !== undefined || a.save) out.push(a);
  }
  return out;
}

/** Traits: the `***Name.*** text` entries before the first `## ` section (Flyby, Keen Hearing and Sight). */
export function creatureTraits(body: string): Raw[] {
  const end = body.search(/^## /m), head = end >= 0 ? body.slice(0, end) : body;
  return [...head.matchAll(/^\*\*\*(.+?)\.\*\*\*\s*(.*)$/gm)].map(m => ({ name: m[1].trim(), text: m[2].trim() }));
}

/** Stage two: patch the metadata-mapped raw with what the note text provides. */
export function libraryBody(type: string, raw: Raw, body: string): Raw {
  switch (type) {
    case "spell": return spellFromBody(raw, body);
    case "item": {
      const rules = cleanBody(body), withRules = rules ? { ...raw, rules } : raw;
      if (withRules.variant !== undefined) return withRules;
      // The italic type line ("*Armor (any medium, heavy), uncommon*") is dropped by cleanBody, so read it here.
      const line = body.replace(/\r/g, "").split("\n").map(l => l.trim()).find(l => /^\*[^*].*\*$/.test(l));
      const v = recognizeVariant(String(raw.name ?? ""), line?.slice(1, -1));
      return v ? { ...withRules, variant: v } : withRules;
    }
    case "mastery": { const rules = cleanBody(body); return rules ? { ...raw, rules } : raw; }
    case "condition": case "injury": { const rules = cleanBody(body); return rules ? { ...raw, rules } : raw; }
    case "creature": {
      const attacks = creatureAttacks(body), traits = creatureTraits(body);
      return { ...raw, ...(attacks.length ? { attacks } : {}), ...(traits.length ? { traits } : {}) };
    }
    default: return raw;
  }
}

/** Does a user note use the library's snake_case spelling for this type? Only then is the adapter run on it. */
function usesLibrarySchema(type: string, fm: Raw): boolean {
  switch (type) {
    case "spell": return fm.casting_time !== undefined || typeof fm.components === "string";
    case "item": return fm.item_type !== undefined;
    case "condition": return fm.condition_kind !== undefined;
    case "mastery": return true;
    case "creature": return fm.creature_type !== undefined || fm.hp_formula !== undefined || typeof fm.hp === "number" || typeof fm.speed === "string";
    default: return false;
  }
}
const sameShape = (a: unknown, b: unknown) => typeof a === typeof b && Array.isArray(a) === Array.isArray(b);

/**
 * A user note (any source) written in the library's schema: map it with the library adapter, then lay the note's own fields over
 * the result wherever they have the plugin-native shape, so native fields win when both spellings are present. Notes that do not
 * use the library spelling come back untouched, and anything still invalid afterwards stays a listed problem.
 */
export function adaptUserNote(type: string, fm: Raw, body: string): Raw {
  if (!usesLibrarySchema(type, fm)) return fm;
  const adapted = libraryBody(type, libraryMeta(type, fm).raw, body), out: Raw = { ...adapted };
  for (const [k, v] of Object.entries(fm)) if (v !== undefined && (adapted[k] === undefined || sameShape(v, adapted[k]))) out[k] = v;
  if (type === "spell" && typeof out.school === "string") out.school = cap(out.school);
  return out;
}
