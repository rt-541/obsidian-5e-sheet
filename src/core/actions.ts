import type { Character, CompanionEntry, Npc } from "./character";
import type { ActorStats } from "./derive";
import type { Abil } from "./types";

export type Who = { companion: number } | undefined;
export type Action =
  | { type: "damage"; amount: number; who?: Who } | { type: "heal"; amount: number; who?: Who } | { type: "temp"; amount: number; who?: Who }
  | { type: "condition"; id: string; level: number; who?: Who }
  | { type: "slot"; level: string; used: number } | { type: "resource"; index: number; used: number }
  | { type: "charges"; index: number; used: number } | { type: "hitDie"; die: string; used: number }
  | { type: "deathSave"; which: "successes" | "failures"; value: number }
  | { type: "equip"; index: number; on: boolean } | { type: "attune"; index: number; on: boolean }
  | { type: "inspiration"; on: boolean }
  | { type: "addItem"; id: string } | { type: "removeItem"; index: number }
  | { type: "addCompanion"; creature: string; name: string; kind: CompanionEntry["kind"] } | { type: "removeCompanion"; index: number }
  | { type: "ability"; abil: Abil; value: number };
export interface Limits { self: ActorStats; companions: (ActorStats | undefined)[]; chargesMax: (index: number) => number; }
export const MAX_ATTUNED = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
type Hp = { current?: number; temp: number };

function hpChange(hp: Hp, a: Action, max: number): void {
  const cur = hp.current ?? max;
  if (a.type === "damage") { const n = Math.max(0, a.amount), fromTemp = Math.min(hp.temp, n); hp.temp -= fromTemp; hp.current = Math.max(0, cur - (n - fromTemp)); }
  if (a.type === "heal") hp.current = Math.min(max, cur + Math.max(0, a.amount));
  if (a.type === "temp") hp.temp = Math.max(hp.temp, Math.max(0, a.amount));
}
function setCondition(conds: Record<string, number>, id: string, level: number, maxLevel: number): void {
  const l = clamp(level, 0, maxLevel); if (l === 0) delete conds[id]; else conds[id] = l;
}
const condMax = (s: ActorStats | undefined, id: string) => id === "exhaustion" ? 6 : 1;

export function apply(c0: Character, a: Action, lim: Limits): { value: Character; error?: string } {
  const c = structuredClone(c0);
  const who = "who" in a ? a.who : undefined;
  if (who) {
    const comp = c.companions[who.companion], st = lim.companions[who.companion];
    if (!comp) return { value: c0, error: "No such companion" };
    if (!st && a.type !== "condition") return { value: c0, error: "Unknown creature" };
    if (a.type === "condition") setCondition(comp.conditions, a.id, a.level, condMax(st, a.id));
    else hpChange(comp.hp, a, st!.hp.max);
    return { value: c };
  }
  switch (a.type) {
    case "damage": case "heal": case "temp": {
      const wasDown = c.hp.current === 0;
      hpChange(c.hp, a, lim.self.hp.max);
      if (a.type === "heal" && wasDown && c.hp.current > 0) c.deathSaves = { successes: 0, failures: 0 };
      break;
    }
    case "condition": setCondition(c.conditions, a.id, a.level, condMax(lim.self, a.id)); if (a.id === "exhaustion") c.hp.current = Math.min(c.hp.current, c.hp.max); break;
    case "slot": { const s = lim.self.slots.find(x => x.level === a.level); c.spellSlots[a.level] = { used: clamp(a.used, 0, s?.max ?? 0) }; break; }
    case "resource": { const r = c.resources[a.index]; if (r) r.used = clamp(a.used, 0, r.max); break; }
    case "charges": { const e = c.inventory[a.index]; if (e) e.charges = { used: clamp(a.used, 0, lim.chargesMax(a.index)) }; break; }
    case "hitDie": { const h = lim.self.hitDice.find(x => x.die === a.die); c.hitDice[a.die] = { used: clamp(a.used, 0, h?.max ?? 0) }; break; }
    case "deathSave": c.deathSaves[a.which] = clamp(a.value, 0, 3); break;
    case "equip": { const e = c.inventory[a.index]; if (e) { e.equipped = a.on; if (!a.on) e.attuned = false; } break; }
    case "attune": {
      const e = c.inventory[a.index]; if (!e) break;
      if (a.on && !e.attuned && c.inventory.filter(x => x.attuned).length >= MAX_ATTUNED) return { value: c0, error: "Already attuned to 3 items" };
      e.attuned = a.on; if (a.on) e.equipped = true; break;
    }
    case "inspiration": c.inspiration = a.on; break;
    case "addItem": c.inventory.push({ id: a.id, qty: 1, equipped: false, attuned: false }); break;
    case "removeItem": c.inventory.splice(a.index, 1); break;
    case "addCompanion": c.companions.push({ creature: a.creature, name: a.name, kind: a.kind, hp: { temp: 0 }, conditions: {} }); break;
    case "removeCompanion": c.companions.splice(a.index, 1); break;
    case "ability": c.abilities[a.abil] = clamp(a.value, 1, 30); break;
  }
  return { value: c };
}

export function applyNpc(n0: Npc, a: Action, stats: ActorStats): { value: Npc; error?: string } {
  const n = structuredClone(n0);
  if (a.type === "damage" || a.type === "heal" || a.type === "temp") { hpChange(n.hp, a, stats.hp.max); return { value: n }; }
  if (a.type === "condition") { setCondition(n.conditions, a.id, a.level, condMax(stats, a.id)); return { value: n }; }
  return { value: n0, error: "Not available for NPCs" };
}
