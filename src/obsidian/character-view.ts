import { FileView, MarkdownRenderer, Platform, TFile, type WorkspaceLeaf } from "obsidian";
import { campaignType, type CampaignData } from "../content/types/campaign";
import { parseNote } from "../core/character";
import { SheetController } from "../ui/controller";
import { pickLayout, type LayoutName } from "../ui/layouts";
import { mountSheet } from "../ui/sheet";
import type FiveESheetPlugin from "../main";
import { campaignLink, stripFrontmatter } from "./store";

export const VIEW_TYPE = "dnd-5e-sheet";

export class CharacterView extends FileView {
  private ctl?: SheetController;
  private mounted?: { destroy(): void; render(): void };
  private layoutName?: LayoutName;
  private resizeObs?: ResizeObserver;
  private logPath?: string;

  constructor(leaf: WorkspaceLeaf, private plugin: FiveESheetPlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? "5e sheet"; }
  getIcon() { return "dice"; }

  async onOpen() {
    this.addAction("file-text", "Open as markdown", () => this.plugin.openAsMarkdown(this.leaf));
    this.resizeObs = new ResizeObserver(() => { if (this.layoutName && this.pick() !== this.layoutName) void this.build(); });
    this.resizeObs.observe(this.contentEl);
  }
  async onClose() { this.resizeObs?.disconnect(); await this.teardown(); }
  async onLoadFile(file: TFile) { await this.build(file); }
  async onUnloadFile() { await this.teardown(); }
  /** A renamed note keeps its roll log, and the sheet is rebuilt so nothing points at the old path. */
  async onRename(file: TFile) {
    const old = this.logPath, logs = this.plugin.data.logs;
    const col = this.plugin.data.collapsed;
    if (old && old !== file.path && col?.[old]) { col[file.path] = col[old]; delete col[old]; }
    if (old && old !== file.path) { if (logs[old] && !logs[file.path]) logs[file.path] = logs[old]; delete logs[old]; this.plugin.saveLogsSoon(); }
    await this.build(file);
  }

  /** The sheet being shown (the compendium browser adds items, spells and companions to it). */
  get sheet(): SheetController | undefined { return this.ctl; }

  /** The layout for this pane: the Layout setting, else the device and the pane width (phone, tablet 700 to 1100 px, desktop). */
  private pick(): LayoutName {
    return pickLayout(this.plugin.data.settings.layout, { isMobile: Platform.isMobile, isTablet: Platform.isTablet, width: this.contentEl.clientWidth });
  }
  private campaignFor(file: TFile, raw: string | undefined): CampaignData | undefined {
    const link = campaignLink(raw); if (!link) return undefined;
    const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path); if (!target) return undefined;
    const fm = this.app.metadataCache.getFileCache(target)?.frontmatter;
    return fm ? campaignType.validate(fm as Record<string, unknown>).value : undefined;
  }

  private async teardown() {
    if (this.file) await this.plugin.store.flush(this.file.path);
    this.mounted?.destroy(); this.mounted = undefined; this.ctl = undefined;
  }

  /** (Re)build the sheet for the current file. Keeps tab, mode and edit state across rebuilds. */
  async build(file: TFile | null = this.file) {
    if (!file) return;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const parsed = parseNote(this.plugin.store.pending(file.path) ?? fm);
    const keepTop = this.contentEl.scrollTop;   // a rebuild must not jump the reader back to the top
    if (parsed.kind === "none") { this.contentEl.empty(); this.contentEl.createEl("p", { text: "This note is not a 5e character or NPC (frontmatter type: 5e-character or 5e-npc)." }); return; }
    const prev = this.ctl;
    const body = stripFrontmatter(await this.app.vault.cachedRead(file));
    this.logPath = file.path;
    const log = (this.plugin.data.logs[file.path] ??= []);
    let sheetCtl: SheetController | undefined;
    const ctl = new SheetController({
      registry: this.plugin.registry,
      campaign: this.campaignFor(file, parsed.value.campaign),
      ruleDefaults: this.plugin.data.settings.ruleDefaults,
      save: v => { if (this.file) this.plugin.store.queue(this.file.path, v); },
      notify: m => (sheetCtl ? sheetCtl.say(m) : this.plugin.notice(m)),
      openBuilder: () => this.plugin.openBuilder(),
      log, body,
      collapsedGroups: () => this.plugin.data.collapsed?.[file.path] ?? [],
      setCollapsedGroups: ids => { const d = (this.plugin.data.collapsed ??= {}); if (ids.length) d[file.path] = ids; else delete d[file.path]; this.plugin.saveLogsSoon(); },
      saveCreature: async d => (await this.plugin.saveCreature(d)).id,
      saveItem: async (d, find) => (await this.plugin.saveItem(d, find)).id,
      saveSpell: d => this.plugin.saveSpell(d),
      updateSpell: (t, d) => this.plugin.updateSpell(t, d),
      openNote: p => { void this.plugin.openNote(p); },
      renderMarkdown: (md, el) => { void MarkdownRenderer.render(this.app, md, el, file.path, this); },
    }, parsed);
    sheetCtl = ctl;
    if (prev) { ctl.tab = prev.tab; ctl.mode = prev.mode; ctl.editing = prev.editing; }
    ctl.subscribe(() => this.plugin.saveLogsSoon());
    this.mounted?.destroy();
    this.contentEl.empty();
    this.ctl = ctl; this.layoutName = this.pick(); this.mounted = mountSheet(this.contentEl, ctl, this.layoutName);
    this.contentEl.scrollTop = keepTop;
  }

  /** Called by the plugin when this file's metadata changes. */
  async externalChange() {
    if (!this.file || this.plugin.store.isOwnWrite(this.file.path) || this.plugin.store.pending(this.file.path)) return;
    const fm = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    const p = parseNote(fm);
    if (p.kind === "none") { this.plugin.openAsMarkdown(this.leaf); return; }
    this.ctl?.reload(p);
  }
  rerender() { this.mounted?.render(); }
}
