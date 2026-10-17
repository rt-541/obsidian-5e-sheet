import { normalizePath, stringifyYaml, type App } from "obsidian";
import { createNote, type NoteIO } from "./create-note";

export function vaultNoteIO(app: App): NoteIO {
  return {
    exists: path => app.vault.getAbstractFileByPath(path) !== null,
    async ensureFolder(path) {
      let built = "";
      for (const part of normalizePath(path).split("/")) {
        built = built ? `${built}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(built)) await app.vault.createFolder(built);
      }
    },
    async create(path, text) { await app.vault.create(path, text); },
  };
}

/** The Obsidian implementation of host.createNote(path, frontmatter). */
export function obsidianCreateNote(app: App, body = "Notes."): (path: string, frontmatter: Record<string, unknown>) => Promise<string> {
  const io = vaultNoteIO(app);
  return (path, fm) => createNote(io, normalizePath(path), fm, body, o => stringifyYaml(o));
}
