import type { Character, CompanionEntry, Npc } from "./character";
import type { ActorStats } from "./derive";
import type { ItemData, SpellData } from "../content/types";
import { itemWorks, type EffectContext } from "./effects";
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
  | { type: "ability"; abil: Abil; value: number }
  | { type: "cast"; spell: string; level?: number; item?: number } | { type: "endConcentration" }
  | { type: "addSpell"; id: string } | { type: "removeSpell"; index: number } | { type: "prepare"; index: number; on: boolean }
  | { type: "pinSpell"; key: string; on: boolean }
  /** Used count of a resource derived from class operations (stored in character.uses). */
  | { type: "uses"; id: string; used: number }
  | { type: "xp"; value: number }
  /** Switch a class DC to its alternate ability (stored as character.choices["dc.<id>.alt"]). */
  | { type: "dcAlt"; id: string; on: boolean };
export interface Limits {
  self: ActorStats; companions: (ActorStats | undefined)[]; chargesMax: (index: number) => number;
  /** Re-derive after a condition change so stored HP can be clamped to the new effective max. */
  derive?: (c: Character) => ActorStats;
  deriveCompanion?: (e: CompanionEntry) => ActorStats | undefined;
  /** Needed for casting: spell and item data come from the registry. */
  ctx?: EffectContext;
}
export const MAX_ATTUNED = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
type Hp = { current?: number; temp: number };

function hpChange(hp: Hp, a: Action, max: number): void {
  const cur = Math.min(hp.current ?? max, max);
  if (a.type === "damage") { const n = Math.max(0, a.amount), fromTemp = Math.min(hp.temp, n); hp.temp -= fromTemp; hp.current = Math.max(0, cur - (n - fromTemp)); }
  if (a.type === "heal") hp.current = Math.min(max, cur + Math.max(0, a.amount));
  if (a.type === "temp") hp.temp = Math.max(hp.temp, Math.max(0, a.amount));
}
function setCondition(conds: Record<string, number>, id: string, level: number, maxLevel: number): void {
  const l = clamp(level, 0, maxLevel); if (l === 0) delete conds[id]; else conds[id] = l;
}
const condMax = (s: ActorStats | undefined, id: string) => id === "exhaustion" ? 6 : 1;

function cast(c0: Character, c: Character, a: Extract<Action, { type: "cast" }>, lim: Limits): { value: Character; error?: string; note?: string } {
  const fail = (error: string) => ({ value: c0, error });
  const reg = lim.ctx?.registry, sp = reg?.get<SpellData>("spell", a.spell)?.data;
  if (!sp) return fail("Spell missing from compendium");
  if (a.item !== undefined) {
    const e = c.inventory[a.item], it = e?.id ? reg!.get<ItemData>("item", e.id)?.data : undefined;
    if (!e || !it || !itemWorks(e, it)) return fail("That item isn't working");
    const g = it.grants?.spells.find(x => x.id === a.spell);
    if (!g) return fail("That item doesn't grant this spell");
    if (g.cost.kind === "charges") {
      const used = e.charges?.used ?? 0;
      if (used + g.cost.amount > (it.charges?.max ?? 0)) return fail("Not enough charges");
      e.charges = { ...e.charges, used: used + g.cost.amount };
    } else if (g.cost.kind === "perDay") {
      const used = e.spellUses?.[a.spell] ?? 0;
      if (used >= g.cost.uses) return fail("No uses left today");
      e.spellUses = { ...e.spellUses, [a.spell]: used + 1 };
    }
  } else {
    if (!c.spells.some(x => x.id === a.spell)) return fail("Not one of your spells");
    if (sp.level >= 1) {
      const lvl = a.level ?? sp.level;
      if (lvl < sp.level) return fail("Can't cast below the spell's level");
      const slot = lim.self.slots.find(s => s.level === String(lvl) && s.used < s.max) ?? lim.self.slots.find(s => s.level === "pact" && s.pactLevel === lvl && s.used < s.max);
      if (!slot) return fail(`No level ${lvl} slots left`);
      c.spellSlots[slot.level] = { ...c.spellSlots[slot.level], used: slot.used + 1 };
    }
  }
  let note: string | undefined;
  if (sp.concentration) {
    const prev = c.concentration;
    if (prev && prev !== a.spell) note = `Concentration on ${reg!.get<SpellData>("spell", prev)?.data.name ?? prev} ends`;
    c.concentration = a.spell;
  }
  return { value: c, ...(note ? { note } : {}) };
}

export function apply(c0: Character, a: Action, lim: Limits): { value: Character; error?: string; note?: string } {
  const c = structuredClone(c0);
  const who = "who" in a ? a.who : undefined;
  if (who) {
    const comp = c.companions[who.companion], st = lim.companions[who.companion];
    if (!comp) return { value: c0, error: "No such companion" };
    if (!st && a.type !== "condition") return { value: c0, error: "Unknown creature" };
    if (a.type === "condition") {
      setCondition(comp.conditions, a.id, a.level, condMax(st, a.id));
      const after = lim.deriveCompanion?.(comp); if (after && comp.hp.current !== undefined) comp.hp.current = Math.min(comp.hp.current, after.hp.max);
    }
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
    case "condition": setCondition(c.conditions, a.id, a.level, condMax(lim.self, a.id)); c.hp.current = Math.min(c.hp.current, lim.derive?.(c).hp.max ?? c.hp.max); break;
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
    case "cast": return cast(c0, c, a, lim);
    case "endConcentration": delete c.concentration; break;
    case "addSpell": if (!c.spells.some(x => x.id === a.id)) c.spells.push({ id: a.id, prepared: false }); break;
    case "removeSpell": { const gone = c.spells.splice(a.index, 1)[0]; if (gone) c.mainSpells = c.mainSpells.filter(k => k !== gone.id); break; }
    case "pinSpell": c.mainSpells = c.mainSpells.filter(k => k !== a.key); if (a.on) c.mainSpells.push(a.key); break;
    case "prepare": { const s = c.spells[a.index]; if (s) s.prepared = a.on; break; }
    case "xp": c.xp = Math.max(0, Math.round(a.value)); break;
    case "dcAlt": {
      if (!lim.self.progress.dcs.some(d => d.id === a.id && d.alt)) return { value: c0, error: "That class DC has no alternate ability" };
      if (a.on) c.choices[`dc.${a.id}.alt`] = true; else delete c.choices[`dc.${a.id}.alt`];
      break;
    }
    case "uses": {
      const r = lim.self.resources.find(x => x.derived && x.id === a.id);
      if (!r) return { value: c0, error: "Unknown resource" };
      const n = clamp(a.used, 0, r.max);
      if (n) c.uses[a.id] = n; else delete c.uses[a.id];
      break;
    }
    case "ability": c.abilities[a.abil] = clamp(a.value, 1, 30); break;
  }
  return { value: c };
}

export function applyNpc(n0: Npc, a: Action, stats: ActorStats, rederive?: (n: Npc) => ActorStats | undefined): { value: Npc; error?: string } {
  const n = structuredClone(n0);
  if (a.type === "damage" || a.type === "heal" || a.type === "temp") { hpChange(n.hp, a, stats.hp.max); return { value: n }; }
  if (a.type === "condition") { setCondition(n.conditions, a.id, a.level, condMax(stats, a.id));
    const after = rederive?.(n); if (after && n.hp.current !== undefined) n.hp.current = Math.min(n.hp.current, after.hp.max);
    return { value: n }; }
  return { value: n0, error: "Not available for NPCs" };
}
