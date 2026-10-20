import type { Registry } from "../content/registry";
import type { CampaignData, ConditionData, ItemData, ToggleDef } from "../content/types";
import type { InventoryEntry } from "./character";
import { layerRow } from "./customize";
import { evalFormula } from "./formula";
import { matchesTag } from "./roll-tags";
import type { Effects, Modifier, RollTarget } from "./types";

/** The effects of a toggled feature or item, gated so they apply only while its switch is on (and its own `while` gates hold). */
export const gatedByToggle = (effects: Effects, t: ToggleDef): Effects => ({ ...effects, while: [...(effects.while ?? []), `toggle:${t.id}`, ...(t.while ?? [])] });

export interface SourcedEffects { source: string; effects: Effects; }
export interface EffectContext { registry: Registry; campaign?: CampaignData; }
type ActorLike = { conditions: Record<string, number>; injuries?: { id: string; overcome: boolean }[]; inventory?: InventoryEntry[]; modifiers: Modifier[] };

export const itemWorks = (e: InventoryEntry, item: ItemData | undefined) => !!item && e.equipped && (!item.attunement || e.attuned);

/** An item's switch after the row's own customization (a switch can be added, changed or removed per inventory row). */
export const itemToggle = (it: ItemData, e: InventoryEntry): ToggleDef | undefined => layerRow(it.name, { toggle: it.toggle }, e.customize, 0, () => {}).toggle;

export function collectEffects(a: ActorLike, ctx: EffectContext): SourcedEffects[] {
  const out: SourcedEffects[] = [], r = ctx.registry;
  for (const [id, lvl] of Object.entries(a.conditions)) {
    const c = r.get<ConditionData>("condition", id)?.data; if (!c || lvl < 1) continue;
    if (c.levels && c.levelEffects) { const l = Math.min(lvl, c.levels); out.push({ source: `${c.name} ${l}`, effects: c.levelEffects[l] ?? {} }); }
    else out.push({ source: c.name, effects: c.effects });
  }
  for (const inj of a.injuries ?? []) {
    if (inj.overcome) continue;
    const c = r.get<ConditionData>("injury", inj.id)?.data; if (c) out.push({ source: c.name, effects: c.effects });
  }
  for (const e of a.inventory ?? []) {
    if (!e.id) continue;
    const it = r.get<ItemData>("item", e.id)?.data;
    if (it && itemWorks(e, it) && Object.keys(it.effects).length) { const tg = itemToggle(it, e); out.push({ source: it.name, effects: tg ? gatedByToggle(it.effects, tg) : it.effects }); }
  }
  for (const m of a.modifiers) out.push({ source: m.source ?? "Modifier", effects: { modifiers: [m] } });
  const w = ctx.campaign?.weather;
  if (w && (w.adv.length || w.dis.length)) out.push({ source: `Weather: ${w.name}`, effects: { adv: w.adv, dis: w.dis } });
  return out;
}

export function rollSources(list: SourcedEffects[], t: RollTarget) {
  const pick = (k: "adv" | "dis" | "autofail") => list.filter(s => (s.effects[k] ?? []).some(tag => matchesTag(tag, t))).map(s => s.source);
  return { adv: pick("adv"), dis: pick("dis"), fail: pick("autofail") };
}

export interface ModOpts {
  /** The roll or row being worked out: modifiers with `on` apply only when it matches (and are skipped when it is absent). */
  t?: RollTarget;
  /** Names a formula value may use (prof, level, ability mods, scales, toggle_<id>, dc_<id>). */
  vars?: Record<string, number>;
  /** Called with a short problem when a formula cannot be worked out; that modifier is skipped. */
  problem?: (msg: string) => void;
}
export interface ModPart { source: string; kind: "add" | "half" | "zero" | "double"; amount: number; }

/** Every modifier of this target that applies, in order, with formulas worked out. */
export function modifierParts(list: SourcedEffects[], target: Modifier["target"], o: ModOpts = {}): ModPart[] {
  const out: ModPart[] = [];
  for (const s of list) for (const m of s.effects.modifiers ?? []) {
    if (m.target !== target) continue;
    if (m.on !== undefined && !(o.t && matchesTag(m.on, o.t))) continue;
    if (m.value === "half" || m.value === "zero" || m.value === "double") { out.push({ source: s.source, kind: m.value, amount: 0 }); continue; }
    if (typeof m.value === "number") { out.push({ source: s.source, kind: "add", amount: m.value }); continue; }
    try { out.push({ source: s.source, kind: "add", amount: Math.floor(evalFormula(m.value, o.vars ?? {})) }); }
    catch (x) { o.problem?.(`${s.source}: ${target} bonus ${(x as Error).message}`); }
  }
  return out;
}

export function sumModifier(list: SourcedEffects[], target: Modifier["target"], o: ModOpts = {}) {
  let add = 0, half = false, zero = false, double = false; const sources: string[] = [];
  for (const p of modifierParts(list, target, o)) {
    if (p.kind === "half") half = true; else if (p.kind === "zero") zero = true; else if (p.kind === "double") double = true; else add += p.amount;
    if (!sources.includes(p.source)) sources.push(p.source);
  }
  return { add, half, zero, ...(double ? { double } : {}), sources };
}

/**
 * The crit range for this roll: the lowest critRange among effects that apply (a natural 20 always counts).
 * An effect that only works against something ("vs analyzed creatures") cannot be checked here, so it does not move the range;
 * it comes back as a hint to show with the roll.
 */
export function critInfo(list: SourcedEffects[], t: RollTarget): { range: number; hints: string[] } {
  let range = 20; const hints: string[] = [];
  for (const s of list) {
    const c = s.effects.critRange; if (c === undefined || (s.effects.critOn !== undefined && !matchesTag(s.effects.critOn, t))) continue;
    if (s.effects.critVs) hints.push(`${c}-20 is a critical hit against ${s.effects.critVs} (${s.source})`); else range = Math.min(range, c);
  }
  return { range, hints };
}

/**
 * What the d20Rule effects do to this roll: a die at or below `reroll` is rolled again (keep the new one), a die below `min` counts as `min`.
 * `proficient` rules only apply to skills the character is proficient in. `notes` names the sources, for the roll log.
 */
export function d20Rules(list: SourcedEffects[], t: RollTarget, proficient: boolean): { min?: number; reroll?: number; notes: string[] } {
  let min: number | undefined, reroll: number | undefined; const notes: string[] = [];
  for (const s of list) for (const r of s.effects.d20Rule ?? []) {
    if (!matchesTag(r.on, t) || (r.proficient && !proficient)) continue;
    if (r.min !== undefined) min = Math.max(min ?? 0, r.min);
    if (r.reroll !== undefined) reroll = Math.max(reroll ?? 0, r.reroll);
    if (!notes.includes(s.source)) notes.push(s.source);
  }
  return { ...(min !== undefined ? { min } : {}), ...(reroll !== undefined ? { reroll } : {}), notes };
}

export function damageTraits(list: SourcedEffects[]) {
  const u = (k: "resist" | "immune" | "vulnerable") => [...new Set(list.flatMap(s => s.effects[k] ?? []))];
  return { resist: u("resist"), immune: u("immune"), vulnerable: u("vulnerable") };
}
export const notes = (list: SourcedEffects[]) => list.filter(s => s.effects.note).map(s => ({ source: s.source, text: s.effects.note! }));

export function missingIds(a: { conditions: Record<string, number>; inventory?: InventoryEntry[]; injuries?: { id: string }[] }, r: Registry): string[] {
  const out: string[] = [];
  for (const id of Object.keys(a.conditions)) if (!r.get("condition", id)) out.push(`condition:${id}`);
  for (const e of a.inventory ?? []) if (e.id && !r.get("item", e.id)) out.push(`item:${e.id}`);
  for (const i of a.injuries ?? []) if (!r.get("injury", i.id)) out.push(`injury:${i.id}`);
  return out;
}
