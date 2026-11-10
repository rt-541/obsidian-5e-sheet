import { refFor, sameRef, splitRef } from "../content/edition";
import type { Registry } from "../content/registry";
import type { ItemData, MasteryData } from "../content/types";
import type { Character, InventoryEntry } from "./character";
import { characterEdition } from "./edition";

/**
 * The mastery property to show on an attack row: the row's weapon (or the base a generic variant is made from) is one the character has mastered,
 * and the weapon names a property whose note exists. Display only, nothing here touches a number. A named magic weapon with no base link
 * matches only when its own id is mastered.
 */
export function masteryOfRow(c: Character, reg: Registry, e: InventoryEntry, it: ItemData | undefined): { id: string; name: string } | undefined {
  const mastered = c.mastery; if (!mastered?.length) return undefined;
  const own = characterEdition(c);
  if (![e.id, e.base].some(id => id !== undefined && mastered.some(m => sameRef(m, id, own)))) return undefined;
  const pid = it?.weapon?.mastery; if (!pid) return undefined;
  // a brought-in weapon names its property in its own edition's books
  const from = e.id ? splitRef(e.id).edition : undefined;
  const note = from && from !== own ? reg.forEdition(from).get<MasteryData>("mastery", pid) : reg.get<MasteryData>("mastery", pid); if (!note) return undefined;
  return { id: refFor(note, own), name: note.data.name };
}
