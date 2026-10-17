/** Source names. The first folder under the compendium root is the source; bundled SRD content is `WotC (SRD)`. */
export const SRD_SOURCE = "WotC (SRD)";
/** The generated library folder (owned by the dnd-compendium sync; read only here). */
export const LIBRARY_SOURCE = "WotC";
/** Notes directly in the compendium root, and the default home of hand-made content. */
export const HOMEBREW_SOURCE = "Homebrew";

/** Per-campaign switches: `{ "<Source>": true | false }`, absent means on. */
export type SourceSwitches = Record<string, boolean> | undefined;
export const sourceOn = (sw: SourceSwitches, source: string): boolean => sw?.[source] !== false;

/** Name of the marker file inside a generated library folder (written by the dnd-compendium sync). */
export const LIBRARY_MARKER = ".dnd-compendium-generated";

/**
 * Precedence group: user sources win over generated library sources (WotC and any folder with the marker), which win over
 * the bundled SRD. `lib` is the set of library source names the registry has seen; WotC always counts.
 */
const group = (s: string, lib?: ReadonlySet<string>) => (s === SRD_SOURCE ? 2 : s === LIBRARY_SOURCE || lib?.has(s) ? 1 : 0);
/** Negative when `a` outranks `b`: Homebrew, then other user sources alphabetically, then the library (WotC first), then WotC (SRD). */
export function compareSources(a: string, b: string, lib?: ReadonlySet<string>): number {
  const d = group(a, lib) - group(b, lib);
  if (d) return d;
  if (a === b) return 0;
  if (group(a, lib) === 1) return a === LIBRARY_SOURCE ? -1 : b === LIBRARY_SOURCE ? 1 : a.localeCompare(b);
  if (group(a, lib) !== 0) return 0;
  if (a === HOMEBREW_SOURCE) return -1;
  if (b === HOMEBREW_SOURCE) return 1;
  return a.localeCompare(b);
}

const norm = (f: string) => f.replace(/^\/+|\/+$/g, "");
export interface Located {
  source: string;
  /** Path segments below the source folder (the file name is last). */
  rest: string[];
}
/** Where a note sits under the compendium root: its source (first folder) and the path below it. Null when outside the root. */
export function locate(root: string, path: string): Located | null {
  const r = norm(root);
  if (!r || !path.startsWith(r + "/") || !path.endsWith(".md")) return null;
  const parts = path.slice(r.length + 1).split("/");
  if (parts.length === 1) return { source: HOMEBREW_SOURCE, rest: parts };
  return { source: parts[0], rest: parts.slice(1) };
}
/** Book text and index pages inside a generated library folder are never content entries (the caller checks the folder is a library one). */
export const isLibrarySkip = (loc: Located): boolean => loc.rest[0] === "Books" || loc.rest[0] === "Index";

/** `Classes/<Class>/<file>` is a class note; `Classes/<Class>/Subclasses/<file>` a subclass. Returns the class folder name. */
export function classFolder(loc: Located): { folder: string; kind: "class" | "subclass" } | null {
  const [a, folder, b, file] = loc.rest;
  if (a !== "Classes" || !folder) return null;
  if (loc.rest.length === 3) return { folder, kind: "class" };
  if (loc.rest.length === 4 && b === "Subclasses" && file) return { folder, kind: "subclass" };
  return null;
}
