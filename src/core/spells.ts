import type { GrantedSpell, ItemData, SpellData } from "../content/types";
import type { Character } from "./character";
import type { ActorStats } from "./derive";
import { itemWorks, type EffectContext } from "./effects";

export interface SpellRow {
  id: string; name: string; level: number; known: boolean;     // false only for missing ids
  source: { kind: "own"; prepared: boolean } | { kind: "item"; itemIndex: number; itemName: string; cost: GrantedSpell["cost"]; usesLeft?: number; chargesLeft?: number };
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

function build(id: string, data: SpellData | undefined, source: SpellRow["source"], castLevel: number | undefined, stats: ActorStats,
  over: { dc?: number; attack?: number } = {}): SpellRow {
  if (!data) return { id, name: id, level: 0, known: false, source, castLevel: castLevel ?? 0, concentration: false };
  const level = castLevel ?? data.level, mod = stats.spellcasting ? stats.mods[stats.spellcasting.abil] : 0;
  const dmgDice = data.damage ? (data.damage.bySlot && level >= 1 ? diceAt(data.damage.bySlot, level) : undefined) ?? diceAt(data.damage.byCharLevel, stats.level) ?? diceAt(data.damage.bySlot, level) : undefined;
  const healDice = diceAt(data.heal?.bySlot, level);
  return { id, name: data.name, level: data.level, known: true, source, castLevel: level,
    ...(data.attack && (over.attack ?? stats.spellcasting?.attack) !== undefined ? { attack: over.attack ?? stats.spellcasting!.attack } : {}),
    ...(data.save && (over.dc ?? stats.spellcasting?.dc) !== undefined ? { dc: over.dc ?? stats.spellcasting!.dc } : {}),
    ...(dmgDice ? { damage: withMod(dmgDice, mod) } : {}), ...(healDice ? { heal: withMod(healDice, mod) } : {}),
    concentration: data.concentration, data };
}

export function spellRows(c: Character, stats: ActorStats, ctx: EffectContext): { own: SpellRow[]; fromItems: SpellRow[] } {
  const r = ctx.registry;
  const own = c.spells.map(s => build(s.id, r.get<SpellData>("spell", s.id)?.data, { kind: "own", prepared: s.prepared }, undefined, stats));
  const fromItems: SpellRow[] = [];
  c.inventory.forEach((e, itemIndex) => {
    if (!e.id) return;
    const it = r.get<ItemData>("item", e.id)?.data;
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
