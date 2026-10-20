import type { Character } from "./character";
import { apply } from "./actions";
import { deriveCharacter } from "./derive";
import type { EffectContext } from "./effects";
import { entryName } from "./item-entry";

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** What adding this item and putting it on would change, in words. Never changes `c`. */
export function previewAdd(c: Character, ctx: EffectContext, add: { id: string; base?: string; attune?: boolean }): string {
  const before = deriveCharacter(c, ctx);
  const out = apply(c, { type: "addItem", id: add.id, ...(add.base ? { base: add.base } : {}), equip: true, ...(add.attune ? { attune: true } : {}) },
    { self: before, companions: [], chargesMax: () => 0, ctx });
  if (out.error) return out.error;
  const after = deriveCharacter(out.value, ctx), parts: string[] = [];
  if (after.ac.value !== before.ac.value) parts.push(`AC ${before.ac.value} -> ${after.ac.value}`);
  c.inventory.forEach((x, i) => { if (x.equipped && !out.value.inventory[i]?.equipped) parts.push(`${entryName(x, ctx.registry)} put away`); });
  const had = new Set(before.attacks.map(x => x.name));
  for (const at of after.attacks) if (!had.has(at.name)) parts.push(`Adds ${at.name} to Attacks: ${[at.toHit !== undefined ? signed(at.toHit) : "", at.damage?.match(/^\S+/)?.[0] ?? ""].filter(Boolean).join(", ")}`);
  return parts.join(", ") || "No change to your numbers";
}
