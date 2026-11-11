import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { itemType } from "../../src/content/types/item";
import type { ItemData } from "../../src/content/types";
import { ITEM_TEMPLATE, draftToItemNote, parseItemBlock, validateItemDraft, typeLine } from "../../src/content/itemblock";

// every item below is invented for these tests
const LANTERN = `**Lantern of the Hollow Oak**
*Wondrous item, rare (requires attunement by a druid)*

Weight: 2 lb.
Cost: 1,500 gp

The lantern glows with a pale green light while it is lit.

The lantern has 4 charges. It regains 1d4 expended charges daily at dawn.`;

const world = () => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };
const find = (r: Registry) => (id: string) => r.get<ItemData>("item", id)?.data;

describe("parseItemBlock", () => {
  it("reads name, type line, attunement, rarity, weight, cost, charges and the description", () => {
    const { draft: d, unread } = parseItemBlock(LANTERN);
    expect(d).toMatchObject({ name: "Lantern of the Hollow Oak", kind: "wondrous", rarity: "rare", attunement: true, attunementNote: "by a druid", weight: 2, value: 150000, charges: { max: 4, reset: "dawn" } });
    expect(d.description).toBe("The lantern glows with a pale green light while it is lit.\n\nThe lantern has 4 charges. It regains 1d4 expended charges daily at dawn.");
    expect(unread).toEqual([]);
  });
  it("reads a weapon with its base and a bonus to attack and damage", () => {
    const { draft: d } = parseItemBlock("Thornwood Staff\nWeapon (quarterstaff), uncommon\nYou have a +2 bonus to attack and damage rolls made with this magic weapon.");
    expect(d).toMatchObject({ kind: "weapon", base: "quarterstaff", rarity: "uncommon", attunement: false, attackBonus: 2, damageBonus: 2 });
  });
  it("reads a bonus to attack only, or to damage only", () => {
    expect(parseItemBlock("Pin\nWeapon (dagger), rare\nA +1 bonus to damage rolls.").draft).toMatchObject({ damageBonus: 1 });
    expect(parseItemBlock("Pin\nWeapon (dagger), rare\nA +1 bonus to damage rolls.").draft.attackBonus).toBeUndefined();
    expect(parseItemBlock("Pin\nWeapon (dagger), rare\nA +3 bonus to attack rolls.").draft.damageBonus).toBeUndefined();
  });
  it("reads armor and a bonus to AC", () => {
    const { draft: d } = parseItemBlock("Reedscale Hauberk\nArmor (hide), rare\nYou have a +1 bonus to AC while you wear this armor.");
    expect(d).toMatchObject({ kind: "armor", base: "hide", rarity: "rare", acBonus: 1 });
  });
  it("reads a shield from Armor (shield)", () => {
    expect(parseItemBlock("Wren Shield\nArmor (shield), uncommon").draft).toMatchObject({ kind: "shield" });
  });
  it("reads healing from a potion", () => {
    const { draft: d } = parseItemBlock("Dewdrop Draught\nPotion, common\nYou regain 3d4 + 1 hit points when you drink this potion.");
    expect(d).toMatchObject({ kind: "consumable", rarity: "common", heal: "3d4+1" });
  });
  it("a name like Ring of Foxes is a name, not a type line", () => {
    const { draft: d } = parseItemBlock("Ring of Foxes\nRing, rare (requires attunement)\nIt makes you sly.");
    expect(d).toMatchObject({ name: "Ring of Foxes", kind: "wondrous", attunement: true, rarity: "rare" });
    expect(parseItemBlock("Ring of Foxes\nIt makes you sly.").draft).toMatchObject({ name: "Ring of Foxes", kind: "gear", description: "It makes you sly." });
  });
  it("charges that never come back reset never; short and long rests are read", () => {
    expect(parseItemBlock("Wick\nWondrous item, uncommon\nIt has 2 charges.").draft.charges).toEqual({ max: 2, reset: "none" });
    expect(parseItemBlock("Wick\nWondrous item, uncommon\nIt has 2 charges and regains all expended charges after a short rest.").draft.charges).toEqual({ max: 2, reset: "short" });
    expect(parseItemBlock("Wick\nWondrous item, uncommon\nIt has 5 charges and regains 1d4 charges after a long rest.").draft.charges).toEqual({ max: 5, reset: "long" });
  });
  it("copes with markdown, bullets, extra blank lines, a unicode minus and the same text in a fenced block", () => {
    const messy = ["```5e-item", "", "***Marsh Lamp***", "", "", "- _Wondrous item_, **uncommon**", "", "• Weight: 3 lb.", "", "The lamp  glows — a bit.", "", "* It has 2 charges.", "```"].join("\n");
    const a = parseItemBlock(messy).draft;
    expect(a).toMatchObject({ name: "Marsh Lamp", kind: "wondrous", rarity: "uncommon", weight: 3, charges: { max: 2, reset: "none" } });
    expect(a.description).toBe("The lamp glows - a bit.\n\nIt has 2 charges.");
    expect(parseItemBlock(messy.replace(/```5e-item\n/, "").replace(/\n```$/, "")).draft).toEqual(a);
  });
  it("lists lines it could not understand", () => {
    const r = parseItemBlock("Odd Bell\nSomething stray here\nWondrous item, rare\nDamage: 1d8 slashing\nA bell that rings.");
    expect(r.unread).toEqual(["Something stray here", "Damage: 1d8 slashing"]);
    expect(r.draft.description).toBe("A bell that rings.");
  });
  it("never throws on odd input", () => {
    for (const t of ["", "   \n\n", "```5e-item\n```", "12345", "Name only"]) expect(() => parseItemBlock(t)).not.toThrow();
    expect(parseItemBlock("Name only").draft.name).toBe("Name only");
  });
  it("the template reads cleanly into a valid item", () => {
    const r = parseItemBlock(ITEM_TEMPLATE);
    expect(r.unread).toEqual([]);
    expect(r.draft).toMatchObject({ name: "Item Name", kind: "wondrous", rarity: "rare", attunement: true, weight: 1, value: 50000, charges: { max: 3, reset: "dawn" } });
    expect(validateItemDraft(r.draft)).toEqual([]);
  });
});

describe("validateItemDraft", () => {
  const ok = parseItemBlock(LANTERN).draft;
  it("asks for a name and sensible numbers in plain words", () => {
    expect(validateItemDraft({ ...ok, name: " " })).toEqual(["Give the item a name."]);
    expect(validateItemDraft({ ...ok, weight: -1 })).toEqual(["Weight is in pounds: use a number like 2 or 0.5, or leave it empty."]);
    expect(validateItemDraft({ ...ok, charges: { max: 0, reset: "dawn" } })).toEqual(["Charges must be a whole number, 1 or more (or leave it empty)."]);
    expect(validateItemDraft({ ...ok, heal: "lots" })).toEqual(["Healing should be dice, like 2d4+2."]);
    expect(validateItemDraft({ ...ok, acBonus: 1.5 })).toEqual(["The Armor Class bonus must be a whole number, like 1."]);
  });
});

describe("draftToItemNote", () => {
  it("writes native frontmatter the item type accepts, with a readable body", () => {
    const { id, fm, body } = draftToItemNote(parseItemBlock(LANTERN).draft);
    expect(id).toBe("lantern-of-the-hollow-oak");
    expect(fm).toMatchObject({ type: "5e-item", source: "Homebrew", kind: "wondrous", rarity: "rare", attunement: true, weight: 2, value: 150000, charges: { max: 4, reset: "dawn" } });
    expect(itemType.validate(fm).errors).toEqual([]);
    expect(body).toContain("# Lantern of the Hollow Oak"); expect(body).toContain("*Wondrous item, rare (requires attunement by a druid)*");
    expect(body).toContain("The lantern glows");
  });
  it("a weapon with a base copies the ordinary weapon's dice and adds the bonus", () => {
    const { fm } = draftToItemNote(parseItemBlock("Thornwood Staff\nWeapon (quarterstaff), uncommon\nYou have a +2 bonus to attack and damage rolls.").draft, find(world()));
    expect(fm.kind).toBe("weapon");
    expect(fm.weapon).toMatchObject({ dmg: "1d6", range: "melee", bonus: 2 });
    expect(itemType.validate(fm).errors).toEqual([]);
  });
  it("unequal attack and damage bonuses become modifiers", () => {
    const { fm } = draftToItemNote(parseItemBlock("Pin\nWeapon (dagger), rare\nA +1 bonus to damage rolls.").draft, find(world()));
    expect(fm.weapon).not.toHaveProperty("bonus");
    expect(fm.effects).toEqual({ modifiers: [{ target: "damage", value: 1 }] });
  });
  it("armor with a base copies the armor class and adds the AC bonus as a modifier", () => {
    const { fm } = draftToItemNote(parseItemBlock("Reedscale Hauberk\nArmor (hide), rare\nYou have a +1 bonus to AC while you wear this armor.").draft, find(world()));
    expect(fm.kind).toBe("armor"); expect(fm.armor).toMatchObject({ base: 12, dex: "max2" });
    expect(fm.effects).toEqual({ modifiers: [{ target: "ac", value: 1 }] });
    expect(itemType.validate(fm).errors).toEqual([]);
  });
  it("a weapon or armor whose base is unknown becomes a magic item that keeps its bonuses", () => {
    const { fm } = draftToItemNote(parseItemBlock("Odd Blade\nWeapon (moon sickle), rare\nA +1 bonus to attack and damage rolls.").draft, find(world()));
    expect(fm.kind).toBe("wondrous");
    expect(fm.effects).toEqual({ modifiers: [{ target: "attack", value: 1 }, { target: "damage", value: 1 }] });
    expect(fm.rules).toContain("Based on: moon sickle");
    expect(itemType.validate(fm).errors).toEqual([]);
  });
  it("a shield gives +2 AC plus its bonus; a potion keeps its healing", () => {
    expect(draftToItemNote(parseItemBlock("Wren Shield\nArmor (shield), uncommon\nYou have a +1 bonus to AC.").draft).fm.effects).toEqual({ modifiers: [{ target: "ac", value: 3 }] });
    const { fm } = draftToItemNote(parseItemBlock("Dewdrop Draught\nPotion, common\nYou regain 3d4 hit points.").draft);
    expect(fm).toMatchObject({ kind: "consumable", heal: "3d4" }); expect(itemType.validate(fm).errors).toEqual([]);
  });
  it("typeLine reads back like the pasted layout", () => {
    expect(typeLine(parseItemBlock(LANTERN).draft)).toBe("Wondrous item, rare (requires attunement by a druid)");
    expect(typeLine(parseItemBlock("Pin\nWeapon (dagger), rare").draft)).toBe("Weapon (dagger), rare");
  });
});
