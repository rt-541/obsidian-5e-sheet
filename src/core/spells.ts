import { splitRef } from "../content/edition";
import type { GrantedSpell, ItemData, SpellData } from "../content/types";
import type { Character } from "./character";
import type { ActorStats } from "./derive";
import { parseDice } from "./dice";
import { entryItem } from "./item-entry";
import { itemWorks, type EffectContext } from "./effects";
import { evalFormula, fillDice } from "./formula";

export interface SpellRow {
  id: string; name: string; level: number; known: boolean;     // false only for missing ids
  source: { kind: "own"; prepared: boolean; always?: boolean } | { kind: "item"; itemIndex: number; itemName: string; cost: GrantedSpell["cost"]; usesLeft?: number; chargesLeft?: number };
  castLevel: number;                       // item level override or spell level
  attack?: number; dc?: number;            // item overrides, else character spellcasting
  damage?: string; heal?: string;          // dice at castLevel (cantrips: by character level), MOD replaced
  concentration: boolean; data?: SpellData;
}

/** Dice for the highest table key at or below `level`. */
export function diceAt(table: Record<string, string> | undefined, level: number): string | undefined {
  if (!table) return undefined;
  let best: number | undefined;
  for (const k of Object.keys(table)) { const n = Number(k); if (Number.isFinite(n) && n <= level && (best === undefined || n > best)) best = n; }
  return best === undefined ? undefined : table[String(best)];
}

const withMod = (dice: string, mod: number) =>
  dice.replace(/\+MOD/g, mod === 0 ? "" : mod > 0 ? `+${mod}` : `${mod}`).replace(/MOD/g, String(mod));

/** Beams of Eldritch Blast: one, two at level 5, three at 11, four at 17. */
const beamsAt = (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1);
const simple = (s: string | undefined) => (s ?? "").toLowerCase();

/** Damage added by spellDamage effects that match this spell, as " + term" text (empty when none match). */
function spellExtra(id: string, data: SpellData, stats: ActorStats): string {
  const vars: Record<string, number> = { ...numericScales(stats.progress.scales), ...stats.mods, prof: stats.prof, level: stats.level, total: stats.level };
  let out = "";
  for (const s of stats.effects) for (const d of s.effects.spellDamage ?? []) {
    if (d.spell !== undefined && d.spell !== splitRef(id).id) continue;
    if (d.level !== undefined && d.level !== data.level) continue;
    if (d.school !== undefined && simple(d.school) !== simple(data.school)) continue;
    if (d.damageType && !d.damageType.map(simple).includes(simple(data.damage?.type))) continue;
    if (d.class !== undefined && !data.classes.map(simple).includes(simple(d.class))) continue;
    let term: string;
    try {
      const filled = typeof d.add === "string" ? fillDice(d.add, stats.progress.scales) : d.add;
      try { if (typeof filled === "string") { parseDice(filled); term = filled; } else throw new Error("formula"); }
      catch { term = String(Math.floor(evalFormula(filled, vars))); }
    } catch { continue; }
    const beams = d.perBeam ? beamsAt(stats.level) : 1;
    if (beams > 1) {
      const dice = /^(\d+)d(\d+)$/.exec(term);
      term = dice ? `${+dice[1] * beams}d${dice[2]}` : /^-?\d+$/.test(term) ? String(+term * beams) : Array(beams).fill(term).join(" + ");
    }
    out += ` + ${term}`;
  }
  return out;
}
const numericScales = (sc: Record<string, string | number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sc)) { const n = typeof v === "number" ? v : v.trim() !== "" ? Number(v) : NaN; if (Number.isFinite(n)) out[k.replace(/-/g, "_")] = n; }
  return out;
};

function build(id: string, data: SpellData | undefined, source: SpellRow["source"], castLevel: number | undefined, stats: ActorStats,
  over: { dc?: number; attack?: number } = {}): SpellRow {
  if (!data) return { id, name: id, level: 0, known: false, source, castLevel: castLevel ?? 0, concentration: false };
  const level = castLevel ?? data.level, mod = stats.spellcasting ? stats.mods[stats.spellcasting.abil] : 0;
  const extra = data.damage ? spellExtra(id, data, stats) : "";
  const dmgDice = data.damage ? (data.damage.bySlot && level >= 1 ? diceAt(data.damage.bySlot, level) : undefined) ?? diceAt(data.damage.byCharLevel, stats.level) ?? diceAt(data.damage.bySlot, level) : undefined;
  const healDice = diceAt(data.heal?.bySlot, level);
  return { id, name: data.name, level: data.level, known: true, source, castLevel: level,
    ...(data.attack && (over.attack ?? stats.spellcasting?.attack) !== undefined ? { attack: over.attack ?? stats.spellcasting!.attack } : {}),
    ...(data.save && (over.dc ?? stats.spellcasting?.dc) !== undefined ? { dc: over.dc ?? stats.spellcasting!.dc } : {}),
    ...(dmgDice ? { damage: withMod(dmgDice, mod) + extra } : {}), ...(healDice ? { heal: withMod(healDice, mod) } : {}),
    concentration: data.concentration, data };
}

export function spellRows(c: Character, stats: ActorStats, ctx: EffectContext): { own: SpellRow[]; fromItems: SpellRow[] } {
  const r = ctx.registry;
  const own = c.spells.map(s => build(s.id, r.get<SpellData>("spell", s.id)?.data, { kind: "own", prepared: s.prepared || !!s.always, ...(s.always ? { always: true } : {}) }, undefined, stats));
  const fromItems: SpellRow[] = [];
  c.inventory.forEach((e, itemIndex) => {
    if (!e.id) return;
    const it = entryItem(e, r);
    if (!it || !itemWorks(e, it)) return;
    for (const g of it.grants?.spells ?? []) {
      const source: SpellRow["source"] = { kind: "item", itemIndex, itemName: it.name, cost: g.cost,
        ...(g.cost.kind === "perDay" ? { usesLeft: Math.max(0, g.cost.uses - (e.spellUses?.[g.id] ?? 0)) } : {}),
        ...(g.cost.kind === "charges" ? { chargesLeft: Math.max(0, (it.charges?.max ?? 0) - (e.charges?.used ?? 0)) } : {}) };
      fromItems.push(build(g.id, r.get<SpellData>("spell", g.id)?.data, source, g.level, stats, { dc: g.dc, attack: g.attack }));
    }
  });
  return { own, fromItems };
}

/** One own spell as it would be cast at `level` (upcast dice included). */
export function castRow(c: Character, stats: ActorStats, ctx: EffectContext, id: string, level: number): SpellRow | undefined {
  const e = c.spells.find(x => x.id === id) ?? { id, prepared: true };
  const data = ctx.registry.get<SpellData>("spell", id)?.data;
  return data ? build(id, data, { kind: "own", prepared: e.prepared || !!(e as { always?: boolean }).always }, Math.max(level, data.level), stats) : undefined;
}
