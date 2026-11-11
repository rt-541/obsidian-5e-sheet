import { baseChoices, baseFits, combineVariant, recognizeVariant, variantName } from "../../src/content/item-variant";
import { libraryMeta } from "../../src/content/library";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { itemType, type ItemData } from "../../src/content/types/item";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, libraryFixtures } from "../fixtures/library";
import { addVariants, curve, emberEdge, plusOneArmor, reedSpear, slate, thornSword } from "../fixtures/item-variants";
import { mechanicsRegistry } from "../fixtures/mechanics";

describe("recognizeVariant", () => {
  it("reads +N Armor and +N Weapon from the name", () => {
    expect(recognizeVariant("+2 Armor")).toEqual({ base: "armor", bonusAc: 2 });
    expect(recognizeVariant("+1 weapon")).toEqual({ base: "weapon", bonusWeapon: 1 });
    expect(recognizeVariant("+1 Shield")).toBeUndefined();
    expect(recognizeVariant("Ring of Warding")).toBeUndefined();
  });
  it("reads (any ...) from the type line", () => {
    expect(recognizeVariant("Ember Edge", "Weapon (any sword), rare (requires attunement)")).toEqual({ base: "weapon", only: ["sword"] });
    expect(recognizeVariant("Moonthread Armor", "Armor (any medium, heavy), rare")).toEqual({ base: "armor", only: ["medium", "heavy"] });
    expect(recognizeVariant("Dull Armor", "Armor (any type, type, type), rare")).toEqual({ base: "armor" });   // today's importer output
    expect(recognizeVariant("Thorn Sword", "Weapon (longsword), rare")).toBeUndefined();
  });
});

describe("item validation", () => {
  it("keeps an explicit variant and wins over recognition", () => {
    const v = itemType.validate({ name: "+1 Armor", kind: "armor", attunement: false, weight: 0, variant: { base: "armor", only: ["light"], bonusAc: 3 } });
    expect(v.value!.variant).toEqual({ base: "armor", only: ["light"], bonusAc: 3 });
  });
  it("recognises a variant from the name when the note has no armor or weapon numbers", () => {
    expect(itemType.validate({ name: "+3 Weapon", kind: "weapon", attunement: false, weight: 0 }).value!.variant).toEqual({ base: "weapon", bonusWeapon: 3 });
  });
  it("names bad variant fields in plain words", () => {
    expect(itemType.validate({ name: "X", kind: "armor", attunement: false, weight: 0, variant: { base: "boots" } }).errors).toContain("variant.base: must be armor or weapon");
  });
  it("keeps weapon groups", () => {
    expect(itemType.validate({ name: "Thorn Sword", kind: "weapon", attunement: false, weight: 2, weapon: { dmg: "1d6", type: "slashing", ab: "finesse", range: "melee", groups: ["sword"] } }).value!.weapon!.groups).toEqual(["sword"]);
  });
});

describe("library notes", () => {
  it("a library item's type line becomes its variant once the body is read", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    await new VaultLoader(r, fakeVault(libraryFixtures()), "compendium/5e").indexAll();
    const e = r.get<ItemData>("item", "moonthread-armor")!; await r.hydrate(e);
    expect(e.data.variant).toEqual({ base: "armor", only: ["medium", "heavy"] });
  });
  it("frontmatter variant data is used as written", () => {
    expect(libraryMeta("item", { name: "+1 Armor", item_type: "Armor", variant: { base: "armor", bonusAc: 1 } }).raw.variant).toEqual({ base: "armor", bonusAc: 1 });
  });
});

describe("which bases fit", () => {
  const r = mechanicsRegistry(); addVariants(r);
  const entries = r.list<ItemData>("item");
  it("armor words match the armor weight, weapon words match group, name, damage type or reach", () => {
    expect(baseFits({ base: "armor", only: ["heavy"] }, slate)).toBe(true);
    expect(baseFits({ base: "armor", only: ["light"] }, slate)).toBe(false);
    expect(baseFits({ base: "weapon", only: ["sword"] }, thornSword)).toBe(true);
    expect(baseFits({ base: "weapon", only: ["sword"] }, { id: "curve-blade", data: { ...curve.data, weapon: { ...curve.data.weapon!, groups: ["sword"] } } })).toBe(true);
    expect(baseFits({ base: "weapon", only: ["melee+slashing"] }, reedSpear)).toBe(false);
    expect(baseFits({ base: "weapon", only: ["melee+slashing"] }, thornSword)).toBe(true);
    expect(baseFits({ base: "weapon", except: ["reed-spear"] }, reedSpear)).toBe(false);
    expect(baseFits({ base: "weapon" }, slate)).toBe(false);
  });
  it("a word is matched by a base's groups alone when it has them, so bow never offers a crossbow", () => {
    const mk = (id: string, name: string, groups: string[]) => ({ id, data: { ...thornSword.data, name, weapon: { ...thornSword.data.weapon!, groups } } });
    expect(baseFits({ base: "weapon", only: ["bow"] }, mk("longbow", "Longbow", ["bow"]))).toBe(true);
    expect(baseFits({ base: "weapon", only: ["bow"] }, mk("light-crossbow", "Light Crossbow", ["crossbow"]))).toBe(false);
  });
  it("lists only ordinary items with numbers, never another magic item or variant", () => {
    const ids = baseChoices({ base: "armor" }, entries).map(e => e.id);
    expect(ids).toContain("slate-mail"); expect(ids).not.toContain("plus-one-armor"); expect(ids).not.toContain("glow-mail");
  });
  it("names the result", () => {
    expect(variantName("+1 Armor", "Slate Mail")).toBe("+1 Slate Mail");
    expect(variantName("Ember Edge", "Thorn Sword")).toBe("Ember Edge (Thorn Sword)");
  });
  it("combines numbers from both", () => {
    const a = combineVariant(plusOneArmor.data, slate.data);
    expect(a).toMatchObject({ name: "+1 Slate Mail", kind: "armor", armor: { base: 14, dex: "none", stealthDis: true, strReq: 12 }, weight: 40, rarity: "rare" });
    expect(a.effects.modifiers).toContainEqual({ target: "ac", value: 1 });
    expect(a.variant).toBeUndefined();
    const w = combineVariant({ ...emberEdge.data, variant: { base: "weapon", only: ["sword"], bonusWeapon: 1 } }, thornSword.data, 2);
    expect(w.weapon).toMatchObject({ dmg: "1d6", bonus: 2, props: ["finesse", "versatile"] });
    expect(w.attunement).toBe(true);
  });
  it("the bundled list has every SRD base armor and weapon, swords grouped", () => {
    const b = mechanicsRegistry();
    expect(baseChoices({ base: "weapon", only: ["sword"] }, b.list<ItemData>("item")).map(e => e.id)).toEqual(expect.arrayContaining(["greatsword", "longsword", "rapier", "scimitar", "shortsword"]));
    expect(baseChoices({ base: "armor" }, b.list<ItemData>("item"))).toHaveLength(12);
  });
});
