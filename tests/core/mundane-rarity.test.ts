import { attack, gear, pc, put, srdRegistry, stats } from "../fixtures/overlay";

describe("weapon rarity", () => {
  it("a weapon marked mundane (as library notes write it) is not a magic weapon; a rare one is", () => {
    const r = srdRegistry();
    const blade = (name: string, rarity: string) => put(r, "item", { name, kind: "weapon", rarity, weapon: { dmg: "1d6", type: "slashing", ab: "str", range: "melee" } });
    blade("Plain Test Blade", "mundane"); blade("Odd Test Blade", "none"); blade("Glowing Test Blade", "rare");
    const s = stats(pc("fighter", 1, {}, { inventory: gear("plain-test-blade", "odd-test-blade", "glowing-test-blade") }), r);
    expect(attack(s, "Plain Test Blade").target.tags).not.toContain("magic");
    expect(attack(s, "Odd Test Blade").target.tags).not.toContain("magic");
    expect(attack(s, "Glowing Test Blade").target.tags).toContain("magic");
  });
});
