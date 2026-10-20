import { recognizeVariant } from "../../src/content/item-variant";
import { libraryMeta } from "../../src/content/library";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { itemType, type ItemData } from "../../src/content/types/item";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, libraryFixtures } from "../fixtures/library";

describe("recognizeVariant", () => {
  it("reads +N Armor and +N Weapon from the name", () => {
    expect(recognizeVariant("+2 Armor")).toEqual({ base: "armor", bonusAc: 2 });
    expect(recognizeVariant("+1 weapon")).toEqual({ base: "weapon", bonusWeapon: 1 });
    expect(recognizeVariant("+1 Shield")).toBeUndefined();
    expect(recognizeVariant("Ring of Warding")).toBeUndefined();
  });
  it("reads (any ...) from the type line", () => {
    expect(recognizeVariant("Ember Edge", "Weapon (any sword), rare (requires attunement)")).toEqual({ base: "weapon", only: ["sword"] });
    expect(recognizeVariant("Gleam Armor", "Armor (any medium, heavy), uncommon")).toEqual({ base: "armor", only: ["medium", "heavy"] });
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
    const e = r.get<ItemData>("item", "gleam-armor")!; await r.hydrate(e);
    expect(e.data.variant).toEqual({ base: "armor", only: ["medium", "heavy"] });
  });
  it("frontmatter variant data is used as written", () => {
    expect(libraryMeta("item", { name: "+1 Armor", item_type: "Armor", variant: { base: "armor", bonusAc: 1 } }).raw.variant).toEqual({ base: "armor", bonusAc: 1 });
  });
});
