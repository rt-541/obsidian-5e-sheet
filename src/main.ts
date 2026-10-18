import { MarkdownView, Notice, Plugin, TFile, TFolder, type WorkspaceLeaf } from "obsidian";
import { Registry, type Entry } from "./content/registry";
import type { SourceSwitches } from "./content/sources";
import { campaignType, type CampaignData } from "./content/types/campaign";
import type { CompanionKind } from "./core/character";
import { loadSrd } from "./content/srd";
import { setBuiltinMechanics } from "./content/overlay";
import { registerBuiltinTypes } from "./content/types";
import { VaultLoader } from "./content/vault-loader";
import { BuilderController } from "./ui/builder";
import { BuilderModal } from "./obsidian/builder-modal";
import { CharacterView, VIEW_TYPE } from "./obsidian/character-view";
import { COMPENDIUM_VIEW, CompendiumView } from "./obsidian/compendium-view";
import { addToSheet } from "./ui/compendium";
import { DEFAULT_SETTINGS, FiveESettingTab, type PluginData } from "./obsidian/settings";
import { healCompendiumFolder } from "./obsidian/heal";
import { campaignLink, NoteStore } from "./obsidian/store";
import { obsidianCreateNote } from "./obsidian/vault-note";
import { ObsidianVaultAdapter } from "./obsidian/vault-adapter";

const SHEET_TYPES = new Set(["5e-character", "5e-npc"]);
const LOG_SAVE_MS = 2000;

export default class FiveESheetPlugin extends Plugin {
  data!: PluginData;
  registry = new Registry();
  store!: NoteStore;
  loader!: VaultLoader;
  private asMarkdown = new WeakSet<WorkspaceLeaf>();
  /** The sheet tab most recently active: where the compendium browser adds things. */
  private lastSheet?: WorkspaceLeaf;
  private logTimer?: number;

  async onload() {
    this.data = Object.assign({ settings: { ...DEFAULT_SETTINGS }, logs: {} }, await this.loadData());
    this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings };
    setBuiltinMechanics(this.data.settings.builtinMechanics);
    registerBuiltinTypes(this.registry);
    const problems = loadSrd(this.registry);
    if (problems.length) console.error("5e sheet: SRD problems", problems);
    this.store = new NoteStore({ process: (path, fn) => {
      const f = this.app.vault.getAbstractFileByPath(path);
      return f instanceof TFile ? this.app.fileManager.processFrontMatter(f, fn).then(() => true) : Promise.resolve(false);
    } }, 300, undefined, undefined, path => this.notice(`5e sheet: could not save, ${path} no longer exists.`));
    this.loader = new VaultLoader(this.registry, new ObsidianVaultAdapter(this.app), this.data.settings.compendiumFolder);
    this.registerView(VIEW_TYPE, leaf => new CharacterView(leaf, this));
    this.registerView(COMPENDIUM_VIEW, leaf => new CompendiumView(leaf, this));
    this.addRibbonIcon("book-open", "Open 5e compendium", () => { void this.openCompendium(); });
    this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
      if (leaf?.view instanceof CharacterView) this.lastSheet = leaf;
      this.app.workspace.getLeavesOfType(COMPENDIUM_VIEW).forEach(l => (l.view as CompendiumView).refresh());
    }));
    this.addSettingTab(new FiveESettingTab(this.app, this));
    this.registry.onChange(() => this.refreshViews());

    this.app.workspace.onLayoutReady(async () => {
      const moved = await healCompendiumFolder(this.data.settings.compendiumFolder, p => this.app.vault.adapter.exists(p));
      if (moved) { this.data.settings.compendiumFolder = moved; await this.persist(); this.notice(`5e sheet: compendium folder moved to ${moved}`); }
      if (moved) await this.loader.setFolder(moved);   // re-indexes from the new root
      const n = moved ? "?" : await this.loader.indexAll();
      if (this.registry.problems().length) this.notice(`5e sheet: ${this.registry.problems().length} compendium note(s) have errors. Run "Show compendium problems".`);
      console.debug(`5e sheet: indexed ${n} compendium notes (${this.registry.libraryCount()} from the WotC library, ${this.registry.referenceOnlyCount()} library notes not usable on the sheet)`);
      this.registerEvent(this.app.metadataCache.on("changed", file => { void this.loader.changed(file.path); this.forViews(v => v.file?.path === file.path, v => v.externalChange()); }));
      this.registerEvent(this.app.vault.on("delete", f => { this.loader.deleted(f.path); }));
      this.registerEvent(this.app.vault.on("rename", (f, old) => { void this.loader.renamed(f.path, old); this.store.rename(old, f.path); }));
      this.registerEvent(this.app.workspace.on("file-open", file => this.sheetifyLeaves(file)));
      // Tabs restored at startup never fire file-open; switch them once the metadata cache knows their frontmatter.
      this.sheetifyLeaves();
      const ref = this.app.metadataCache.on("resolved", () => { this.sheetifyLeaves(); this.app.metadataCache.offref(ref); });
      this.registerEvent(ref);
    });

    // Right-click (file explorer, tab menu, links): open a character or NPC note as a sheet.
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof TFile) || !this.isSheet(file)) return;
      menu.addItem(i => i.setTitle("Open as 5e sheet").setIcon("dice").setSection("open").onClick(() => this.openAsSheet(file)));
      menu.addItem(i => i.setTitle("Open as 5e sheet in new tab").setIcon("dice").setSection("open").onClick(() => this.openAsSheet(file, true)));
    }));
    this.addCommand({ id: "open-compendium", name: "Open 5e compendium", callback: () => { void this.openCompendium(); } });
    this.addCommand({ id: "toggle-sheet", name: "Toggle sheet / markdown", callback: () => this.toggleActive() });
    this.addCommand({ id: "new-character", name: "New character", callback: () => this.createNote("5e-character") });
    this.addCommand({ id: "new-character-builder", name: "New character (builder)", callback: () => this.openBuilder() });
    this.addCommand({ id: "new-npc", name: "New NPC", callback: () => this.createNote("5e-npc") });
    this.addCommand({ id: "show-problems", name: "Show compendium problems", callback: () => {
      const p = this.registry.problems();
      this.notice(p.length ? p.map(x => `${x.path}: ${x.errors.join("; ")}`).join("\n") : "No compendium problems.");
    } });
    this.addCommand({ id: "reload-compendium", name: "Reload compendium", callback: async () => { await this.loader.setFolder(this.data.settings.compendiumFolder); this.notice("Compendium reloaded."); } });
  }

  async onunload() { await this.store.flush(); await this.persist(); }

  notice(msg: string) { new Notice(msg, 6000); }
  async persist() { await this.saveData(this.data); }
  saveLogsSoon() { window.clearTimeout(this.logTimer); this.logTimer = window.setTimeout(() => { void this.persist(); }, LOG_SAVE_MS); }

  /** Show the compendium browser: reuse its tab, else a new tab (the whole screen on mobile). */
  async openCompendium() {
    const ws = this.app.workspace, existing = ws.getLeavesOfType(COMPENDIUM_VIEW)[0];
    if (existing) { ws.revealLeaf(existing); return; }
    const leaf = ws.getLeaf("tab");
    await leaf.setViewState({ type: COMPENDIUM_VIEW, active: true });
    ws.revealLeaf(leaf);
  }
  /** The character sheet "Add to character" targets: the most recently active one, else any open one. */
  private targetSheet(): CharacterView | undefined {
    const ok = (l?: WorkspaceLeaf) => (l?.view instanceof CharacterView && l.view.sheet?.character ? l.view : undefined);
    return ok(this.lastSheet) ?? this.app.workspace.getLeavesOfType(VIEW_TYPE).map(l => ok(l)).find(Boolean);
  }
  targetSheetName(): string | undefined { return this.targetSheet()?.file?.basename; }
  /** The target sheet's campaign (its source switches dim sources in the browser). */
  targetCampaign(): CampaignData | undefined { return this.targetSheet()?.sheet?.host.campaign; }
  addToSheet(e: Entry, kind: CompanionKind): string {
    const v = this.targetSheet(), ctl = v?.sheet;
    const msg = ctl && v ? addToSheet(ctl, e, kind, v.file?.basename ?? "the sheet") : "Open a character sheet first";
    this.notice(msg); return msg;
  }
  async openNote(path: string) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) await this.app.workspace.getLeaf("tab").openFile(f);
  }
  /** Source switches of the campaign a note links to (`[[Name]]` or a plain name), resolved from `from`. */
  private campaignSources(link: string, from: string): SourceSwitches {
    const name = campaignLink(link); if (!name) return undefined;
    const target = this.app.metadataCache.getFirstLinkpathDest(name, from); if (!target) return undefined;
    const fm = this.app.metadataCache.getFileCache(target)?.frontmatter;
    return fm ? campaignType.validate(fm as Record<string, unknown>).value?.sources : undefined;
  }

  private forViews(match: (v: CharacterView) => boolean, fn: (v: CharacterView) => void | Promise<void>) {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) { const v = leaf.view as CharacterView; if (match(v)) void fn(v); }
  }
  refreshViews() { this.forViews(() => true, v => v.build()); }

  private isSheet(file: TFile | null): boolean {
    const t = file && this.app.metadataCache.getFileCache(file)?.frontmatter?.type;
    return typeof t === "string" && SHEET_TYPES.has(t);
  }
  /** Switch every markdown tab showing a sheet note (optionally only `only`) to the sheet view, unless the user chose markdown for it. */
  private sheetifyLeaves(only?: TFile | null) {
    if (!this.data.settings.autoOpen) return;
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view.getViewType() !== "markdown" || this.asMarkdown.has(leaf)) return;
      const file = (leaf.view as MarkdownView).file;
      if (!file || (only && file.path !== only.path) || !this.isSheet(file)) return;
      const active = this.app.workspace.getMostRecentLeaf() === leaf;
      void leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active });
    });
  }
  async openAsMarkdown(leaf: WorkspaceLeaf) {
    const file = (leaf.view as CharacterView).file; if (!file) return;
    this.asMarkdown.add(leaf);
    await leaf.setViewState({ type: "markdown", state: { file: file.path }, active: true });
  }
  /** Open `file` as a sheet: reuse a tab already showing it, else the current tab, or a new tab when asked. */
  async openAsSheet(file: TFile, newTab = false) {
    const ws = this.app.workspace;
    const existing = ws.getLeavesOfType(VIEW_TYPE).find(l => (l.view as CharacterView).file?.path === file.path);
    if (existing && !newTab) { ws.revealLeaf(existing); return; }
    const shown = newTab ? undefined : ws.getLeavesOfType("markdown").find(l => (l.view as MarkdownView).file?.path === file.path);
    const leaf = shown ?? ws.getLeaf(newTab ? "tab" : false);
    this.asMarkdown.delete(leaf);
    await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
  }
  private async toggleActive() {
    const leaf = this.app.workspace.getMostRecentLeaf(); if (!leaf) return;
    if (leaf.view.getViewType() === VIEW_TYPE) return this.openAsMarkdown(leaf);
    const file = this.app.workspace.getActiveFile();
    if (!file || !this.isSheet(file)) { this.notice("This note is not a 5e character or NPC."); return; }
    this.asMarkdown.delete(leaf);
    await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
  }
  /** The new-character builder: a modal wizard that writes the note through the Obsidian layer and opens it as a sheet. */
  openBuilder() {
    const parent = this.app.workspace.getActiveFile()?.parent, folder = parent instanceof TFolder ? parent.path : "";
    const modal: { close(): void } = { close: () => { /* replaced below */ } };
    const ctl = new BuilderController({
      registry: this.registry, notify: m => this.notice(m), folder: folder === "/" ? "" : folder,
      campaignSources: link => this.campaignSources(link, this.app.workspace.getActiveFile()?.path ?? ""),
      exists: p => this.app.vault.getAbstractFileByPath(p) !== null,
      createNote: obsidianCreateNote(this.app),
      open: path => this.openCreated(path), close: () => modal.close(),
    });
    // Started from a campaign note (or a character in one): name the campaign up front so the pickers honour its source switches.
    const active = this.app.workspace.getActiveFile(), fm = active && this.app.metadataCache.getFileCache(active)?.frontmatter;
    if (active && fm?.type === "5e-campaign") ctl.setCampaign(`[[${active.basename}]]`);
    else if (typeof fm?.campaign === "string") ctl.setCampaign(fm.campaign);
    const m = new BuilderModal(this.app, ctl);
    modal.close = () => m.close();
    m.open();
  }
  /** Show a note this plugin just created as a sheet, once Obsidian has indexed its frontmatter. */
  private async openCreated(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    if (!this.app.metadataCache.getFileCache(file)?.frontmatter) {
      await new Promise<void>(done => {
        const ref = this.app.metadataCache.on("changed", f => { if (f.path === file.path) { this.app.metadataCache.offref(ref); done(); } });
        window.setTimeout(() => { this.app.metadataCache.offref(ref); done(); }, 2000);
      });
    }
    await this.openAsSheet(file);
  }
  private async createNote(type: "5e-character" | "5e-npc") {
    const parent = this.app.workspace.getActiveFile()?.parent ?? this.app.vault.getRoot();
    const folder = parent instanceof TFolder ? parent.path : "";
    const base = type === "5e-character" ? "New character" : "New NPC";
    let path = `${folder ? folder + "/" : ""}${base}.md`, i = 1;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${folder ? folder + "/" : ""}${base} ${++i}.md`;
    const fm = type === "5e-character"
      ? `type: 5e-character\nschema: 1\nname: ${base}\nclasses: []\nabilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }\nhp: { max: 10, current: 10, temp: 0 }\n`
      : `type: 5e-npc\nschema: 1\nname: ${base}\ncreature: acolyte\n`;
    const f = await this.app.vault.create(path, `---\n${fm}---\n\nNotes.\n`);
    this.asMarkdown.delete(this.app.workspace.getLeaf(false));
    await this.app.workspace.getLeaf(false).setViewState({ type: VIEW_TYPE, state: { file: f.path }, active: true });
  }
}
