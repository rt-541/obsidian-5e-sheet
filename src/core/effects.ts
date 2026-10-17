import type { Registry } from "../content/registry";
import type { CampaignData, ConditionData, ItemData } from "../content/types";
import type { InventoryEntry } from "./character";
import type { Effects, Modifier, RollTarget } from "./types";

export interface SourcedEffects { source: string; effects: Effects; }
export interface EffectContext { registry: Registry; campaign?: CampaignData; }
type ActorLike = { conditions: Record<string, number>; injuries?: { id: string; overcome: boolean }[]; inventory?: InventoryEntry[]; modifiers: Modifier[] };

export const itemWorks = (e: InventoryEntry, item: ItemData | undefined) => !!item && e.equipped && (!item.attunement || e.attuned);

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
    if (it && itemWorks(e, it) && Object.keys(it.effects).length) out.push({ source: it.name, effects: it.effects });
  }
  for (const m of a.modifiers) out.push({ source: m.source ?? "Modifier", effects: { modifiers: [m] } });
  const w = ctx.campaign?.weather;
  if (w && (w.adv.length || w.dis.length)) out.push({ source: `Weather: ${w.name}`, effects: { adv: w.adv, dis: w.dis } });
  return out;
}

function matches(tag: string, t: RollTarget): boolean {
  const [k, q] = tag.split(":");
  switch (k) {
    case "attack":
      if (t.kind !== "attack") return false;
      if (!q) return true;
      if (q === "melee" || q === "ranged") return t.range === q;
      return q.startsWith("!") ? t.abil !== q.slice(1) : t.abil === q;
    case "check":
      if (!(t.kind === "check" || t.kind === "skill" || t.kind === "initiative")) return false;
      return !q || t.abil === q;
    case "skill": return t.kind === "skill" && t.skill === q;
    case "save": return t.kind === "save" && (!q || t.abil === q);
    default: return t.kind === k;
  }
}

export function rollSources(list: SourcedEffects[], t: RollTarget) {
  const pick = (k: "adv" | "dis" | "autofail") => list.filter(s => (s.effects[k] ?? []).some(tag => matches(tag, t))).map(s => s.source);
  return { adv: pick("adv"), dis: pick("dis"), fail: pick("autofail") };
}

export function sumModifier(list: SourcedEffects[], target: Modifier["target"]) {
  let add = 0, half = false, zero = false; const sources: string[] = [];
  for (const s of list) for (const m of s.effects.modifiers ?? []) {
    if (m.target !== target) continue;
    if (m.value === "half") half = true; else if (m.value === "zero") zero = true; else add += m.value;
    if (!sources.includes(s.source)) sources.push(s.source);
  }
  return { add, half, zero, sources };
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
