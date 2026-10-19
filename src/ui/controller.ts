import type { Registry } from "../content/registry";
import { slug } from "../content/registry";
import type { Draft } from "../content/creature-note";
import type { CampaignData, ItemData, LevelingMode, SpellData } from "../content/types";
import { apply, applyNpc, customItemProblem, type Action, type Limits } from "../core/actions";
import type { Character, Combo, Npc, Parsed } from "../core/character";
import { blankCombo, validateCombo } from "../core/combos";
import { deriveCharacter, deriveCompanion, deriveNpc, type ActorStats } from "../core/derive";
import { rollD20, rollDice } from "../core/dice";
import { critInfo, d20Rules, rollSources } from "../core/effects";
import { explainChange, type ChangeGroup } from "../core/level-diff";
import { evalFormula, fillDice } from "../core/formula";
import { applyLevel, applyResolve, levelFromXp, planLevel, planResolve, rollHitDie, undoLevel, xpProgress, MAX_TOTAL_LEVEL, type LevelPlan, type Step } from "../core/levelup";
import { formulaVars, type FeatureRow } from "../core/progression";
import type { RollMode, RollResult, RollTarget, Rng } from "../core/types";
import { activeRests, MODULES } from "../rules";
import { blankItemSearch, type ItemSearch } from "./additem-ui";
import { findRations, foodDays } from "../rules/hexploration";
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
  /** Save a custom creature as a Homebrew note and register it; resolves to its creature id. Never overwrites an existing note. */
  saveCreature?(draft: Draft): Promise<string>;
  /** Trait groups the player collapsed, kept per character in plugin data (not in the note). */
  collapsedGroups?(): string[];
  setCollapsedGroups?(ids: string[]): void;
}
export type Panel =
  | { kind: "conditions"; who?: number } | { kind: "log" } | { kind: "rest"; id: string }
  | { kind: "compendium" } | { kind: "add-companion" } | { kind: "customize" }
  | { kind: "cast"; spell: string } | { kind: "add-spell" } | { kind: "details"; ref: string } | { kind: "level-up" } | { kind: "combo-edit" };
/** The combo form: `index` is the combo being changed, or null for a new one. Typing changes the draft without redrawing. */
export interface ComboDraft { index: number | null; combo: Combo; error?: string; confirmDelete?: boolean; }
/** The level-up wizard: `level` adds a class level, `resolve` only answers choices a note still owes. */
export interface LevelUpView { featOpen: Set<string>; spellQuery: string; featQuery: string; }
export interface LevelUpState {
  mode: "level" | "resolve"; classId?: string; page: number; /** Search text and the feat/ability switch, kept across redraws. */ view: LevelUpView;
  hp?: { method: "roll" | "average"; roll?: number }; choices: Record<string, unknown>; error?: string;
}
/** The "custom item" form in the add panel: raw text as typed, so a half-typed number is kept as is. */
export interface CustomItemForm { name: string; qty: string; weight: string; consumable: boolean; error?: string; }
export const blankCustomItem = (): CustomItemForm => ({ name: "", qty: "1", weight: "", consumable: false });
type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

export const LOG_MAX = 50;

export class SheetController {
  value: Character | Npc; errors: string[]; writable: boolean;
  mode: RollMode = "normal"; editing = false; tab = ""; amount = 5;
  /** Optional damage type chosen next to the Damage button (resistance, immunity and vulnerability use it). */
  damageType = "";
  /** After damage while concentrating: the save the player is asked to make. */
  concentrationCheck: { dc: number; spell: string } | null = null;
  comboDraft: ComboDraft | null = null;
  /** The add panel's custom item form; typing changes it without redrawing. */
  customItem: CustomItemForm = blankCustomItem();
  /** The add panel's search text and kind chip. */
  itemSearch: ItemSearch = blankItemSearch();
  /** Which inventory row has its "..." options open. */
  itemMenu: number | null = null;
  /** The open menu is asking "Remove <name>? Yes / No". */
  confirmRemove = false;
  /** The next redraw puts the keyboard focus on the element with this data-keep (desktop only). */
  focusNext?: string;
  panel: Panel | null = null; levelUp: LevelUpState | null = null; confirmUndo = false; lastRoll?: RollResult; restOpts: RestOptions = { samePlace: true, safeHaven: false };
  private subs = new Set<() => void>();
  private collapsed?: Set<string>;

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
    this.host.notify("This note has errors, so the sheet is read-only. Fix the note's properties first, then reopen it."); return false;
  }

  /** Apply an action; returns whether it changed the note, plus any note the rules attached (e.g. concentration replaced). */
  dispatch(a: Action): { ok: boolean; note?: string } {
    if (!this.guard()) return { ok: false };
    const st = this.stats(); if (!st) { this.host.notify("Unknown creature for this NPC"); return { ok: false }; }
    const out = this.value.type === "5e-character" ? apply(this.value, a, this.limits()) : applyNpc(this.value, a, st, n => deriveNpc(n, this.ctx()));
    if (out.error) { this.host.notify(out.error); return { ok: false }; }
    this.commit(out.value);
    if ((a.type === "damage" || a.type === "equip" || a.type === "attune") && "note" in out && out.note) this.host.notify(out.note);
    if ("concentrationCheck" in out && out.concentrationCheck) {
      const prev = this.concentrationCheck;
      this.concentrationCheck = prev && prev.spell === out.concentrationCheck.spell && prev.dc > out.concentrationCheck.dc ? prev : out.concentrationCheck;
      this.emit();
    } else if (this.concentrationCheck && (a.type === "endConcentration" || this.character?.concentration !== this.concentrationCheck.spell)) { this.concentrationCheck = null; this.emit(); }
    return { ok: true, ...("note" in out && out.note ? { note: out.note } : {}) };
  }

  /** Add one of a compendium item to the pack (a second copy bumps the count) and say what happened. */
  addItem(id: string): boolean {
    const had = this.character?.inventory.find(e => e.id === id)?.qty ?? 0;
    if (!this.dispatch({ type: "addItem", id }).ok) return false;
    const name = this.host.registry.get<ItemData>("item", id)?.name ?? id;
    this.host.notify(had ? `Added ${name} (now ${had + 1})` : `Added ${name}.`);
    return true;
  }

  /**
   * Use one of an inventory entry: take one off the stack, and when the item heals (a potion) roll its dice and heal.
   * Says what happened in words.
   */
  useItem(index: number): boolean {
    const c = this.character, e = c?.inventory[index];
    if (!c || !e || e.qty <= 0) return false;
    const it = e.id ? this.host.registry.get<ItemData>("item", e.id) : undefined, name = it?.name ?? e.name ?? "Item", left = e.qty - 1;
    const tail = left > 0 ? `${left} left.` : "None left. It stays in your inventory, greyed out.";
    if (!it?.data.heal) {
      this.dispatch({ type: "itemQty", index, qty: left });
      this.host.notify(left > 0 ? `Used ${name}: ${left} left.` : `Used ${name}: none left. It stays in your inventory, greyed out.`);
      return true;
    }
    let rolled: number;
    try { rolled = Number(this.damage(`${name} healing`, it.data.heal).total); }
    catch (x) { this.host.notify(`${name}: ${(x as Error).message}`); return false; }
    const before = this.stats()!.hp.current;
    if (!this.dispatch({ type: "itemQty", index, qty: left }).ok || !this.dispatch({ type: "heal", amount: rolled }).ok) return false;
    const healed = this.stats()!.hp.current - before;
    this.host.notify(`${name}: healed ${healed}${healed < rolled ? ` (rolled ${rolled}, but that is all the room you had)` : ""}. ${tail}`);
    return true;
  }

  // ---- Hexploration: rations and foraging

  /** Put `n` more rations in the pack: onto the existing stack, else a new entry (the compendium rations, or a custom "Rations (1 day)"). */
  addRations(n: number): boolean {
    const c = this.character; if (!c || n < 1) return false;
    const i = findRations(c, this.host.registry);
    if (i >= 0) return this.dispatch({ type: "itemQty", index: i, qty: c.inventory[i].qty + n }).ok;
    if (this.host.registry.get("item", "rations")) {
      if (!this.dispatch({ type: "addItem", id: "rations" }).ok) return false;
      return n === 1 || this.dispatch({ type: "itemQty", index: this.character!.inventory.length - 1, qty: n }).ok;
    }
    return this.dispatch({ type: "addCustomItem", name: "Rations (1 day)", qty: n, weight: 2, consumable: true }).ok;
  }
  /** Forage for food: a Wisdom (Survival) check. A quick forage takes half the time and has disadvantage. Says in words what was found. */
  forage(quick: boolean, ev: Mods = {}): void {
    const c = this.character, st = this.stats(); if (!c || !st || !this.guard()) return;
    const sk = st.skills.find(k => k.id === "survival");
    const r = this.roll(quick ? "Quick forage (Wisdom, Survival)" : "Forage (Wisdom, Survival)", sk?.mod ?? st.mods.wis, { kind: "skill", abil: "wis", skill: "survival" }, ev, undefined, quick ? "dis" : undefined);
    const total = typeof r.total === "number" ? r.total : 0, days = foodDays(total);
    if (!days) { this.host.notify(`Found nothing to eat (rolled ${r.total}, needed 10).`); return; }
    const tonight = (c.rest.foraged ?? 0) === 0, extra = tonight ? days - 1 : days, dayWord = `${days} day${days === 1 ? "" : "s"}`;
    if (tonight) { const v = structuredClone(this.character!); v.rest.foraged = 1; this.commit(v); }
    if (extra > 0) this.addRations(extra);
    const what = [tonight ? "tonight's meal" : "", extra ? `${extra} ration${extra === 1 ? "" : "s"} into your pack` : ""].filter(Boolean).join(" plus ");
    this.host.notify(`Found food for ${dayWord}: ${what}`);
  }

  toggleItemMenu(index: number) { this.itemMenu = this.itemMenu === index ? null : index; this.confirmRemove = false; this.emit(); }
  askRemove(on: boolean) { this.confirmRemove = on; this.emit(); }
  /** Remove the entry (after the Yes tap); its pin goes with it. */
  removeItemAt(index: number): boolean {
    const e = this.character?.inventory[index]; if (!e) return false;
    const name = this.host.registry.get<ItemData>("item", e.id ?? "")?.name ?? e.name ?? "Item";
    this.itemMenu = null; this.confirmRemove = false;
    if (!this.dispatch({ type: "removeItem", index }).ok) return false;
    this.host.notify(`Removed ${name}.`); return true;
  }

  /** Add the custom item typed into the form. A problem is shown under the form in plain words. */
  submitCustomItem(): boolean {
    const f = this.customItem, qty = f.qty.trim() === "" ? NaN : Number(f.qty), weight = f.weight.trim() === "" ? undefined : Number(f.weight);
    const bad = customItemProblem({ name: f.name, qty, ...(weight !== undefined ? { weight } : {}) });
    if (bad) { f.error = bad; this.emit(); return false; }
    const name = f.name.trim(), had = this.character?.inventory.find(e => !e.id && e.name?.toLowerCase() === name.toLowerCase())?.qty ?? 0;
    this.customItem = blankCustomItem();   // before the dispatch redraws, so the redrawn form is the empty one
    if (!this.dispatch({ type: "addCustomItem", name, qty, ...(weight !== undefined ? { weight } : {}), ...(f.consumable ? { consumable: true } : {}) }).ok) { this.customItem = f; return false; }
    this.host.notify(had ? `Added ${name} (now ${had + qty})` : `Added ${name}.`);
    return true;
  }

  /** Start or end a toggle (Rage, a stance, an aura) and say in words what happened, including why it could not start. */
  toggle(id: string, on: boolean, value?: number): boolean {
    const out = this.dispatch({ type: "toggle", id, on, ...(value !== undefined ? { value } : {}) });
    if (out.ok && out.note) this.host.notify(out.note);
    return out.ok;
  }

  /** Roll the Constitution save the concentration prompt asks for; failing it ends the spell. */
  rollConcentration() {
    const chk = this.concentrationCheck, st = this.stats(), c = this.character;
    if (!chk || !st || !c) return;
    const name = this.host.registry.get<SpellData>("spell", chk.spell)?.name ?? chk.spell;
    this.concentrationCheck = null;
    const r = this.roll(`Concentration save (DC ${chk.dc})`, st.concentrationSave, { kind: "save", abil: "con", concentration: true });
    if (r.total !== "fail" && r.total >= chk.dc) { this.host.notify(`Concentration kept: ${name} continues.`); return; }
    if (c.concentration === chk.spell) this.dispatch({ type: "endConcentration" });
    this.host.notify(`Concentration lost: ${name} ends.`);
  }
  dismissConcentrationCheck() { this.concentrationCheck = null; this.emit(); }

  // ---- combos

  /** Open the combo form on combo `index`, or on a blank one when `index` is null. */
  startComboEdit(index: number | null) {
    const c = this.character; if (!c || !this.guard()) return;
    const existing = index === null ? undefined : c.combos[index];
    if (index !== null && !existing) return;
    this.comboDraft = { index, combo: existing ? structuredClone(existing) : blankCombo() }; this.open({ kind: "combo-edit" });
  }
  /** Change the draft in a way that needs the form drawn again (a step added, moved or removed, a different pick). */
  touchComboDraft(mut: (d: Combo) => void) { const d = this.comboDraft; if (!d) return; mut(d.combo); delete d.error; delete d.confirmDelete; this.emit(); }
  saveComboDraft(): boolean {
    const d = this.comboDraft; if (!d) return false;
    const bad = validateCombo(d.combo);
    if (bad) { d.error = bad; this.emit(); return false; }
    if (!this.dispatch({ type: "combo", combo: d.combo, ...(d.index !== null ? { index: d.index } : {}) }).ok) return false;
    this.comboDraft = null; this.close(); return true;
  }
  cancelComboEdit() { this.comboDraft = null; this.close(); }
  /** Deleting asks twice: the first tap changes the button to "Tap again to delete". */
  deleteComboDraft(): boolean {
    const d = this.comboDraft; if (!d || d.index === null) return false;
    if (!d.confirmDelete) { d.confirmDelete = true; this.emit(); return false; }
    if (!this.dispatch({ type: "comboRemove", index: d.index }).ok) return false;
    this.comboDraft = null; this.close(); return true;
  }
  /** Move the combo being edited one place earlier or later in the list. */
  moveComboDraft(by: -1 | 1) {
    const d = this.comboDraft; if (!d || d.index === null || !this.character?.combos[d.index + by]) return;
    if (this.dispatch({ type: "comboMove", index: d.index, by }).ok) { d.index += by; this.emit(); }
  }
  pinCombo(index: number, on: boolean) { this.dispatch({ type: "comboPin", index, on }); }

  /** Spend `amount` of a resource by name (a combo step) and say in words when there is not enough. */
  spendResource(name: string, amount: number): boolean {
    const st = this.stats(), r = st?.resources.find(x => slug(x.name) === slug(name));
    if (!st || !r) { this.host.notify(`${name} is not on this sheet.`); return false; }
    const plain = { crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } };
    if (r.unlimited) { this.record({ title: `${r.name} used`, total: 0, dice: [], detail: r.unlimited, ...plain }); return true; }
    if (r.used + amount > r.max) { this.host.notify(`No ${r.name} left. Take a rest first.`); return false; }
    const ok = r.derived ? this.dispatch({ type: "uses", id: r.id, used: r.used + amount }).ok : this.dispatch({ type: "resource", index: Number(r.id.split(":")[1]), used: r.used + amount }).ok;
    if (ok) this.record({ title: `${r.name} -${amount}`, total: 0, dice: [], detail: `${r.max - r.used - amount} of ${r.max} left`, ...plain });
    return ok;
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
  roll(title: string, mod: number, target: RollTarget, ev: Mods = {}, who?: number, force?: RollMode): RollResult {
    const st = who === undefined ? this.stats() : this.companionStats()[who];
    const src = st ? rollSources(st.effects, target) : { adv: [], dis: [], fail: [] };
    const chosen: RollMode = ev.shiftKey ? "adv" : (ev.ctrlKey || ev.metaKey) ? "dis" : this.mode;
    // `force` is a mode the action itself imposes (a hurried forage): it cancels the opposite mode the player picked
    const mode: RollMode = force === undefined ? chosen : force === chosen || chosen === "normal" ? force : "normal";
    this.mode = "normal";
    const crit = st && target.kind === "attack" ? critInfo(st.effects, target) : undefined;
    // Reliable Talent, Halfling Lucky and the like: a minimum for the die, or a reroll of low dice.
    const skill = target.kind === "skill" ? st?.skills.find(k => k.id === target.skill) : undefined;
    const rules = st ? d20Rules(st.effects, target, !!skill && (skill.prof || skill.expertise)) : undefined;
    return this.record(rollD20({ title, mod, mode, ...src, ...(crit ? { critRange: crit.range, critNote: crit.hints } : {}), ...(this.host.rng ? { rng: this.host.rng } : {}),
      ...(rules?.min !== undefined ? { min: rules.min } : {}), ...(rules?.reroll !== undefined ? { reroll: rules.reroll } : {}), ...(rules?.notes.length ? { ruleNotes: rules.notes } : {}) }));
  }
  damage(title: string, expr: string): RollResult { return this.record(rollDice(title, expr, this.host.rng)); }

  setMode(m: RollMode) { this.mode = m; this.emit(); }
  setEditing(on: boolean) { this.editing = on; this.confirmUndo = false; if (!on && this.panel?.kind === "customize") this.panel = null; this.emit(); }
  /** Whether the traits card section `id` is collapsed (default: expanded). */
  isCollapsed(id: string) { return this.collapsedSet().has(id); }
  toggleCollapsed(id: string) {
    const s = this.collapsedSet(); if (!s.delete(id)) s.add(id);
    this.host.setCollapsedGroups?.([...s]); this.emit();
  }
  private collapsedSet() { return (this.collapsed ??= new Set(this.host.collapsedGroups?.() ?? [])); }
  setTab(t: string) { this.tab = t; this.emit(); }
  open(p: Panel) { if (p.kind === "compendium") { this.customItem = blankCustomItem(); this.itemSearch = blankItemSearch(); } this.panel = p; this.emit(); }
  close() { this.panel = null; this.emit(); }

  restCtx(): RestCtx { return { c: this.character!, stats: this.stats()!, registry: this.host.registry, rules: this.rules() }; }
  /** Lines optional rules add to a rest (Hexploration: the night's meal). `c` is changed; pass a copy for a preview. */
  private restHooks(id: string, ctx: RestCtx, c: Character): string[] {
    const rules = this.rules();
    return MODULES.filter(m => rules[m.id] && m.onRest).flatMap(m => m.onRest!(id, ctx, c));
  }
  restPreview(id: string) {
    const r = activeRests(this.rules()).find(x => x.id === id); if (!r) return [];
    const ctx = this.restCtx();
    return [...r.preview(ctx, this.restOpts), ...this.restHooks(id, ctx, structuredClone(ctx.c))];
  }
  rest(id: string) {
    if (!this.guard() || !this.character) return;
    const r = activeRests(this.rules()).find(x => x.id === id); if (!r) return;
    const ctx = this.restCtx(), out = r.apply(ctx, this.restOpts);
    out.summary.push(...this.restHooks(id, ctx, out.value));
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
  /** Everything the wizard's current picks would change, in plain words (before and after the level). */
  levelUpChanges(): ChangeGroup[] {
    const c = this.character, pre = this.levelUpPreview();
    return c && !("error" in pre) ? explainChange(c, pre.value, this.ctx()) : [];
  }
  /** What undoing the last level would change: the same list, reversed. */
  undoChanges(): ChangeGroup[] {
    const c = this.character; if (!c || !c.levelLog.length) return [];
    const r = undoLevel(c, this.host.registry);
    return "error" in r ? [] : explainChange(c, r.value, this.ctx());
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
        if (!r.unlimited && r.used + amount > r.max) { this.host.notify(`No ${r.name} left for ${a.name}`); return; }
        if (r.unlimited) parts.push(`${r.name} (${r.unlimited.toLowerCase()})`);
        else { if (!this.dispatch({ type: "uses", id, used: r.used + amount }).ok) return; parts.push(`${r.name} -${amount}`); }
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
