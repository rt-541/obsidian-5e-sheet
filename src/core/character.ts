import { parseModifier } from "./modifier";
import { ABILS, type Abil, type Modifier } from "./types";

export interface ClassLevel { class: string; subclass?: string; level: number; }
export interface InventoryEntry { id?: string; name?: string; qty: number; equipped: boolean; attuned: boolean; charges?: { used: number }; weight?: number; spellUses?: Record<string, number>; /** Used up when used. Left out: a compendium potion is, a custom item is not. */ consumable?: boolean; }
export type CompanionKind = "familiar" | "companion" | "steed" | "summon" | "sidekick";
export interface CompanionEntry { creature: string; name: string; kind: CompanionKind; hp: { current?: number; temp: number }; conditions: Record<string, number>; }
export interface Resource { name: string; max: number; used: number; reset: "short" | "long" | "dawn" | "none"; }
export type HpMethod = "roll" | "average" | "first" | "recorded";
const HP_METHODS: HpMethod[] = ["roll", "average", "first", "recorded"];
/**
 * What one applied level added: the HP method and amount (before CON) and every pick made, keyed `<source>:<level>:<op id>`.
 * `hp.added` is the HP actually added to the maximum (CON included), so undo reverses exactly that; `recorded` entries are the whole amount.
 * Keys starting with `+` are written by the level-up and read by undo (`+subclass`, `+items`, `+spells`, `+swaps`).
 */
export interface LevelEntry { class: string; level: number; hp: { method: HpMethod; die?: number; gained: number; added?: number }; choices: Record<string, unknown>; }
/** The kinds of action a combo step can be, in the words a player uses. */
export const COMBO_ACTIONS = ["Action", "Bonus action", "Reaction", "Move", "Free", "Other"] as const;
/** What a combo step points at on the sheet: one thing to use (attack, spell, feature, item), a save DC to show, a resource to spend, dice to roll. */
export interface ComboUse { attack?: string; spell?: string; feature?: string; item?: string; /** Index of a companion; with `attack`, that companion's attack. */ companion?: number; resource?: string; cost?: number; dc?: string; dice?: string; }
export interface ComboStep { action: string; /** Who does it, when not the character (a companion's name). */ who?: string; use?: ComboUse; text: string; }
export interface Combo { name: string; when: string; steps: ComboStep[]; notes?: string; /** Shown on the main page. */ pinned?: boolean; }
export interface SheetToggles { hide: string[]; show: string[]; }
export interface Character {
  type: "5e-character"; schema: 1; name: string; campaign?: string; race?: string; subrace?: string; background?: string;
  classes: ClassLevel[]; abilities: Record<Abil, number>;
  proficiencies: { saves: Abil[]; skills: string[]; expertise: string[] };
  hp: { max: number; current: number; temp: number };
  hitDice: Record<string, { used: number }>;
  deathSaves: { successes: number; failures: number };
  spellSlots: Record<string, { used: number }>;
  spells: { id: string; prepared: boolean; /** Always prepared (a domain or class feature): counts as prepared and cannot be unprepared. */ always?: boolean }[];
  inventory: InventoryEntry[]; coins: { pp: number; gp: number; ep: number; sp: number; cp: number };
  resources: Resource[]; conditions: Record<string, number>; injuries: { id: string; overcome: boolean }[];
  modifiers: Modifier[]; inspiration: boolean; xp: number; baseSpeed: number;
  /** Applied levels, oldest first; absent on notes that predate leveling. */
  levelLog: LevelEntry[];
  /** Feat ids. */
  feats: string[];
  /** Languages entered by hand, merged with those the race, background and class choices give. */
  languages: string[];
  /** Used counts of resources derived from class operations, keyed by resource id. */
  uses: Record<string, number>;
  /** Non-level choices and toggles, e.g. "dc.hemocraft.alt": true. */
  choices: Record<string, unknown>;
  /** Switched-on states such as a Rage, keyed by toggle id (true, or a number / text for a toggle with a value). */
  active: Record<string, boolean | number | string>;
  concentration?: string;
  /** Spells shown on the main page: own spell id, or "<item id>/<spell id>" for item spells. */
  mainSpells: string[];
  /** Pinned to the Resources and charges card: "feature:<key>", "feat:<id>", "item:<id>" or "item-name:<name>" (a custom item). */
  mainPins: string[];
  /** Combos: ordered coaching steps, each optionally pointing at an attack, spell, feature, item or resource. */
  combos: Combo[];
  rest: { nightsInPlace: number; /** Days of food foraged and not yet eaten (the Hexploration rule). */ foraged?: number }; companions: CompanionEntry[]; sheet: SheetToggles; rules: Record<string, boolean>;
}
export interface Npc {
  type: "5e-npc"; schema: 1; name: string; creature: string;
  hp: { max?: number; current?: number; temp: number }; conditions: Record<string, number>;
  modifiers: Modifier[]; sheet: SheetToggles; rules: Record<string, boolean>; campaign?: string;
}
export type Parsed =
  | { kind: "character"; value: Character; errors: string[]; writable: boolean }
  | { kind: "npc"; value: Npc; errors: string[]; writable: boolean }
  | { kind: "none" };

type R = Record<string, unknown>;
const isObj = (v: unknown): v is R => typeof v === "object" && v !== null && !Array.isArray(v);
const KINDS: CompanionKind[] = ["familiar", "companion", "steed", "summon", "sidekick"];
const RESETS = ["short", "long", "dawn", "none"] as const;

/** "bonus", "Bonus Action" and "bonus action" all mean "Bonus action"; undefined or empty is an ordinary Action. */
export function comboAction(v: unknown): string | undefined {
  if (v === undefined || v === "") return "Action";
  if (typeof v !== "string") return undefined;
  const strip = (s: string) => s.trim().toLowerCase().replace(/\s+action$/, ""), k = strip(v);
  return k === "action" || k === "" ? "Action" : COMBO_ACTIONS.find(a => strip(a) === k);
}

/** Field readers: undefined -> default silently; wrong type -> error + default. */
class Reader {
  errors: string[] = [];
  num(v: unknown, at: string, d: number, min = -Infinity): number {
    if (v === undefined) return d;
    if (typeof v === "number" && Number.isFinite(v) && v >= min) return v;
    this.errors.push(`${at}: must be a number`); return d;
  }
  whole(v: unknown, at: string, d = 0): number {
    if (v === undefined) return d;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    this.errors.push(`${at}: must be a whole number from 0`); return d;
  }
  str(v: unknown, at: string): string | undefined {
    if (v === undefined) return undefined;
    if (typeof v === "string") return v;
    this.errors.push(`${at}: must be text`); return undefined;
  }
  bool(v: unknown, at: string, d = false): boolean {
    if (v === undefined) return d;
    if (typeof v === "boolean") return v;
    this.errors.push(`${at}: must be true or false`); return d;
  }
  obj(v: unknown, at: string): R {
    if (v === undefined) return {};
    if (isObj(v)) return v;
    this.errors.push(`${at}: must be a mapping`); return {};
  }
  list(v: unknown, at: string): unknown[] {
    if (v === undefined) return [];
    if (Array.isArray(v)) return v;
    this.errors.push(`${at}: must be a list`); return [];
  }
  strs(v: unknown, at: string): string[] {
    const l = this.list(v, at);
    if (l.every(x => typeof x === "string")) return l as string[];
    this.errors.push(`${at}: must be a list of text`); return [];
  }
  conditions(v: unknown, at: string): Record<string, number> {
    const o = this.obj(v, at), out: Record<string, number> = {};
    for (const [k, x] of Object.entries(o)) { const n = x === true ? 1 : x === false ? 0 : this.whole(x, `${at}.${k}`); if (n > 0) out[k] = n; }
    return out;
  }
  modifiers(v: unknown, at: string): Modifier[] {
    return this.list(v, at).flatMap((m, i) => { const mod = parseModifier(m, `${at}[${i}]`, this.errors); return mod ? [mod] : []; });
  }
  combos(v: unknown, at: string): Combo[] {
    return this.list(v, at).flatMap((x, i) => {
      const a = `${at}[${i}]`;
      if (!isObj(x) || typeof x.name !== "string" || !x.name.trim()) { this.errors.push(`${a}: must have a name`); return []; }
      const steps = this.list(x.steps, `${a}.steps`).flatMap((s, j) => {
        const b = `${a}.steps[${j}]`;
        if (!isObj(s)) { this.errors.push(`${b}: must be a mapping`); return []; }
        const action = comboAction(s.action);
        if (action === undefined) this.errors.push(`${b}.action: must be one of ${COMBO_ACTIONS.join(", ")}`);
        const step: ComboStep = { ...s, action: action ?? "Action", text: this.str(s.text, `${b}.text`) ?? "" };
        const who = this.str(s.who, `${b}.who`); if (who) step.who = who; else delete step.who;
        if (s.use !== undefined) {
          const u = this.obj(s.use, `${b}.use`), use: ComboUse = { ...u };
          for (const k of ["attack", "spell", "feature", "item", "resource", "dc", "dice"] as const) { const t = this.str(u[k], `${b}.use.${k}`); if (t !== undefined) use[k] = t; else delete use[k]; }
          for (const k of ["companion", "cost"] as const) { if (u[k] !== undefined) use[k] = this.whole(u[k], `${b}.use.${k}`); else delete use[k]; }
          step.use = use;
        } else delete step.use;
        return [step];
      });
      const combo: Combo = { ...x, name: x.name, when: this.str(x.when, `${a}.when`) ?? "", steps };
      const notes = this.str(x.notes, `${a}.notes`); if (notes) combo.notes = notes; else delete combo.notes;
      if (x.pinned !== undefined) { if (this.bool(x.pinned, `${a}.pinned`)) combo.pinned = true; else delete combo.pinned; }
      return [combo];
    });
  }
  toggles(v: unknown, at: string): SheetToggles { const o = this.obj(v, at); return { hide: this.strs(o.hide, `${at}.hide`), show: this.strs(o.show, `${at}.show`) }; }
  rules(v: unknown, at: string): Record<string, boolean> {
    const o = this.obj(v, at), out: Record<string, boolean> = {};
    for (const [k, x] of Object.entries(o)) out[k] = this.bool(x, `${at}.${k}`);
    return out;
  }
}

export function newCharacter(name: string): Character {
  return {
    type: "5e-character", schema: 1, name, classes: [], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencies: { saves: [], skills: [], expertise: [] }, hp: { max: 0, current: 0, temp: 0 }, hitDice: {},
    deathSaves: { successes: 0, failures: 0 }, spellSlots: {}, spells: [], inventory: [], coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    resources: [], conditions: {}, injuries: [], modifiers: [], inspiration: false, xp: 0, baseSpeed: 30, levelLog: [], feats: [], languages: [], uses: {}, choices: {}, active: {}, mainSpells: [], mainPins: [], combos: [],
    rest: { nightsInPlace: 0 }, companions: [], sheet: { hide: [], show: [] }, rules: {},
  };
}

function schemaCheck(fm: R, r: Reader): void {
  if (fm.schema === undefined || fm.schema === 1) return;
  if (typeof fm.schema === "number" && fm.schema > 1) r.errors.push(`schema ${fm.schema} is newer than this plugin supports`);
  else r.errors.push("schema: must be 1");
}

function parseCharacter(fm: R): Parsed {
  const r = new Reader(), c = newCharacter(r.str(fm.name, "name") ?? "Unnamed");
  schemaCheck(fm, r);
  for (const k of ["campaign", "race", "subrace", "background"] as const) { const s = r.str(fm[k], k); if (s) c[k] = s; }
  c.classes = r.list(fm.classes, "classes").flatMap((x, i) => {
    if (!isObj(x) || typeof x.class !== "string") { r.errors.push(`classes[${i}]: must have a class`); return []; }
    const sub = r.str(x.subclass, `classes[${i}].subclass`);
    return [{ ...x, class: x.class, level: r.whole(x.level, `classes[${i}].level`, 1), ...(sub !== undefined ? { subclass: sub } : {}) }];
  });
  const ab = r.obj(fm.abilities, "abilities");
  for (const a of ABILS) c.abilities[a] = r.num(ab[a], `abilities.${a}`, 10, 1);
  const pr = r.obj(fm.proficiencies, "proficiencies");
  const saves = r.strs(pr.saves, "proficiencies.saves");
  for (const s of saves) if (!ABILS.includes(s as Abil)) r.errors.push(`proficiencies.saves: unknown ability "${s}"`);
  c.proficiencies = { saves: saves.filter((s): s is Abil => ABILS.includes(s as Abil)),
    skills: r.strs(pr.skills, "proficiencies.skills"), expertise: r.strs(pr.expertise, "proficiencies.expertise") };
  const hp = r.obj(fm.hp, "hp");
  c.hp = { max: r.whole(hp.max, "hp.max"), current: r.whole(hp.current, "hp.current"), temp: r.whole(hp.temp, "hp.temp") };
  for (const [k, v] of Object.entries(r.obj(fm.hitDice, "hitDice"))) {
    if (!isObj(v)) { r.errors.push(`hitDice.${k}: must be a mapping`); continue; }
    c.hitDice[k] = { ...v, used: r.whole(v.used, `hitDice.${k}.used`) };
  }
  const ds = r.obj(fm.deathSaves, "deathSaves");
  c.deathSaves = { successes: r.whole(ds.successes, "deathSaves.successes"), failures: r.whole(ds.failures, "deathSaves.failures") };
  for (const [k, v] of Object.entries(r.obj(fm.spellSlots, "spellSlots"))) {
    if (!isObj(v)) { r.errors.push(`spellSlots.${k}: must be a mapping`); continue; }
    c.spellSlots[k] = { ...v, used: r.whole(v.used, `spellSlots.${k}.used`) };
  }
  c.spells = r.list(fm.spells, "spells").flatMap((x, i) => isObj(x) && typeof x.id === "string" ? [{ ...x, id: x.id, prepared: r.bool(x.prepared, `spells[${i}].prepared`), ...(r.bool(x.always, `spells[${i}].always`) ? { always: true } : {}) }] : (r.errors.push(`spells[${i}]: must have an id`), []));
  c.inventory = r.list(fm.inventory, "inventory").flatMap((x, i) => {
    if (!isObj(x) || (typeof x.id !== "string" && typeof x.name !== "string")) { r.errors.push(`inventory[${i}]: needs an id or a name`); return []; }
    const e: InventoryEntry = { ...x, qty: r.whole(x.qty, `inventory[${i}].qty`, 1), equipped: r.bool(x.equipped, `inventory[${i}].equipped`), attuned: r.bool(x.attuned, `inventory[${i}].attuned`) };
    if (typeof x.id === "string") e.id = x.id; if (typeof x.name === "string") e.name = x.name;
    if (x.charges !== undefined) { const ch = r.obj(x.charges, `inventory[${i}].charges`); e.charges = { ...ch, used: r.whole(ch.used, `inventory[${i}].charges.used`) }; }
    if (x.spellUses !== undefined) {
      const su = r.obj(x.spellUses, `inventory[${i}].spellUses`), uses: Record<string, number> = {};
      for (const [k, v] of Object.entries(su)) uses[k] = r.whole(v, `inventory[${i}].spellUses.${k}`);
      e.spellUses = uses;
    }
    if (x.weight !== undefined) e.weight = r.num(x.weight, `inventory[${i}].weight`, 0);
    if (x.consumable !== undefined) e.consumable = r.bool(x.consumable, `inventory[${i}].consumable`);
    return [e];
  });
  const co = r.obj(fm.coins, "coins");
  for (const k of ["pp", "gp", "ep", "sp", "cp"] as const) c.coins[k] = r.whole(co[k], `coins.${k}`);
  c.resources = r.list(fm.resources, "resources").flatMap((x, i) => {
    if (!isObj(x) || typeof x.name !== "string") { r.errors.push(`resources[${i}]: must have a name`); return []; }
    let reset: Resource["reset"] = "long";
    if (x.reset !== undefined) { if (RESETS.includes(x.reset as never)) reset = x.reset as Resource["reset"]; else r.errors.push(`resources[${i}].reset: must be short, long, dawn or none`); }
    return [{ ...x, name: x.name, max: r.whole(x.max, `resources[${i}].max`, 1), used: r.whole(x.used, `resources[${i}].used`), reset }];
  });
  c.conditions = r.conditions(fm.conditions, "conditions");
  c.injuries = r.list(fm.injuries, "injuries").flatMap((x, i) => isObj(x) && typeof x.id === "string" ? [{ ...x, id: x.id, overcome: r.bool(x.overcome, `injuries[${i}].overcome`) }] : (r.errors.push(`injuries[${i}]: must have an id`), []));
  c.modifiers = r.modifiers(fm.modifiers, "modifiers");
  c.inspiration = r.bool(fm.inspiration, "inspiration");
  c.xp = r.whole(fm.xp, "xp");
  c.baseSpeed = r.whole(fm.baseSpeed, "baseSpeed", 30);
  const restFm = r.obj(fm.rest, "rest"), foraged = restFm.foraged === undefined ? 0 : r.whole(restFm.foraged, "rest.foraged");
  c.rest = { nightsInPlace: r.whole(restFm.nightsInPlace, "rest.nightsInPlace"), ...(foraged > 0 ? { foraged } : {}) };
  c.companions = r.list(fm.companions, "companions").flatMap((x, i) => {
    if (!isObj(x) || typeof x.creature !== "string") { r.errors.push(`companions[${i}]: must have a creature`); return []; }
    const hp = r.obj(x.hp, `companions[${i}].hp`);
    let kind: CompanionKind = "companion";
    if (x.kind !== undefined) { if (KINDS.includes(x.kind as CompanionKind)) kind = x.kind as CompanionKind; else r.errors.push(`companions[${i}].kind: must be one of ${KINDS.join(", ")}`); }
    const ce: CompanionEntry = { ...x, creature: x.creature, name: r.str(x.name, `companions[${i}].name`) ?? x.creature,
      kind, hp: { ...hp, temp: r.whole(hp.temp, `companions[${i}].hp.temp`) },
      conditions: r.conditions(x.conditions, `companions[${i}].conditions`) };
    if (hp.current !== undefined) ce.hp.current = r.whole(hp.current, `companions[${i}].hp.current`);
    return [ce];
  });
  c.levelLog = r.list(fm.levelLog, "levelLog").flatMap((x, i) => {
    const at = `levelLog[${i}]`;
    if (!isObj(x) || typeof x.class !== "string" || !x.class) { r.errors.push(`${at}: must have a class`); return []; }
    const hp = r.obj(x.hp, `${at}.hp`);
    if (!HP_METHODS.includes(hp.method as HpMethod)) r.errors.push(`${at}.hp.method: must be ${HP_METHODS.join(", ")}`);
    const entryHp: LevelEntry["hp"] = { ...hp, method: HP_METHODS.includes(hp.method as HpMethod) ? hp.method as HpMethod : "recorded", gained: r.whole(hp.gained, `${at}.hp.gained`) };
    if (hp.die !== undefined) entryHp.die = r.whole(hp.die, `${at}.hp.die`);
    if (hp.added !== undefined) entryHp.added = r.whole(hp.added, `${at}.hp.added`);
    return [{ ...x, class: x.class, level: r.whole(x.level, `${at}.level`, 1) || (r.errors.push(`${at}.level: must be from 1`), 1), hp: entryHp, choices: r.obj(x.choices, `${at}.choices`) }];
  });
  c.feats = r.strs(fm.feats, "feats");
  c.languages = r.strs(fm.languages, "languages");
  for (const [k, v] of Object.entries(r.obj(fm.uses, "uses"))) c.uses[k] = r.whole(v, `uses.${k}`);
  c.choices = r.obj(fm.choices, "choices");
  for (const [k, v] of Object.entries(r.obj(fm.active, "active"))) {
    if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") { if (v !== false) c.active[k] = v; }
    else r.errors.push(`active.${k}: must be true, false, a number or text`);
  }
  const conc = r.str(fm.concentration, "concentration"); if (conc) c.concentration = conc;
  c.mainSpells = r.strs(fm.mainSpells, "mainSpells");
  c.mainPins = r.strs(fm.mainPins, "mainPins");
  c.combos = r.combos(fm.combos, "combos");
  c.sheet = r.toggles(fm.sheet, "sheet");
  c.rules = r.rules(fm.rules, "rules");
  return { kind: "character", value: c, errors: r.errors, writable: r.errors.length === 0 };
}

function parseNpc(fm: R): Parsed {
  const r = new Reader();
  schemaCheck(fm, r);
  const creature = typeof fm.creature === "string" ? fm.creature : (r.errors.push("creature: must be text"), "");
  const hp = r.obj(fm.hp, "hp");
  const v: Npc = { type: "5e-npc", schema: 1, name: r.str(fm.name, "name") ?? creature ?? "NPC", creature,
    hp: { temp: r.whole(hp.temp, "hp.temp") }, conditions: r.conditions(fm.conditions, "conditions"),
    modifiers: r.modifiers(fm.modifiers, "modifiers"), sheet: r.toggles(fm.sheet, "sheet"), rules: r.rules(fm.rules, "rules") };
  if (hp.max !== undefined) v.hp.max = r.whole(hp.max, "hp.max");
  if (hp.current !== undefined) v.hp.current = r.whole(hp.current, "hp.current");
  const camp = r.str(fm.campaign, "campaign"); if (camp) v.campaign = camp;
  return { kind: "npc", value: v, errors: r.errors, writable: r.errors.length === 0 };
}

export function parseNote(fm: unknown): Parsed {
  if (!isObj(fm)) return { kind: "none" };
  if (fm.type === "5e-character") return parseCharacter(fm);
  if (fm.type === "5e-npc") return parseNpc(fm);
  return { kind: "none" };
}

export function writeInto(fm: Record<string, unknown>, value: Character | Npc): void {
  const defaults = (value.type === "5e-character" ? newCharacter(value.name) : { modifiers: [], conditions: {}, sheet: { hide: [], show: [] }, rules: {} }) as unknown as Record<string, unknown>;
  if (value.type === "5e-character" && value.concentration === undefined) delete fm.concentration;
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const isDefault = JSON.stringify(v) === JSON.stringify(defaults[k]);
    if (isDefault && !(k in fm) && k !== "schema") continue;
    fm[k] = structuredClone(v);
  }
}
