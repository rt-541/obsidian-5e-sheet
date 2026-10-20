import type { Entry } from "./registry";
import type { ItemData, ItemVariant } from "./types/item";

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

const DEX_OF = { light: "full", medium: "max2", heavy: "none" } as const;

/** Does one word describe this base? Armor weights, melee/ranged, a damage type, the base's id, a group, or part of its name. */
function wordHolds(w: string, base: { id: string; data: ItemData }): boolean {
  const { armor, weapon } = base.data;
  if (w in DEX_OF) return armor?.dex === DEX_OF[w as keyof typeof DEX_OF];
  if (weapon && (w === weapon.range || w === weapon.type.toLowerCase())) return true;
  return w === base.id || !!weapon?.groups?.includes(w) || base.data.name.toLowerCase().includes(w);
}
const wordsHold = (spec: string, base: { id: string; data: ItemData }) => spec.split("+").every(w => wordHolds(w.trim().toLowerCase(), base));

/** Can this generic item be made from this armor or weapon? */
export function baseFits(v: ItemVariant, base: { id: string; data: ItemData }): boolean {
  if (!(v.base === "armor" ? base.data.armor : base.data.weapon)) return false;
  if (v.except?.some(w => wordsHold(w, base))) return false;
  return !v.only?.length || v.only.some(w => wordsHold(w, base));
}

/** The ordinary armor or weapons a generic item can be made from: no other magic item, no other generic item. Sorted by name. */
export function baseChoices(v: ItemVariant, items: Entry<ItemData>[]): Entry<ItemData>[] {
  return items.filter(e => baseFits(v, e) && !e.data.variant && !e.data.weapon?.bonus && (!e.data.rarity || /^(mundane|none|common)$/i.test(e.data.rarity)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "+1 Armor" on Slate Mail is "+1 Slate Mail"; a name without armor or weapon in it reads "Ember Edge (Thorn Sword)". */
export function variantName(variant: string, base: string): string {
  return /\b(armou?r|weapon)\b/i.test(variant) ? variant.replace(/\b(armou?r|weapon)\b/i, () => base) : `${variant} (${base})`;
}

/** The finished item: numbers (kind, armor, weapon, weight) from the base, everything magical from the generic item. `bonus` replaces the generic item's own bonus. */
export function combineVariant(variant: ItemData, base: ItemData, bonus?: number): ItemData {
  const v = variant.variant;
  const out: ItemData = { name: variantName(variant.name, base.name), kind: base.kind, attunement: variant.attunement, weight: base.weight, effects: variant.effects };
  const keep = <K extends keyof ItemData>(k: K, val: ItemData[K] | undefined) => { if (val !== undefined) out[k] = val as ItemData[K]; };
  keep("rarity", variant.rarity); keep("value", variant.value ?? base.value); keep("armor", base.armor);
  for (const k of ["charges", "heal", "grants", "toggle", "rules", "attackOption", "builtIn", "overlay"] as const) keep(k, variant[k] as never);
  if (base.weapon) {
    const total = (base.weapon.bonus ?? 0) + (bonus ?? v?.bonusWeapon ?? 0);
    out.weapon = { ...base.weapon, ...(total ? { bonus: total } : {}) };
  }
  const ac = bonus ?? v?.bonusAc;
  if (v?.base === "armor" && ac) out.effects = { ...variant.effects, modifiers: [...(variant.effects.modifiers ?? []), { target: "ac", value: ac }] };
  return out;
}
