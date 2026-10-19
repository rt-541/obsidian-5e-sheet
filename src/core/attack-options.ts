import { slug } from "../content/registry";
import type { AttackOptionDef, ItemData } from "../content/types";
import type { Character, InventoryEntry } from "./character";
import type { ResourceRow } from "./derive";
import { itemWorks, type SourcedEffects } from "./effects";
import { extraDice } from "./attack-rows";
import { fillDice } from "./formula";
import type { DeclaredAttackOption } from "./progression";

/** One line of the Attack options card: a declared option (a focus die, an on-hit die, a reroll) or an extra-damage switch. */
export interface AttackOptionRow {
  id: string; name: string; /** feature:<key> | item:<id> | "" */ ref: string;
  kind: "declared" | "extra"; on: boolean;
  toHit?: string; onHit?: string; reroll?: boolean; oncePerTurn?: boolean; /** Roll tag the option applies to. */ tag: string;
  resource?: { id: string; name: string; left: number; max: number; unlimited: boolean };
  /** Set when the option cannot work: plain words. */ problem?: string;
  /** Extra rows: the dice and type added, e.g. "1d6 fire"; perTurn from per: "turn". */ adds?: string; perTurn?: boolean;
}

/** The resource a name points at: the same match the switch cost uses (derived by id, manual by name). */
export const resourceByName = (rows: ResourceRow[], name: string): ResourceRow | undefined =>
  rows.find(x => x.id === slug(name) || (!x.derived && slug(x.name) === slug(name)));

function declaredRow(c: Character, id: string, name: string, ref: string, def: AttackOptionDef, level: number, resources: ResourceRow[], scales: Record<string, string | number>): AttackOptionRow | undefined {
  let onHit: string | undefined;
  if (def.scale) {
    let best = 0; for (const k of Object.keys(def.scale)) { const n = Number(k); if (n <= level && n > best) best = n; }
    if (best) onHit = def.scale[best];
  } else if (def.onHit) onHit = fillDice(def.onHit, scales);
  const toHit = def.toHit ? fillDice(def.toHit, scales) : undefined;
  if (!toHit && !onHit && !def.reroll) return undefined;
  const row: AttackOptionRow = { id, name, ref, kind: "declared", on: c.optionsOn?.includes(id) ?? false, tag: def.on ?? "attack" };
  if (toHit) row.toHit = toHit;
  if (onHit) row.onHit = onHit;
  if (def.reroll) row.reroll = true;
  if (def.oncePerTurn) row.oncePerTurn = true;
  if (def.resource) {
    const r = resourceByName(resources, def.resource);
    if (!r) row.problem = `needs ${def.resource}, which this character doesn't have`;
    else row.resource = { id: r.id, name: r.name, left: r.unlimited ? 0 : Math.max(0, r.max - r.used), max: r.max, unlimited: !!r.unlimited };
  }
  return row;
}

/** The attack options the character has: those its features and working items declare. */
export function attackOptionRows(c: Character, declared: DeclaredAttackOption[], items: { e: InventoryEntry; it: ItemData | undefined }[],
  fx: SourcedEffects[], resources: ResourceRow[], scales: Record<string, string | number>, totalLevel: number, vars: Record<string, number> = {}): AttackOptionRow[] {
  const out: AttackOptionRow[] = [];
  for (const d of declared) {
    const row = declaredRow(c, d.id, d.name, `feature:${d.key}`, d.def, d.level, resources, scales);
    if (row) out.push(row);
  }
  for (const { e, it } of items) {
    const def = it?.attackOption;
    if (!it || !def || !itemWorks(e, it) || out.some(x => x.id === def.id)) continue;
    const row = declaredRow(c, def.id, it.name, `item:${e.id ?? ""}`, def, totalLevel, resources, scales);
    if (row) out.push(row);
  }
  for (const s of fx) {
    const list = s.effects.extraDamage ?? [];
    if (!list.length) continue;
    const id = `extra:${slug(s.source)}`;
    if (out.some(x => x.id === id)) continue;
    const x = list[0], dice = extraDice(x.dice, { scales, vars });
    out.push({ id, name: s.source, ref: "", kind: "extra", on: !c.optionsOff?.includes(id), tag: x.on ?? "attack",
      ...(dice !== undefined ? { adds: `${dice} ${x.type}` } : {}), ...(list.some(y => y.per === "turn") ? { perTurn: true } : {}) });
  }
  return out;
}
