import type { Registry } from "../content/registry";
import { slug } from "../content/registry";
import type { CampaignData, ItemData, LevelingMode, SpellData } from "../content/types";
import { apply, applyNpc, type Action, type Limits } from "../core/actions";
import type { Character, Npc, Parsed } from "../core/character";
import { deriveCharacter, deriveCompanion, deriveNpc, type ActorStats } from "../core/derive";
import { rollD20, rollDice } from "../core/dice";
import { rollSources } from "../core/effects";
import { evalFormula, fillDice } from "../core/formula";
import { applyLevel, applyResolve, levelFromXp, planLevel, planResolve, rollHitDie, undoLevel, xpProgress, MAX_TOTAL_LEVEL, type LevelPlan, type Step } from "../core/levelup";
import { formulaVars, type FeatureRow } from "../core/progression";
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
  /** Open the new-character builder (offered on a sheet that has no class yet). */
  openBuilder?(): void;
}
export type Panel =
  | { kind: "conditions"; who?: number } | { kind: "log" } | { kind: "rest"; id: string }
  | { kind: "compendium" } | { kind: "add-companion" } | { kind: "customize" }
  | { kind: "cast"; spell: string } | { kind: "add-spell" } | { kind: "details"; ref: string } | { kind: "level-up" };
/** The level-up wizard: `level` adds a class level, `resolve` only answers choices a note still owes. */
export interface LevelUpView { featOpen: Set<string>; spellQuery: string; featQuery: string; }
export interface LevelUpState {
  mode: "level" | "resolve"; classId?: string; page: number; /** Search text and the feat/ability switch, kept across redraws. */ view: LevelUpView;
  hp?: { method: "roll" | "average"; roll?: number }; choices: Record<string, unknown>; error?: string;
}
type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

export const LOG_MAX = 50;

export class SheetController {
  value: Character | Npc; errors: string[]; writable: boolean;
  mode: RollMode = "normal"; editing = false; tab = ""; amount = 5;
  panel: Panel | null = null; levelUp: LevelUpState | null = null; confirmUndo = false; lastRoll?: RollResult; restOpts: RestOptions = { samePlace: true, safeHaven: false };
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

  /** The registry the pickers (level-up wizard, add spell / item / companion) list from: sources this campaign switched off are left out. */
  pickers(): Registry { return this.host.registry.scoped(this.host.campaign?.sources); }
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

  /** Apply an action; returns whether it changed the note, plus any note the rules attached (e.g. concentration replaced). */
  dispatch(a: Action): { ok: boolean; note?: string } {
    if (!this.guard()) return { ok: false };
    const st = this.stats(); if (!st) { this.host.notify("Unknown creature for this NPC"); return { ok: false }; }
    const out = this.value.type === "5e-character" ? apply(this.value, a, this.limits()) : applyNpc(this.value, a, st, n => deriveNpc(n, this.ctx()));
    if (out.error) { this.host.notify(out.error); return { ok: false }; }
    this.commit(out.value);
    return { ok: true, ...("note" in out && out.note ? { note: out.note } : {}) };
  }

  /** Cast a spell (own, or from item `item`) and show what it cost. */
  cast(spell: string, level?: number, item?: number) {
    const sp = this.host.registry.get<SpellData>("spell", spell);
    const out = this.dispatch({ type: "cast", spell, ...(level !== undefined ? { level } : {}), ...(item !== undefined ? { item } : {}) });
    if (!out.ok) return false;
    const lvl = level ?? sp?.data.level ?? 0, c = this.character;
    const g = item !== undefined && c?.inventory[item]?.id ? this.host.registry.get<ItemData>("item", c.inventory[item].id!)?.data.grants?.spells.find(x => x.id === spell) : undefined;
    const spent = item !== undefined ? (g?.cost.kind === "charges" ? "charge spent" : g?.cost.kind === "perDay" ? "daily use spent" : "at will") : lvl >= 1 ? "slot spent" : "cantrip";
    this.record({ title: `Cast ${sp?.name ?? spell} (${item === undefined && lvl >= 1 ? `level ${lvl}, ` : ""}${spent})`, total: 0, dice: [],
      detail: out.note ?? "", crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } });
    return true;
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
  setEditing(on: boolean) { this.editing = on; this.confirmUndo = false; if (!on && this.panel?.kind === "customize") this.panel = null; this.emit(); }
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
  // ---- leveling

  levelingMode(): LevelingMode { return this.host.campaign?.leveling ?? "milestone"; }
  /** Total character level, XP, and (in XP mode) how far to the next level. */
  xpInfo() {
    const c = this.character, level = c?.classes.reduce((a, k) => a + k.level, 0) ?? 0, xp = c?.xp ?? 0;
    return { mode: this.levelingMode(), xp, level, ...xpProgress(xp, Math.max(level, 1)), maxed: level >= MAX_TOTAL_LEVEL, xpLevel: levelFromXp(xp) };
  }
  /** XP mode: the XP total has crossed the next threshold. Milestone campaigns may always level up. */
  levelUpReady(): boolean { const i = this.xpInfo(); return !i.maxed && (i.mode === "milestone" || i.ready); }
  startLevelUp() {
    if (!this.guard() || !this.character) return;
    if (this.xpInfo().maxed) { this.host.notify("Characters stop at level 20."); return; }
    this.levelUp = { mode: "level", page: 0, choices: {}, view: { featOpen: new Set(), spellQuery: "", featQuery: "" } }; this.open({ kind: "level-up" });
  }
  /** Open the wizard on the choices a note without a level log still owes. */
  startResolve() {
    if (!this.guard() || !this.character) return;
    this.levelUp = { mode: "resolve", page: 0, choices: {}, view: { featOpen: new Set(), spellQuery: "", featQuery: "" } }; this.open({ kind: "level-up" });
  }
  cancelLevelUp() { this.levelUp = null; this.close(); }
  /** Change the wizard state (a pick, the page, the class) and redraw. Changing the class clears the picks. */
  setLevelUp(patch: Partial<LevelUpState>) {
    if (!this.levelUp) return;
    const next: LevelUpState = { ...this.levelUp, ...patch };
    delete next.error;
    if (patch.classId !== undefined && patch.classId !== this.levelUp.classId) { next.choices = {}; delete next.hp; }
    this.levelUp = next; this.emit();
  }
  pick(key: string, value: unknown) { if (this.levelUp) this.setLevelUp({ choices: { ...this.levelUp.choices, [key]: value } }); }
  rollLevelHp(die: number) { this.setLevelUp({ hp: { method: "roll", roll: rollHitDie(die, this.host.rng) } }); }
  /** The wizard's plan for its current picks (no class yet is just no steps). */
  levelUpSteps(): { steps: Step[]; plan?: LevelPlan; error?: string } {
    const c = this.character, st = this.levelUp;
    if (!c || !st) return { steps: [] };
    if (st.mode === "resolve") return { steps: planResolve(c, this.pickers(), st.choices) };
    if (!st.classId) return { steps: [] };
    const p = planLevel(c, st.classId, this.pickers(), st.choices);
    return "error" in p ? { steps: [], error: p.error } : { steps: p.steps, plan: p };
  }
  /** What applying the wizard now would do, without changing anything. */
  levelUpPreview(): { value: Character; summary: string[] } | { error: string } {
    const c = this.character, st = this.levelUp;
    if (!c || !st) return { error: "Nothing to apply" };
    const answers = { ...(st.hp ? { hp: st.hp } : {}), choices: st.choices };
    return st.mode === "level" ? applyLevel(c, { class: st.classId ?? "" }, answers, this.pickers(), this.host.rng) : applyResolve(c, answers, this.pickers());
  }
  applyLevelUp(): boolean {
    const c = this.character, st = this.levelUp;
    if (!this.guard() || !c || !st) return false;
    const r = this.levelUpPreview();
    if ("error" in r) { this.levelUp = { ...st, error: r.error }; this.host.notify(r.error); this.emit(); return false; }
    this.levelUp = null; this.panel = null; this.commit(r.value);
    this.record({ title: st.mode === "level" ? "Level up" : "Choices made", total: 0, dice: [], detail: r.summary.join(" · "), crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } });
    return true;
  }
  /** Undo the last applied level; the first click only asks for confirmation. */
  undoLastLevel(): boolean {
    const c = this.character; if (!this.guard() || !c) return false;
    if (!this.confirmUndo) { this.confirmUndo = true; this.emit(); return false; }
    this.confirmUndo = false;
    const r = undoLevel(c, this.host.registry);
    if ("error" in r) { this.host.notify(r.error); this.emit(); return false; }
    this.commit(r.value);
    this.record({ title: "Undo level", total: 0, dice: [], detail: r.summary.join(" · "), crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } });
    return true;
  }
  cancelUndo() { if (this.confirmUndo) { this.confirmUndo = false; this.emit(); } }

  /** Use a feature or option action: spend its cost, then roll its attack, damage and healing; a save is shown as its DC. */
  useAction(f: FeatureRow) {
    const a = f.action, c = this.character, st = this.stats();
    if (!a || !c || !st || !this.guard()) return;
    const plain = { crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } };
    try {
      const scales = st.progress.scales, vars = formulaVars(c, scales), parts: string[] = [];
      if (a.cost && "resource" in a.cost) {
        const id = slug(a.cost.resource), r = st.resources.find(x => x.derived && x.id === id);
        if (!r) { this.host.notify(`${a.name}: no resource called ${a.cost.resource}`); return; }
        const amount = a.cost.amount === undefined ? 1 : Math.max(0, Math.floor(evalFormula(a.cost.amount, vars)));
        if (r.used + amount > r.max) { this.host.notify(`No ${r.name} left for ${a.name}`); return; }
        if (!this.dispatch({ type: "uses", id, used: r.used + amount }).ok) return;
        parts.push(`${r.name} -${amount}`);
      }
      if (a.cost && "selfDamage" in a.cost) {
        const roll = this.damage(`${a.name} (self damage)`, fillDice(a.cost.selfDamage, scales));
        this.dispatch({ type: "damage", amount: Number(roll.total) }); parts.push(`${roll.total} damage to you`);
      }
      if (a.save) {
        const dc = st.progress.dcs.find(x => x.id === slug(a.save!.dc));
        parts.push(`${a.save.abil.toUpperCase()} save DC ${dc ? dc.dc : "?"}`);
      }
      if (a.attack === undefined && !a.damage && !a.heal) { this.record({ title: a.name, total: 0, dice: [], detail: [...parts, a.text ?? ""].filter(Boolean).join(" · "), ...plain }); return; }
      if (parts.length) this.record({ title: `${a.name} used`, total: 0, dice: [], detail: parts.join(" · "), ...plain });
      if (a.attack !== undefined) this.roll(`${a.name} attack`, Math.floor(evalFormula(a.attack, vars)), { kind: "attack" });
      if (a.damage) this.damage(`${a.name} damage`, fillDice(a.damage, scales));
      if (a.heal) this.damage(`${a.name} healing`, fillDice(a.heal, scales));
    } catch (x) { this.host.notify(`${a.name}: ${(x as Error).message}`); }
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
