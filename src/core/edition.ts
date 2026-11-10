/** Edition vocabulary: which rules a character or content entry belongs to. The rules table arrives later. */
export type Edition = "2014" | "2024";
export const EDITIONS: readonly Edition[] = ["2014", "2024"];

/** `"2014"`, `2014`, `"2024"` and `2024` read as editions; anything else is no edition. */
export function readEdition(v: unknown): Edition | undefined {
  const s = typeof v === "number" ? String(v) : v;
  return s === "2014" || s === "2024" ? s : undefined;
}
export const otherEdition = (e: Edition): Edition => (e === "2014" ? "2024" : "2014");
/** A character with no recorded edition plays the 2014 rules. */
export const characterEdition = (c: { edition?: Edition }): Edition => c.edition ?? "2014";
