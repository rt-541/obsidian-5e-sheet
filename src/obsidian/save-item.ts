import { freeName } from "../content/creature-note";
import { draftToItemNote, validateItemDraft, type ItemDraft } from "../content/itemblock";
import { slug, type Registry } from "../content/registry";
import type { ItemData } from "../content/types";
import { createNote, type NoteIO } from "./create-note";

export interface SavedItem { id: string; name: string; path: string }

/** Characters a file name cannot hold in Obsidian. */
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Write a custom item as a note in `<compendium>/Homebrew/Items/` and put it in the registry straight away, so the caller can add it to the
 * inventory before Obsidian has re-indexed the new file. Never overwrites: a name that is taken (a note with that file name, or any item with
 * that id) gets " (2)", " (3)" ... `find` looks up a base weapon or armour (a sheet passes its edition lens; the default is the raw registry); the name checks always use the raw one.
 */
export async function saveItem(deps: { registry: Registry; io: NoteIO; compendiumFolder: string; stringify: (o: Record<string, unknown>) => string }, draft: ItemDraft, find?: (id: string) => ItemData | undefined): Promise<SavedItem> {
  const problems = validateItemDraft(draft);
  if (problems.length) throw new Error(problems.join(" "));
  const folder = `${deps.compendiumFolder.replace(/\/+$/, "")}/Homebrew/Items`;
  const pathOf = (name: string) => `${folder}/${fileSafe(name)}.md`;
  const name = freeName(draft.name.trim(), n => !fileSafe(n) || deps.io.exists(pathOf(n)) || deps.registry.get("item", slug(n)) !== undefined);
  const { id, fm, body } = draftToItemNote({ ...draft, name }, find ?? (k => deps.registry.get<ItemData>("item", k)?.data));
  const path = pathOf(name);
  await createNote(deps.io, path, fm, body, deps.stringify);
  const problem = deps.registry.add("vault", "item", fm, { path, body, sourceName: "Homebrew" });
  if (problem) throw new Error(`The item was saved to ${path} but the sheet could not read it: ${problem.errors.join("; ")}`);
  return { id, name, path };
}
