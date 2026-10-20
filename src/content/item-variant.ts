import type { ItemVariant } from "./types/item";

const NAME = /^\+([1-3])\s+(armou?r|weapon)$/i;
const LINE = /^\*?\s*(armou?r|weapon)\s*\(any ([^)]*)\)/i;
/** Words that mean "any" rather than naming a kind of armor or weapon. */
const ANY = new Set(["armor", "armour", "weapon", "type"]);

/** Recognise a generic magic item from its name ("+2 Armor") and its type line ("Weapon (any sword), rare"). */
export function recognizeVariant(name: string, typeLine?: string): ItemVariant | undefined {
  let out: ItemVariant | undefined;
  const n = NAME.exec(name.trim());
  if (n) out = n[2].toLowerCase() === "weapon" ? { base: "weapon", bonusWeapon: Number(n[1]) } : { base: "armor", bonusAc: Number(n[1]) };
  const t = typeLine ? LINE.exec(typeLine.trim()) : null;
  if (t) {
    const base = t[1].toLowerCase() === "weapon" ? "weapon" : "armor";
    const only = t[2].split(/,|\bor\b/i).map(w => w.trim().toLowerCase()).filter(w => w && !ANY.has(w));
    out = { ...out, base, ...(only.length ? { only } : {}) };
  }
  return out;
}
