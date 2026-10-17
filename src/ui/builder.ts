import type { Registry } from "../content/registry";
import type { SourceSwitches } from "../content/sources";
import type { ClassData } from "../content/types";
import { baseCharacter, buildCharacter, originBonus, buildSteps, characterFrontmatter, defaultScores, draftProblems, newDraft, notePath, pointBuyCost, rollGold, scoreProblems, POINT_BUY_BUDGET, POINT_BUY_COST,
  type BuildDraft, type EquipmentChoice, type ScoreMethod } from "../core/builder";
import type { Character } from "../core/character";
import type { Step } from "../core/levelup";
import { ABILS, type Abil, type Rng } from "../core/types";
import type { LevelUpView } from "./controller";

/** What the Obsidian layer (or a test) provides to the builder. */
export interface BuilderHost {
  registry: Registry; rng?: Rng;
  /** Source switches of the campaign the draft names (a link or plain name); pickers leave out switched-off sources. */
  campaignSources?(campaign: string): SourceSwitches;
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
  | { id: "race" } | { id: "background" } | { id: "scores" } | { id: "class" } | { id: "equipment" } | { id: "name" }
  | { id: "step"; step: Exclude<Step, { kind: "hp" }> };

const stepsOf = (s: Step[]) => s.filter((x): x is Exclude<Step, { kind: "hp" }> => x.kind !== "hp");

/** The new-character builder: a draft, the page it is on, and the final write. UI-free so it can be driven by tests. */
export class BuilderController {
  draft: BuildDraft = newDraft(); page = 0; error?: string; creating = false;
  view: LevelUpView = { featOpen: new Set(), spellQuery: "", featQuery: "" };
  private subs = new Set<() => void>();
  constructor(public host: BuilderHost) {}

  /** The registry the pickers list from: sources the draft's campaign switched off are left out. */
  pickers(): Registry { return this.host.registry.scoped(this.draft.campaign ? this.host.campaignSources?.(this.draft.campaign) : undefined); }

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  emit() { this.subs.forEach(f => f()); }

  // The same shape the level-up pages use.
  get character(): Character { return baseCharacter(this.draft, this.host.registry); }
  /** Increases the race and subrace give on their own (shown next to the manual bonus). */
  originBonus() { return originBonus(this.draft, this.host.registry); }
  pick(key: string, value: unknown) { this.draft = { ...this.draft, choices: { ...this.draft.choices, [key]: value } }; this.touch(); }

  private touch() { delete this.error; this.emit(); }
  private dropChoices(...prefixes: string[]) {
    const choices = Object.fromEntries(Object.entries(this.draft.choices).filter(([k]) => !prefixes.some(p => k.startsWith(p))));
    this.draft = { ...this.draft, choices };
  }
  classData(): ClassData | undefined { return this.draft.classId ? this.host.registry.get<ClassData>("class", this.draft.classId)?.data : undefined; }

  /** Replace the draft with `patch` applied; `without` names fields to remove. */
  private edit(patch: Partial<BuildDraft>, ...without: (keyof BuildDraft)[]) {
    const next: BuildDraft = { ...this.draft, ...patch };
    for (const k of without) delete next[k];
    this.draft = next; this.touch();
  }
  setRace(id: string | undefined) {
    if (id === this.draft.race) return;
    this.dropChoices("race:", "subrace:");
    this.edit(id ? { race: id } : {}, "subrace", ...(id ? [] : ["race" as const]));
  }
  setSubrace(id: string | undefined) { this.dropChoices("subrace:"); this.edit(id ? { subrace: id } : {}, ...(id ? [] : ["subrace" as const])); }
  setBackground(id: string | undefined) { this.dropChoices("background:"); this.edit(id ? { background: id } : {}, ...(id ? [] : ["background" as const])); }
  setClass(id: string) {
    if (id === this.draft.classId) return;
    this.dropChoices("class:", "subclass:", "feat:");
    this.edit({ classId: id }, "equipment");
  }
  setName(name: string) { this.draft = { ...this.draft, name }; this.touch(); }
  setCampaign(campaign: string) { this.edit(campaign.trim() ? { campaign: campaign.trim() } : {}, ...(campaign.trim() ? [] : ["campaign" as const])); }

  // ---- ability scores
  setMethod(method: ScoreMethod) { this.draft = { ...this.draft, method, scores: defaultScores(method) }; this.touch(); }
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
    if (d.method === "standard-array") {
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
    const s = buildSteps(this.draft, this.pickers());
    return { origin: stepsOf(s.origin), level: stepsOf(s.level), ...(s.error ? { error: s.error } : {}) };
  }
  pages(): BuilderPage[] {
    const s = this.steps(), c = this.classData();
    return [{ id: "race" }, { id: "background" }, { id: "scores" }, { id: "class" },
      ...s.origin.map(step => ({ id: "step", step }) as BuilderPage), ...s.level.map(step => ({ id: "step", step }) as BuilderPage),
      ...(c && (c.equipment?.length || c.gold !== undefined) ? [{ id: "equipment" } as BuilderPage] : []), { id: "name" }];
  }
  go(page: number) { this.page = Math.max(0, Math.min(page, this.pages().length - 1)); this.touch(); }
  /** Has the current page everything it needs before Next? */
  ready(p: BuilderPage): boolean {
    const d = this.draft;
    switch (p.id) {
      case "race": return !!d.race && !!this.host.registry.get("race", d.race);
      case "background": return true;
      case "scores": return scoreProblems(d.method, d.scores).length === 0 && ABILS.every(a => (d.method === "manual" || d.scores[a] + (d.bonus[a] ?? 0) <= 20) && Number.isInteger(d.bonus[a] ?? 0));
      case "class": return !!d.classId && !!this.classData();
      case "equipment": return !draftProblems(d, this.host.registry).some(m => /equipment|gold/i.test(m));
      case "name": return false;
      case "step": return this.stepDone(p.step);
    }
  }
  private stepDone(s: Exclude<Step, { kind: "hp" }>): boolean {
    const v = this.draft.choices[s.key], isStrs = (x: unknown): x is string[] => Array.isArray(x) && x.every(y => typeof y === "string");
    switch (s.kind) {
      case "subclass": return typeof v === "string";
      case "asi": return typeof v === "object" && v !== null && ("feat" in v || Object.values((v as { abilities?: Record<string, number> }).abilities ?? {}).reduce((a, n) => a + n, 0) === 2);
      case "pick": return isStrs(v) && v.length === s.count && v.every(x => x.trim() !== "");
      case "spells": return isStrs(v) && v.length === s.cantrips + s.count;
    }
  }
  problems(): string[] { return draftProblems(this.draft, this.host.registry); }
  /** What the finished character would be (or why not), for the last page. */
  preview(): { value: Character; summary: string[] } | { error: string } { return buildCharacter(this.draft, this.host.registry, this.host.rng); }

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
