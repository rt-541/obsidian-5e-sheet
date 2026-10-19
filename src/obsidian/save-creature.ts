import { draftToNote, freeName, validateDraft, type Draft } from "../content/creature-note";
import { slug, type Registry } from "../content/registry";
import { createNote, type NoteIO } from "./create-note";

export interface SavedCreature { id: string; name: string; path: string }

/** Characters a file name cannot hold in Obsidian. */
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Write a custom creature as a note in `<compendium>/Homebrew/Creatures/` and put it in the registry straight away, so the caller
 * can add it as a companion before Obsidian has re-indexed the new file. Never overwrites: a name that is taken (a note with that
 * file name, or any creature with that id) gets " (2)", " (3)" ...
 */
export async function saveCreature(deps: { registry: Registry; io: NoteIO; compendiumFolder: string; stringify: (o: Record<string, unknown>) => string }, draft: Draft): Promise<SavedCreature> {
  const problems = validateDraft(draft);
  if (problems.length) throw new Error(problems.join(" "));
  const folder = `${deps.compendiumFolder.replace(/\/+$/, "")}/Homebrew/Creatures`;
  const pathOf = (name: string) => `${folder}/${fileSafe(name)}.md`;
  const name = freeName(draft.name.trim(), n => !fileSafe(n) || deps.io.exists(pathOf(n)) || deps.registry.get("creature", slug(n)) !== undefined);
  const { id, fm, body } = draftToNote({ ...draft, name });
  const path = pathOf(name);
  await createNote(deps.io, path, fm, body, deps.stringify);
  const problem = deps.registry.add("vault", "creature", fm, { path, body, sourceName: "Homebrew" });
  if (problem) throw new Error(`The creature was saved to ${path} but the sheet could not read it: ${problem.errors.join("; ")}`);
  return { id, name, path };
}
