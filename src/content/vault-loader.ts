import type { Registry } from "./registry";

export interface VaultNote { path: string; frontmatter: Record<string, unknown> | undefined; body: string; }
export interface VaultAdapter { listMarkdown(folder: string): string[]; read(path: string): Promise<VaultNote>; }

const NOT_CONTENT = new Set(["character", "npc"]);
const norm = (f: string) => f.replace(/^\/+|\/+$/g, "");

export class VaultLoader {
  private folder: string;
  private known = new Set<string>();
  constructor(private registry: Registry, private adapter: VaultAdapter, folder: string) { this.folder = norm(folder); }

  private inside = (p: string) => !!this.folder && p.startsWith(this.folder + "/") && p.endsWith(".md");

  async indexAll(): Promise<number> {
    let n = 0;
    for (const p of this.adapter.listMarkdown(this.folder)) if (this.inside(p) && await this.load(p)) n++;
    return n;
  }
  private async load(path: string): Promise<boolean> {
    const note = await this.adapter.read(path);
    const t = note.frontmatter?.type;
    if (typeof t !== "string" || !t.startsWith("5e-") || NOT_CONTENT.has(t.slice(3))) { this.forget(path); return false; }
    this.known.add(path);
    return this.registry.add("vault", t.slice(3), note.frontmatter!, { path, body: note.body.trim() }) === null;
  }
  private forget(path: string) { if (this.known.delete(path)) this.registry.removePath(path); else this.registry.removePath(path); }

  async changed(path: string): Promise<void> { if (this.inside(path)) await this.load(path); else this.forget(path); }
  deleted(path: string): void { this.forget(path); }
  async renamed(path: string, oldPath: string): Promise<void> { this.forget(oldPath); await this.changed(path); }
  async setFolder(folder: string): Promise<void> {
    for (const p of [...this.known]) this.forget(p);
    this.folder = norm(folder); await this.indexAll();
  }
}
