import { attack, gear, pc, srdRegistry, stats, switchOn } from "../fixtures/overlay";

const R = srdRegistry();

describe("why-this-number breakdowns", () => {
  it("AC says where every part comes from, for a formula and for armor", () => {
    expect(stats(pc("monk", 5, { dex: 18, wis: 16 }), R).why.ac).toBe("AC 17 = 10 + Dex 4 + Wis 3 (Unarmored Defense)");
    const chain = stats(pc("fighter", 1, { dex: 14 }, { inventory: gear("chain-mail", "shield") }), R);
    expect(chain.why.ac).toMatch(/^AC 18 = 16 \(Chain mail\)/);
    expect(chain.why.ac).toContain("Shield");
    expect(stats(pc("fighter", 1, { dex: 16 }, { inventory: gear("scale-mail") }), R).why.ac).toBe("AC 16 = 14 (Scale mail) + Dex 2 (medium armor adds at most +2)");
    expect(stats(pc("wizard", 1, { dex: 8 }), R).why.ac).toBe("AC 9 = 10 (no armor) - Dex 1");
  });

  it("speed, hit points, initiative, passives and carrying capacity", () => {
    const s = stats(pc("monk", 5, { dex: 18, wis: 16, str: 10 }), R);
    expect(s.why.speed).toBe("Speed 40 = Base 30 + 10 (Unarmored Movement)");
    expect(s.why.initiative).toBe("Initiative +4 = Dex 4");
    expect(s.why["passive:perception"]).toBe(`Passive Perception ${s.passives.perception} = 10 + Wis 3`);
    expect(s.why.carry).toBe("Carrying capacity 150 lb = Str 10 x 15");
    expect(s.why.hp).toMatch(/^Max HP 20 = Hit points from levels 20$/);
  });

  it("saves and skills list ability, proficiency and bonuses", () => {
    const s = stats(pc("monk", 5, { dex: 18, wis: 16, str: 10 }), R);
    expect(s.why["save:dex"]).toBe("Dexterity save +7 = Dex 4 + Proficiency 3");
    expect(s.why["save:int"]).toBe("Intelligence save +0 = Int 0");
    const c = pc("monk", 5, { dex: 18, wis: 16 }, { proficiencies: { saves: [], skills: ["stealth"], expertise: [] } });
    expect(stats(c, R).why["skill:stealth"]).toBe("Stealth +7 = Dex 4 + Proficiency 3");
    expect(stats(c, R).why["check:dex"]).toBe("Dexterity check +4 = Dex 4");
  });

  it("attacks explain the hit and the damage, including rage and a missing proficiency", () => {
    const s = stats(pc("monk", 5, { dex: 18, wis: 16 }), R);
    expect(attack(s, "Unarmed Strike").why).toEqual({ hit: "To hit +7 = Dex 4 + Proficiency 3", damage: "Damage 1d6+4 = 1d6 + Dex 4" });
    const c = pc("barbarian", 5, { str: 16, con: 14 }, { inventory: gear("greataxe") });
    const on = stats(switchOn(c, R, "rage"), R);
    expect(attack(on, "Greataxe").why!.damage).toBe("Damage 1d12+5 = 1d12 + Str 3 + 2 (Rage)");
    const wiz = stats(pc("wizard", 1, { str: 16 }, { inventory: gear("greataxe") }), R);
    expect(attack(wiz, "Greataxe").why!.hit).toContain("Proficiency 0 (not proficient)");
  });

  it("spell DC and attack, and class DCs", () => {
    const s = stats(pc("wizard", 5, { int: 16 }), R);
    expect(s.why["spell-dc"]).toBe("Spell save DC 14 = 8 + Proficiency 3 + Int 3");
    expect(s.why["spell-attack"]).toBe("Spell attack +6 = Proficiency 3 + Int 3");
    const monk = stats(pc("monk", 5, { wis: 16 }), R);
    expect(monk.why["dc:ki"]).toBe("Ki save DC 14 = 8 + Proficiency 3 + Wis 3");
  });
});
