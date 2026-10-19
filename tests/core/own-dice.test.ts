import { ownDiceOn, d20Words, damageWords, saveWords, spaced, OWN_DICE } from "../../src/core/own-dice";

describe("own-dice words", () => {
  it("layers: the last one that sets it wins", () => {
    expect(OWN_DICE).toBe("own-dice");
    expect(ownDiceOn([{ "own-dice": true }, undefined, { "own-dice": false }])).toBe(false);
    expect(ownDiceOn([{}, { "own-dice": true }, {}])).toBe(true); expect(ownDiceOn([])).toBe(false);
  });
  it("spaces an expression", () => { expect(spaced("1d8+3 slashing + 1d6 fire")).toBe("1d8 + 3 slashing + 1d6 fire"); });
  it("d20 words", () => {
    expect(d20Words({ mod: 5, mode: "normal" })).toBe("Roll 1d20 + 5");
    expect(d20Words({ mod: -1, mode: "normal" })).toBe("Roll 1d20 - 1");
    expect(d20Words({ mod: 0, mode: "normal" })).toBe("Roll 1d20");
    expect(d20Words({ mod: 5, mode: "adv" })).toBe("Roll 2d20, keep the higher, + 5");
    expect(d20Words({ mod: 5, mode: "dis" })).toBe("Roll 2d20, keep the lower, + 5");
    expect(d20Words({ mod: 5, mode: "cancel" })).toBe("Roll 1d20 + 5 (advantage and disadvantage cancel)");
    expect(d20Words({ mod: 5, mode: "normal", extras: [{ dice: "1d4", name: "Test Focus", spent: "1 Focus Dice spent, 2 of 3 left" }] }))
      .toBe("Roll 1d20 + 5, plus 1d4 for Test Focus (1 Focus Dice spent, 2 of 3 left)");
    expect(d20Words({ mod: 2, mode: "normal", fail: ["Test Hold"] })).toBe("Automatic failure (Test Hold): nothing to roll.");
    expect(d20Words({ mod: 2, mode: "normal", reroll: 1, min: 10, critRange: 19 }))
      .toBe("Roll 1d20 + 2. If the d20 shows 1 or lower, roll it again once and keep the new roll. A d20 below 10 counts as 10. You crit on 19-20.");
  });
  it("damage and save words", () => {
    expect(damageWords({ expr: "1d10+3 slashing", weaponNote: "two hands", extras: [{ dice: "2d4", name: "Test Analysis", spent: "1 Insight Dice spent, 1 of 2 left" }] }))
      .toBe("Roll 1d10 + 3 slashing (two hands) + 2d4 for Test Analysis (1 Insight Dice spent, 1 of 2 left)");
    expect(damageWords({ expr: "1d8+3 slashing + 1d6 fire", reroll: "Test Savage" }))
      .toBe("Roll 1d8 + 3 slashing twice and keep the higher total (Test Savage), then add 1d6 fire");
    expect(saveWords("dex", 14)).toBe("They roll a DEX save against DC 14");
  });
});
