import type { Registry } from "../content/registry";
import type { SourceSwitches } from "../content/sources";
import type { ClassData } from "../content/types";
import { pickDelta } from "../core/ability-increase";
import { baseCharacter, buildCharacter, originBonus, originParts, buildSteps, characterFrontmatter, defaultScores, draftProblems, newDraft, notePath, pointBuyCost, rollGold, rollScores, scoreProblems, POINT_BUY_BUDGET, POINT_BUY_COST,
  type BuildDraft, type EquipmentChoice, type RollScheme, type ScoreMethod } from "../core/builder";
import type { Character } from "../core/character";
import { noneFoundLine, readEdition, type Edition } from "../core/edition";
import type { Step } from "../core/levelup";
import { ABILS, type Abil, type Rng } from "../core/types";
import type { LevelUpView } from "./controller";

/** What the Obsidian layer (or a test) provides to the builder. */
export interface BuilderHost {
  registry: Registry; rng?: Rng;
  /** Source switches of the campaign the draft names (a link or plain name); pickers leave out switched-off sources. */
  campaignSources?(campaign: string): SourceSwitches;
  /** The setting's default edition for new characters (2014 when the host does not say). */
  defaultEdition?(): Edition;
  /** The edition the named campaign's note asks for, if it names one. */
  campaignEdition?(campaign: string): Edition | undefined;
  notify(msg: string): void;
  /** Folder new notes go in ("" = the vault root). */
  folder: string;
  exists(path: string): boolean;
  /** Write the note (the Obsidian layer makes the folders and refuses to overwrite). */
  createNote(path: string, frontmatter: Record<string, unknown>): Promise<string>;
  /** Show the new note as a sheet. */
  open(path: string): void | Promise<void>;
  close(): void;
}

export type BuilderPage =
  | { id: "edition" } | { id: "race" } | { id: "background" } | { id: "scores" } | { id: "class" } | { id: "equipment" } | { id: "name" }
  | { id: "step"; step: Exclude<Step, { kind: "hp" }> };

const stepsOf = (s: Step[]) => s.filter((x): x is Exclude<Step, { kind: "hp" }> => x.kind !== "hp");

/** The new-character builder: a draft, the page it is on, and the final write. UI-free so it can be driven by tests. */
export class BuilderController {
  draft: BuildDraft = newDraft(); page = 0; error?: string; creating = false;
  view: LevelUpView = { featOpen: new Set(), spellQuery: "", featQuery: "" };
  private subs = new Set<() => void>();
  /** The host as given: its registry has no edition lens. `host.registry` is the lens of the draft's edition. */
  readonly baseRegistry: Registry;
  host: BuilderHost;
  constructor(host: BuilderHost) {
    this.baseRegistry = host.registry;
    // The prototype keeps every other host field live; only `registry` is replaced by the lens of whichever edition the draft has now.
    const lenses = new Map<Edition, Registry>();
    this.host = Object.create(host, { registry: { enumerable: true, get: () => {
      const e = this.edition(); let lens = lenses.get(e);
      if (!lens) { lens = this.baseRegistry.forEdition(e); lenses.set(e, lens); }
      return lens;
    } } }) as BuilderHost;
  }

  /** The edition the player chose, else the campaign's, else the setting's, else 2014. */
  edition(): Edition { return this.draft.edition ?? this.defaultEdition(); }
  /** What a new character starts with: the campaign key, else the setting, else 2014. */
  defaultEdition(): Edition {
    const c = this.draft.campaign;
    return (c ? readEdition(this.host.campaignEdition?.(c)) : undefined) ?? readEdition(this.host.defaultEdition?.()) ?? "2014";
  }
  /** Choose the edition; everything picked under the old one is dropped. */
  setEdition(e: Edition) {
    const next: BuildDraft = { ...this.draft, edition: e, choices: {} };
    for (const k of ["race", "subrace", "background", "classId", "equipment"] as const) delete next[k];
    this.draft = next; delete this.view.other; delete this.view.switchTo; this.touch();
  }
  /** Names of what the draft holds that a switch of edition would clear, in words the page can show. */
  pickedKinds(raceWord: string): string[] {
    const d = this.draft, out: string[] = [];
    if (d.race || d.subrace) out.push(raceWord);
    if (d.background) out.push("background");
    if (d.classId) out.push("class");
    if (d.equipment) out.push("equipment");
    if (Object.keys(d.choices).length) out.push("other");
    return out;
  }
  /** Tap on an edition button: the current one cancels a pending switch; another one switches at once, or after a second tap when picks would be lost. */
  chooseEdition(e: Edition) {
    if (e === this.edition()) {
      delete this.view.switchTo;
      if (this.draft.edition === undefined) this.draft = { ...this.draft, edition: e };   // accepting the default drops nothing
      this.touch();
      return;
    }
    if (this.view.switchTo !== e && this.pickedKinds("x").length) { this.view.switchTo = e; this.emit(); return; }
    this.setEdition(e);
  }
  /** The host registry read through the draft's edition. */
  private reg(): Registry { return this.host.registry; }
  /** The draft with its edition filled in, for the core builder functions. */
  private resolved(): BuildDraft { return { ...this.draft, edition: this.edition() }; }
  /** Why a list is empty, when the edition has none of that kind (undefined otherwise). */
  emptyReason(type: "class" | "race" | "background"): string | undefined {
    if (this.pickers().list(type).length) return undefined;
    return noneFoundLine(this.edition(), type);
  }

  /** The registry the pickers list from: this edition only, and sources the draft's campaign switched off are left out. */
  pickers(): Registry { return this.reg().scoped(this.draft.campaign ? this.host.campaignSources?.(this.draft.campaign) : undefined); }

  /** Open or close the About card of a race or class. */
  toggleAbout(id: string) { if (this.view.about === id) delete this.view.about; else this.view.about = id; this.emit(); }

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  emit() { this.subs.forEach(f => f()); }

  // The same shape the level-up pages use.
  get character(): Character { return baseCharacter(this.resolved(), this.reg()); }
  /** Increases the race and subrace give on their own (shown next to the manual bonus). */
  originParts() { return originParts(this.resolved(), this.reg()); }
  originBonus() { return originBonus(this.resolved(), this.reg()); }
  pick(key: string, value: unknown) { this.draft = { ...this.draft, choices: { ...this.draft.choices, [key]: value } }; this.touch(); }

  private touch() { delete this.error; delete this.armedScheme; this.emit(); }
  private dropChoices(...prefixes: string[]) {
    const choices = Object.fromEntries(Object.entries(this.draft.choices).filter(([k]) => !prefixes.some(p => k.startsWith(p))));
    this.draft = { ...this.draft, choices };
  }
  classData(): ClassData | undefined { return this.draft.classId ? this.reg().get<ClassData>("class", this.draft.classId)?.data : undefined; }

  /** Replace the draft with `patch` applied; `without` names fields to remove. */
  private edit(patch: Partial<BuildDraft>, ...without: (keyof BuildDraft)[]) {
    const next: BuildDraft = { ...this.draft, ...patch };
    for (const k of without) delete next[k];
    this.draft = next; this.touch();
  }
  setRace(id: string | undefined) {
    if (id === this.draft.race) return;
    this.dropChoices("race:", "subrace:", "feat:");
    this.edit(id ? { race: id } : {}, "subrace", ...(id ? [] : ["race" as const]));
  }
  setSubrace(id: string | undefined) { this.dropChoices("subrace:", "feat:"); this.edit(id ? { subrace: id } : {}, ...(id ? [] : ["subrace" as const])); }
  setBackground(id: string | undefined) { this.dropChoices("background:", "feat:"); this.edit(id ? { background: id } : {}, ...(id ? [] : ["background" as const])); }
  setClass(id: string) {
    if (id === this.draft.classId) return;
    this.dropChoices("class:", "subclass:", "feat:");
    this.edit({ classId: id }, "equipment");
  }
  setName(name: string) { this.draft = { ...this.draft, name }; this.touch(); }
  setCampaign(campaign: string) {
    // The campaign field is on the last page: a campaign entered after picks must not switch the edition under them.
    const d = this.draft, picked = !!(d.race || d.subrace || d.background || d.classId || d.equipment || Object.keys(d.choices).length);
    if (d.edition === undefined && picked) this.draft = { ...d, edition: this.edition() };
    this.edit(campaign.trim() ? { campaign: campaign.trim() } : {}, ...(campaign.trim() ? [] : ["campaign" as const]));
  }

  // ---- ability scores
  setMethod(method: ScoreMethod) {
    const next: BuildDraft = { ...this.draft, method, scores: defaultScores(method) }; delete next.rolled;
    this.draft = next; this.touch();
  }
  /** The way whose button was tapped once while rolls were held; a second tap of it re-rolls. Any other action clears it. */
  armedScheme?: RollScheme;
  /** Roll for scores. With rolls already held, the first tap only arms the button (it would throw the numbers away). */
  rollScores(scheme: RollScheme) {
    const d = this.draft;
    if (d.method !== "rolled") return;
    if (d.rolled?.rolls.length && this.armedScheme !== scheme) { this.armedScheme = scheme; this.emit(); return; }
    const rolls = rollScores(scheme, this.host.rng), t = rolls.map(r => r.total);
    this.draft = { ...d, rolled: { scheme, rolls }, scores: { str: t[0], dex: t[1], con: t[2], int: t[3], wis: t[4], cha: t[5] } }; this.touch();
  }
  pointBuySpent(): number { return pointBuyCost(this.draft.scores) ?? 0; }
  /** Raise or lower one score by a step; point buy stays inside 8 to 15 and the 27 point budget. */
  nudgeScore(a: Abil, by: number) {
    const d = this.draft, cur = d.scores[a], next = cur + by;
    if (d.method === "point-buy") {
      if (POINT_BUY_COST[next] === undefined) return;
      if (by > 0 && this.pointBuySpent() - POINT_BUY_COST[cur] + POINT_BUY_COST[next] > POINT_BUY_BUDGET) return;
    } else if (next < 1 || next > 30) return;
    this.draft = { ...d, scores: { ...d.scores, [a]: next } }; this.touch();
  }
  /** Set a score outright. In the standard array the value swaps with whichever ability held it. */
  setScore(a: Abil, value: number) {
    const d = this.draft;
    if (!Number.isFinite(value)) return;
    if (d.method === "standard-array" || d.method === "rolled") {
      const other = ABILS.find(x => x !== a && d.scores[x] === value);
      this.draft = { ...d, scores: { ...d.scores, ...(other ? { [other]: d.scores[a] } : {}), [a]: value } };
    } else this.draft = { ...d, scores: { ...d.scores, [a]: Math.round(value) } };
    this.touch();
  }
  nudgeBonus(a: Abil, by: number) {
    const b = (this.draft.bonus[a] ?? 0) + by; if (b < -2 || b > 4) return;
    const bonus = { ...this.draft.bonus, [a]: b }; if (!b) delete bonus[a];
    this.draft = { ...this.draft, bonus }; this.touch();
  }

  // ---- equipment
  setEquipment(e: EquipmentChoice | undefined) { this.edit(e ? { equipment: e } : {}, ...(e ? [] : ["equipment" as const])); }
  rollStartingGold() {
    const dice = this.classData()?.gold; if (!dice) return;
    this.setEquipment({ kind: "gold", gold: rollGold(dice, this.host.rng) });
  }

  // ---- pages
  steps(): { origin: Exclude<Step, { kind: "hp" }>[]; level: Exclude<Step, { kind: "hp" }>[]; error?: string } {
    const s = buildSteps(this.resolved(), this.pickers());
    return { origin: stepsOf(s.origin), level: stepsOf(s.level), ...(s.error ? { error: s.error } : {}) };
  }
  pages(): BuilderPage[] {
    const s = this.steps(), c = this.classData();
    return [{ id: "edition" }, { id: "race" }, { id: "background" }, { id: "scores" }, { id: "class" },
      ...s.origin.map(step => ({ id: "step", step }) as BuilderPage), ...s.level.map(step => ({ id: "step", step }) as BuilderPage),
      ...(c && (c.equipment?.length || c.gold !== undefined) ? [{ id: "equipment" } as BuilderPage] : []), { id: "name" }];
  }
  go(page: number) {
    delete this.view.switchTo;
    // Moving on from the edition page accepts the default: it is recorded, so a campaign typed later cannot switch it under the picks.
    if (page > this.page && this.pages()[this.page]?.id === "edition" && this.draft.edition === undefined) this.draft = { ...this.draft, edition: this.edition() };
    this.page = Math.max(0, Math.min(page, this.pages().length - 1)); this.touch();
  }
  /** Has the current page everything it needs before Next? */
  ready(p: BuilderPage): boolean {
    const d = this.draft;
    switch (p.id) {
      case "edition": return true;   // the default counts as chosen
      case "race": return !!d.race && !!this.reg().get("race", d.race);
      case "background": return true;
      case "scores": return scoreProblems(d.method, d.scores, d.rolled).length === 0 && ABILS.every(a => (d.method === "manual" || d.scores[a] + (d.bonus[a] ?? 0) <= 20) && Number.isInteger(d.bonus[a] ?? 0));
      case "class": return !!d.classId && !!this.classData();
      case "equipment": return !draftProblems(this.resolved(), this.reg()).some(m => /equipment|gold/i.test(m));
      case "name": return false;
      case "step": return this.stepDone(p.step);
    }
  }
  private stepDone(s: Exclude<Step, { kind: "hp" }>): boolean {
    const v = this.draft.choices[s.key], isStrs = (x: unknown): x is string[] => Array.isArray(x) && x.every(y => typeof y === "string");
    switch (s.kind) {
      case "subclass": case "feat": return typeof v === "string";
      case "asi": return typeof v === "object" && v !== null && ("feat" in v || Object.values((v as { abilities?: Record<string, number> }).abilities ?? {}).reduce((a, n) => a + n, 0) === 2);
      case "pattern": return pickDelta({ from: s.from, patterns: s.patterns }, v) !== undefined;
      case "optional": return typeof v === "boolean";
      case "pick": return isStrs(v) && v.length === s.count && v.every(x => x.trim() !== "");
      case "spells": return isStrs(v) && v.length === s.cantrips + s.count;
    }
  }
  problems(): string[] { return draftProblems(this.resolved(), this.reg()); }
  /** What the finished character would be (or why not), for the last page. */
  preview(): { value: Character; summary: string[] } | { error: string } { return buildCharacter(this.resolved(), this.reg(), this.host.rng); }

  /** Build the character, write the note and show it. */
  async create(): Promise<boolean> {
    if (this.creating) return false;
    const r = this.preview();
    if ("error" in r) { this.error = r.error; this.host.notify(r.error); this.emit(); return false; }
    this.creating = true; this.emit();
    try {
      const path = notePath(this.host.folder, this.draft.name, p => this.host.exists(p));
      await this.host.createNote(path, characterFrontmatter(r.value));
      await this.host.open(path);
      this.host.notify(`Created ${r.value.name}`);
      this.host.close();
      return true;
    } catch (x) {
      this.error = `Could not create the note: ${(x as Error).message}`; this.host.notify(this.error); return false;
    } finally { this.creating = false; this.emit(); }
  }
}
