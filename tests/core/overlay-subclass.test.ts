import { feat, gear, pc, pcSub, put, srdRegistry, stats, subclass, switchOn, attack } from "../fixtures/overlay";

const R = srdRegistry();
const sword = { inventory: gear("longsword") };

describe("built-in mechanics: subclass and class features", () => {
  it("13. Improved Critical / Superior Critical: crits on 19, then 18 (the SRD Champion already says so: its own numbers win)", () => {
    const r = srdRegistry();
    put(r, "subclass", { name: "Champion", class: "fighter", levels: { 3: [feat("Improved Critical")], 15: [feat("Superior Critical")] } });
    expect(stats(pcSub("fighter", 3, "champion"), r).crit).toEqual({ range: 19 });
    expect(stats(pcSub("fighter", 15, "champion"), r).crit).toEqual({ range: 18 });
    expect(stats(pcSub("fighter", 2, "champion"), r).crit).toBeUndefined();
    const srd = stats(pcSub("fighter", 15, "champion"), R);
    expect(srd.crit).toEqual({ range: 18 });
    expect(srd.progress.overlay.skipped).toEqual(["subclass:champion:improved-critical", "subclass:champion:superior-critical"]);
  });

  it("14. Divine Strike / Blessed Strikes: 1d8 (2d8 from 14) once per turn, in the domain's damage type", () => {
    const life = pcSub("cleric", 8, "life", { str: 16 }, { inventory: gear("greataxe") });
    expect(attack(stats(life, R), "Greataxe").damage).toBe("1d12+3 slashing + 1d8 radiant");
    expect(attack(stats(life, R), "Greataxe").note).toMatch(/once per turn/);
    expect(attack(stats(pcSub("cleric", 14, "life", { str: 16 }, { inventory: gear("greataxe") }), R), "Greataxe").damage).toBe("1d12+3 slashing + 2d8 radiant");
    expect(attack(stats(pcSub("cleric", 7, "life", { str: 16 }, { inventory: gear("greataxe") }), R), "Greataxe").damage).toBe("1d12+3 slashing");
    const r = srdRegistry();
    subclass(r, "War Domain", "cleric", 8, ["Divine Strike"]);
    subclass(r, "Nature Domain", "cleric", 8, ["Divine Strike"]);
    subclass(r, "Trickery Domain", "cleric", 8, ["Divine Strike"]);
    expect(attack(stats(pcSub("cleric", 8, "war-domain", { str: 16 }, sword), r), "Longsword").damage).toBe("1d8+3 slashing + 1d8 slashing");
    expect(attack(stats(pcSub("cleric", 8, "nature-domain", { str: 16 }, sword), r), "Longsword").damage).toBe("1d8+3 slashing + 1d8 elemental");
    expect(attack(stats(pcSub("cleric", 8, "trickery-domain", { str: 16 }, sword), r), "Longsword").damage).toBe("1d8+3 slashing + 1d8 domain");
    expect(attack(stats(pcSub("cleric", 8, "nature-domain", { str: 16 }, sword), r), "Longsword").note).toMatch(/choose cold, fire or lightning/);
    put(r, "class", { name: "Cleric", hitDie: 8, levels: { 8: [feat("Blessed Strikes")] } });
    expect(attack(stats(pc("cleric", 8, { str: 16 }, sword), r), "Longsword").damage).toBe("1d8+3 slashing + 1d8 radiant");
  });

  it("15. Aura of Protection: Charisma modifier (at least +1) on every saving throw", () => {
    const s = stats(pc("paladin", 6, { dex: 14, cha: 16 }), R);
    expect(s.saves.dex.mod).toBe(2 + 3);
    expect(s.saves.int.mod).toBe(0 + 3);
    expect(s.progress.scales["aura-range"]).toBe(10);
    expect(stats(pc("paladin", 5, { dex: 14, cha: 16 }), R).saves.dex.mod).toBe(2);
    expect(stats(pc("paladin", 6, { cha: 8 }), R).saves.int.mod).toBe(1);
    expect(stats(pc("paladin", 18, { cha: 16 }), R).progress.scales["aura-range"]).toBe(30);
  });

  it("16. Divine Smite: a Use button with the damage of a first-level slot and the rest in words", () => {
    const f = stats(pc("paladin", 2, { str: 16 }), R).progress.features.find(x => x.name === "Divine Smite")!;
    expect(f.action).toMatchObject({ name: "Divine Smite", damage: "2d8 radiant" });
    expect(f.action!.text).toMatch(/spell slot/);
    expect(f.overlay).toBe("class:paladin:divine-smite@2014");
  });

  it("17. Improved Divine Smite: +1d8 radiant on every melee weapon hit from level 11", () => {
    const gearUp = { inventory: gear("longsword", "longbow") };
    const s = stats(pc("paladin", 11, { str: 16, dex: 12 }, gearUp), R);
    expect(attack(s, "Longsword").damage).toBe("1d8+3 slashing + 1d8 radiant");
    expect(attack(s, "Longbow").damage).toBe("1d8+1 piercing");
    expect(attack(stats(pc("paladin", 10, { str: 16 }, sword), R), "Longsword").damage).toBe("1d8+3 slashing");
  });

  it("18. Sacred Weapon: Start spends Channel Divinity and adds Charisma to weapon attack rolls", () => {
    const c = pcSub("paladin", 3, "devotion", { str: 16, cha: 16 }, sword);
    const off = stats(c, R);
    expect(attack(off, "Longsword").toHit).toBe(3 + 2);
    expect(off.toggles.find(t => t.id === "sacred-weapon")).toMatchObject({ name: "Sacred Weapon", on: false });
    const on = stats(switchOn(c, R, "sacred-weapon"), R);
    expect(attack(on, "Longsword").toHit).toBe(3 + 2 + 3);
    expect(on.resources.find(r => r.id === "channel-divinity")).toMatchObject({ used: 1, max: 1 });
  });

  it("19. Oathbreaker: Aura of Hate adds Charisma to melee damage, Supernatural Resistance resists nonmagical weapons", () => {
    const r = srdRegistry();
    subclass(r, "Oathbreaker", "paladin", 7, ["Aura of Hate", "Supernatural Resistance"]);
    const s = stats(pcSub("paladin", 7, "oathbreaker", { str: 16, cha: 16 }, sword), r);
    expect(attack(s, "Longsword").damage).toBe("1d8+6 slashing");
    expect(s.traits.resist).toEqual(["nonmagical bludgeoning", "nonmagical piercing", "nonmagical slashing"]);
  });

  it("20. Gloom Stalker Dread Ambusher: Wisdom added to initiative and an extra 1d8 on a weapon hit", () => {
    const r = srdRegistry();
    subclass(r, "Gloom Stalker", "ranger", 3, ["Dread Ambusher"]);
    const s = stats(pcSub("ranger", 3, "gloom-stalker", { str: 16, dex: 14, wis: 16 }, sword), r);
    expect(s.initiative).toBe(2 + 3);
    expect(attack(s, "Longsword").damage).toBe("1d8+3 slashing + 1d8 slashing");
    expect(attack(s, "Longsword").note).toMatch(/on the first turn of a fight/);
  });

  it("21. Planar Warrior, Slayer's Prey, Dreadful Strikes, Gathered Swarm and Colossus Slayer: extra damage once per turn", () => {
    const r = srdRegistry();
    subclass(r, "Horizon Walker", "ranger", 3, ["Planar Warrior"]);
    subclass(r, "Monster Slayer", "ranger", 3, ["Slayer's Prey"]);
    subclass(r, "Fey Wanderer", "ranger", 3, ["Dreadful Strikes"]);
    subclass(r, "Swarmkeeper", "ranger", 3, ["Gathered Swarm"]);
    const dmg = (id: string, level: number) => attack(stats(pcSub("ranger", level, id, { str: 16 }, sword), r), "Longsword").damage;
    expect(dmg("horizon-walker", 3)).toBe("1d8+3 slashing + 1d8 force");
    expect(dmg("horizon-walker", 11)).toBe("1d8+3 slashing + 2d8 force");
    expect(dmg("monster-slayer", 3)).toBe("1d8+3 slashing + 1d6 slashing");
    expect(dmg("fey-wanderer", 3)).toBe("1d8+3 slashing + 1d4 psychic");
    expect(dmg("fey-wanderer", 11)).toBe("1d8+3 slashing + 1d6 psychic");
    expect(dmg("swarmkeeper", 3)).toBe("1d8+3 slashing + 1d6 slashing");
    expect(dmg("swarmkeeper", 11)).toBe("1d8+3 slashing + 1d8 slashing");
    // the SRD Hunter's Colossus Slayer is an option the player picks
    const hunter = pcSub("ranger", 3, "hunter", { str: 16 }, { ...sword, choices: { "subclass:hunter:3:hunters-prey-pick": ["hunters-prey-colossus-slayer"] } });
    expect(attack(stats(hunter, R), "Longsword").damage).toBe("1d8+3 slashing + 1d8 slashing");
    expect(attack(stats(pcSub("ranger", 3, "hunter", { str: 16 }, sword), R), "Longsword").damage).toBe("1d8+3 slashing");
  });

  it("22. Sneak Attack: a Use button with the dice for the rogue's level", () => {
    const s = stats(pc("rogue", 5, { dex: 16 }), R);
    const f = s.progress.features.find(x => x.name === "Sneak Attack")!;
    expect(f.action).toMatchObject({ name: "Sneak Attack", damage: "{sneak-attack}" });
    expect(s.progress.scales["sneak-attack"]).toBe("3d6");
    expect(stats(pc("rogue", 19), R).progress.scales["sneak-attack"]).toBe("10d6");
  });

  it("23. Swashbuckler Rakish Audacity: Charisma added to initiative", () => {
    const r = srdRegistry();
    subclass(r, "Swashbuckler", "rogue", 3, ["Rakish Audacity"]);
    expect(stats(pcSub("rogue", 3, "swashbuckler", { dex: 14, cha: 16 }), r).initiative).toBe(2 + 3);
    expect(stats(pc("rogue", 3, { dex: 14, cha: 16 }), r).initiative).toBe(2);
  });

  it("24. Draconic Resilience: AC 13 + Dex with no armor and 1 more hit point per sorcerer level", () => {
    const s = stats(pcSub("sorcerer", 3, "draconic", { dex: 14, cha: 16 }), R);
    expect(s.ac.value).toBe(15);
    expect(s.hp.max).toBe(20 + 3);
    expect(stats(pcSub("sorcerer", 3, "draconic", { dex: 14 }, { inventory: gear("leather-armor") }), R).ac.value).toBe(13);
    expect(stats(pcSub("sorcerer", 1, "draconic", { dex: 14 }), R).hp.max).toBe(21);
  });
});
