import { titleCase } from "./words";
import type { Registry } from "../content/registry";
import type { ClassData, GrantsData, SubraceData } from "../content/types";
import { abilityKey, describeDelta, increaseDelta, type AbilityDelta } from "./ability-increase";
import type { Edition } from "./edition";
import { newCharacter, writeInto, type Character, type InventoryEntry } from "./character";
import { applyLevel, applyResolve, planLevel, planResolve, type Step } from "./levelup";
import { ABILS, type Abil, type Rng } from "./types";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

// ---------------------------------------------------------------- ability scores

export const POINT_BUY_BUDGET = 27;
/** Point buy (the same in both editions): score -> points it costs. */
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export type ScoreMethod = "point-buy" | "standard-array" | "manual";
export type Scores = Record<Abil, number>;

/** Points spent, or null when a score is outside 8 to 15. */
export function pointBuyCost(scores: Scores): number | null {
  let total = 0;
  for (const a of ABILS) { const c = POINT_BUY_COST[scores[a]]; if (c === undefined) return null; total += c; }
  return total;
}
export function defaultScores(method: ScoreMethod): Scores {
  if (method === "point-buy") return { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  if (method === "standard-array") return Object.fromEntries(ABILS.map((a, i) => [a, STANDARD_ARRAY[i]])) as Scores;
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
}
/** What is wrong with the base scores (before race bonuses) for the chosen method. */
export function scoreProblems(method: ScoreMethod, scores: Scores): string[] {
  if (method === "manual") return ABILS.filter(a => !(Number.isInteger(scores[a]) && scores[a] >= 1 && scores[a] <= 30)).map(a => `${ABIL_NAME[a]} must be a whole number from 1 to 30`);
  if (method === "standard-array") {
    const used = ABILS.map(a => scores[a]).sort((x, y) => y - x);
    return used.join() === STANDARD_ARRAY.join() ? [] : ["Standard array: use 15, 14, 13, 12, 10 and 8 once each"];
  }
  const out = ABILS.filter(a => POINT_BUY_COST[scores[a]] === undefined).map(a => `${ABIL_NAME[a]} must be a whole number from 8 to 15 in point buy`);
  if (out.length) return out;
  const spent = pointBuyCost(scores) ?? 0;
  return spent > POINT_BUY_BUDGET ? [`Point buy spends ${spent} of ${POINT_BUY_BUDGET} points`] : [];
}

// ---------------------------------------------------------------- the draft

export type EquipmentChoice = { kind: "option"; index: number } | { kind: "gold"; gold: number };
/** Everything the builder collects before the note exists. `choices` are keyed like the level log (`race:<id>:<op>`, `class:<id>:1:<op>`). */
export interface BuildDraft {
  name: string; /** The rules edition the player chose; absent until they do (a new character then gets 2014). */ edition?: Edition; campaign?: string; race?: string; subrace?: string; background?: string; classId?: string;
  method: ScoreMethod; scores: Scores; /** Race and other bonuses added to the base scores. */ bonus: Partial<Record<Abil, number>>;
  equipment?: EquipmentChoice; choices: Record<string, unknown>;
}
export const newDraft = (): BuildDraft => ({ name: "", method: "point-buy", scores: defaultScores("point-buy"), bonus: {}, choices: {} });

/**
 * Increases from the race's and subrace's `ability` field: fixed amounts plus the abilities picked in `choices` (`race:<id>:ability`).
 * Groups still unanswered add nothing yet.
 */
export function originBonus(d: BuildDraft, r?: Registry): AbilityDelta {
  const out: AbilityDelta = {};
  if (!r) return out;
  for (const [kind, id] of [["race", d.race], ["subrace", d.subrace]] as const) {
    const inc = id ? r.get<GrantsData>(kind, id)?.data.ability : undefined;
    const { delta } = increaseDelta(inc, (inc?.choose ?? []).map((_g, i) => d.choices[abilityKey(kind, id!, i)]));
    for (const [a, n] of Object.entries(delta)) out[a as Abil] = (out[a as Abil] ?? 0) + (n as number);
  }
  return out;
}

/** Base scores plus the manual bonus and the race's own increases; the increases stop at 20 (a manual score already above stays as it is). */
export const finalScores = (d: BuildDraft, r?: Registry): Scores => {
  const origin = originBonus(d, r);
  return Object.fromEntries(ABILS.map(a => {
    const before = d.scores[a] + (d.bonus[a] ?? 0), add = origin[a] ?? 0;
    return [a, add > 0 ? Math.max(before, Math.min(20, before + add)) : Math.max(1, before + add)];
  })) as Scores;
};

/** Roll starting gold such as 5d4*10. */
export function rollGold(dice: string, rng: Rng = Math.random): number {
  const m = /^(\d{1,2})d(\d{1,3})(?:\s*\*\s*(\d{1,4}))?$/.exec(dice.trim());
  if (!m) throw new Error(`bad gold dice: ${dice}`);
  let sum = 0; for (let i = 0; i < +m[1]; i++) sum += 1 + Math.floor(rng() * +m[2]);
  return sum * +(m[3] ?? 1);
}

const classOf = (d: BuildDraft, r: Registry) => d.classId ? r.get<ClassData>("class", d.classId) : undefined;
const offersEquipment = (c: ClassData | undefined) => !!c && (!!c.equipment?.length || c.gold !== undefined);

/** Why the draft cannot become a character yet (empty when it can; open steps are reported by buildCharacter). */
export function draftProblems(d: BuildDraft, r: Registry): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push("Give the character a name");
  if (!d.race) out.push("Pick a race");
  else if (!r.get("race", d.race)) out.push(`Unknown race ${d.race}`);
  if (d.subrace) {
    const s = r.get<SubraceData>("subrace", d.subrace);
    if (!s) out.push(`Unknown subrace ${d.subrace}`);
    else if (s.data.race !== d.race) out.push(`${s.data.name} belongs to ${s.data.race}, not ${d.race ?? "no race"}`);
  }
  if (d.background && !r.get("background", d.background)) out.push(`Unknown background ${d.background}`);
  if (!d.classId) out.push("Pick a class");
  else if (!r.get("class", d.classId)) out.push(`Unknown class ${d.classId}`);
  out.push(...scoreProblems(d.method, d.scores));
  for (const a of ABILS) {
    const b = d.bonus[a] ?? 0, f = d.scores[a] + b;
    if (!Number.isInteger(b) || b < -2 || b > 4) out.push(`${ABIL_NAME[a]} bonus must be a whole number from -2 to 4`);
    else if (d.method !== "manual" && f > 20) out.push(`${ABIL_NAME[a]} cannot start above 20`);
  }
  const cls = classOf(d, r);
  if (offersEquipment(cls?.data)) {
    const e = d.equipment;
    if (!e) out.push("Choose starting equipment or gold");
    else if (e.kind === "option" && !(Number.isInteger(e.index) && e.index >= 0 && e.index < (cls!.data.equipment?.length ?? 0))) out.push(`There is no equipment option ${e.kind === "option" ? e.index + 1 : ""}`.trim());
    else if (e.kind === "gold" && !(Number.isInteger(e.gold) && e.gold >= 0)) out.push("Starting gold must be a whole number from 0");
    else if (e.kind === "gold" && cls!.data.gold === undefined) out.push(`${cls!.data.name} has no starting gold`);
  }
  return out;
}

// ---------------------------------------------------------------- steps and the character

/** The character with race, subrace, background and scores but no class: the starting point of the class-level steps. */
export function baseCharacter(d: BuildDraft, r?: Registry): Character {
  const c = newCharacter(d.name.trim() || "New character");
  c.edition = d.edition ?? "2014";
  if (d.campaign) c.campaign = d.campaign;
  if (d.race) c.race = d.race;
  if (d.subrace) c.subrace = d.subrace;
  if (d.background) c.background = d.background;
  c.abilities = finalScores(d, r);
  return c;
}

/**
 * The questions the builder must ask: those the race, subrace and background still owe (`origin`),
 * then the class's first-level questions (`level`, the hit points are automatic at first level and left out).
 */
export function buildSteps(d: BuildDraft, r: Registry): { origin: Step[]; level: Step[]; error?: string } {
  if (!d.race && !d.classId) return { origin: [], level: [] };
  const base = baseCharacter(d, r), origin = planResolve(base, r, d.choices);
  if (!d.classId) return { origin, level: [] };
  const p = planLevel(base, d.classId, r, d.choices);
  if ("error" in p) return { origin, level: [], error: p.error };
  return { origin, level: p.steps.filter(s => s.kind !== "hp") };
}

const itemEntry = (r: Registry, id: string): InventoryEntry =>
  ({ ...(r.get("item", id) ? { id } : { name: titleCase(id) }), qty: 1, equipped: false, attuned: false });
/** Starting gear as one short line: repeats counted in first-seen order ("Crossbow Bolt x20"), named from the registry else title-cased. */
export function gearList(ids: string[], r: Registry): string {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => { const name = r.get("item", id)?.name ?? titleCase(id); return n > 1 ? `${name} x${n}` : name; }).join(", ");
}
function addItems(c: Character, r: Registry, ids: string[]) {
  for (const id of ids) {
    const e = itemEntry(r, id), same = c.inventory.find(x => (e.id !== undefined ? x.id === e.id : x.name === e.name));
    if (same) same.qty++; else c.inventory.push(e);
  }
}

/** Build the level 1 character through the same engine the level-up uses. Pure; on any problem returns { error }. */
export function buildCharacter(d: BuildDraft, r: Registry, rng: Rng = Math.random): { value: Character; summary: string[] } | { error: string } {
  const problems = draftProblems(d, r);
  if (problems.length) return { error: problems[0] };
  const open = buildSteps(d, r).origin.find((s): s is Extract<Step, { kind: "pick" }> => s.kind === "pick" && s.what === "abilities" && !(s.key in d.choices));
  if (open) return { error: `${open.source}: ${open.label} still needs an answer` };
  let c = baseCharacter(d, r);
  const summary: string[] = [];
  const gained = originBonus(d, r);
  if (Object.keys(gained).length) summary.push(`Ability scores from race: ${describeDelta(gained)}`);
  if (planResolve(c, r, d.choices).length) {
    const o = applyResolve(c, { choices: d.choices }, r);
    if ("error" in o) return o;
    c = o.value; summary.push(...o.summary);
  }
  const lv = applyLevel(c, { class: d.classId! }, { choices: d.choices }, r, rng);
  if ("error" in lv) return lv;
  const value = lv.value; summary.push(...lv.summary);
  const cls = classOf(d, r)!, e = d.equipment;
  if (e?.kind === "option") { addItems(value, r, cls.data.equipment![e.index]); summary.push(`Equipment: ${gearList(cls.data.equipment![e.index], r)}`); }
  else if (e?.kind === "gold") { value.coins.gp = e.gold; summary.push(`Starting gold: ${e.gold} gp`); }
  return { value, summary };
}

// ---------------------------------------------------------------- the note

/** The frontmatter for a new note: only what differs from the defaults, exactly as the sheet itself would write it. */
export function characterFrontmatter(c: Character): Record<string, unknown> {
  const fm: Record<string, unknown> = { type: "5e-character", name: c.name };
  writeInto(fm, c);
  return fm;
}

/** `<folder>/<name>.md`, numbered when taken; characters that Obsidian would reject in a file name are replaced. */
export function notePath(folder: string, name: string, exists: (path: string) => boolean): string {
  const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "New character";
  const dir = folder.replace(/\/+$/, ""), prefix = dir ? `${dir}/` : "";
  let path = `${prefix}${clean}.md`, i = 1;
  while (exists(path)) path = `${prefix}${clean} ${++i}.md`;
  return path;
}

