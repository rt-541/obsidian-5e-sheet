import type { Registry } from "../content/registry";
import type { CampaignData, ItemData } from "../content/types";
import { apply, applyNpc, type Action, type Limits } from "../core/actions";
import type { Character, Npc, Parsed } from "../core/character";
import { deriveCharacter, deriveCompanion, deriveNpc, type ActorStats } from "../core/derive";
import { rollD20, rollDice } from "../core/dice";
import { rollSources } from "../core/effects";
import type { RollMode, RollResult, RollTarget, Rng } from "../core/types";
import { activeRests, MODULES } from "../rules";
import { resolveRules, resolveSections, spendHitDie, type RestCtx, type RestOptions } from "../rules/module";

/** What the Obsidian layer (or a test) provides to a sheet. */
export interface SheetHost {
  registry: Registry; campaign?: CampaignData; ruleDefaults: Record<string, boolean>;
  save(value: Character | Npc): void;
  notify(msg: string): void;
  log: RollResult[];
  rng?: Rng;
  body?: string;
  renderMarkdown?(md: string, el: HTMLElement): void;
}
export type Panel =
  | { kind: "conditions"; who?: number } | { kind: "log" } | { kind: "rest"; id: string }
  | { kind: "compendium" } | { kind: "add-companion" } | { kind: "customize" };
type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

export const LOG_MAX = 50;

export class SheetController {
  value: Character | Npc; errors: string[]; writable: boolean;
  mode: RollMode = "normal"; editing = false; tab = ""; amount = 5;
  panel: Panel | null = null; lastRoll?: RollResult; restOpts: RestOptions = { samePlace: true, safeHaven: false };
  private subs = new Set<() => void>();

  constructor(public host: SheetHost, parsed: Exclude<Parsed, { kind: "none" }>) {
    this.value = parsed.value; this.errors = parsed.errors; this.writable = parsed.writable;
  }
  get isNpc() { return this.value.type === "5e-npc"; }
  get character(): Character | undefined { return this.value.type === "5e-character" ? this.value : undefined; }

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  emit() { this.subs.forEach(f => f()); }

  /** Replace the value after an external file change (Obsidian Sync, manual edit). */
  reload(parsed: Exclude<Parsed, { kind: "none" }>) { this.value = parsed.value; this.errors = parsed.errors; this.writable = parsed.writable; this.emit(); }

  ctx() { return { registry: this.host.registry, ...(this.host.campaign ? { campaign: this.host.campaign } : {}) }; }
  rules() { return resolveRules(MODULES, [this.host.ruleDefaults, this.host.campaign?.rules, this.value.rules]); }
  visible(features: string[]) {
    const keep = new Set(["identity", "play-edit"]);
    const shown = new Set(resolveSections(features, [this.host.campaign?.sections, this.value.sheet], this.rules(), MODULES));
    return features.filter(f => keep.has(f) || shown.has(f));
  }
  stats(): ActorStats | undefined {
    return this.value.type === "5e-character" ? deriveCharacter(this.value, this.ctx()) : deriveNpc(this.value, this.ctx());
  }
  companionStats(): (ActorStats | undefined)[] {
    return this.character?.companions.map(c => deriveCompanion(c, this.ctx())) ?? [];
  }
  limits(): Limits {
    const c = this.character;
    return { self: this.stats()!, companions: this.companionStats(),
      derive: v => deriveCharacter(v, this.ctx()), deriveCompanion: e => deriveCompanion(e, this.ctx()),
      ctx: this.ctx(),
      chargesMax: i => { const id = c?.inventory[i]?.id; return (id && this.host.registry.get<ItemData>("item", id)?.data.charges?.max) || 0; } };
  }

  private commit(v: Character | Npc) { this.value = v; this.host.save(v); this.emit(); }
  private guard(): boolean {
    if (this.writable) return true;
    this.host.notify("This note has errors, so the sheet is read-only. Fix the frontmatter first."); return false;
  }

  dispatch(a: Action) {
    if (!this.guard()) return;
    const st = this.stats(); if (!st) { this.host.notify("Unknown creature for this NPC"); return; }
    const out = this.value.type === "5e-character" ? apply(this.value, a, this.limits()) : applyNpc(this.value, a, st, n => deriveNpc(n, this.ctx()));
    if (out.error) { this.host.notify(out.error); return; }
    this.commit(out.value);
  }

  private record(r: RollResult) {
    this.lastRoll = r; this.host.log.unshift(r); if (this.host.log.length > LOG_MAX) this.host.log.length = LOG_MAX; this.emit(); return r;
  }
  /** d20 roll for the sheet's actor or companion `who`. Shift = adv, Ctrl/Cmd = dis, else the one-shot mode switch. */
  roll(title: string, mod: number, target: RollTarget, ev: Mods = {}, who?: number): RollResult {
    const st = who === undefined ? this.stats() : this.companionStats()[who];
    const src = st ? rollSources(st.effects, target) : { adv: [], dis: [], fail: [] };
    const mode: RollMode = ev.shiftKey ? "adv" : (ev.ctrlKey || ev.metaKey) ? "dis" : this.mode;
    this.mode = "normal";
    return this.record(rollD20({ title, mod, mode, ...src, ...(this.host.rng ? { rng: this.host.rng } : {}) }));
  }
  damage(title: string, expr: string): RollResult { return this.record(rollDice(title, expr, this.host.rng)); }

  setMode(m: RollMode) { this.mode = m; this.emit(); }
  setEditing(on: boolean) { this.editing = on; if (!on && this.panel?.kind === "customize") this.panel = null; this.emit(); }
  setTab(t: string) { this.tab = t; this.emit(); }
  open(p: Panel) { this.panel = p; this.emit(); }
  close() { this.panel = null; this.emit(); }

  restCtx(): RestCtx { return { c: this.character!, stats: this.stats()!, registry: this.host.registry, rules: this.rules() }; }
  restPreview(id: string) { const r = activeRests(this.rules()).find(x => x.id === id); return r ? r.preview(this.restCtx(), this.restOpts) : []; }
  rest(id: string) {
    if (!this.guard() || !this.character) return;
    const r = activeRests(this.rules()).find(x => x.id === id); if (!r) return;
    const out = r.apply(this.restCtx(), this.restOpts);
    this.panel = null; this.commit(out.value);
    this.record({ title: r.label, total: 0, dice: [], detail: out.summary.join(" · "), crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } });
  }
  spendHitDie(die: string) {
    if (!this.guard() || !this.character) return;
    const out = spendHitDie(this.restCtx(), die, this.host.rng);
    if (out.error) { this.host.notify(out.error); return; }
    this.commit(out.value); this.record(out.roll!);
  }
  setRule(id: string, on: boolean) {
    if (!this.guard()) return;
    const v = structuredClone(this.value); v.rules[id] = on; this.commit(v);
  }
  setHidden(section: string, hidden: boolean) {
    if (!this.guard()) return;
    const v = structuredClone(this.value), s = v.sheet;
    s.hide = s.hide.filter(x => x !== section); s.show = s.show.filter(x => x !== section);
    (hidden ? s.hide : s.show).push(section); this.commit(v);
  }
}
