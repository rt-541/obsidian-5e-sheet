import { entryEdition, refFor } from "../content/edition";
import { sourceOn, type SourceSwitches } from "../content/sources";
import type { Entry, Registry } from "../content/registry";
import type { ClassData } from "../content/types/class";
import type { ItemData } from "../content/types/item";
import type { Op } from "../content/types/ops";
import type { FeatData, GrantsData, SubclassData } from "../content/types/origin";
import type { SpellData } from "../content/types/spell";
import type { Character } from "./character";
import { characterEdition, editionRules, otherEdition, type Edition } from "./edition";
import type { EffectContext } from "./effects";
import { explainChange, type ChangeGroup } from "./level-diff";
import { ABILS, type Abil } from "./types";
import { titleCase } from "./words";

/** A heading with its sentences; `pair` names the two notes behind it so the panel can open both. */
export interface CompareGroup extends ChangeGroup { key?: string; pair?: { type: string; own: Entry; other: Entry }; }
export interface Comparison { groups: CompareGroup[]; missingLibrary?: Edition; }
export interface CompareOpts { allLevels?: boolean; campaign?: EffectContext["campaign"]; }

const MAX_LEVEL = 20;
const ABIL_LONG: Record<Abil, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const words = (id: string) => { const t = id.replace(/[-_]/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const list = (xs: string[]) => xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/**
 * The note of the edition `to` that stands in for `entry`: the one whose `replaces` names this id (or that this entry's own `replaces` names, looking back), else the one with the same id.
 * Reads the index only (no note is opened). An entry already of edition `to` has no counterpart, and neither has a hand-made note with no edition
 * (it belongs to both). Notes of a source the campaign switched off (`sources`) are not offered.
 */
export function counterpartOf(reg: Registry, type: string, entry: Entry, to: Edition, sources?: SourceSwitches): Entry | undefined {
  const ed = entryEdition(entry);
  if (ed === undefined || ed === to) return undefined;
  const usable = (e: Entry) => !e.referenceOnly && entryEdition(e) === to && sourceOn(sources, e.sourceName);
  const named = reg.listAll(type).find(e => usable(e) && e.replaces?.includes(entry.id));
  if (named) return reg.getAll(type, named.id).find(usable);
  // Looking back from the newer edition: the entry itself names what it replaces.
  for (const id of entry.replaces ?? []) { const back = reg.getAll(type, id).find(usable); if (back) return back; }
  return reg.getAll(type, entry.id).find(usable);
}

/**
 * The vault note behind an entry the lens handed back: a library note with no mapped mechanics yields to the bundled SRD entry of the same id
 * for the sheet's numbers, but the pair's identity and text are the library note's (the same note whichever edition the character holds).
 */
function textual(reg: Registry, type: string, e: Entry, sources?: SourceSwitches): Entry {
  if (e.source !== "srd") return e;
  const ed = entryEdition(e);
  return reg.getAll(type, e.id).find(x => x.source === "vault" && x.library && !x.referenceOnly && entryEdition(x) === ed && sourceOn(sources, x.sourceName)) ?? e;
}

/** `both`: a hand-made note with no edition, used under both editions, so there is nothing to pair. */
interface Pairing { type: string; ref: string; from?: Entry; cp?: Entry; both?: boolean; swapped: string; }
/** One stored reference and its counterpart; `swapped` is the reference the other-edition character would store. */
function pairRef(reg: Registry, type: string, ref: string, own: Edition, sources?: SourceSwitches): Pairing {
  const won = reg.forEdition(own).get(type, ref);
  if (!won) return { type, ref, swapped: ref };
  const other = otherEdition(own), edOf = entryEdition(won);
  if (edOf === undefined) return { type, ref, from: won, both: true, swapped: ref };
  const from = textual(reg, type, won, sources);
  const cp = counterpartOf(reg, type, from, otherEdition(edOf), sources);
  // The thing that stays when there is no counterpart is written so it still finds its own edition's note.
  return { type, ref, from, ...(cp ? { cp } : {}), swapped: refFor(cp ?? from, other) };
}

/**
 * The character as the other edition would hold it: every class, subclass, species, subrace, background, feat, spell and item
 * replaced by its counterpart, the edition flipped. A thing with no counterpart stays, written as a reference to its own edition's note.
 * `reg` is the unlensed registry.
 */
export function swapEdition(c: Character, reg: Registry, sources?: SourceSwitches): { value: Character; unmatched: { type: string; ref: string }[] } {
  const own = characterEdition(c), unmatched: { type: string; ref: string }[] = [];
  const mark = (p: Pairing, count = true) => { if (count && p.from && !p.cp && !p.both && !unmatched.some(u => u.type === p.type && u.ref === p.ref)) unmatched.push({ type: p.type, ref: p.ref }); };
  const swap = (type: string, ref: string | undefined, count = true): string | undefined => { if (ref === undefined) return undefined; const p = pairRef(reg, type, ref, own, sources); mark(p, count); return p.swapped; };
  const classMap = new Map<string, string>();
  const classes = c.classes.map(k => {
    const cls = swap("class", k.class)!; classMap.set(k.class, cls);
    const sub = swap("subclass", k.subclass);
    return { ...k, class: cls, ...(sub !== undefined ? { subclass: sub } : {}) };
  });
  const value: Character = {
    ...c, edition: otherEdition(own), classes,
    ...(c.race !== undefined ? { race: swap("race", c.race)! } : {}),
    ...(c.subrace !== undefined ? { subrace: swap("subrace", c.subrace)! } : {}),
    ...(c.background !== undefined ? { background: swap("background", c.background)! } : {}),
    feats: c.feats.map(f => swap("feat", f)!),
    spells: c.spells.map(s => ({ ...s, id: swap("spell", s.id)! })),
    inventory: c.inventory.map(e => {
      if (!e.id) return e;
      const p = pairRef(reg, "item", e.id, own, sources);
      mark(p, !!e.equipped && p.from?.type === "item" && (p.from.data as ItemData).kind === "weapon");
      return { ...e, id: p.swapped };
    }),
    levelLog: c.levelLog.map(l => ({ ...l, class: classMap.get(l.class) ?? l.class })),
  };
  return { value, unmatched };
}

// ---- the sentences ----

const NOUNS: Record<string, (from: Edition) => string> = {
  class: () => "class", subclass: () => "subclass", race: from => editionRules(from).raceWord.toLowerCase(), subrace: () => "subrace",
  background: () => "background", feat: () => "feat", spell: () => "spell", item: () => "weapon",
};
const LABELS: Record<string, (from: Edition) => string> = {
  class: () => "Class", subclass: () => "Subclass", race: from => editionRules(from).raceWord, subrace: () => "Subrace",
  background: () => "Background", feat: () => "Feat", spell: () => "Spell", item: () => "Weapon",
};
/** The sentence for a thing the other books do not have. */
export const noVersionLine = (to: Edition, from: Edition, noun: string): string => `The ${to} books have no version of this ${noun}; your table can keep using the ${from} one`;
/** "<what>: <a> in the <from> books, <b> in the <to> books". */
const differs = (what: string, a: string, b: string, from: Edition, to: Edition) => `${what}: ${a} in the ${from} books, ${b} in the ${to} books`;

const levelsOf = (v: { levels?: Record<number, Op[]> } | undefined): Record<number, Op[]> => v?.levels ?? {};
/** Feature names by level (the earliest level a name appears at), lower-cased for matching. */
function featureLevels(levels: Record<number, Op[]>): Map<string, { name: string; level: number }> {
  const out = new Map<string, { name: string; level: number }>();
  for (const [lv, ops] of Object.entries(levels).map(([k, v]) => [Number(k), v] as const).sort((a, b) => a[0] - b[0]))
    for (const op of ops ?? []) if (op.op === "feature" && typeof op.name === "string" && !out.has(op.name.toLowerCase())) out.set(op.name.toLowerCase(), { name: op.name, level: lv });
  return out;
}
/** Features gained, lost and moved between two level tables, looking only at levels up to `upTo`. */
function featureLines(a: Map<string, { name: string; level: number }>, b: Map<string, { name: string; level: number }>, upTo: number, from: Edition, to: Edition): string[] {
  const out: string[] = [];
  const gained = [...b].filter(([k, f]) => !a.has(k) && f.level <= upTo).map(([, f]) => f.name);
  const lost = [...a].filter(([k, f]) => !b.has(k) && f.level <= upTo).map(([, f]) => f.name);
  if (gained.length) out.push(`Features only the ${to} books have: ${list(gained)}`);
  if (lost.length) out.push(`Features only the ${from} books have: ${list(lost)}`);
  for (const [k, f] of a) { const g = b.get(k); if (g && g.level !== f.level && (f.level <= upTo || g.level <= upTo)) out.push(`${f.name} comes at level ${f.level} in the ${from} books and level ${g.level} in the ${to} books`); }
  return out;
}
/** A stored proficiency in the words the sheet uses ("skill:sleight-of-hand" is "Sleight of Hand"); anything else is already plain text. */
const proficiencyWords = (p: string): string => {
  const m = /^(skill|save|expertise):(.+)$/.exec(p);
  if (!m) return p;
  if (m[1] === "save") return ABIL_LONG[m[2] as Abil] ?? titleCase(m[2]);
  return m[1] === "expertise" ? `${titleCase(m[2])} (double training)` : titleCase(m[2]);
};
const proficiencyTexts = (ops: Op[] | Record<number, Op[]> | undefined): string[] => {
  const all = Array.isArray(ops) ? ops : Object.values(ops ?? {}).flat();
  return all.flatMap(o => o.op === "grant" ? o.proficiencies : []).map(proficiencyWords);
};
const setDiff = (a: string[], b: string[], what: string, from: Edition, to: Edition): string[] => {
  const gained = b.filter(x => !a.includes(x)), lost = a.filter(x => !b.includes(x)), out: string[] = [];
  if (gained.length) out.push(`${what} only the ${to} books give: ${list(gained)}`);
  if (lost.length) out.push(`${what} only the ${from} books give: ${list(lost)}`);
  return out;
};

function abilityText(d: GrantsData): string {
  const parts: string[] = [];
  for (const k of ABILS) { const n = d.ability?.fixed[k]; if (n) parts.push(`${n > 0 ? "+" : ""}${n} ${ABIL_LONG[k]}`); }
  for (const ch of d.ability?.choose ?? []) parts.push(`+${ch.amount} to ${ch.count === 1 ? "one ability" : `${ch.count} abilities`} you choose`);
  if (d.abilityPick) parts.push(`a choice of ${d.abilityPick.patterns.map(p => list(p.map(n => `+${n}`))).join(" or ")} across abilities you choose`);
  return parts.length ? list(parts) : "none";
}

function classLines(a: ClassData, b: ClassData, upTo: number, from: Edition, to: Edition): string[] {
  const out: string[] = [];
  const die = (n: unknown) => (typeof n === "number" && n > 0 ? `d${n}` : "none");
  if (a.hitDie !== b.hitDie) out.push(differs("Hit die", die(a.hitDie), die(b.hitDie), from, to));
  if (a.subclassLevel !== b.subclassLevel) out.push(differs("Level you pick a subclass", String(a.subclassLevel ?? "none"), String(b.subclassLevel ?? "none"), from, to));
  out.push(...featureLines(featureLevels(levelsOf(a)), featureLevels(levelsOf(b)), upTo, from, to));
  out.push(...setDiff(proficiencyTexts(a.levels), proficiencyTexts(b.levels), "Training", from, to));
  return out;
}
function grantsLines(a: GrantsData, b: GrantsData, from: Edition, to: Edition): string[] {
  const out: string[] = [], at = abilityText(a), bt = abilityText(b);
  if (at !== bt) out.push(differs("Ability bonuses", at, bt, from, to));
  out.push(...featureLines(featureLevels({ 1: a.grants ?? [] }), featureLevels({ 1: b.grants ?? [] }), 1, from, to));
  out.push(...setDiff(proficiencyTexts(a.grants), proficiencyTexts(b.grants), "Training", from, to));
  const lang = (g: GrantsData) => (g.grants ?? []).flatMap(o => o.op === "grant" ? o.languages : []).map(words);
  out.push(...setDiff(lang(a), lang(b), "Languages", from, to));
  const num = (g: GrantsData, k: "speed" | "darkvision") => (g.grants ?? []).flatMap(o => o.op === "grant" && o[k] !== undefined ? [o[k]!] : [])[0];
  for (const [k, label] of [["speed", "Speed"], ["darkvision", "Darkvision"]] as const) { const x = num(a, k), y = num(b, k); if (x !== y) out.push(differs(label, x === undefined ? "none" : `${x} ft`, y === undefined ? "none" : `${y} ft`, from, to)); }
  return out;
}
function featLines(a: FeatData, b: FeatData, from: Edition, to: Edition): string[] {
  const out = grantsLines(a, b, from, to);
  if (a.minLevel !== b.minLevel) out.push(differs("Earliest level you can take it", String(a.minLevel ?? 1), String(b.minLevel ?? 1), from, to));
  return out;
}
/** The base damage dice of a spell, in one piece of text; a cantrip lists each tier. */
function spellDice(d: SpellData["damage"] | SpellData["heal"] | undefined): string {
  if (!d) return "none";
  const damage = d as NonNullable<SpellData["damage"]>;
  if (damage.byCharLevel) return [...new Set(Object.values(damage.byCharLevel))].join(", ");
  const by = d.bySlot ?? {}, first = Object.keys(by).sort((x, y) => Number(x) - Number(y))[0];
  return first === undefined ? "none" : by[first];
}
function spellLines(a: SpellData, b: SpellData, from: Edition, to: Edition): string[] {
  const out: string[] = [], lvl = (n: number) => (n === 0 ? "cantrip" : `level ${n}`);
  if (a.level !== b.level) out.push(differs("Spell level", lvl(a.level), lvl(b.level), from, to));
  for (const [k, label] of [["castingTime", "Casting time"], ["range", "Range"], ["duration", "Duration"]] as const) if (a[k] !== b[k]) out.push(differs(label, a[k] || "none", b[k] || "none", from, to));
  const x = spellDice(a.damage), y = spellDice(b.damage); if (x !== y) out.push(differs("Damage dice", x, y, from, to));
  const hx = spellDice(a.heal), hy = spellDice(b.heal); if (hx !== hy) out.push(differs("Healing dice", hx, hy, from, to));
  return out;
}
function weaponLines(a: ItemData, b: ItemData, reg: Registry, from: Edition, to: Edition): string[] {
  const out: string[] = [], x = a.weapon?.dmg, y = b.weapon?.dmg;
  if (x !== y) out.push(differs("Damage dice", x ?? "none", y ?? "none", from, to));
  const m = (d: ItemData) => (d.weapon?.mastery ? reg.get<{ name: string }>("mastery", d.weapon.mastery)?.name ?? words(d.weapon.mastery) : "none");
  if (m(a) !== m(b)) out.push(differs("Weapon mastery property", m(a), m(b), from, to));
  return out;
}

const SAME = (from: Edition, to: Edition) => `Nothing the sheet tracks differs between the ${from} and ${to} versions.`;
const FEATURE_GROUPS = [/^New features$/, /^Features you lose$/];
const WHOLE_TITLES: Record<string, string> = { "What grows with your level": "What scales with level, side by side", "Numbers that changed": "Numbers that differ", Also: "Other differences" };
/**
 * Lines of the whole-sheet comparison that the per-thing groups say better (or that only differ because the two characters hold different ids),
 * worded as a comparison of two rule sets (explainChange speaks of before and after) and led by a line saying which side is which.
 */
function wholeSheet(groups: ChangeGroup[], from: Edition, to: Edition): ChangeGroup[] {
  const only = (e: Edition) => `only under the ${e} rules`;
  const reword = (g: ChangeGroup, l: string) => {
    if (g.title !== "Also") return l;
    const lost = /^(.+?) lost: (.*)$/.exec(l); if (lost) return `${lost[1]} ${only(from)}: ${lost[2]}`;
    const got = /^([^:→]+): (.*)$/.exec(l); return got && !l.includes("→") ? `${got[1]} ${only(to)}: ${got[2]}` : l;
  };
  const rest = groups.filter(g => !FEATURE_GROUPS.some(r => r.test(g.title))).map(g => ({ title: WHOLE_TITLES[g.title] ?? g.title, lines: g.lines.filter(l =>
    !(g.title === "Hit points" && / hit dice \d+ → \d+$/.test(l)) && !/^(New spells|Spells you no longer know): /.test(l) && !/^Items added to your gear: /.test(l)).map(l => reword(g, l)) }))
    .filter(g => g.lines.length);
  return rest.length ? [{ title: "Your whole sheet, both ways", lines: [`Left of each arrow: your sheet under the ${from} rules. Right of it: the same character under the ${to} rules.`] }, ...rest] : [];
}

const level20 = (c: Character): Character => ({ ...c, classes: c.classes.map(k => ({ ...k, level: MAX_LEVEL })) });
const entryNameOf = (e: Entry) => e.name;

/**
 * What differs for this character if it played the other edition: each class and subclass (up to its level, or to level 20), species,
 * subrace, background, feat, spell and equipped weapon is paired with its counterpart and the data differences are put in plain sentences.
 * Only the notes it pairs are read (spells and weapons are hydrated; nothing else is). `reg` is the unlensed registry.
 */
export async function compareCharacter(c: Character, reg: Registry, opts: CompareOpts = {}): Promise<Comparison> {
  const own = characterEdition(c), to = otherEdition(own);
  if (!reg.listEdition("class", to).length) return { groups: [], missingLibrary: to };
  const base = opts.allLevels ? level20(c) : c, sources = opts.campaign?.sources;
  const groups: CompareGroup[] = [];

  const room = (type: string, ref: string, upTo: number, heading?: string) => {
    const p = pairRef(reg, type, ref, own, sources); if (!p.from) return;
    if (p.both) {
      const both = [own, to].sort();
      groups.push({ title: `${LABELS[type](own)}: ${p.from.name}${heading ? ` (${heading})` : ""}`, key: `${type}:${ref}`, lines: [`Your own note for this ${NOUNS[type](own)} has no edition, so the sheet uses it under both the ${both[0]} and ${both[1]} rules`] });
      return;
    }
    const from = entryEdition(p.from) ?? own, target = otherEdition(from);
    const label = `${LABELS[type](from)}: ${p.from.name}${heading ? ` (${heading})` : ""}`, key = `${type}:${ref}`;
    if (!p.cp) { groups.push({ title: label, key, lines: [noVersionLine(target, from, NOUNS[type](from))] }); return; }
    return { p, from, target, label, key, cp: p.cp, own: p.from, upTo };
  };
  type Room = NonNullable<ReturnType<typeof room>>;
  const finish = async (r: Room | undefined, body: (r: Room) => string[], hydrate = false) => {
    if (!r) return;
    if (hydrate) { await reg.hydrate(r.own); await reg.hydrate(r.cp); }
    const lines = body(r);
    if (r.cp.id !== r.own.id) lines.unshift(`In the ${r.target} books this is ${entryNameOf(r.cp)}`);
    groups.push({ title: r.label, key: r.key, lines: lines.length ? lines : [SAME(r.from, r.target)], pair: { type: r.p.type, own: r.own, other: r.cp } });
  };

  for (const k of base.classes) {
    const head = opts.allLevels ? "all levels, 1 to 20" : k.level === 1 ? "level 1" : `levels 1 to ${k.level}`;
    await finish(room("class", k.class, k.level, head), r => classLines(r.own.data as ClassData, r.cp.data as ClassData, r.upTo, r.from, r.target));
    if (k.subclass) await finish(room("subclass", k.subclass, k.level, head), r => {
      const a = r.own.data as SubclassData, b = r.cp.data as SubclassData;
      return [...featureLines(featureLevels(levelsOf(a)), featureLevels(levelsOf(b)), r.upTo, r.from, r.target), ...setDiff(proficiencyTexts(a.levels), proficiencyTexts(b.levels), "Training", r.from, r.target)];
    });
  }
  for (const [type, ref] of [["race", base.race], ["subrace", base.subrace], ["background", base.background]] as const)
    if (ref) await finish(room(type, ref, 1), r => grantsLines(r.own.data as GrantsData, r.cp.data as GrantsData, r.from, r.target));
  for (const f of [...new Set(base.feats)]) await finish(room("feat", f, 1), r => featLines(r.own.data as FeatData, r.cp.data as FeatData, r.from, r.target));
  for (const s of [...new Set(base.spells.map(x => x.id))]) await finish(room("spell", s, 1), r => spellLines(r.own.data as SpellData, r.cp.data as SpellData, r.from, r.target), true);
  const weapons = [...new Set(base.inventory.filter(e => e.equipped && e.id).map(e => e.id!))].filter(id => (reg.forEdition(own).get("item", id)?.data as ItemData | undefined)?.kind === "weapon");
  for (const w of weapons) await finish(room("item", w, 1), r => weaponLines(r.own.data as ItemData, r.cp.data as ItemData, reg.forEdition(r.target), r.from, r.target), true);

  // What the numbers do across the whole sheet: derived both ways with each edition's own lens.
  try {
    const swapped = swapEdition(base, reg, sources).value;
    const cfg = (e: Edition): EffectContext => ({ registry: reg.forEdition(e), ...(opts.campaign ? { campaign: opts.campaign } : {}) });
    for (const g of wholeSheet(explainChange(base, swapped, cfg(own), cfg(to)), own, to)) groups.push(g);
  } catch {
    groups.push({ title: "Numbers that differ", lines: ["The sheet could not work out the number changes for this character from these notes."] });
  }
  return { groups };
}
