import { isVersatile, itemType, versatileDie, type ItemData } from "./types/item";
import { CHARGE_RESETS, draftToItemNote, typeLine, type ItemDraft } from "./itemblock";
import type { Registry } from "./registry";

export interface ItemFact { label: string; value: string }

/** Price in copper pieces as "1 gp 5 sp 3 cp" (ten cp to the sp, ten sp to the gp). */
export function priceText(cp: number): string {
  const gp = Math.floor(cp / 100), sp = Math.floor((cp % 100) / 10), c = cp % 10;
  return [gp ? `${gp} gp` : "", sp ? `${sp} sp` : "", c ? `${c} cp` : ""].filter(Boolean).join(" ") || "0 cp";
}

const signed = (n: number) => (n >= 0 ? "+" : "") + n;
/** The armor class bonuses (a "+1 armor") that sit on top of the base number. */
const acBonus = (d: ItemData) => (d.effects.modifiers ?? []).reduce((s, m) => s + (m.target === "ac" && typeof m.value === "number" ? m.value : 0), 0);

function acText(d: ItemData): string | undefined {
  const a = d.armor; if (!a) return undefined;
  const b = acBonus(d), dex = a.dex === "full" ? " + Dex" : a.dex === "max2" ? " + Dex (max 2)" : "";
  return b ? `${a.base + b}${dex} (${a.base} ${b > 0 ? "+" : "-"} ${Math.abs(b)})` : `${a.base}${dex}`;
}
function damageText(d: ItemData, versatile: boolean): string | undefined {
  const w = d.weapon; if (!w) return undefined;
  return `${w.dmg}${w.bonus ? signed(w.bonus) : ""}${w.extraDamage ? ` + ${w.extraDamage}` : ""} ${w.type}${versatile && isVersatile(w) ? ` (two hands: ${versatileDie(w)})` : ""}`;
}
const resetWords = (r: string) => CHARGE_RESETS.find(x => x.id === r)?.label ?? r;
const lb = (n: number) => `${n} lb`;

/** The labelled facts of an item card, in reading order. Only facts the item has. */
export function itemFacts(d: ItemData): ItemFact[] {
  const out: ItemFact[] = [], add = (label: string, value: string | undefined) => { if (value) out.push({ label, value }); };
  add("Armor Class", acText(d));
  add("Strength", d.armor?.strReq !== undefined ? String(d.armor.strReq) : undefined);
  add("Stealth", d.armor?.stealthDis ? "disadvantage" : undefined);
  add("Damage", damageText(d, true));
  add("Attack", d.weapon?.bonus ? `${signed(d.weapon.bonus)} to hit` : undefined);
  add("Properties", d.weapon?.props?.length ? d.weapon.props.join(", ") : undefined);
  add("Charges", d.charges ? `${d.charges.max}, ${d.charges.reset === "none" ? "do not come back" : `back ${resetWords(d.charges.reset)}`}` : undefined);
  add("Weight", d.weight ? lb(d.weight) : undefined);
  add("Value", d.value !== undefined ? priceText(d.value) : undefined);
  return out;
}

/** One short line: "+1 Slate Mail: AC 15 (14 + 1), Str 12, Stealth disadvantage, 40 lb". */
export function itemSummary(name: string, d: ItemData): string {
  const bits: string[] = [], ac = acText(d);
  if (ac) bits.push(`AC ${ac}`);
  if (d.armor?.strReq !== undefined) bits.push(`Str ${d.armor.strReq}`);
  if (d.armor?.stealthDis) bits.push("Stealth disadvantage");
  const dmg = damageText(d, false); if (dmg) bits.push(dmg);
  if (d.weapon?.bonus) bits.push(`${signed(d.weapon.bonus)} to hit`);
  bits.push(...(d.weapon?.props ?? []));
  if (d.weight) bits.push(lb(d.weight));
  return bits.length ? `${name}: ${bits.join(", ")}` : name;
}

/** "Weapon, rare (requires attunement)"; a generic item that has no base yet reads "Armor (any armor), rare". */
export function itemTypeLine(d: ItemData): string {
  const v = d.variant;
  const base = v ? (v.only?.length ? `any ${v.only.join(" or ")}` : `any ${v.base}`) : undefined;
  return typeLine({ name: d.name, kind: d.kind, attunement: d.attunement, rarity: d.rarity, base, description: "" });
}

/** The item a custom-item form would make, for the live card; undefined while the draft has no name or does not read as an item. */
export function draftPreview(d: ItemDraft, reg: Registry): { name: string; data: ItemData } | undefined {
  if (!d.name.trim()) return undefined;
  try {
    const { fm } = draftToItemNote(d, k => (reg.get("item", k)?.data as ItemData | undefined));
    const { value, errors } = itemType.validate(fm);
    return value && !errors.length ? { name: value.name, data: value } : undefined;
  } catch { return undefined; }
}
