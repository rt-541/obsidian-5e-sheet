import type { Registry } from "../content/registry";
import { slug } from "../content/registry";
import type { Draft } from "../content/creature-note";
import type { SpellDraft } from "../content/spell-note";
import type { CampaignData, ItemData, LevelingMode, SpellData } from "../content/types";
import { apply, applyNpc, customItemProblem, itemPinRef, type Action, type Limits } from "../core/actions";
import type { Character, Combo, Npc, Parsed } from "../core/character";
import { entryItem, entryName, entryVariant, isGear } from "../core/item-entry";
import { changeFromForm, plainBonus, type ItemChangeForm } from "./item-change-ui";
import type { ItemVariant } from "../content/types/item";
import { blankCombo, validateCombo } from "../core/combos";
import { customizeKey, layerRow, type Customization, type RowDefs } from "../core/customize";
import { customizationFrom, formFrom, formProblem, type CustomizeForm } from "./customize-form";
import { actionDc, deriveCharacter, deriveCompanion, deriveNpc, type ActorStats } from "../core/derive";
import { critDamageOf, rollD20, rollDice, rollKeepHigher } from "../core/dice";
import { affordable, onHitOptions, spendWords, toHitOptions, type AttackOptionRow } from "../core/attack-options";
import { d20Words, damageWords, saveWords, spaced, type Extra } from "../core/own-dice";
import { matchesTag } from "../core/roll-tags";
import { critInfo, d20Rules, rollSources } from "../core/effects";
import { explainChange, type ChangeGroup } from "../core/level-diff";
import { evalFormula, fillDice } from "../core/formula";
import { applyLevel, applyResolve, levelFromXp, planLevel, planResolve, rollHitDie, undoLevel, xpProgress, MAX_TOTAL_LEVEL, type LevelPlan, type Step } from "../core/levelup";
import type { ActionDef } from "../content/types/ops";
import { formulaVars } from "../core/progression";
import type { Abil, RollMode, RollResult, RollTarget, Rng } from "../core/types";
import { activeRests, MODULES, OWN_DICE } from "../rules";
import { blankItemDraft, parseItemBlock, validateItemDraft, type ChargeReset, type ItemDraft, type ItemKind } from "../content/itemblock";
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
  /** Save a custom item as a Homebrew note and register it; resolves to its item id. Never overwrites an existing note. */
  saveItem?(draft: ItemDraft): Promise<string>;
  /** Save a custom spell as a Homebrew note and register it. Never overwrites an existing note. */
  saveSpell?(draft: SpellDraft): Promise<{ id: string; name: string; path: string }>;
  /** Rewrite the spell fields of a spell note the player made (its id, other properties and body are kept). */
  updateSpell?(target: { id: string; path: string; sourceName: string; body?: string }, draft: SpellDraft): Promise<{ id: string; name: string; path: string }>;
  /** Open a note in Obsidian. */
  openNote?(path: string): void;
  /** Trait groups the player collapsed, kept per character in plugin data (not in the note). */
  collapsedGroups?(): string[];
  setCollapsedGroups?(ids: string[]): void;
}
export type Panel =
  | { kind: "conditions"; who?: number } | { kind: "log" } | { kind: "rest"; id: string }
  | { kind: "compendium" } | { kind: "add-companion" } | { kind: "customize" } | { kind: "customize-row" } | { kind: "item-change"; index: number }
  | { kind: "cast"; spell: string } | { kind: "add-spell"; edit?: { mode: "edit" | "copy"; id: string } } | { kind: "details"; ref: string } | { kind: "level-up" } | { kind: "combo-edit" };
/** What the Customize form is changing: a feature (by key) or an inventory row (by index). */
export type CustomizeTarget = { kind: "feature"; key: string; name: string; pinRef: string } | { kind: "item"; index: number };
/** The Customize form: typing changes `form` without redrawing. */
export interface CustomizeDraft { target: CustomizeTarget; form: CustomizeForm; error?: string }
/** The combo form: `index` is the combo being changed, or null for a new one. Typing changes the draft without redrawing. */
export interface ComboDraft { index: number | null; combo: Combo; error?: string; confirmDelete?: boolean; }
/** The level-up wizard: `level` adds a class level, `resolve` only answers choices a note still owes. */
export interface LevelUpView { featOpen: Set<string>; spellQuery: string; featQuery: string; /** Builder: the race or class whose About card is open. */ about?: string; }
export interface LevelUpState {
  mode: "level" | "resolve"; classId?: string; page: number; /** Search text and the feat/ability switch, kept across redraws. */ view: LevelUpView;
  hp?: { method: "roll" | "average"; roll?: number }; choices: Record<string, unknown>; error?: string;
}
/** The "custom item" form in the add panel: raw text as typed, so a half-typed number is kept as is. */
export interface CustomItemForm {
  name: string; qty: string; weight: string; consumable: boolean; error?: string;
  /** The extra fields (kind, rarity, charges ...) are shown. They matter when the item is saved to the compendium. */
  more: boolean; kind: ItemKind; base: string; rarity: string; attunement: boolean; attunementNote: string;
  chargesMax: string; chargesReset: ChargeReset; attackBonus: string; damageBonus: string; acBonus: string; heal: string; description: string; /** Price in copper, carried over from an import. */ value?: number;
  /** The import view (paste text) is showing instead of the form. */ importing: boolean; importText: string; showTemplate: boolean; unread: string[];
}
export const blankCustomItem = (): CustomItemForm => ({ name: "", qty: "1", weight: "", consumable: false, more: false, kind: "gear", base: "", rarity: "", attunement: false, attunementNote: "",
  chargesMax: "", chargesReset: "dawn", attackBonus: "", damageBonus: "", acBonus: "", heal: "", description: "", importing: false, importText: "", showTemplate: false, unread: [] });
type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

/** The box that tells a player who rolls their own dice what to roll. */
export type OwnRoll =
  | { kind: "say"; entry: RollResult; error?: string }
  | { kind: "attack"; entry: RollResult; ai: number; crit: boolean; error?: string }
  | { kind: "total"; title: string; say: string; min?: number; max?: number; error?: string; roll(): number; apply(total: number): void };

export const LOG_MAX = 50;
/** How long after an attack roll the damage button still counts as "it hit". */
export const HIT_WINDOW_MS = 3000;

export class SheetController {
  value: Character | Npc; errors: string[]; writable: boolean;
  mode: RollMode = "normal"; editing = false; tab = ""; amount = 5;
  /** Optional damage type chosen next to the Damage button (resistance, immunity and vulnerability use it). */
  damageType = "";
  /** After damage while concentrating: the save the player is asked to make. */
  concentrationCheck: { dc: number; spell: string } | null = null;
  comboDraft: ComboDraft | null = null;
  /** The Customize form for one feature or item row. */
  customizeDraft: CustomizeDraft | null = null;
  /** The add panel's custom item form; typing changes it without redrawing. */
  customItem: CustomItemForm = blankCustomItem();
  /** The add panel's search text and kind chip. */
  itemSearch: ItemSearch = blankItemSearch();
  /** Which inventory row has its "..." options open. */
  itemMenu: number | null = null;
  /** The Change item form for one inventory row; typing changes it without redrawing. */
  itemChange: ItemChangeForm | null = null;
  /** Which companion card has its "..." options open. */
  companionMenu: number | null = null;
  /** The open menu is asking "Remove <name>? Yes / No". */
  confirmRemove = false;
  /** The next redraw puts the keyboard focus on the element with this data-keep (desktop only). */
  focusNext?: string;
  panel: Panel | null = null; levelUp: LevelUpState | null = null; confirmUndo = false; lastRoll?: RollResult; toastItem?: { kind: "roll"; roll: RollResult } | { kind: "notice"; text: string }; restOpts: RestOptions = { samePlace: true, safeHaven: false };
  /** Set for a few seconds after an own attack is rolled to hit; the damage button then counts as a hit. */
  hitWindow: { ai: number; name: string; crit: boolean } | null = null;
  /** Own-dice play: the open "roll this" box, if any. */
  ownRoll: OwnRoll | null = null;
  private hitTimer: ReturnType<typeof setTimeout> | undefined;
  private subs = new Set<() => void>();
  private collapsed?: Set<string>;

  constructor(public host: SheetHost, parsed: Exclude<Parsed, { kind: "none" }>) {
    this.value = parsed.value; this.errors = parsed.errors; this.writable = parsed.writable;
    void this.hydrateInventory();
  }
  /**
   * Read the library items in the inventory in full, once, so a generic item whose note says "(any sword)" in its text is
   * recognised and its row can ask "Which weapon?". Redraws only when something was read.
   */
  async hydrateInventory(): Promise<void> {
    const reg = this.host.registry, ids = new Set((this.character?.inventory ?? []).map(e => e.id).filter((x): x is string => !!x));
    let read = false;
    for (const id of ids) {
      const entry = reg.get("item", id); if (!entry?.library) continue;
      try { const before = entry.data; await reg.hydrate(entry); if (entry.data !== before) read = true; } catch { /* an unreadable note keeps what it had */ }
    }
    if (read) this.emit();
  }
  get isNpc() { return this.value.type === "5e-npc"; }
  get character(): Character | undefined { return this.value.type === "5e-character" ? this.value : undefined; }

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  emit() { this.subs.forEach(f => f()); }

  /** Replace the value after an external file change (Obsidian Sync, manual edit). */
  reload(parsed: Exclude<Parsed, { kind: "none" }>) { this.closeHitWindow(); this.ownRoll = null; this.value = parsed.value; this.errors = parsed.errors; this.writable = parsed.writable; this.emit(); }

  /** The registry the pickers (level-up wizard, add spell / item / companion) list from: sources this campaign switched off are left out. */
  pickers(): Registry { return this.host.registry.scoped(this.host.campaign?.sources); }
  ctx() { return { registry: this.host.registry, ...(this.host.campaign ? { campaign: this.host.campaign } : {}) }; }
  rules() { return resolveRules(MODULES, [this.host.ruleDefaults, this.host.campaign?.rules, this.value.rules]); }
  /** Whether the player rolls their own dice instead of the sheet rolling for them. */
  ownDice(): boolean { return !!this.rules()[OWN_DICE]; }
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
      chargesMax: i => { const e = c?.inventory[i]; return (e && entryItem(e, this.host.registry)?.charges?.max) || 0; } };
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
    if (a.type === "equip" || a.type === "attune" || a.type === "removeItem" || a.type === "addItem" || a.type === "addCustomItem") this.gripPrompt = null;
    this.commit(out.value);
    if ((a.type === "damage" || a.type === "equip" || a.type === "attune" || a.type === "hands") && "note" in out && out.note) this.host.notify(out.note);
    if ("concentrationCheck" in out && out.concentrationCheck) {
      const prev = this.concentrationCheck;
      this.concentrationCheck = prev && prev.spell === out.concentrationCheck.spell && prev.dc > out.concentrationCheck.dc ? prev : out.concentrationCheck;
      this.emit();
    } else if (this.concentrationCheck && (a.type === "endConcentration" || this.character?.concentration !== this.concentrationCheck.spell)) { this.concentrationCheck = null; this.emit(); }
    return { ok: true, ...("note" in out && out.note ? { note: out.note } : {}) };
  }

  /** The inventory index whose "put away your shield?" question is open. */
  gripPrompt: number | null = null;
  askGrip(index: number | null): void { this.gripPrompt = index; this.emit(); }
  /** Hold a weapon in one or two hands; two hands can put the shield away in the same step. */
  setHands(index: number, hands: 1 | 2, putAwayShield = false): boolean {
    this.gripPrompt = null;
    return this.dispatch({ type: "hands", index, hands, ...(putAwayShield ? { putAwayShield } : {}) }).ok;
  }

  /** Add one of a compendium item to the pack (a second copy bumps the count) and say what happened. */
  addItem(id: string): boolean {
    const had = this.character?.inventory.find(e => e.id === id)?.qty ?? 0;
    if (!this.dispatch({ type: "addItem", id }).ok) return false;
    const name = this.host.registry.get("item", id)?.name ?? id;
    this.host.notify(had ? `Added ${name} (now ${had + 1})` : `Added ${name}.`);
    return true;
  }

  /** The generic item or gear being added: which armor or weapon it is made from, if chosen. The Add item panel shows the choice. */
  addPick: { id: string; base?: string } | null = null;
  /**
   * Start adding an item from the Add item panel. Potions and other plain items are added at once; armor, shields, weapons and
   * generic items ("+1 armor") open the pick view instead. A library item is read in full first so "(any sword)" is recognised.
   */
  async startAdd(id: string): Promise<void> {
    const entry = this.host.registry.get("item", id);
    const known = () => { const d = entryItem({ id, qty: 1, equipped: false, attuned: false }, this.host.registry); return { gear: !!d && isGear(d), variant: !!d?.variant }; };
    if (entry?.library && !known().gear && !known().variant) await this.host.registry.hydrate(entry);
    const k = known();
    if (!k.gear && !k.variant) { this.addItem(id); return; }
    this.addPick = { id }; this.emit();
  }
  /** Choose the armor or weapon a generic item is made from (undefined goes back to the list of choices). */
  pickBase(base: string | undefined): void {
    if (!this.addPick) return;
    this.addPick = base ? { id: this.addPick.id, base } : { id: this.addPick.id }; this.emit();
  }
  /** Add the picked item: put on, put on and attuned, or just carried. */
  finishAdd(how: "equip" | "attune" | "add"): boolean {
    const p = this.addPick; if (!p) return false;
    const r = this.dispatch({ type: "addItem", id: p.id, ...(p.base ? { base: p.base } : {}), ...(how !== "add" ? { equip: true } : {}), ...(how === "attune" ? { attune: true } : {}) });
    if (!r.ok) return false;
    const name = entryName({ id: p.id, qty: 1, equipped: false, attuned: false, ...(p.base ? { base: p.base } : {}) }, this.host.registry);
    this.host.notify(`Added ${name}.${r.note ? ` ${r.note}` : ""}`);
    this.addPick = null; this.emit();
    return true;
  }

  /**
   * Use one of an inventory entry: take one off the stack, and when the item heals (a potion) roll its dice and heal.
   * Says what happened in words.
   */
  useItem(index: number): boolean {
    const c = this.character, e = c?.inventory[index];
    if (!c || !e || e.qty <= 0) return false;
    const it = entryItem(e, this.host.registry), name = it?.name ?? e.name ?? "Item", left = e.qty - 1;
    if (!it?.heal) {
      this.dispatch({ type: "itemQty", index, qty: left });
      this.host.notify(left > 0 ? `Used ${name}: ${left} left.` : `Used ${name}: none left. It stays in your inventory, greyed out.`);
      return true;
    }
    if (this.ownDice()) {
      const expr = it.heal, title = `${name} healing`;
      this.askTotal({ title, say: damageWords({ expr }), min: 0, roll: () => Number(rollDice(title, expr, this.host.rng).total),
        apply: n => { const now = this.character?.inventory[index]; if (now && now.id === e.id && now.qty > 0) this.healWith(index, name, n); } });
      return true;
    }
    let rolled: number;
    try { rolled = Number(this.damage(`${name} healing`, it.heal).total); }
    catch (x) { this.host.notify(`${name}: ${(x as Error).message}`); return false; }
    return this.healWith(index, name, rolled);
  }
  /** Use one of entry `index` and heal `rolled`, saying what happened. */
  private healWith(index: number, name: string, rolled: number): boolean {
    const e = this.character?.inventory[index]; if (!e) return false;
    const left = e.qty - 1, tail = left > 0 ? `${left} left.` : "None left. It stays in your inventory, greyed out.";
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
    if (this.ownDice()) {
      const target: RollTarget = { kind: "skill", abil: "wis", skill: "survival" }, title = quick ? "Quick forage (Wisdom, Survival)" : "Forage (Wisdom, Survival)";
      const mod = sk?.mod ?? st.mods.wis, setup = this.d20Setup(target, ev, undefined, quick ? "dis" : undefined);
      this.askTotal({ title, say: `${this.d20Say(mod, setup)} (Wisdom, Survival)`, roll: this.d20Roller(title, mod, setup), apply: n => this.forageWith(n) });
      return;
    }
    const r = this.roll(quick ? "Quick forage (Wisdom, Survival)" : "Forage (Wisdom, Survival)", sk?.mod ?? st.mods.wis, { kind: "skill", abil: "wis", skill: "survival" }, ev, undefined, quick ? "dis" : undefined);
    this.forageWith(typeof r.total === "number" ? r.total : 0, r.total);
  }
  /** The result of a forage check that came to `total`. */
  private forageWith(total: number, shown: number | string = total): void {
    const c = this.character; if (!c) return;
    const days = foodDays(total);
    if (!days) { this.host.notify(`Found nothing to eat (rolled ${shown}, needed 10).`); return; }
    const tonight = (c.rest.foraged ?? 0) === 0, extra = tonight ? days - 1 : days, dayWord = `${days} day${days === 1 ? "" : "s"}`;
    if (tonight) { const v = structuredClone(this.character!); v.rest.foraged = 1; this.commit(v); }
    if (extra > 0) this.addRations(extra);
    const what = [tonight ? "tonight's meal" : "", extra ? `${extra} ration${extra === 1 ? "" : "s"} into your pack` : ""].filter(Boolean).join(" plus ");
    this.host.notify(`Found food for ${dayWord}: ${what}`);
  }

  toggleItemMenu(index: number) { this.itemMenu = this.itemMenu === index ? null : index; this.companionMenu = null; this.confirmRemove = false; this.emit(); }
  toggleCompanionMenu(index: number) { this.companionMenu = this.companionMenu === index ? null : index; this.itemMenu = null; this.confirmRemove = false; this.emit(); }
  /** Remove the companion (after the Yes tap). */
  removeCompanionAt(index: number): boolean {
    const comp = this.character?.companions[index]; if (!comp) return false;
    this.companionMenu = null; this.confirmRemove = false;
    if (!this.dispatch({ type: "removeCompanion", index }).ok) return false;
    this.host.notify(`Removed ${comp.name}.`); return true;
  }
  /** Split a stack of armor or weapons into one row per piece. */
  splitItem(index: number): boolean {
    const e = this.character?.inventory[index]; if (!e) return false;
    const it = entryItem(e, this.host.registry), n = Math.floor(e.qty), name = entryName(e, this.host.registry);
    if (!it || !isGear(it) || n < 2) return false;
    if (!this.dispatch({ type: "itemSplit", index }).ok) return false;
    this.itemMenu = null; this.confirmRemove = false; this.emit();
    this.host.notify(`Split ${name} into ${n} rows.`); return true;
  }
  askRemove(on: boolean) { this.confirmRemove = on; this.emit(); }
  /** Remove the entry (after the Yes tap); its pin goes with it. */
  removeItemAt(index: number): boolean {
    const e = this.character?.inventory[index]; if (!e) return false;
    const name = entryItem(e, this.host.registry)?.name ?? e.name ?? "Item";
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

  /** Fill the item form from pasted text (a layout the 5e-item reader understands), listing what it could not read. */
  readItemText(text: string) {
    const { draft: d, unread } = parseItemBlock(text), f = blankCustomItem(), num = (n: number | undefined) => (n === undefined ? "" : String(n));
    Object.assign(f, { name: d.name, kind: d.kind, base: d.base ?? "", rarity: d.rarity ?? "", attunement: d.attunement, attunementNote: d.attunementNote ?? "", weight: num(d.weight),
      chargesMax: num(d.charges?.max), chargesReset: d.charges?.reset ?? "dawn", attackBonus: num(d.attackBonus), damageBonus: num(d.damageBonus), acBonus: num(d.acBonus),
      heal: d.heal ?? "", description: d.description, value: d.value, consumable: d.kind === "consumable", more: true, importing: false, unread });
    this.customItem = f;   // a fresh form, so a quantity typed before the import is not inherited
    this.emit();
  }
  /** The form as an item draft; text that is not a number becomes NaN so the validator names it. */
  itemDraftFromForm(): ItemDraft {
    const f = this.customItem, n = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const d = blankItemDraft();
    Object.assign(d, { name: f.name.trim(), kind: f.kind, attunement: f.attunement, description: f.description.trim() });
    const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K] | undefined) => { if (v !== undefined) d[k] = v; };
    set("base", f.base.trim() || undefined); set("rarity", f.rarity || undefined); set("attunementNote", f.attunement ? f.attunementNote.trim() || undefined : undefined);
    set("weight", n(f.weight)); set("value", f.value); set("heal", f.heal.trim() || undefined);
    const max = n(f.chargesMax); if (max !== undefined) d.charges = { max, reset: f.chargesReset };
    set("attackBonus", n(f.attackBonus)); set("damageBonus", n(f.damageBonus)); set("acBonus", n(f.acBonus));
    return d;
  }
  /** Save the form's item as a Homebrew note, then put it in the pack. The panel stays open. */
  async saveItemToCompendium(): Promise<boolean> {
    const f = this.customItem, save = this.host.saveItem;
    if (!save || !this.character) return false;
    const qty = f.qty.trim() === "" ? NaN : Number(f.qty), draft = this.itemDraftFromForm();
    const bad = !Number.isInteger(qty) || qty < 1 ? "How many? Use a whole number, 1 or more." : validateItemDraft(draft)[0];
    if (bad) { f.error = bad; this.emit(); return false; }
    try {
      const id = await save(draft);
      this.customItem = blankCustomItem();
      if (!this.dispatch({ type: "addItem", id }).ok) return false;
      if (qty > 1) { const i = this.character.inventory.findIndex(e => e.id === id); if (i >= 0) this.dispatch({ type: "itemQty", index: i, qty }); }
      this.host.notify(`Saved ${this.host.registry.get("item", id)?.name ?? draft.name} to your Homebrew items and added it.`);
      return true;
    } catch (x) { f.error = x instanceof Error ? x.message : String(x); this.emit(); return false; }
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
    const target: RollTarget = { kind: "save", abil: "con", concentration: true }, title = `Concentration save (DC ${chk.dc})`;
    if (this.ownDice()) {
      const setup = this.d20Setup(target, {});
      this.askTotal({ title, say: `${this.d20Say(st.concentrationSave, setup)} (Constitution save, DC ${chk.dc})`, roll: this.d20Roller(title, st.concentrationSave, setup),
        apply: n => { this.concentrationCheck = null; this.concentrationResult(chk.spell, name, n >= chk.dc); } });
      return;
    }
    this.concentrationCheck = null;
    const r = this.roll(title, st.concentrationSave, target);
    this.concentrationResult(chk.spell, name, r.total !== "fail" && r.total >= chk.dc);
  }
  private concentrationResult(spell: string, name: string, kept: boolean) {
    if (kept) { this.host.notify(`Concentration kept: ${name} continues.`); return; }
    if (this.character?.concentration === spell) this.dispatch({ type: "endConcentration" });
    this.host.notify(`Concentration lost: ${name} ends.`);
  }
  /** Roll a death save: a 20 brings you back up, a 1 is two failures, 10 or more a success, anything else a failure. */
  rollDeathSave(ev: Mods = {}): void {
    const c = this.character; if (!c || !this.deathSaveOpen()) return;
    const target: RollTarget = { kind: "death-save" }, title = "Death save";
    if (this.ownDice()) {
      const setup = this.d20Setup(target, ev);
      this.askTotal({ title, say: `${this.d20Say(0, setup)}. Type the number on the die you keep.`, min: 1, max: 20, roll: this.d20Roller(title, 0, setup), apply: n => this.deathSaveWith(n) });
      return;
    }
    const r = this.roll(title, 0, target, ev);
    this.deathSaveWith(r.total === "fail" ? 2 : r.natural ?? Number(r.total));
  }
  /** A death save is only for someone at 0 hit points who is neither stable (3 successes) nor dead (3 failures). */
  deathSaveOpen(): boolean {
    const c = this.character; if (!c) return false;
    return this.stats()?.hp.current === 0 && c.deathSaves.successes < 3 && c.deathSaves.failures < 3;
  }
  private deathSaveWith(n: number): void {
    const c = this.character; if (!c || !this.deathSaveOpen()) return;
    if (n >= 20) { this.dispatch({ type: "heal", amount: 1 }); this.host.notify("Natural 20: you are back up with 1 hit point."); return; }
    const ds = c.deathSaves;
    if (n >= 10) {
      const v = Math.min(3, ds.successes + 1); this.dispatch({ type: "deathSave", which: "successes", value: v });
      if (v === 3) this.host.notify("Three successes: you are stable.");
      return;
    }
    const v = Math.min(3, ds.failures + (n === 1 ? 2 : 1)); this.dispatch({ type: "deathSave", which: "failures", value: v });
    if (v === 3) this.host.notify("Three failed death saves: your character dies.");
  }
  dismissConcentrationCheck() { this.concentrationCheck = null; this.emit(); }

  // ---- customize one feature or item row

  /** A target's name, the note's own switch, attack option and Use button, the effective ones, and the player's changes. */
  private customizeInfo(t: CustomizeTarget): { name: string; note: RowDefs; effective: RowDefs; mine?: Customization; pinRef: string; save(value?: Customization): Action; own(r: { ref: string; itemIndex?: number }): boolean } | undefined {
    const c = this.character, st = this.stats(); if (!c || !st) return undefined;
    if (t.kind === "feature") {
      const row = st.progress.features.find(f => f.key === t.key); if (!row) return undefined;
      const ref = customizeKey(t.key), mine = c.customize[ref];
      const effective: RowDefs = { ...(row.toggle ? { toggle: row.toggle } : {}), ...(row.attackOption ? { attackOption: row.attackOption } : {}), ...(row.action ? { action: row.action } : {}) };
      return { name: t.name, note: row.noteDefs ?? effective, effective, ...(mine ? { mine } : {}), pinRef: t.pinRef,
        save: value => ({ type: "customize", key: ref, ...(value ? { value } : {}) }), own: r => r.ref === ref };
    }
    const e = c.inventory[t.index], reg = e ? entryItem(e, this.host.registry) : undefined;
    // a hand-made item (name only) has no note: it can still get a Use button
    if (!e || (!reg && (e.id || !e.name))) return undefined;
    const note: RowDefs = reg ? { ...(reg.toggle ? { toggle: reg.toggle } : {}), ...(reg.attackOption ? { attackOption: reg.attackOption } : {}) } : {};
    const itemName = reg ? reg.name : e.name!;
    const l = layerRow(itemName, note, e.customize, st.level, () => undefined);
    return { name: itemName, note, effective: { ...(l.toggle ? { toggle: l.toggle } : {}), ...(l.attackOption ? { attackOption: l.attackOption } : {}), ...(l.action ? { action: l.action } : {}) },
      ...(e.customize ? { mine: e.customize } : {}), pinRef: itemPinRef(e),
      save: value => ({ type: "customizeItem", index: t.index, ...(value ? { value } : {}) }), own: r => r.itemIndex === t.index };
  }
  /** Open the Customize form on a feature or an inventory row. */
  startCustomize(t: CustomizeTarget) {
    if (!this.guard()) return;
    const c = this.character, info = this.customizeInfo(t);
    if (!c || !info) { this.host.notify("There is nothing to customize here."); return; }
    this.customizeDraft = { target: t, form: formFrom(info.effective, info.mine, c.mainPins.includes(info.pinRef), info.name) };
    this.open({ kind: "customize-row" });
  }
  /** Change the form in a way that needs it drawn again (a choice made, a row added). */
  touchCustomize(mut: (f: CustomizeForm) => void) { const d = this.customizeDraft; if (!d) return; mut(d.form); delete d.error; this.emit(); }
  saveCustomize(): boolean {
    const d = this.customizeDraft, c = this.character, st = this.stats(), info = d ? this.customizeInfo(d.target) : undefined;
    if (!d || !c || !st || !info) return false;
    const bad = formProblem(d.form, Object.keys(st.progress.scales));
    if (bad) { d.error = bad; this.emit(); return false; }
    // ids other rows already use; this row's own are free to keep
    // (an item's attack option has no itemIndex for own() to match, so this row's current ids are left out by value)
    const mine = new Set([info.effective.toggle?.id, info.effective.attackOption?.id].filter((x): x is string => !!x));
    const taken = [...st.toggles.filter(r => !info.own(r)).map(r => r.id), ...st.attackOptions.filter(r => !info.own({ ref: r.ref })).map(r => r.id)].filter(id => !mine.has(id));
    const value = customizationFrom(d.form, info.note, info.name, taken);
    const wasPinned = c.mainPins.includes(info.pinRef);
    if (!this.dispatch(info.save(Object.keys(value).length ? value : undefined)).ok) return false;
    if (d.form.pin !== wasPinned && !this.dispatch({ type: "pin", ref: info.pinRef, on: d.form.pin }).ok) return false;
    this.customizeDraft = null; this.close(); this.host.notify(`Saved your changes to ${info.name}.`); return true;
  }
  // ---- change one inventory row (its name, base, bonus, charges and notes)

  private static bonusText = (n: number) => (n ? String(n) : "");
  /** The generic item's variant behind a row, base chosen or not (undefined for an ordinary item). */
  itemVariantOf(index: number): ItemVariant | undefined {
    const e = this.character?.inventory[index];
    return e?.id ? entryVariant({ ...e, base: undefined }, this.host.registry) : undefined;
  }
  /** The row's item without its change, for the base the form has chosen. */
  private changePlain(f: ItemChangeForm) {
    const e = this.character?.inventory[f.index];
    return e ? entryItem({ ...e, base: f.base || undefined, change: undefined }, this.host.registry) : undefined;
  }
  /** Open the Change form on an inventory row. */
  openItemChange(index: number): void {
    if (!this.guard()) return;
    const e = this.character?.inventory[index], reg = this.host.registry;
    const plain = e && entryItem({ ...e, change: undefined }, reg);
    if (!e || !plain) { this.host.notify("There is nothing to change here."); return; }
    const now = entryItem(e, reg) ?? plain, ch = e.change?.charges ?? plain.charges;
    this.itemChange = { index, name: now.name, base: e.base ?? "", bonus: SheetController.bonusText(e.change?.bonus ?? plainBonus(plain, !!e.base)),
      chargesMax: ch ? String(ch.max) : "", chargesReset: ch?.reset ?? "dawn", notes: e.change?.notes ?? "" };
    this.itemMenu = null; this.confirmRemove = false;
    this.open({ kind: "item-change", index });
  }
  /** Pick another armor or weapon. A name or bonus still showing the old base's own follows the new one. */
  setChangeBase(base: string): void {
    const f = this.itemChange; if (!f) return;
    const old = this.changePlain(f), oldBased = !!f.base;
    f.base = base; delete f.error;
    const next = this.changePlain(f);
    if (old && next) {
      if (f.name.trim() === old.name) f.name = next.name;
      if (f.bonus === SheetController.bonusText(plainBonus(old, oldBased))) f.bonus = SheetController.bonusText(plainBonus(next, !!base));
    }
    this.emit();
  }
  /** The card the row would show with the form as typed (the plain card while the form has a problem). */
  itemChangeCard(): { name: string; data: ItemData; notes?: string } | undefined {
    const f = this.itemChange, e = f && this.character?.inventory[f.index], plain = f && this.changePlain(f);
    if (!f || !e || !plain) return undefined;
    const r = changeFromForm(f, plain), change = "error" in r ? undefined : r.change ?? undefined;
    const d = entryItem({ ...e, base: f.base || undefined, change }, this.host.registry) ?? plain;
    return { name: d.name, data: d, ...(change?.notes ? { notes: change.notes } : {}) };
  }
  saveItemChange(): boolean {
    const f = this.itemChange, e = f && this.character?.inventory[f.index], plain = f && this.changePlain(f);
    if (!f || !e || !plain) return false;
    const r = changeFromForm(f, plain);
    if ("error" in r) { f.error = r.error; this.emit(); return false; }
    const base = r.base !== undefined && r.base !== e.base ? r.base : undefined;
    if (!this.dispatch({ type: "itemChange", index: f.index, change: r.change, ...(base ? { base } : {}) }).ok) return false;
    const name = entryName(this.character!.inventory[f.index], this.host.registry);
    this.itemChange = null; this.close(); this.host.notify(`Changed ${name}.`); return true;
  }
  /** Drop the row's changes, so it is back to the compendium item. Its base stays. */
  resetItemChange(): boolean {
    const f = this.itemChange, e = f && this.character?.inventory[f.index]; if (!f || !e) return false;
    if (!this.dispatch({ type: "itemChange", index: f.index, change: null }).ok) return false;
    const name = entryName(this.character!.inventory[f.index], this.host.registry);
    this.itemChange = null; this.close(); this.host.notify(`${name} is back to what its note says.`); return true;
  }

  /** Drop every change to the row, so it is back to what its note says. Pins are kept. */
  resetCustomize(): boolean {
    const d = this.customizeDraft, info = d ? this.customizeInfo(d.target) : undefined;
    if (!d || !info) return false;
    if (!this.dispatch(info.save()).ok) return false;
    this.customizeDraft = null; this.close(); this.host.notify(`${info.name} is back to what its note says.`); return true;
  }
  cancelCustomize() { this.customizeDraft = null; this.close(); }

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
    const row = item !== undefined ? c?.inventory[item] : undefined, g = row ? entryItem(row, this.host.registry)?.grants?.spells.find(x => x.id === spell) : undefined;
    const spent = item !== undefined ? (g?.cost.kind === "charges" ? "charge spent" : g?.cost.kind === "perDay" ? "daily use spent" : "at will") : lvl >= 1 ? "slot spent" : "cantrip";
    this.record({ title: `Cast ${sp?.name ?? spell} (${item === undefined && lvl >= 1 ? `level ${lvl}, ` : ""}${spent})`, total: 0, dice: [],
      detail: out.note ?? "", crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } });
    return true;
  }

  /** Show a short message in the sheet's own toast (the same corner as roll results). */
  say(msg: string): void { this.toastItem = { kind: "notice", text: msg }; this.emit(); }

  private record(r: RollResult) {
    this.lastRoll = r; this.toastItem = { kind: "roll", roll: r }; this.host.log.unshift(r); if (this.host.log.length > LOG_MAX) this.host.log.length = LOG_MAX; this.emit(); return r;
  }
  /** The mode, sources and rules for one d20 roll; also snaps the one-shot mode switch back. */
  private d20Setup(target: RollTarget, ev: Mods, who?: number, force?: RollMode) {
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
    return { st, src, mode, crit, rules };
  }
  /** What a player who rolls their own dice is told for a d20 roll. */
  private d20Say(mod: number, s: ReturnType<SheetController["d20Setup"]>, extras: Extra[] = []): string {
    const adv = s.mode === "adv" || s.src.adv.length > 0, dis = s.mode === "dis" || s.src.dis.length > 0;
    return d20Words({ mod, mode: adv && dis ? "cancel" : adv ? "adv" : dis ? "dis" : "normal", extras, fail: s.src.fail,
      ...(s.rules?.reroll !== undefined ? { reroll: s.rules.reroll } : {}), ...(s.rules?.min !== undefined ? { min: s.rules.min } : {}),
      ...(s.crit && s.crit.range < 20 ? { critRange: s.crit.range } : {}) });
  }
  /** Own-dice play: the to-hit option dice that are on and affordable for this attack, spent now, as the words to add to the d20. */
  private ownToHitExtras(s: ReturnType<SheetController["d20Setup"]>, target: RollTarget): Extra[] {
    if (target.kind !== "attack" || !s.st || s.src.fail.length) return [];
    const used = affordable(toHitOptions(s.st.attackOptions, target));
    const extras = used.map((o, i) => ({ dice: o.toHit!, name: o.name, ...(spendWords(used, i) ? { spent: spendWords(used, i)! } : {}) }));
    this.spend(used);
    return extras;
  }
  /** Own-dice play: record one entry that says what to roll (nothing is rolled) and open the box for it. */
  private ownSay(title: string, words: string, sources = { adv: [] as string[], dis: [] as string[], fail: [] as string[] }): RollResult {
    const entry = this.record({ title, total: 0, dice: [], detail: words, crit: false, fumble: false, sources, own: {} });
    this.ownRoll = { kind: "say", entry }; this.emit(); return entry;
  }
  /** d20 roll for the sheet's actor or companion `who`. Shift = adv, Ctrl/Cmd = dis, else the one-shot mode switch. */
  roll(title: string, mod: number, target: RollTarget, ev: Mods = {}, who?: number, force?: RollMode): RollResult {
    const s = this.d20Setup(target, ev, who, force), { st, src, mode, crit, rules } = s;
    if (this.ownDice()) {
      const extras = who === undefined ? this.ownToHitExtras(s, target) : [];
      return this.ownSay(title, this.d20Say(mod, s, extras), src);
    }
    const rolled = rollD20({ title, mod, mode, ...src, ...(crit ? { critRange: crit.range, critNote: crit.hints } : {}), ...(this.host.rng ? { rng: this.host.rng } : {}),
      ...(rules?.min !== undefined ? { min: rules.min } : {}), ...(rules?.reroll !== undefined ? { reroll: rules.reroll } : {}), ...(rules?.notes.length ? { ruleNotes: rules.notes } : {}) });
    if (who === undefined && target.kind === "attack" && st && rolled.total !== "fail") this.addToHitOptions(rolled, st, target);
    return this.record(rolled);
  }

  /** Add the dice of the attack options that are on and affordable to this to-hit roll, spend them, and say so in the detail. */
  private addToHitOptions(r: RollResult, st: ActorStats, target: RollTarget) {
    const used = affordable(toHitOptions(st.attackOptions, target));
    if (!used.length) return;
    let total = r.total as number;
    for (const o of used) {
      const x = rollDice(o.name, o.toHit!, this.host.rng); total += x.total as number;
      r.detail += ` + ${o.name} ${o.toHit} (${x.total})`;
    }
    r.total = total;
    r.detail += this.spend(used);
  }

  /** Spend one die of each used option's resource and switch off what runs dry or is once per turn. Returns the words to append to the roll's detail. */
  private spend(used: AttackOptionRow[]): string {
    if (!used.length) return "";
    const out = this.dispatch({ type: "attackOptionsUsed", ids: used.map(o => o.id) });
    if (!out.ok) return "";
    if (out.note) this.host.notify(out.note);
    const count = new Map<string, { n: number; o: AttackOptionRow }>();
    for (const o of used) if (o.resource && !o.resource.unlimited) { const e = count.get(o.resource.id); if (e) e.n++; else count.set(o.resource.id, { n: 1, o }); }
    let tail = "";
    for (const { n, o } of count.values()) tail += `; ${Math.max(0, o.resource!.left - n)} of ${o.resource!.max} ${o.resource!.name} left`;
    for (const o of used) if (o.oncePerTurn) tail += `; ${o.name} is off (once per turn)`;
    return tail;
  }

  private closeHitWindow() { clearTimeout(this.hitTimer); this.hitTimer = undefined; this.hitWindow = null; }
  /** Close the hit window when its attack row is no longer the same attack (the note changed under it). Returns true when it was stale, so the caller must not roll whatever now sits at that row. */
  private checkHitWindow(st: ActorStats): boolean {
    const w = this.hitWindow; if (w && st.attacks[w.ai]?.name !== w.name) { this.closeHitWindow(); return true; }
    return false;
  }

  /** Switch an attack option on or off. A problem is said in words. */
  setAttackOption(id: string, on: boolean): boolean { return this.dispatch({ type: "attackOption", id, on }).ok; }

  /** Roll attack row `ai` to hit (own attacks only); opens the hit window unless it failed. */
  attackRoll(ai: number, ev: Mods = {}): RollResult | undefined {
    const st = this.stats(); if (!st) return undefined;
    if (this.checkHitWindow(st)) return undefined;
    const a = st.attacks[ai];
    if (!a || a.toHit === undefined) return undefined;
    const r = this.roll(`${a.name} to hit`, a.toHit, a.target, ev);
    this.closeHitWindow();
    if (this.ownRoll?.kind === "say" && this.ownRoll.entry === r) {
      if (!r.sources.fail.length) this.ownRoll = { kind: "attack", entry: r, ai, crit: false };
      this.emit(); return r;
    }
    if (r.total !== "fail") {
      this.hitWindow = { ai, name: a.name, crit: r.crit };
      this.hitTimer = setTimeout(() => { this.hitTimer = undefined; this.hitWindow = null; this.emit(); }, HIT_WINDOW_MS);
      this.emit();
    }
    return r;
  }

  /** Roll attack row `ai`'s damage; always counts as a hit (spends on-hit options). `crit` uses critDamage and doubles option dice. Closes the hit window. */
  attackDamage(ai: number, crit = false): RollResult | undefined {
    const st = this.stats(); if (!st) return undefined;
    if (this.checkHitWindow(st)) return undefined;
    const a = st.attacks[ai], expr = a && (crit ? a.critDamage : a.damage);
    if (!a || !expr) return undefined;
    const opts = affordable(onHitOptions(st.attackOptions, a.target));
    const title = `${a.name} ${crit ? "critical damage" : "damage"}`, rng = this.host.rng;
    if (this.ownDice()) {
      const extras: Extra[] = opts.flatMap((o, i) => o.onHit ? [{ dice: crit ? critDamageOf(o.onHit) ?? o.onHit : o.onHit, name: o.name, ...(spendWords(opts, i) ? { spent: spendWords(opts, i)! } : {}) }] : []);
      const rr = opts.filter(o => o.reroll).map(o => o.name).join(", ");
      const words = damageWords({ expr, extras, ...(rr ? { reroll: rr } : {}), ...(a.grip?.hands === 2 ? { weaponNote: "two hands" } : {}) });
      this.spend(opts); this.closeHitWindow();
      return this.ownSay(title, words);
    }
    let r: RollResult;
    if (opts.some(o => o.reroll)) {
      const terms = expr.split(" + "), first = rollKeepHigher(title, terms[0], rng);
      const rest = terms.length > 1 ? rollDice(title, terms.slice(1).join(" + "), rng) : undefined;
      r = rest ? { ...first, total: (first.total as number) + (rest.total as number), dice: [...first.dice, ...rest.dice], detail: `${first.detail} + ${rest.detail}` } : first;
    } else r = rollDice(title, expr, rng);
    let total = r.total as number;
    for (const o of opts) {
      if (!o.onHit) continue;
      const dice = crit ? critDamageOf(o.onHit) ?? o.onHit : o.onHit, x = rollDice(o.name, dice, rng);
      total += x.total as number; r.detail += ` + ${o.name} ${dice} (${x.total})`;
    }
    r.total = total;
    const applied = st.attackOptions.filter(o => o.kind === "extra" && o.on && matchesTag(o.tag, a.target)).map(o => o.name);
    if (applied.length) r.detail += `; applied: ${applied.join(", ")}`;
    r.detail += this.spend(opts);
    this.closeHitWindow();
    return this.record(r);
  }
  damage(title: string, expr: string, ctx: { save?: { abil: Abil; dc: number; half: boolean } } = {}): RollResult {
    if (this.ownDice()) {
      const sv = ctx.save;
      return this.ownSay(title, sv ? `${saveWords(sv.abil, sv.dc)}; you roll ${spaced(expr)}${sv.half ? ", half on a save" : ""}` : damageWords({ expr }));
    }
    return this.record(rollDice(title, expr, this.host.rng));
  }

  /** Own-dice play: the player answers whether the attack hit. Hit and Crit say the damage to roll; Miss closes the box. */
  answerHit(outcome: "hit" | "miss" | "crit"): void {
    const o = this.ownRoll; if (!o || o.kind !== "attack") return;
    this.ownRoll = null;
    if (outcome === "miss") { this.emit(); return; }
    if (!this.attackDamage(o.ai, outcome === "crit")) this.emit();
  }
  /** Add the total the player typed to the log entry. Empty just closes; anything but a whole number keeps the box open with a message. */
  logOwnTotal(text: string): boolean {
    const o = this.ownRoll; if (!o || o.kind === "total") return false;
    const t = text.trim(), n = Number(t);
    if (t !== "" && !Number.isInteger(n)) { o.error = "Type the total you rolled, a whole number."; this.emit(); return false; }
    if (t !== "") o.entry.own = { total: n };
    this.ownRoll = null; this.emit(); return true;
  }
  closeOwnRoll(): void { this.ownRoll = null; this.emit(); }

  /** Own-dice play: ask for the total of a roll that changes the sheet. Nothing changes until `apply` runs. */
  askTotal(p: Omit<Extract<OwnRoll, { kind: "total" }>, "kind" | "error">): void { this.ownRoll = { kind: "total", ...p }; this.emit(); }
  /** Check the typed total and apply it. A bad value says why and keeps the box open. */
  submitTotal(text: string): boolean {
    const o = this.ownRoll; if (!o || o.kind !== "total") return false;
    const t = text.trim(), n = Number(t);
    let bad = "";
    if (!/^-?\d+$/.test(t) || !Number.isSafeInteger(n)) bad = "Type the total you rolled, a whole number.";
    else if (o.min !== undefined && o.max !== undefined && (n < o.min || n > o.max)) bad = `Type a number from ${o.min} to ${o.max}.`;
    else if (o.min !== undefined && n < o.min) bad = `Type a number ${o.min} or more.`;
    else if (o.max !== undefined && n > o.max) bad = `Type a number ${o.max} or less.`;
    if (bad) { o.error = bad; this.emit(); return false; }
    this.ownRoll = null; o.apply(n); this.emit(); return true;
  }
  /** "Roll it for me": the app rolls the dice and applies the result. */
  rollItForMe(): void {
    const o = this.ownRoll; if (!o || o.kind !== "total") return;
    let n: number;
    try { n = o.roll(); } catch (x) { this.host.notify((x as Error).message); return; }
    this.ownRoll = null; o.apply(n); this.emit();
  }
  /** A function that rolls the d20 of an own-dice question with the mode and sources already worked out. */
  private d20Roller(title: string, mod: number, s: ReturnType<SheetController["d20Setup"]>): () => number {
    return () => {
      const r = rollD20({ title, mod, mode: s.mode, ...s.src, ...(this.host.rng ? { rng: this.host.rng } : {}),
        ...(s.rules?.min !== undefined ? { min: s.rules.min } : {}), ...(s.rules?.reroll !== undefined ? { reroll: s.rules.reroll } : {}) });
      return typeof r.total === "number" ? r.total : 0;
    };
  }

  setMode(m: RollMode) { this.mode = m; this.emit(); }
  setEditing(on: boolean) { this.editing = on; this.confirmUndo = false; if (!on && (this.panel?.kind === "customize" || this.panel?.kind === "customize-row")) { this.panel = null; this.customizeDraft = null; } this.emit(); }
  /** Whether the traits card section `id` is collapsed (default: expanded). */
  isCollapsed(id: string) { return this.collapsedSet().has(id); }
  toggleCollapsed(id: string) {
    const s = this.collapsedSet(); if (!s.delete(id)) s.add(id);
    this.host.setCollapsedGroups?.([...s]); this.emit();
  }
  private collapsedSet() { return (this.collapsed ??= new Set(this.host.collapsedGroups?.() ?? [])); }
  setTab(t: string) { this.tab = t; this.emit(); }
  open(p: Panel) { if (p.kind === "compendium") { this.customItem = blankCustomItem(); this.itemSearch = blankItemSearch(); this.addPick = null; } this.panel = p; this.emit(); }
  close() { if (this.panel?.kind === "customize-row") this.customizeDraft = null; if (this.panel?.kind === "item-change") this.itemChange = null; this.panel = null; this.emit(); }

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
    if (this.ownDice()) {
      const ctx = this.restCtx(), con = ctx.stats.mods.con, pre = spendHitDie(ctx, die, undefined, 0);
      if (pre.error) { this.host.notify(pre.error); return; }
      this.askTotal({ title: `Hit Die ${die}`, say: `${damageWords({ expr: `1${die}${con === 0 ? "" : con > 0 ? `+${con}` : `${con}`}` })} and enter the total: you heal that much`, min: 0,
        roll: () => Number(rollDice(`Hit Die ${die}`, `1${die}`, this.host.rng).total) + con, apply: n => this.spendHitDieWith(die, n) });
      return;
    }
    this.spendHitDieWith(die);
  }
  private spendHitDieWith(die: string, total?: number) {
    if (!this.guard() || !this.character) return;
    const out = spendHitDie(this.restCtx(), die, this.host.rng, total);
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
  rollLevelHp(die: number) {
    if (!this.ownDice()) { this.setLevelUp({ hp: { method: "roll", roll: rollHitDie(die, this.host.rng) } }); return; }
    this.askTotal({ title: "Hit points for this level", say: `Roll 1d${die}`, min: 1, max: die, roll: () => rollHitDie(die, this.host.rng), apply: n => this.setLevelUp({ hp: { method: "roll", roll: n } }) });
  }
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
  useAction(f: { action?: ActionDef }, itemIndex?: number) {
    const a = f.action, c = this.character, st = this.stats();
    if (!a || !c || !st || !this.guard()) return;
    const plain = { crit: false, fumble: false, sources: { adv: [], dis: [], fail: [] } }, own = this.ownDice();
    try {
      const scales = st.progress.scales, vars = formulaVars(c, scales), parts: string[] = [];
      if (a.cost && "resource" in a.cost) {
        const id = slug(a.cost.resource), r = st.resources.find(x => x.id === id || (!x.derived && slug(x.name) === id));
        if (!r) { this.host.notify(`${a.name}: no resource called ${a.cost.resource}`); return; }
        const amount = a.cost.amount === undefined ? 1 : Math.max(0, Math.floor(evalFormula(a.cost.amount, vars)));
        if (!r.unlimited && r.used + amount > r.max) { this.host.notify(`No ${r.name} left for ${a.name}`); return; }
        if (r.unlimited) parts.push(`${r.name} (${r.unlimited.toLowerCase()})`);
        else {
          const spend: Action = r.derived ? { type: "uses", id: r.id, used: r.used + amount } : { type: "resource", index: Number(r.id.split(":")[1]), used: r.used + amount };
          if (!this.dispatch(spend).ok) return; parts.push(`${r.name} -${amount}`);
        }
      }
      if (a.cost && "charges" in a.cost) {
        const e = itemIndex !== undefined ? c.inventory[itemIndex] : undefined;
        if (!e) { this.host.notify("This only works on an item."); return; }
        const max = this.limits().chargesMax(itemIndex!), used = e.charges?.used ?? 0, n = a.cost.charges;
        if (used + n > max) { this.host.notify(`Not enough charges left for ${a.name}`); return; }
        if (!this.dispatch({ type: "charges", index: itemIndex!, used: used + n }).ok) return;
        parts.push(`${n} charge${n === 1 ? "" : "s"} spent`);
      }
      let selfAt = -1, selfDie = "";
      if (a.cost && "selfDamage" in a.cost) {
        if (own) { selfAt = parts.length; selfDie = fillDice(a.cost.selfDamage, scales); parts.push(`Roll ${spaced(selfDie)} for the damage to you`); }
        else {
          const roll = this.damage(`${a.name} (self damage)`, fillDice(a.cost.selfDamage, scales));
          this.dispatch({ type: "damage", amount: Number(roll.total) }); parts.push(`${roll.total} damage to you`);
        }
      }
      let saveAt = -1;
      if (a.save) {
        const dc = actionDc(st, a.save.dc);
        saveAt = parts.length;
        parts.push(own && dc ? saveWords(a.save.abil, dc.dc) : `${a.save.abil.toUpperCase()} save DC ${dc ? dc.dc : "?"}`);
      }
      if (own && (a.attack !== undefined || a.damage || a.heal || selfAt >= 0)) {
        // one entry with every part of the action in words
        const words = [...parts];
        if (a.attack !== undefined) {
          const target: RollTarget = { kind: "attack" }, setup = this.d20Setup(target, {});
          words.splice(saveAt >= 0 ? saveAt : words.length, 0, this.d20Say(Math.floor(evalFormula(a.attack, vars)), setup, this.ownToHitExtras(setup, target)));
        }
        if (a.damage) words.push(`you roll ${spaced(fillDice(a.damage, scales))}${a.damageType ? ` ${a.damageType}` : ""}`);
        if (a.heal) words.push(`Roll ${spaced(fillDice(a.heal, scales))} healing`);
        if (selfAt < 0) { this.ownSay(a.name, words.join("; ")); return; }
        // the damage to you changes the sheet, so it asks for its total; the rest of the action is said in the same box
        const rest = words.slice(selfAt + 1), title = `${a.name} (self damage)`;
        const say = words[selfAt] + (rest.length ? `. Then: ${rest.join("; ")}` : "");
        this.record({ title: a.name, total: 0, dice: [], detail: words.join("; "), ...plain, own: {} });
        this.askTotal({ title, say, min: 0, roll: () => Number(rollDice(title, selfDie, this.host.rng).total), apply: n => { this.dispatch({ type: "damage", amount: n }); } });
        return;
      }
      if (a.attack === undefined && !a.damage && !a.heal) { this.record({ title: a.name, total: 0, dice: [], detail: [...parts, a.text ?? ""].filter(Boolean).join(" · "), ...plain }); return; }
      if (parts.length) this.record({ title: `${a.name} used`, total: 0, dice: [], detail: parts.join(" · "), ...plain });
      if (a.attack !== undefined) this.roll(`${a.name} attack`, Math.floor(evalFormula(a.attack, vars)), { kind: "attack" });
      if (a.damage) this.damage(`${a.name} damage${a.damageType ? ` (${a.damageType})` : ""}`, fillDice(a.damage, scales));
      if (a.heal) this.damage(`${a.name} healing`, fillDice(a.heal, scales));
    } catch (x) { this.host.notify(`${a.name}: ${(x as Error).message}`); }
  }

  setRule(id: string, on: boolean) {
    if (!this.guard()) return;
    this.ownRoll = null;
    const v = structuredClone(this.value); v.rules[id] = on; this.commit(v);
  }
  setHidden(section: string, hidden: boolean) {
    if (!this.guard()) return;
    const v = structuredClone(this.value), s = v.sheet;
    s.hide = s.hide.filter(x => x !== section); s.show = s.show.filter(x => x !== section);
    (hidden ? s.hide : s.show).push(section); this.commit(v);
  }
}
