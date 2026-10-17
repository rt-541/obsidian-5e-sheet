import { Modal, Platform, type App } from "obsidian";
import type { BuilderController } from "../ui/builder";
import { mountBuilder } from "../ui/builder-ui";

/** Hosts the new-character builder in an Obsidian modal. */
export class BuilderModal extends Modal {
  private mounted?: { destroy(): void };
  constructor(app: App, private ctl: BuilderController) { super(app); }
  onOpen() {
    this.modalEl.addClass("fe-builder-modal");
    const root = this.contentEl.createDiv();
    this.mounted = mountBuilder(root, this.ctl, Platform.isMobile || window.innerWidth < 700);
  }
  onClose() { this.mounted?.destroy(); this.mounted = undefined; this.contentEl.empty(); }
}
