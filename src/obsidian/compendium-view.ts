import { ItemView, Platform, type WorkspaceLeaf } from "obsidian";
import { CompendiumController, mountCompendium } from "../ui/compendium";
import type FiveESheetPlugin from "../main";

export const COMPENDIUM_VIEW = "dnd-5e-compendium";
const NARROW_PX = 700;

/** The compendium browser as an Obsidian view: a pane on desktop, the whole screen on mobile (same layout rules as the sheet). */
export class CompendiumView extends ItemView {
  private ctl?: CompendiumController;
  private mounted?: { destroy(): void; render(): void };
  private narrow = false;
  private resizeObs?: ResizeObserver;
  private offRegistry?: () => void;

  constructor(leaf: WorkspaceLeaf, private plugin: FiveESheetPlugin) { super(leaf); }
  getViewType() { return COMPENDIUM_VIEW; }
  getDisplayText() { return "5e compendium"; }
  getIcon() { return "book-open"; }

  private mobile(): boolean {
    const l = this.plugin.data.settings.layout;
    return l === "mobile" || (l === "auto" && (Platform.isMobile || this.narrow));
  }

  async onOpen() {
    this.ctl = new CompendiumController({
      registry: this.plugin.registry,
      switches: () => this.plugin.targetCampaign()?.sources,
      target: () => this.plugin.targetSheetName(),
      add: (e, o) => this.plugin.addToSheet(e, o.companionKind),
      openNote: path => { void this.plugin.openNote(path); },
    });
    this.build();
    this.offRegistry = this.plugin.registry.onChange(() => this.ctl?.emit());
    this.resizeObs = new ResizeObserver(() => { const n = this.contentEl.clientWidth < NARROW_PX; if (n !== this.narrow) { this.narrow = n; this.build(); } });
    this.resizeObs.observe(this.contentEl);
  }
  async onClose() { this.resizeObs?.disconnect(); this.offRegistry?.(); this.mounted?.destroy(); this.mounted = undefined; this.ctl = undefined; }

  private build() {
    if (!this.ctl) return;
    this.mounted?.destroy();
    this.mounted = mountCompendium(this.contentEl, this.ctl, this.mobile());
  }
  /** The active sheet (and so its campaign switches) may have changed. */
  refresh() { this.ctl?.emit(); }
}
