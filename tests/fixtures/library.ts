import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultAdapter, VaultNote } from "../../src/content/vault-loader";

/**
 * Minimal reader for the generator's frontmatter: top-level scalars, lists of scalars and one level of nested mappings
 * (all values JSON-quoted, numbers or booleans). Enough for tests/fixtures/library, no YAML dependency.
 */
const scalar = (s: string): unknown => {
  const v = s.trim();
  if (v.startsWith('"')) return JSON.parse(v);
  if (v === "true") return true; if (v === "false") return false;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
};
export function parseNote(text: string): { fm: Record<string, unknown>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r/g, ""));
  if (!m) return { fm: {}, body: text };
  const lines = m[1].split("\n"), fm: Record<string, unknown> = {};
  for (let i = 0; i < lines.length; i++) {
    const t = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]); if (!t) continue;
    if (t[2] !== "") { fm[t[1]] = scalar(t[2]); continue; }
    const items: string[] = [], map: Record<string, unknown> = {};
    while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
      const l = lines[++i], li = /^\s+-\s+(.*)$/.exec(l), kv = /^\s+([\w-]+):\s*(.*)$/.exec(l);
      if (li) items.push(scalar(li[1]) as string); else if (kv) map[kv[1]] = scalar(kv[2]);
    }
    fm[t[1]] = items.length ? items : map;
  }
  return { fm, body: m[2].trim() };
}

export const LIB_ROOT = "compendium/5e/WotC";
/** The sanitized library fixtures (frontmatter verbatim from the generator, invented one-line bodies) placed under the real library path. */
export function libraryFixtures(): Record<string, { fm: Record<string, unknown>; body: string }> {
  const dir = join(__dirname, "library"), out: Record<string, { fm: Record<string, unknown>; body: string }> = {};
  for (const d of readdirSync(dir)) for (const f of readdirSync(join(dir, d))) out[`${LIB_ROOT}/${d}/${f}`] = parseNote(readFileSync(join(dir, d, f), "utf8"));
  return out;
}

export type Notes = Record<string, { fm?: Record<string, unknown>; body?: string }>;
export interface FakeAdapter extends VaultAdapter { notes: Notes; reads: string[]; }
/**
 * An in-memory vault. `reads` records every body read; `frontmatter` is the metadata-cache path (no read).
 * `exists` is true only for the paths listed in `opts.markers` (full paths such as `compendium/5e/Test Press/.dnd-compendium-generated`).
 */
export function fakeVault(notes: Notes, opts: { markers?: string[] } = {}): FakeAdapter {
  const markers = new Set(opts.markers ?? []);
  const reads: string[] = [];
  return {
    notes, reads,
    listMarkdown: folder => Object.keys(notes).filter(p => p.startsWith(folder + "/")),
    frontmatter: path => notes[path]?.fm,
    exists: path => markers.has(path),
    read: async (path): Promise<VaultNote> => { reads.push(path); return { path, frontmatter: notes[path]?.fm, body: notes[path]?.body ?? "" }; },
  };
}
