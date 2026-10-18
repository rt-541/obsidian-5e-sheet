/** What a right-click in the file explorer offers for creating a character. */
export interface NewCharacterAction { title: string; /** Vault folder the note is saved in ("" for the vault root). */ folder: string; /** `[[Campaign]]` link to pre-fill, when the click was on a campaign note. */ campaign?: string; }

export type MenuTarget =
  | { kind: "folder"; path: string }
  | { kind: "file"; basename: string; /** Folder the file sits in. */ folder: string; frontmatter?: Record<string, unknown> };

const rootless = (p: string) => (p === "/" ? "" : p);

/**
 * A folder offers "New 5e character here" and saves into that folder.
 * A campaign note offers "New character in this campaign": saved beside the campaign note, with the campaign already linked.
 * Anything else offers nothing.
 */
export function newCharacterAction(t: MenuTarget): NewCharacterAction | undefined {
  if (t.kind === "folder") return { title: "New 5e character here", folder: rootless(t.path) };
  if (t.frontmatter?.type === "5e-campaign") return { title: "New character in this campaign", folder: rootless(t.folder), campaign: `[[${t.basename}]]` };
  return undefined;
}
