import { libraryMeta } from "./library";
import { slug, type Registry } from "./registry";
import { classFolder, isLibrarySkip, LIBRARY_SOURCE, locate, type Located } from "./sources";

export interface VaultNote { path: string; frontmatter: Record<string, unknown> | undefined; body: string; }
export interface VaultAdapter {
  listMarkdown(folder: string): string[];
  read(path: string): Promise<VaultNote>;
  /** Frontmatter from the metadata cache without reading the file. Library notes are indexed from this alone. */
  frontmatter?(path: string): Record<string, unknown> | undefined;
}

const NOT_CONTENT = new Set(["character", "npc"]);
const norm = (f: string) => f.replace(/^\/+|\/+$/g, "");
const YIELD_EVERY = 200;
const yieldToUi = () => new Promise<void>(r => setTimeout(r, 0));

interface SubNote { fm: Record<string, unknown>; body: string; loc: Located; folder: string }

/**
 * Reads the compendium folder into the registry. The first folder under the root is the source (notes in the root are
 * Homebrew); the WotC folder is the generated library and is indexed from frontmatter only, bodies are read lazily by
 * Registry.hydrate. Subclasses take their parent class from their `Classes/<Class>/Subclasses/` folder.
 */
export class VaultLoader {
  private folder: string;
  private known = new Set<string>();
  /** class folder slug -> source -> class id, so subclasses find a class whose note carries an explicit id. */
  private classIds = new Map<string, Map<string, string>>();
  private classPaths = new Map<string, { folder: string; source: string }>();
  private subs = new Map<string, SubNote>();

  constructor(private registry: Registry, private adapter: VaultAdapter, folder: string) {
    this.folder = norm(folder);
    registry.setBodyReader(async path => (await adapter.read(path)).body.trim());
  }

  private inside = (p: string) => !!this.folder && p.startsWith(this.folder + "/") && p.endsWith(".md");

  indexAll(): Promise<number> {
    return this.registry.batch(async () => {
      let n = 0, seen = 0;
      for (const p of this.adapter.listMarkdown(this.folder)) {
        if (this.inside(p) && await this.load(p)) n++;
        if (++seen % YIELD_EVERY === 0) await yieldToUi();
      }
      return n;
    });
  }

  private async load(path: string): Promise<boolean> {
    const loc = locate(this.folder, path);
    if (!loc || isLibrarySkip(loc)) { this.forget(path); return false; }
    const lib = loc.source === LIBRARY_SOURCE;
    let fm: Record<string, unknown> | undefined, body = "";
    if (lib && this.adapter.frontmatter) fm = this.adapter.frontmatter(path);
    else { const note = await this.adapter.read(path); fm = note.frontmatter; body = note.body.trim(); }
    const t = fm?.type;
    if (typeof t !== "string" || !t.startsWith("5e-") || NOT_CONTENT.has(t.slice(3))) { this.forget(path); return false; }
    this.known.add(path);
    const type = t.slice(3);
    if (lib) return this.loadLibrary(path, type, fm!);
    const cf = classFolder(loc);
    if (cf?.kind === "class" && type === "class") this.noteClass(path, cf.folder, loc.source, fm!);
    if (cf?.kind === "subclass" && type === "subclass") {
      this.subs.set(path, { fm: fm!, body, loc, folder: cf.folder });
      return this.addSub(path);
    }
    return this.registry.add("vault", type, fm!, { path, body, sourceName: loc.source }) === null;
  }

  private loadLibrary(path: string, type: string, fm: Record<string, unknown>): boolean {
    const m = libraryMeta(type, fm);
    if ((type === "condition" || type === "injury") && typeof m.raw.name === "string") {
      const id = typeof m.raw.id === "string" ? m.raw.id : slug(m.raw.name);
      const srd = this.registry.srdEntry<{ effects?: unknown; levels?: unknown; levelEffects?: unknown }>(type, id);
      if (srd) for (const k of ["effects", "levels", "levelEffects"] as const) if (srd.data[k] !== undefined) m.raw[k] = srd.data[k];
    }
    return this.registry.add("vault", type, m.raw, { path, sourceName: LIBRARY_SOURCE, library: true,
      ...(m.book ? { book: m.book } : {}), ...(m.needsReview ? { needsReview: m.needsReview } : {}) }) === null;
  }

  // Class / subclass folder resolution. The folder decides the parent class; a `class:` in the note only matters outside a Classes folder.
  private noteClass(path: string, folder: string, source: string, fm: Record<string, unknown>) {
    const f = slug(folder), id = typeof fm.id === "string" && fm.id ? fm.id : typeof fm.name === "string" ? slug(fm.name) : f;
    const bySource = this.classIds.get(f) ?? new Map<string, string>();
    const before = this.classIdFor(f, source);
    bySource.set(source, id); this.classIds.set(f, bySource); this.classPaths.set(path, { folder: f, source });
    if (before !== this.classIdFor(f, source)) this.reattach(f);
  }
  private classIdFor(folderSlug: string, source: string): string {
    const m = this.classIds.get(folderSlug);
    return m?.get(source) ?? [...(m?.values() ?? [])][0] ?? folderSlug;
  }
  private addSub(path: string): boolean {
    const s = this.subs.get(path); if (!s) return false;
    const cls = this.classIdFor(slug(s.folder), s.loc.source);
    return this.registry.add("vault", "subclass", { ...s.fm, class: cls }, { path, body: s.body, sourceName: s.loc.source }) === null;
  }
  /** A class id changed (or the class note went away): re-register the subclasses of that folder under the new id. */
  private reattach(folderSlug: string) {
    for (const [p, s] of this.subs) if (slug(s.folder) === folderSlug && this.known.has(p)) this.addSub(p);
  }

  private forget(path: string) {
    this.known.delete(path);
    const sub = this.subs.get(path);
    if (sub) this.subs.delete(path);
    const cls = this.classPaths.get(path);
    if (cls) {
      this.classPaths.delete(path);
      const m = this.classIds.get(cls.folder); m?.delete(cls.source); if (m && !m.size) this.classIds.delete(cls.folder);
    }
    this.registry.removePath(path);
    if (cls) this.reattach(cls.folder);
  }

  async changed(path: string): Promise<void> { if (this.inside(path)) await this.load(path); else this.forget(path); }
  deleted(path: string): void { this.forget(path); }
  async renamed(path: string, oldPath: string): Promise<void> { this.forget(oldPath); await this.changed(path); }
  async setFolder(folder: string): Promise<void> {
    await this.registry.batch(async () => {
      for (const p of [...this.known]) this.forget(p);
      this.folder = norm(folder); await this.indexAll();
    });
  }
}
