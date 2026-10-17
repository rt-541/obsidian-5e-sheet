export type Source = "srd" | "vault";
export interface Entry<T = unknown> { type: string; id: string; name: string; source: Source; path?: string; body?: string; data: T; }
export interface Problem { path: string; errors: string[]; }
export interface TypeDef<T> { type: string; validate(raw: Record<string, unknown>): { value?: T; errors: string[] }; }

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export class Registry {
  private defs = new Map<string, TypeDef<unknown>>();
  private srd = new Map<string, Entry>();      // key type/id
  private vault = new Map<string, Entry>();    // key type/id
  private byPath = new Map<string, string>();  // path -> type/id
  private probs = new Map<string, Problem>();
  private subs = new Set<() => void>();

  register(def: TypeDef<unknown>) { this.defs.set(def.type, def); }
  onChange(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.subs.forEach(f => f()); }

  add(source: Source, type: string, raw: Record<string, unknown>, meta: { path?: string; body?: string } = {}): Problem | null {
    const path = meta.path ?? `${source}:${type}:${String(raw.name)}`;
    if (meta.path) this.dropPath(meta.path);
    const def = this.defs.get(type);
    const fail = (errors: string[]) => { const p = { path, errors }; if (source === "vault") this.probs.set(path, p); this.emit(); return p; };
    if (!def) return fail([`unknown content type ${type}`]);
    const withBody = meta.body && raw.rules === undefined ? { ...raw, rules: meta.body } : raw;
    const { value, errors } = def.validate(withBody);
    if (!value || errors.length) return fail(errors.length ? errors : ["invalid"]);
    const name = String((value as { name: string }).name);
    const id = typeof raw.id === "string" && raw.id ? raw.id : slug(name);
    const key = `${type}/${id}`;
    const entry: Entry = { type, id, name, source, data: value, ...(meta.path ? { path: meta.path } : {}), ...(meta.body ? { body: meta.body } : {}) };
    (source === "srd" ? this.srd : this.vault).set(key, entry);
    if (meta.path && source === "vault") this.byPath.set(meta.path, key);
    this.emit();
    return null;
  }

  private dropPath(path: string): boolean {
    let changed = this.probs.delete(path);
    const key = this.byPath.get(path);
    if (key) { this.vault.delete(key); this.byPath.delete(path); changed = true; }
    return changed;
  }
  removePath(path: string) { if (this.dropPath(path)) this.emit(); }

  get<T>(type: string, id: string): Entry<T> | undefined {
    const k = `${type}/${id}`; return (this.vault.get(k) ?? this.srd.get(k)) as Entry<T> | undefined;
  }
  list<T>(type: string): Entry<T>[] {
    const out = new Map<string, Entry>();
    for (const [k, e] of this.srd) if (e.type === type) out.set(k, e);
    for (const [k, e] of this.vault) if (e.type === type) out.set(k, e);
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name)) as Entry<T>[];
  }
  problems(): Problem[] { return [...this.probs.values()]; }
}
