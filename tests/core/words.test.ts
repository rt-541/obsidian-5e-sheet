import { optionListLabel, plural, resourceCount, titleCase } from "../../src/core/words";
it("resourceCount keeps free-form names as written", () => {
  expect(resourceCount(1, "Ki Points")).toBe("1 Ki Point");
  expect(resourceCount(3, "Ki Points")).toBe("3 Ki Points");
  expect(resourceCount(2, "Superiority Dice")).toBe("2 Superiority Dice");
  expect(resourceCount(1, "Superiority Dice")).toBe("1 Superiority Die");
  expect(resourceCount(1, "Lay on Hands")).toBe("1 Lay on Hands");
  expect(resourceCount(2, "Channel Divinity")).toBe("2 Channel Divinity");
  expect(resourceCount(2, "Bardic Inspiration")).toBe("2 Bardic Inspiration");
  expect(resourceCount(1, "Bonus")).toBe("1 Bonus");
});
it("title case leaves apostrophes and small words alone", () => {
  expect(titleCase("sleight-of-hand")).toBe("Sleight of Hand");
  expect(titleCase("smith's tools")).toBe("Smith's Tools");
  expect(titleCase("the lay of the land")).toBe("The Lay of the Land");
  expect(titleCase("crossbow-bolt")).toBe("Crossbow Bolt");
});
it("plural counts in plain words", () => {
  expect(plural(1, "cantrips")).toBe("1 cantrip"); expect(plural(2, "cantrip")).toBe("2 cantrips");
  expect(plural(1, "Ki Points")).toBe("1 Ki Point"); expect(plural(3, "Ki Points")).toBe("3 Ki Points");
  expect(plural(1, "class")).toBe("1 class"); expect(plural(1, "tools")).toBe("1 tool");
});
it("option lists get a display name", () => {
  expect(optionListLabel("fighter:fighter-fighting-style", 1)).toBe("Choose a fighting style");
  expect(optionListLabel("fighter-fighting-style", 1, "fighter")).toBe("Choose a fighting style");
  expect(optionListLabel("stances", 2)).toBe("Choose 2 stances");
  expect(optionListLabel("metamagic-1", 1)).toBe("Choose a metamagic");
  expect(optionListLabel("eldritch-invocations", 1)).toBe("Choose an eldritch invocation");
});
