import type { Registry } from "../../src/content/registry";

/** Invented weapons (and the shield from the inventory helpers) for the grip tests. */
export function addWeapons(r: Registry) {
  const base = { type: "bludgeoning", ab: "str", range: "melee", category: "simple" };
  r.add("vault", "item", { id: "ash-cudgel", name: "Ash Cudgel", kind: "weapon", attunement: false, weight: 3, weapon: { ...base, dmg: "1d6", props: ["versatile"] } }, { path: "ash-cudgel.md" });
  r.add("vault", "item", { id: "glass-saber", name: "Glass Saber", kind: "weapon", attunement: false, weight: 3, weapon: { ...base, dmg: "1d8", type: "slashing", bonus: 1, versatile: "1d12", props: ["versatile"] } }, { path: "glass-saber.md" });
  r.add("vault", "item", { id: "reed-pike", name: "Reed Pike", kind: "weapon", attunement: false, weight: 4, weapon: { ...base, dmg: "1d8", type: "piercing", props: ["Versatile (1d10)"] } }, { path: "reed-pike.md" });
  r.add("vault", "item", { id: "oak-buckler", name: "Oak Buckler", kind: "shield", attunement: false, weight: 5, effects: { modifiers: [{ target: "ac", value: 2 }] } }, { path: "oak-buckler.md" });
}
