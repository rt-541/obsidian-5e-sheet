export const FULL_CASTER: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const PACT: [number, number][] = [[0, 0], [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];

type P = "full" | "half" | "third" | "pact" | "table";
/** One row of a custom table; slots[0] is the number of 1st-level slots. */
export interface SlotTableRow { slots?: number[]; pact?: { slots: number; level: number }; }
export interface CasterInput { level: number; progression?: P; table?: Record<number, SlotTableRow>; }

/** The row for the highest table level that is at or below `level`. */
export function tableRow(table: Record<number, SlotTableRow> | undefined, level: number): SlotTableRow | undefined {
  let best = 0;
  for (const k of Object.keys(table ?? {})) { const n = Number(k); if (n <= level && n > best) best = n; }
  return best ? table![best] : undefined;
}

/** The two edition rules the slot table reads (see EDITION_RULES); absent means the 2014 values. */
export type SlotRules = { halfCasterRounding: "down" | "up"; halfCasterFromLevel: 1 | 2 };
const SLOT_RULES_2014: SlotRules = { halfCasterRounding: "down", halfCasterFromLevel: 2 };

/**
 * Multiclass slots: full + half/2 + third/3 index the full-caster table. Third-casters always round down; half-casters
 * round as the edition says. A single caster rounds up, and a lone half-caster has slots from the edition's first level.
 * Custom `table` casters (Scholar, Profane Soul) add their listed slots on top, and pact slots add to Warlock pact slots
 * (more slots, higher level of the two).
 */
export function slotTable(classes: CasterInput[], rules: SlotRules = SLOT_RULES_2014) {
  const out: { level: string; max: number; pactLevel?: number }[] = [];
  const casters = classes.filter(c => c.progression && c.progression !== "pact" && c.progression !== "table");
  let casterLevel = 0;
  if (casters.length === 1) {
    const c = casters[0];
    casterLevel = c.progression === "full" ? c.level : c.progression === "half" ? (c.level >= rules.halfCasterFromLevel ? Math.ceil(c.level / 2) : 0) : (c.level >= 3 ? Math.ceil(c.level / 3) : 0);
  } else {
    for (const c of casters) casterLevel += c.progression === "full" ? c.level : c.progression === "half" ? (rules.halfCasterRounding === "up" ? Math.ceil(c.level / 2) : Math.floor(c.level / 2)) : Math.floor(c.level / 3);
  }
  const counts = [...FULL_CASTER[Math.min(casterLevel, 20)]];
  let pactSlots = 0, pactLevel = 0;
  for (const c of classes.filter(c => c.progression === "table")) {
    const row = tableRow(c.table, c.level);
    row?.slots?.forEach((n, i) => { counts[i] = (counts[i] ?? 0) + n; });
    if (row?.pact) { pactSlots += row.pact.slots; pactLevel = Math.max(pactLevel, row.pact.level); }
  }
  counts.forEach((max, i) => { if (max > 0 || i < FULL_CASTER[Math.min(casterLevel, 20)].length) out.push({ level: String(i + 1), max }); });
  const pact = classes.filter(c => c.progression === "pact").reduce((a, c) => a + c.level, 0);
  if (pact > 0) { const [max, lvl] = PACT[Math.min(pact, 20)]; pactSlots += max; pactLevel = Math.max(pactLevel, lvl); }
  if (pactSlots > 0) out.push({ level: "pact", max: pactSlots, pactLevel });
  return out;
}
