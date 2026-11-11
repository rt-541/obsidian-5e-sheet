/** What creating a note needs from the vault; the Obsidian binding is `obsidianCreateNote` in vault-note.ts. */
export interface NoteIO {
  exists(path: string): boolean;
  ensureFolder(path: string): Promise<void>;
  create(path: string, text: string): Promise<void>;
}

/** A note file: YAML frontmatter, then the body. */
export function renderNote(frontmatter: Record<string, unknown>, body: string, stringify: (o: Record<string, unknown>) => string): string {
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body.trim()}\n`;
}

/** The folder part of `a/b/c.md` ("" for a file at the root). */
export const parentOf = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/**
 * `host.createNote(path, frontmatter)`: write a new note, making its folders first.
 * Never overwrites: a path that is taken is an error, so a double click cannot destroy a character.
 */
export async function createNote(io: NoteIO, path: string, frontmatter: Record<string, unknown>, body: string,
  stringify: (o: Record<string, unknown>) => string): Promise<string> {
  if (io.exists(path)) throw new Error(`${path} already exists`);
  const dir = parentOf(path);
  if (dir) await io.ensureFolder(dir);
  await io.create(path, renderNote(frontmatter, body, stringify));
  return path;
}
