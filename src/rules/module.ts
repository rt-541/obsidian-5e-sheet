import type { Registry } from "../content/registry";
import type { Character } from "../core/character";
import type { ActorStats } from "../core/derive";
import { rollDice } from "../core/dice";
import type { RollResult, Rng } from "../core/types";

export interface RestCtx { c: Character; stats: ActorStats; registry: Registry; rules: Record<string, boolean>; }
export interface RestOptions { samePlace?: boolean; safeHaven?: boolean; }
export interface RestDef { id: string; label: string; preview(ctx: RestCtx, o?: RestOptions): string[]; apply(ctx: RestCtx, o?: RestOptions): { value: Character; summary: string[] }; }
export interface RuleModule {
  id: string; title: string; defaultOn: boolean; excludes: string[]; rests: RestDef[]; sections: string[];
  /** Called after a rest applies, with the character as it is after the rest (change `c`); returns lines for the rest summary. */
  onRest?(restId: string, ctx: RestCtx, c: Character): string[];
}

export function resolveRules(modules: RuleModule[], layers: (Record<string, boolean> | undefined)[]): Record<string, boolean> {
  const out: Record<string, boolean> = Object.fromEntries(modules.map(m => [m.id, m.defaultOn]));
  const setAt: Record<string, number> = {};
  layers.forEach((l, i) => { for (const [k, v] of Object.entries(l ?? {})) { out[k] = v; setAt[k] = i + 1; } });
  for (const m of [...modules].sort((a, b) => (setAt[b.id] ?? 0) - (setAt[a.id] ?? 0))) {
    if (!out[m.id]) continue;
    for (const x of m.excludes) if (out[x] && (setAt[x] ?? 0) <= (setAt[m.id] ?? 0)) out[x] = false;
  }
  if (!out["rest-standard"] && !out["rest-excursion"]) out["rest-standard"] = true;
  return out;
}

export function resolveSections(all: string[], layers: ({ hide: string[]; show: string[] } | undefined)[], rules: Record<string, boolean>, modules: RuleModule[]): string[] {
  const hidden = new Set<string>();
  for (const l of layers) { for (const h of l?.hide ?? []) hidden.add(h); for (const s of l?.show ?? []) hidden.delete(s); }
  for (const m of modules) if (!rules[m.id]) for (const s of m.sections) hidden.add(s);
  return all.filter(s => !hidden.has(s));
}

export function spendHitDie(ctx: RestCtx, die: string, rng?: Rng): { value: Character; roll?: RollResult; error?: string } {
  const hd = ctx.stats.hitDice.find(h => h.die === die);
  if (!hd || hd.used >= hd.max) return { value: ctx.c, error: `No ${die} Hit Dice left` };
  const roll = rollDice(`Hit Die ${die}`, `1${die}`, rng), heal = Math.max(1, (roll.total as number) + ctx.stats.mods.con);
  const c = structuredClone(ctx.c);
  c.hitDice[die] = { used: hd.used + 1 };
  c.hp.current = Math.min(ctx.stats.hp.max, c.hp.current + heal);
  return { value: c, roll: { ...roll, total: heal, detail: `${roll.detail} ${ctx.stats.mods.con >= 0 ? "+" : ""}${ctx.stats.mods.con} CON` } };
}
