import { TFile, type App } from "obsidian";
import type { VaultAdapter, VaultNote } from "../content/vault-loader";

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private app: App) {}
  listMarkdown(folder: string): string[] {
    return this.app.vault.getMarkdownFiles().map(f => f.path).filter(p => p.startsWith(folder + "/"));
  }
  frontmatter(path: string): Record<string, unknown> | undefined {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? this.app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined : undefined;
  }
  async read(path: string): Promise<VaultNote> {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) return { path, frontmatter: undefined, body: "" };
    const cache = this.app.metadataCache.getFileCache(f);
    const text = await this.app.vault.cachedRead(f);
    const end = cache?.frontmatterPosition?.end.offset;
    return { path, frontmatter: cache?.frontmatter as Record<string, unknown> | undefined, body: end !== undefined ? text.slice(end).trim() : text.trim() };
  }
}
