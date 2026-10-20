import { combineVariant } from "../../src/content/item-variant";
import { itemFacts, itemSummary, itemTypeLine } from "../../src/content/item-view";
import { emberEdge, plusOneArmor, reedVest, slate, thornSword } from "../fixtures/item-variants";

describe("item facts and summary", () => {
  it("armor facts and the one-line summary", () => {
    const d = combineVariant(plusOneArmor.data, slate.data);
    expect(itemFacts(d)).toEqual(expect.arrayContaining([{ label: "Armor Class", value: "15 (14 + 1)" }, { label: "Strength", value: "12" }, { label: "Stealth", value: "disadvantage" }, { label: "Weight", value: "40 lb" }]));
    expect(itemSummary(d.name, d)).toBe("+1 Slate Mail: AC 15 (14 + 1), Str 12, Stealth disadvantage, 40 lb");
    expect(itemSummary("Reed Vest", reedVest.data)).toBe("Reed Vest: AC 12 + Dex, 8 lb");
  });
  it("weapon facts", () => {
    const d = combineVariant({ ...emberEdge.data, variant: { base: "weapon", bonusWeapon: 1 } }, thornSword.data);
    expect(itemSummary(d.name, d)).toBe("Ember Edge (Thorn Sword): 1d6+1 slashing, +1 to hit, finesse, versatile, 2 lb");
    expect(itemFacts(d)).toEqual(expect.arrayContaining([{ label: "Attack", value: "+1 to hit" }, { label: "Properties", value: "finesse, versatile" }]));
  });
  it("charges read in plain words", () => {
    const base = { ...reedVest.data, armor: undefined };
    expect(itemFacts({ ...base, charges: { max: 3, reset: "dawn" } })).toContainEqual({ label: "Charges", value: "3, back at dawn" });
    expect(itemFacts({ ...base, charges: { max: 2, reset: "none" } })).toContainEqual({ label: "Charges", value: "2, do not come back" });
  });
  it("type line", () => {
    expect(itemTypeLine(combineVariant(emberEdge.data, thornSword.data))).toBe("Weapon, rare (requires attunement)");
    expect(itemTypeLine(plusOneArmor.data)).toBe("Armor (any armor), rare");
  });
});
