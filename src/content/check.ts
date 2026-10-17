export type Errs = string[];
export type Raw = Record<string, unknown>;
export const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
export function str(v: unknown, at: string, e: Errs, opt = false): string | undefined {
  if (v === undefined && opt) return undefined;
  if (typeof v === "string" && v.trim()) return v.trim();
  e.push(`${at}: must be text`); return undefined;
}
export function num(v: unknown, at: string, e: Errs, opt = false): number | undefined {
  if (v === undefined && opt) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  e.push(`${at}: must be a number`); return undefined;
}
export function bool(v: unknown, at: string, e: Errs, def = false): boolean {
  if (v === undefined) return def;
  if (typeof v === "boolean") return v;
  e.push(`${at}: must be true or false`); return def;
}
export function oneOf<T extends string>(v: unknown, opts: readonly T[], at: string, e: Errs, def?: T): T | undefined {
  if (v === undefined && def !== undefined) return def;
  if (typeof v === "string" && (opts as readonly string[]).includes(v)) return v as T;
  e.push(`${at}: must be one of ${opts.join(", ")}`); return def;
}
export function strList(v: unknown, at: string, e: Errs): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v) && v.every(x => typeof x === "string")) return v as string[];
  e.push(`${at}: must be a list of text`); return [];
}
