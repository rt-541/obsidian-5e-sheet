import { PluginSettingTab, Setting, type App } from "obsidian";
import type { RollResult } from "../core/types";
import { setBuiltinMechanics } from "../content/overlay";
import { MODULES } from "../rules";
import type { LayoutSetting } from "../ui/layouts";
import type FiveESheetPlugin from "../main";

export interface Settings {
  compendiumFolder: string;
  autoOpen: boolean;
  layout: LayoutSetting;
  ruleDefaults: Record<string, boolean>;
  /** Built-in mechanics: numbers and switches the plugin supplies for features whose notes have none. */
  builtinMechanics: boolean;
}
export interface PluginData { settings: Settings; logs: Record<string, RollResult[]>; /** Collapsed traits-card groups per character note path. */ collapsed?: Record<string, string[]>; }
export const DEFAULT_SETTINGS: Settings = { compendiumFolder: "compendium/5e", autoOpen: true, layout: "auto", ruleDefaults: {}, builtinMechanics: true };

export class FiveESettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FiveESheetPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this, s = this.plugin.data.settings;
    containerEl.empty();
    new Setting(containerEl).setName("Compendium folder").setDesc("Content notes (type: 5e-item, 5e-spell, 5e-creature, ...) are read from this folder. The first folder under it is the source (WotC, Critical Role, Roll20, Homebrew, ...); notes directly in it are Homebrew.")
      .addText(t => t.setValue(s.compendiumFolder).onChange(async v => { s.compendiumFolder = v.trim() || DEFAULT_SETTINGS.compendiumFolder; await this.plugin.persist(); await this.plugin.loader.setFolder(s.compendiumFolder); }));
    new Setting(containerEl).setName("Open sheets automatically").setDesc("Character and NPC notes open as a sheet instead of markdown.")
      .addToggle(t => t.setValue(s.autoOpen).onChange(async v => { s.autoOpen = v; await this.plugin.persist(); }));
    new Setting(containerEl).setName("Layout").setDesc("Auto picks the phone layout on phones and narrow panes, the tablet layout on tablets and medium-width panes (700 to 1100 pixels), and the desktop layout otherwise. Choose one to always use it.")
      .addDropdown(d => d.addOptions({ auto: "Auto", desktop: "Desktop", tablet: "Tablet", mobile: "Phone" }).setValue(s.layout)
        .onChange(async v => { s.layout = v as LayoutSetting; await this.plugin.persist(); this.plugin.refreshViews(true); }));
    new Setting(containerEl).setName("Built-in mechanics").setDesc("The plugin fills in the numbers and switches (armor class, Rage, Sneak Attack, fighting styles and so on) for features whose notes do not have any. A note that has its own always wins. Turn this off to use only what your notes say.")
      .addToggle(t => t.setValue(s.builtinMechanics).onChange(async v => {
        s.builtinMechanics = v; setBuiltinMechanics(v); await this.plugin.persist();
        await this.plugin.loader.setFolder(s.compendiumFolder); this.plugin.refreshViews(true);
      }));
    containerEl.createEl("h3", { text: "Default rules" });
    containerEl.createEl("p", { text: "Campaign notes and character notes can override these.", cls: "setting-item-description" });
    for (const m of MODULES) new Setting(containerEl).setName(m.title)
      .addToggle(t => t.setValue(s.ruleDefaults[m.id] ?? m.defaultOn).onChange(async v => { s.ruleDefaults[m.id] = v; await this.plugin.persist(); this.plugin.refreshViews(true); }));
  }
}
