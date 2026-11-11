import type { Entry, Registry } from "../../src/content/registry";
import { itemType, type ItemData } from "../../src/content/types/item";

/** Invented bases and generic magic items for the "which armor or weapon" tests. None mirrors a published item. */
const RAW: Record<string, unknown>[] = [
  { id: "slate-mail", name: "Slate Mail", kind: "armor", attunement: false, weight: 40, armor: { base: 14, dex: "none", stealthDis: true, strReq: 12 } },
  { id: "reed-vest", name: "Reed Vest", kind: "armor", attunement: false, weight: 8, armor: { base: 12, dex: "full" } },
  { id: "thorn-sword", name: "Thorn Sword", kind: "weapon", attunement: false, weight: 2, weapon: { dmg: "1d6", type: "slashing", ab: "finesse", range: "melee", props: ["finesse", "versatile"] } },
  { id: "reed-spear", name: "Reed Spear", kind: "weapon", attunement: false, weight: 3, weapon: { dmg: "1d6", type: "piercing", ab: "str", range: "melee" } },
  { id: "curve-blade", name: "Curve Blade", kind: "weapon", attunement: false, weight: 3, weapon: { dmg: "1d6", type: "slashing", ab: "finesse", range: "melee" } },
  { id: "plus-one-armor", name: "+1 Armor", kind: "armor", attunement: false, weight: 0, rarity: "rare", variant: { base: "armor", bonusAc: 1 } },
  { id: "ember-edge", name: "Ember Edge", kind: "weapon", attunement: true, weight: 0, rarity: "rare", variant: { base: "weapon", only: ["sword"] } },
  { id: "glow-mail", name: "Glow Mail", kind: "armor", attunement: false, weight: 20, rarity: "rare", armor: { base: 13, dex: "max2" } },
];

const entry = (raw: Record<string, unknown>): Entry<ItemData> => {
  const { value, errors } = itemType.validate(raw);
  if (!value) throw new Error(errors.join("; "));
  return { type: "item", id: String(raw.id), name: value.name, source: "vault", sourceName: "Homebrew", data: value };
};

export const addVariants = (r: Registry) => { for (const raw of RAW) r.add("vault", "item", raw, { path: `${String(raw.id)}.md` }); };

const by = (id: string) => entry(RAW.find(x => x.id === id)!);
export const slate = by("slate-mail"), reedVest = by("reed-vest"), thornSword = by("thorn-sword"), reedSpear = by("reed-spear");
export const curve = by("curve-blade"), plusOneArmor = by("plus-one-armor"), emberEdge = by("ember-edge");
