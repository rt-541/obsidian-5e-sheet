import { writeInto, type Character, type Npc } from "../core/character";

/** The one thing the store needs from Obsidian: app.fileManager.processFrontMatter. */
export interface FrontmatterIO { process(path: string, fn: (fm: Record<string, unknown>) => void): Promise<boolean | void>; }
export interface Timers { set(fn: () => void, ms: number): unknown; clear(h: unknown): void; now(): number; }
const realTimers: Timers = { set: (f, ms) => window.setTimeout(f, ms), clear: h => window.clearTimeout(h as number), now: () => Date.now() };

/**
 * Debounced writes, one per file. Rapid taps collapse into one write of the latest value.
 * Local changes win over a concurrent external edit for the fields the sheet owns; unknown keys
 * written by anyone else are preserved because writeInto only touches sheet fields.
 */
export class NoteStore {
  private pendingValues = new Map<string, Character | Npc>();
  private handles = new Map<string, unknown>();
  private lastWrite = new Map<string, number>();
  constructor(private io: FrontmatterIO, private delayMs = 300, private timers: Timers = realTimers, private ownWriteWindowMs = 1500, private onMissing?: (path: string) => void) {}

  queue(path: string, value: Character | Npc): void {
    this.pendingValues.set(path, structuredClone(value));
    const h = this.handles.get(path); if (h !== undefined) this.timers.clear(h);
    this.handles.set(path, this.timers.set(() => { void this.flush(path); }, this.delayMs));
  }
  pending(path: string): Character | Npc | undefined { return this.pendingValues.get(path); }

  async flush(path?: string): Promise<void> {
    const paths = path ? [path] : [...this.pendingValues.keys()];
    for (const p of paths) {
      const v = this.pendingValues.get(p); if (!v) continue;
      const h = this.handles.get(p); if (h !== undefined) this.timers.clear(h);
      this.handles.delete(p); this.pendingValues.delete(p);
      this.lastWrite.set(p, this.timers.now());
      if ((await this.io.process(p, fm => writeInto(fm, v))) === false) this.onMissing?.(p);
    }
  }
  /** True right after our own write, so the view ignores the modify event it causes. */
  isOwnWrite(path: string): boolean {
    const t = this.lastWrite.get(path); return t !== undefined && this.timers.now() - t < this.ownWriteWindowMs;
  }
  rename(oldPath: string, newPath: string): void {
    const v = this.pendingValues.get(oldPath); if (!v) return;
    const h = this.handles.get(oldPath); if (h !== undefined) this.timers.clear(h);
    this.pendingValues.delete(oldPath); this.handles.delete(oldPath); this.queue(newPath, v);
  }
}

/** "[[Ekron Campaign]]", "[[Ekron Campaign|alias]]" or "Ekron Campaign" -> "Ekron Campaign". */
export function campaignLink(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^\s*\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]\s*$/.exec(raw);
  const s = (m ? m[1] : raw).trim();
  return s || null;
}
export function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return (m ? text.slice(m[0].length) : text).trim();
}
