import { freeName } from "../content/creature-note";
import { slug, type Registry } from "../content/registry";
import { MECHANIC_KEYS, spellDraftToNote, spellMechanics, validateSpellDraft, type SpellDraft } from "../content/spell-note";
import { createNote, type NoteIO } from "./create-note";

export interface SavedSpell { id: string; name: string; path: string }

/** What editing a note needs on top of creating one (the Obsidian binding is in main.ts). */
export interface SpellIO extends NoteIO {
  /** Change the note's frontmatter in place (app.fileManager.processFrontMatter). False if the note is gone. */
  processFrontMatter(path: string, fn: (fm: Record<string, unknown>) => void): Promise<boolean>;
  /** Replace the text after the frontmatter, leaving the frontmatter as it is. */
  replaceBody(path: string, body: string): Promise<void>;
}
interface Deps { registry: Registry; io: NoteIO; compendiumFolder: string; stringify: (o: Record<string, unknown>) => string }

/** Characters a file name cannot hold in Obsidian. */
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Write a custom spell as a note in `<compendium>/Homebrew/Spells/` and put it in the registry straight away, so the caller can add it
 * to a character before Obsidian has re-indexed the file. Never overwrites: a name that is taken (a note with that file name, or any
 * spell with that id) gets " (2)", " (3)" ...
 */
export async function saveSpell(deps: Deps, draft: SpellDraft): Promise<SavedSpell> {
  const problems = validateSpellDraft(draft);
  if (problems.length) throw new Error(problems.join(" "));
  const folder = `${deps.compendiumFolder.replace(/\/+$/, "")}/Homebrew/Spells`;
  const pathOf = (name: string) => `${folder}/${fileSafe(name)}.md`;
  const name = freeName(draft.name.trim(), n => !fileSafe(n) || deps.io.exists(pathOf(n)) || deps.registry.get("spell", slug(n)) !== undefined);
  const { id, fm, body } = spellDraftToNote({ ...draft, name });
  const path = pathOf(name);
  await createNote(deps.io, path, fm, body, deps.stringify);
  const problem = deps.registry.add("vault", "spell", fm, { path, body, sourceName: "Homebrew" });
  if (problem) throw new Error(`The spell was saved to ${path} but the sheet could not read it: ${problem.errors.join("; ")}`);
  return { id, name, path };
}

/**
 * Rewrite the spell fields of an existing note (name, level, components, dice ...) and leave everything else in it alone: other
 * frontmatter keys, the id (characters refer to it) and the body. The body is only replaced when the player changed the description.
 */
export async function updateSpell(deps: { registry: Registry; io: SpellIO },
  target: { id: string; path: string; sourceName: string; body?: string }, draft: SpellDraft): Promise<SavedSpell> {
  const problems = validateSpellDraft(draft);
  if (problems.length) throw new Error(problems.join(" "));
  const mech = spellMechanics(draft), text = draft.description.trim();
  const bodyChanged = text !== (target.body ?? "").trim();
  let result: Record<string, unknown> | undefined;
  const ok = await deps.io.processFrontMatter(target.path, fm => {
    for (const k of MECHANIC_KEYS) delete fm[k];
    for (const [k, v] of Object.entries(mech)) if (v !== null) fm[k] = v;
    fm.id = target.id;
    if (fm.rules !== undefined && bodyChanged) fm.rules = text;   // a note that keeps its text in the properties
    result = { ...fm };
  });
  if (!ok || !result) throw new Error(`${target.path} no longer exists, so the spell could not be changed.`);
  const keepsRulesInProps = result.rules !== undefined;
  if (bodyChanged && !keepsRulesInProps) await deps.io.replaceBody(target.path, text);
  const body = bodyChanged ? text : target.body;
  const problem = deps.registry.add("vault", "spell", result, { path: target.path, ...(body !== undefined ? { body } : {}), sourceName: target.sourceName });
  if (problem) throw new Error(`The spell was changed in ${target.path} but the sheet could not read it: ${problem.errors.join("; ")}`);
  return { id: target.id, name: draft.name.trim(), path: target.path };
}
