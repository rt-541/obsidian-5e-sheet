import { PluginSettingTab, Setting, type App } from "obsidian";
import type { RollResult } from "../core/types";
import { MODULES } from "../rules";
import type FiveESheetPlugin from "../main";

export interface Settings {
  compendiumFolder: string;
  autoOpen: boolean;
  layout: "auto" | "desktop" | "mobile";
  ruleDefaults: Record<string, boolean>;
}
export interface PluginData { settings: Settings; logs: Record<string, RollResult[]>; /** Collapsed traits-card groups per character note path. */ collapsed?: Record<string, string[]>; }
export const DEFAULT_SETTINGS: Settings = { compendiumFolder: "compendium/5e", autoOpen: true, layout: "auto", ruleDefaults: {} };

export class FiveESettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FiveESheetPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this, s = this.plugin.data.settings;
    containerEl.empty();
    new Setting(containerEl).setName("Compendium folder").setDesc("Content notes (type: 5e-item, 5e-spell, 5e-creature, ...) are read from this folder. The first folder under it is the source (WotC, Critical Role, Roll20, Homebrew, ...); notes directly in it are Homebrew.")
      .addText(t => t.setValue(s.compendiumFolder).onChange(async v => { s.compendiumFolder = v.trim() || DEFAULT_SETTINGS.compendiumFolder; await this.plugin.persist(); await this.plugin.loader.setFolder(s.compendiumFolder); }));
    new Setting(containerEl).setName("Open sheets automatically").setDesc("Character and NPC notes open as a sheet instead of markdown.")
      .addToggle(t => t.setValue(s.autoOpen).onChange(async v => { s.autoOpen = v; await this.plugin.persist(); }));
    new Setting(containerEl).setName("Layout").setDesc("Auto picks the mobile layout on phones and narrow panes.")
      .addDropdown(d => d.addOptions({ auto: "Auto", desktop: "Desktop", mobile: "Mobile" }).setValue(s.layout)
        .onChange(async v => { s.layout = v as Settings["layout"]; await this.plugin.persist(); this.plugin.refreshViews(); }));
    containerEl.createEl("h3", { text: "Default rules" });
    containerEl.createEl("p", { text: "Campaign notes and character notes can override these.", cls: "setting-item-description" });
    for (const m of MODULES) new Setting(containerEl).setName(m.title)
      .addToggle(t => t.setValue(s.ruleDefaults[m.id] ?? m.defaultOn).onChange(async v => { s.ruleDefaults[m.id] = v; await this.plugin.persist(); this.plugin.refreshViews(); }));
  }
}
