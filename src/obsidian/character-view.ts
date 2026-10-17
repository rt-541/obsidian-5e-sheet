import { FileView, MarkdownRenderer, Platform, TFile, type WorkspaceLeaf } from "obsidian";
import { campaignType, type CampaignData } from "../content/types/campaign";
import { parseNote } from "../core/character";
import { SheetController } from "../ui/controller";
import { mountSheet } from "../ui/sheet";
import type FiveESheetPlugin from "../main";
import { campaignLink, stripFrontmatter } from "./store";

export const VIEW_TYPE = "dnd-5e-sheet";
const NARROW_PX = 700;

export class CharacterView extends FileView {
  private ctl?: SheetController;
  private mounted?: { destroy(): void; render(): void };
  private narrow = false;
  private resizeObs?: ResizeObserver;

  constructor(leaf: WorkspaceLeaf, private plugin: FiveESheetPlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? "5e sheet"; }
  getIcon() { return "dice"; }

  async onOpen() {
    this.addAction("file-text", "Open as markdown", () => this.plugin.openAsMarkdown(this.leaf));
    this.resizeObs = new ResizeObserver(() => { const n = this.contentEl.clientWidth < NARROW_PX; if (n !== this.narrow) { this.narrow = n; void this.build(); } });
    this.resizeObs.observe(this.contentEl);
  }
  async onClose() { this.resizeObs?.disconnect(); await this.teardown(); }
  async onLoadFile(file: TFile) { await this.build(file); }
  async onUnloadFile() { await this.teardown(); }

  private mobile(): boolean {
    const l = this.plugin.data.settings.layout;
    return l === "mobile" || (l === "auto" && (Platform.isMobile || this.narrow));
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
    this.contentEl.empty();
    if (parsed.kind === "none") { this.contentEl.createEl("p", { text: "This note is not a 5e character or NPC (frontmatter type: 5e-character or 5e-npc)." }); return; }
    const prev = this.ctl;
    const body = stripFrontmatter(await this.app.vault.cachedRead(file));
    const log = (this.plugin.data.logs[file.path] ??= []);
    const ctl = new SheetController({
      registry: this.plugin.registry,
      campaign: this.campaignFor(file, parsed.value.campaign),
      ruleDefaults: this.plugin.data.settings.ruleDefaults,
      save: v => this.plugin.store.queue(file.path, v),
      notify: m => this.plugin.notice(m),
      log, body,
      renderMarkdown: (md, el) => { void MarkdownRenderer.render(this.app, md, el, file.path, this); },
    }, parsed);
    if (prev) { ctl.tab = prev.tab; ctl.mode = prev.mode; ctl.editing = prev.editing; }
    ctl.subscribe(() => this.plugin.saveLogsSoon());
    this.mounted?.destroy();
    this.ctl = ctl; this.mounted = mountSheet(this.contentEl, ctl, this.mobile());
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
