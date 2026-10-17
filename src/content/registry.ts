import { libraryBody, type Raw as LibRaw } from "./library";
import { compareSources, HOMEBREW_SOURCE, SRD_SOURCE, sourceOn, type SourceSwitches } from "./sources";

/** Where an entry came from: bundled data or a vault note. `sourceName` is the user-facing source (folder name). */
export type Source = "srd" | "vault";
export interface Entry<T = unknown> {
  type: string; id: string; name: string; source: Source;
  /** `WotC (SRD)` for bundled content, else the first folder under the compendium root (`Homebrew` for notes in the root). */
  sourceName: string;
  /** Book abbreviation of a generated library note (frontmatter `source`, e.g. PHB). */
  book?: string;
  /** True for notes under the generated WotC library folder. */
  library?: boolean;
  /** Library note the sheet cannot use (mapping failed): shown by the browser and hover only. Holds the reason. */
  referenceOnly?: string;
  /** Library creature flagged by the generator for review: usable, but show a badge. */
  needsReview?: string[];
  path?: string; body?: string; data: T;
}
export interface Problem { path: string; errors: string[]; }
export interface TypeDef<T> { type: string; validate(raw: Record<string, unknown>): { value?: T; errors: string[] }; }
export interface AddMeta { path?: string; body?: string; sourceName?: string; library?: boolean; book?: string; needsReview?: string[]; }
export interface ListOpts { /** Campaign source switches: entries of sources set to false are left out. */ sources?: SourceSwitches; }

/** User-facing source badge text: `WotC · PHB` for a library note with a book, else the source name. */
export const sourceLabel = (e: { sourceName: string; library?: boolean; book?: string }): string => (e.library && e.book ? `${e.sourceName} · ${e.book}` : e.sourceName);

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const BODY_CACHE = 64;

export class Registry {
  private defs = new Map<string, TypeDef<unknown>>();
  private all = new Map<string, Entry[]>();    // key type/id -> every source's entry
  private byPath = new Map<string, string>();  // path -> type/id
  private raws = new WeakMap<Entry, LibRaw>(); // library entries: the metadata-mapped raw, kept for lazy hydration
  private hydrated = new WeakSet<Entry>();
  private bodies = new Map<string, string>();  // LRU of note bodies by path
  private reader?: (path: string) => Promise<string>;
  private probs = new Map<string, Problem>();
  private subs = new Set<() => void>();
  private refOnly = 0;

  register(def: TypeDef<unknown>) { this.defs.set(def.type, def); }
  onChange(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private held = 0; private dirty = false;
  private emit() { if (this.held) this.dirty = true; else this.subs.forEach(f => f()); }
  /** Run `fn` with change notifications held back and sent once at the end (bulk indexing must not rebuild views per note). */
  async batch<R>(fn: () => Promise<R>): Promise<R> {
    this.held++;
    try { return await fn(); }
    finally { if (--this.held === 0 && this.dirty) { this.dirty = false; this.subs.forEach(f => f()); } }
  }
  /** How the registry reads a note body on demand (library entries are indexed from frontmatter only). */
  setBodyReader(fn: (path: string) => Promise<string>) { this.reader = fn; }

  add(source: Source, type: string, raw: Record<string, unknown>, meta: AddMeta = {}): Problem | null {
    const path = meta.path ?? `${source}:${type}:${String(raw.name)}`;
    if (meta.path) this.dropPath(meta.path);
    const sourceName = meta.sourceName ?? (source === "srd" ? SRD_SOURCE : HOMEBREW_SOURCE);
    const library = meta.library === true;
    const def = this.defs.get(type);
    const fail = (errors: string[]): Problem | null => {
      if (library && source === "vault") { this.addReference(type, raw, path, sourceName, meta, errors.join("; ")); this.emit(); return null; }
      const p = { path, errors }; if (source === "vault") this.probs.set(path, p); this.emit(); return p;
    };
    if (!def) return fail([`unknown content type ${type}`]);
    const withBody = meta.body && raw.rules === undefined ? { ...raw, rules: meta.body } : raw;
    const { value, errors } = def.validate(withBody);
    if (!value || errors.length) return fail(errors.length ? errors : ["invalid"]);
    const name = String((value as { name: string }).name);
    const id = typeof raw.id === "string" && raw.id ? raw.id : slug(name);
    const entry: Entry = { type, id, name, source, sourceName, data: value, ...(meta.path ? { path: meta.path } : {}), ...(meta.body ? { body: meta.body } : {}),
      ...(library ? { library: true } : {}), ...(meta.book ? { book: meta.book } : {}), ...(meta.needsReview ? { needsReview: meta.needsReview } : {}) };
    if (library) this.raws.set(entry, raw);
    this.put(entry, meta.path);
    this.emit();
    return null;
  }

  private addReference(type: string, raw: Record<string, unknown>, path: string, sourceName: string, meta: AddMeta, reason: string) {
    const nm = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!nm) return;
    const id = typeof raw.id === "string" && raw.id ? raw.id : slug(nm);
    this.put({ type, id, name: nm, source: "vault", sourceName, library: true, referenceOnly: reason, path, data: { name: nm },
      ...(meta.book ? { book: meta.book } : {}), ...(meta.needsReview ? { needsReview: meta.needsReview } : {}) }, path);
  }

  private put(entry: Entry, path?: string) {
    const key = `${entry.type}/${entry.id}`;
    const list = this.all.get(key) ?? [];
    // Bundled entries have no path: replace the one of the same source; vault entries were dropped by path before.
    const kept = entry.path ? list : list.filter(e => e.path !== undefined || e.sourceName !== entry.sourceName);
    kept.push(entry); this.all.set(key, kept);
    if (path) this.byPath.set(path, key);
    if (entry.referenceOnly) this.refOnly++;
  }

  private dropPath(path: string): boolean {
    let changed = this.probs.delete(path);
    this.bodies.delete(path);
    const key = this.byPath.get(path);
    if (key) {
      const list = this.all.get(key) ?? [];
      const rest = list.filter(e => e.path !== path);
      this.refOnly -= list.filter(e => e.path === path && e.referenceOnly).length;
      if (rest.length) this.all.set(key, rest); else this.all.delete(key);
      this.byPath.delete(path); changed = true;
    }
    return changed;
  }
  removePath(path: string) { if (this.dropPath(path)) this.emit(); }

  /**
   * A view of this registry whose `list` leaves out sources a campaign switched off (for pickers). `get` stays unfiltered,
   * so characters that already use an entry from a switched-off source keep working. Reads through to the live registry.
   */
  scoped(sources: SourceSwitches): Registry {
    if (!sources || !Object.values(sources).includes(false)) return this;
    return Object.create(this, { list: { value: <T>(type: string, o?: ListOpts) => this.list<T>(type, { ...o, sources: { ...sources, ...o?.sources } }) } }) as Registry;
  }

  /** Highest-precedence usable entry among `list` (reference-only entries and switched-off sources are skipped). */
  private winner(list: Entry[] | undefined, o?: ListOpts): Entry | undefined {
    let best: Entry | undefined;
    for (const e of list ?? []) {
      if (e.referenceOnly || !sourceOn(o?.sources, e.sourceName)) continue;
      if (!best || compareSources(e.sourceName, best.sourceName) <= 0) best = e;   // ties: the later one wins
    }
    return best;
  }

  /** The entry the sheet uses for this id: user sources (Homebrew first) > WotC library > WotC (SRD). */
  get<T>(type: string, id: string, o?: ListOpts): Entry<T> | undefined { return this.winner(this.all.get(`${type}/${id}`), o) as Entry<T> | undefined; }
  /** Usable entries of a type, one per id (the winner), sorted by name. */
  list<T>(type: string, o?: ListOpts): Entry<T>[] {
    const out: Entry[] = [];
    for (const [k, l] of this.all) if (k.startsWith(type + "/")) { const w = this.winner(l, o); if (w && w.type === type) out.push(w); }
    return out.sort((a, b) => a.name.localeCompare(b.name)) as Entry<T>[];
  }
  /** Every entry of a type from every source, reference-only ones included (the browser shows them all). Sorted by name, then precedence. */
  listAll<T>(type?: string): Entry<T>[] {
    const out: Entry[] = [];
    for (const l of this.all.values()) for (const e of l) if (!type || e.type === type) out.push(e);
    return out.sort((a, b) => a.name.localeCompare(b.name) || compareSources(a.sourceName, b.sourceName)) as Entry<T>[];
  }
  /** Every source's entry for one id, by precedence. */
  getAll<T>(type: string, id: string): Entry<T>[] {
    return [...(this.all.get(`${type}/${id}`) ?? [])].sort((a, b) => compareSources(a.sourceName, b.sourceName)) as Entry<T>[];
  }
  /** The bundled SRD entry for an id, even when something else outranks it. */
  srdEntry<T>(type: string, id: string): Entry<T> | undefined { return this.all.get(`${type}/${id}`)?.find(e => e.source === "srd") as Entry<T> | undefined; }
  /** Source names that currently have at least one entry, user sources first. */
  sources(): string[] {
    const s = new Set<string>();
    for (const l of this.all.values()) for (const e of l) s.add(e.sourceName);
    return [...s].sort(compareSources);
  }
  /** User-authored note problems only; library notes that cannot be mapped are counted by referenceOnlyCount. */
  problems(): Problem[] { return [...this.probs.values()]; }
  /** Library notes the sheet cannot use ("library notes not usable on the sheet"). */
  referenceOnlyCount(): number { return this.refOnly; }
  libraryCount(): number { let n = 0; for (const l of this.all.values()) for (const e of l) if (e.library) n++; return n; }

  /** A note's body, read on demand and kept in a small LRU. Bundled entries have none. */
  async bodyOf(entry: Entry): Promise<string> {
    if (entry.body !== undefined) return entry.body;
    const p = entry.path; if (!p || !this.reader) return "";
    const hit = this.bodies.get(p);
    if (hit !== undefined) { this.bodies.delete(p); this.bodies.set(p, hit); return hit; }
    const text = await this.reader(p);
    this.bodies.set(p, text);
    if (this.bodies.size > BODY_CACHE) this.bodies.delete(this.bodies.keys().next().value as string);
    return text;
  }
  /** Fill in what only a library note's text knows (spell damage dice, creature attacks, rules text). Safe to call repeatedly. */
  async hydrate(entry: Entry): Promise<Entry> {
    const raw = this.raws.get(entry);
    if (!entry.library || entry.referenceOnly || !raw || this.hydrated.has(entry)) return entry;
    this.hydrated.add(entry);
    const body = await this.bodyOf(entry);
    const def = this.defs.get(entry.type); if (!def) return entry;
    const { value, errors } = def.validate(libraryBody(entry.type, raw, body));
    if (value && !errors.length) { entry.data = value; this.emit(); }
    return entry;
  }
}
