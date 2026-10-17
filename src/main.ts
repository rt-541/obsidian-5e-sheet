import { MarkdownView, Notice, Plugin, TFile, TFolder, type WorkspaceLeaf } from "obsidian";
import { Registry } from "./content/registry";
import { loadSrd } from "./content/srd";
import { registerBuiltinTypes } from "./content/types";
import { VaultLoader } from "./content/vault-loader";
import { BuilderController } from "./ui/builder";
import { BuilderModal } from "./obsidian/builder-modal";
import { CharacterView, VIEW_TYPE } from "./obsidian/character-view";
import { DEFAULT_SETTINGS, FiveESettingTab, type PluginData } from "./obsidian/settings";
import { NoteStore } from "./obsidian/store";
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
  private logTimer?: number;

  async onload() {
    this.data = Object.assign({ settings: { ...DEFAULT_SETTINGS }, logs: {} }, await this.loadData());
    this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings };
    registerBuiltinTypes(this.registry);
    const problems = loadSrd(this.registry);
    if (problems.length) console.error("5e sheet: SRD problems", problems);
    this.store = new NoteStore({ process: (path, fn) => {
      const f = this.app.vault.getAbstractFileByPath(path);
      return f instanceof TFile ? this.app.fileManager.processFrontMatter(f, fn).then(() => true) : Promise.resolve(false);
    } }, 300, undefined, undefined, path => this.notice(`5e sheet: could not save, ${path} no longer exists.`));
    this.loader = new VaultLoader(this.registry, new ObsidianVaultAdapter(this.app), this.data.settings.compendiumFolder);
    this.registerView(VIEW_TYPE, leaf => new CharacterView(leaf, this));
    this.addSettingTab(new FiveESettingTab(this.app, this));
    this.registry.onChange(() => this.refreshViews());

    this.app.workspace.onLayoutReady(async () => {
      const n = await this.loader.indexAll();
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
      exists: p => this.app.vault.getAbstractFileByPath(p) !== null,
      createNote: obsidianCreateNote(this.app),
      open: path => this.openCreated(path), close: () => modal.close(),
    });
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
