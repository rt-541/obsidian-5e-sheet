import { EDITIONS, readEdition, type Edition } from "../core/edition";
import type { Entry, Registry } from "./registry";

/** The edition an entry belongs to: bundled and library content is 2014 unless stamped; hand-made notes have none unless they say. */
export function entryEdition(e: { source: "srd" | "vault"; library?: boolean; edition?: Edition }): Edition | undefined {
  return e.edition ?? (e.source === "srd" || e.library ? "2014" : undefined);
}

/** Only a trailing `@2014` or `@2024` is a qualifier. */
export function splitRef(ref: string): { id: string; edition?: Edition } {
  const i = ref.lastIndexOf("@");
  const tail = ref.slice(i + 1);
  return i > 0 && (EDITIONS as readonly string[]).includes(tail) ? { id: ref.slice(0, i), edition: readEdition(tail) } : { id: ref };
}
export const qualifyRef = (id: string, e: Edition): string => `${id}@${e}`;
/** Drops a qualifier equal to the character's own edition. */
export function canonRef(ref: string, own: Edition): string {
  const s = splitRef(ref);
  return s.edition && s.edition !== own ? ref : s.id;
}
/** Two stored references name the same thing: equal once a qualifier equal to the character's own edition is dropped. */
export const sameRef = (a: string, b: string, own: Edition): boolean => canonRef(a, own) === canonRef(b, own);
/** Plain when the entry's edition is `own` or none, else qualified. */
export function refFor(entry: Entry, own: Edition): string {
  const ed = entryEdition(entry);
  return !ed || ed === own ? entry.id : qualifyRef(entry.id, ed);
}
/** The card line naming source, book and edition, e.g. `WotC · PHB · 2014 rules`; hand-made notes with no edition show the source alone. */
export function provenanceLine(e: Entry): string {
  const ed = entryEdition(e);
  return [e.sourceName, ...(e.library && e.book ? [e.book] : []), ...(ed ? [`${ed} rules`] : [])].join(" · ");
}
/**
 * An id named inside an entry from another edition than the character's, written as the reference that finds the entry's own edition's version
 * (`id@2014`), so a brought-in note's ops do not resolve through the character's lens. Plain when the entry is the character's edition or none,
 * when no such version exists, or when homebrew wins the id.
 */
export function refIn(reg: Registry, type: string, id: string, from: Edition | undefined, own: Edition): string {
  if (!from || from === own || splitRef(id).edition) return id;
  const hit = reg.forEdition(from).get(type, id);
  return hit ? refFor(hit, own) : id;
}
