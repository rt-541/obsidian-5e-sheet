import { findOverlay } from "../../src/content/overlay";

describe("built-in entry names", () => {
  it("Sacred Weapon is found by the bare feature name and by the Channel Divinity name", () => {
    expect(findOverlay("subclass", ["oath-of-devotion"], "Sacred Weapon")?.key).toBe("subclass:devotion:sacred-weapon");
    expect(findOverlay("subclass", ["devotion"], "Channel Divinity: Sacred Weapon")?.key).toBe("subclass:devotion:sacred-weapon");
    expect(findOverlay("subclass", ["devotion"], "Sacred Weapon", "channel-divinity-sacred-weapon")?.key).toBe("subclass:devotion:sacred-weapon");
  });
});
