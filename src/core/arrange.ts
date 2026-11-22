import type { LayoutSpec, Slot } from "../ui/layouts";

/**
 * A character's own section order for one layout: tab id to columns of slot keys. A slot key is a feature id, or
 * `stat-tiles` for the row of tiles drawn together. Stored in the character note under `sheet.arrange.<layout>`.
 */
export type Arrangement = Record<string, string[][]>;
export const STAT_KEY = "stat-tiles";
export type MoveDir = "up" | "down" | "left" | "right";

export const slotKey = (s: Slot): string => (typeof s === "string" ? s : STAT_KEY);
/** The slot keys of one tab, column by column. */
export const tabKeys = (spec: LayoutSpec, tab: string): string[][] => (spec.tabs.find(t => t.id === tab)?.columns ?? []).map(c => c.map(slotKey));

/**
 * The layout with the saved order applied. Every slot of a tab appears exactly once: unknown or repeated keys are
 * dropped and slots the save does not mention go back to the end of their default column. A save whose column count
 * differs from the layout's (the layout changed since) is ignored for that tab. The pinned header never moves.
 */
export function arrangeLayout(spec: LayoutSpec, saved: Arrangement | undefined): LayoutSpec {
  if (!saved) return spec;
  return { ...spec, tabs: spec.tabs.map(t => {
    const cols = saved[t.id];
    if (!cols || cols.length !== t.columns.length) return t;
    const slots = new Map(t.columns.flat(1).map(s => [slotKey(s), s] as const)), used = new Set<string>();
    const out: Slot[][] = cols.map(c => c.filter(k => slots.has(k) && !used.has(k) && !!used.add(k)).map(k => slots.get(k)!));
    t.columns.forEach((c, i) => c.forEach(s => { if (!used.has(slotKey(s))) { used.add(slotKey(s)); out[i].push(s); } }));
    return { ...t, columns: out };
  }) };
}

/** Where a key sits: column and index, or undefined. */
function find(cols: string[][], key: string): [number, number] | undefined {
  for (let c = 0; c < cols.length; c++) { const i = cols[c].indexOf(key); if (i >= 0) return [c, i]; }
  return undefined;
}

/**
 * One arrow press on a slot of the (already arranged) layout: the tab's new columns, or undefined when it cannot move.
 * Up and down step past hidden slots; left and right land at the same height in the next column (or its end).
 */
export function moveSlot(spec: LayoutSpec, tab: string, key: string, dir: MoveDir, visible: ReadonlySet<string>): string[][] | undefined {
  const cols = tabKeys(spec, tab), at = find(cols, key);
  if (!at) return undefined;
  const [c, i] = at, col = cols[c];
  if (dir === "up" || dir === "down") {
    const step = dir === "up" ? -1 : 1;
    let j = i + step;
    while (j >= 0 && j < col.length && !visible.has(col[j])) j += step;
    if (j < 0 || j >= col.length) return undefined;
    col.splice(i, 1); col.splice(j, 0, key);
    return cols;
  }
  const to = c + (dir === "left" ? -1 : 1);
  if (to < 0 || to >= cols.length) return undefined;
  col.splice(i, 1); cols[to].splice(Math.min(i, cols[to].length), 0, key);
  return cols;
}

/** A dragged slot dropped before `before` in column `toCol` (null: the column's end). Undefined when nothing would change. */
export function dropSlot(spec: LayoutSpec, tab: string, key: string, toCol: number, before: string | null): string[][] | undefined {
  const cols = tabKeys(spec, tab), at = find(cols, key);
  if (!at || toCol < 0 || toCol >= cols.length || before === key) return undefined;
  if (before !== null && !cols[toCol].includes(before)) return undefined;
  cols[at[0]].splice(at[1], 1);
  const target = cols[toCol], j = before === null ? target.length : target.indexOf(before);
  target.splice(j, 0, key);
  return cols;
}
