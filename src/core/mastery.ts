import type { Registry } from "../content/registry";
import type { ItemData, MasteryData } from "../content/types";
import type { Character, InventoryEntry } from "./character";

/**
 * The mastery property to show on an attack row: the row's weapon (or the base a generic variant is made from) is one the character has mastered,
 * and the weapon names a property whose note exists. Display only, nothing here touches a number. A named magic weapon with no base link
 * matches only when its own id is mastered.
 */
export function masteryOfRow(c: Character, reg: Registry, e: InventoryEntry, it: ItemData | undefined): { id: string; name: string } | undefined {
  const mastered = c.mastery; if (!mastered?.length) return undefined;
  if (![e.id, e.base].some(id => id !== undefined && mastered.includes(id))) return undefined;
  const pid = it?.weapon?.mastery; if (!pid) return undefined;
  const note = reg.get<MasteryData>("mastery", pid); if (!note) return undefined;
  return { id: pid, name: note.data.name };
}
