import { planResolve } from "../../src/core/levelup";
import { attack, gear, pc, pcSub, srdRegistry, stats, switchOn } from "../fixtures/overlay";

const R = srdRegistry();
const FIGHTING_STYLE = (id: string) => ({ "class:fighter:1:fighter-fighting-style-pick": [`fighter-fighting-style-${id}`] });

describe("built-in mechanics: class features of the SRD", () => {
  it("1. Barbarian Unarmored Defense: AC 10 + Dex + Con with no armor", () => {
    const s = stats(pc("barbarian", 5, { dex: 14, con: 16 }), R);
    expect(s.ac.value).toBe(15);
    expect(s.ac.sources[0]).toBe("Unarmored Defense");
    // armor replaces it
    expect(stats(pc("barbarian", 5, { dex: 14, con: 16 }, { inventory: gear("chain-mail") }), R).ac.value).toBe(16);
  });

  it("2. Monk Unarmored Defense: AC 10 + Dex + Wis, and a shield turns it off", () => {
    expect(stats(pc("monk", 5, { dex: 18, wis: 16 }), R).ac.value).toBe(17);
    expect(stats(pc("monk", 5, { dex: 18, wis: 16 }, { inventory: gear("shield") }), R).ac.value).toBe(16);
  });

  it("3. Rage: Start Rage spends a use; +2 melee Strength damage, resistances, advantage; off in heavy armor", () => {
    const c = pc("barbarian", 5, { str: 16, con: 14 }, { inventory: gear("greataxe") });
    const off = stats(c, R);
    expect(attack(off, "Greataxe").damage).toBe("1d12+3 slashing");
    expect(off.traits.resist).toEqual([]);
    expect(off.toggles.find(t => t.id === "rage")).toMatchObject({ name: "Rage", on: false });
    const raging = switchOn(c, R, "rage");
    const on = stats(raging, R);
    expect(attack(on, "Greataxe").damage).toBe("1d12+5 slashing");
    expect(on.traits.resist).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(on.effects.find(e => e.source === "Rage")!.effects).toMatchObject({ adv: ["check:str", "save:str"] });
    expect(on.resources.find(r => r.id === "rage")).toMatchObject({ used: 1, max: 3 });
    expect(on.notes.map(n => n.text)).toContain("No spellcasting or concentration while raging.");
    // rage damage grows: +3 from level 9
    expect(attack(stats(switchOn(pc("barbarian", 9, { str: 16 }, { inventory: gear("greataxe") }), R, "rage"), R), "Greataxe").damage).toBe("1d12+6 slashing");
    // heavy armor: the switch stays on but does nothing
    const heavy = stats({ ...raging, inventory: gear("greataxe", "chain-mail") }, R);
    expect(heavy.toggles.find(t => t.id === "rage")).toMatchObject({ on: true, suppressed: true });
    expect(heavy.traits.resist).toEqual([]);
  });

  it("4. Fast Movement: +10 speed unless in heavy armor", () => {
    expect(stats(pc("barbarian", 5), R).speed.value).toBe(40);
    expect(stats(pc("barbarian", 4), R).speed.value).toBe(30);
    expect(stats(pc("barbarian", 5, {}, { inventory: gear("chain-mail") }), R).speed.value).toBe(30);
    expect(stats(pc("barbarian", 5, {}, { inventory: gear("breastplate") }), R).speed.value).toBe(40);
  });

  it("5. Martial Arts: Monk 5 Dex 18 Wis 16 has an Unarmed Strike +7 for 1d6+4", () => {
    const s = stats(pc("monk", 5, { dex: 18, wis: 16 }), R);
    expect(attack(s, "Unarmed Strike")).toMatchObject({ toHit: 7, damage: "1d6+4 bludgeoning" });
    // the die grows with the class
    expect(attack(stats(pc("monk", 11, { dex: 18 }), R), "Unarmed Strike").damage).toBe("1d8+4 bludgeoning");
    // a shortsword is a monk weapon too
    expect(attack(stats(pc("monk", 5, { dex: 18 }, { inventory: gear("shortsword") }), R), "Shortsword").damage).toBe("1d6+4 piercing");
  });

  it("6. Unarmored Movement: speed grows with level and needs no armor and no shield", () => {
    expect(stats(pc("monk", 5), R).speed.value).toBe(40);
    expect(stats(pc("monk", 6), R).speed.value).toBe(45);
    expect(stats(pc("monk", 5, {}, { inventory: gear("shield") }), R).speed.value).toBe(30);
    expect(stats(pc("monk", 5, {}, { inventory: gear("leather-armor") }), R).speed.value).toBe(30);
    expect(stats(pc("monk", 1), R).speed.value).toBe(30);
  });

  it("7. Jack of All Trades: half proficiency on checks and initiative that are not proficient", () => {
    const s = stats(pc("bard", 2, { dex: 14, str: 16 }), R);
    expect(s.prof).toBe(2);
    expect(s.initiative).toBe(2 + 1);
    expect(s.skills.find(k => k.id === "athletics")!.mod).toBe(3 + 1);
    expect(s.checks.str).toBe(3 + 1);
    // a skill the bard is proficient in gets the full bonus instead, not both
    expect(stats(pc("bard", 2, { str: 16 }, { proficiencies: { saves: [], skills: ["athletics"], expertise: [] } }), R).skills.find(k => k.id === "athletics")!.mod).toBe(3 + 2);
    expect(stats(pc("bard", 1, { dex: 14 }), R).initiative).toBe(2);
  });

  it("8. Magical Secrets: two spells from any class list at 10, 14 and 18, and Lore adds two at 6", () => {
    const bard = pc("bard", 10, { cha: 16 });
    const p = stats(bard, R).progress.pending.find(q => q.key === "class:bard:10:ov-magical-secrets")!;
    expect(p.op).toMatchObject({ op: "spells", count: 2, from: "*" });
    const step = planResolve(bard, R).find(x => x.key === p.key)!;
    expect(step).toMatchObject({ kind: "spells", count: 2 });
    // a wizard spell is on offer to a bard
    expect((step as { options: { id: string; disabled?: string }[] }).options.find(o => o.id === "fireball")?.disabled).toBeUndefined();
    expect(stats(pc("bard", 14, { cha: 16 }), R).progress.pending.map(q => q.key)).toContain("class:bard:14:ov-magical-secrets");
    expect(stats(pcSub("bard", 6, "lore", { cha: 16 }), R).progress.pending.map(q => q.key)).toContain("subclass:lore:6:ov-additional-magical-secrets");
    expect(stats(pc("bard", 9, { cha: 16 }), R).progress.pending.map(q => q.key)).not.toContain("class:bard:10:ov-magical-secrets");
  });

  it("9. Wild Shape: a Start button that spends a use, and the highest beast it can become", () => {
    const c = pc("druid", 4, { wis: 16 });
    const s = stats(c, R);
    expect(s.toggles.find(t => t.id === "wild-shape")).toMatchObject({ name: "Wild Shape", on: false });
    expect(s.progress.scales["wild-shape-max-cr"]).toBe("1/2");
    const on = stats(switchOn(c, R, "wild-shape"), R);
    expect(on.resources.find(r => r.id === "wild-shape")).toMatchObject({ used: 1, max: 2 });
    expect(on.notes.map(n => n.source)).toContain("Wild Shape (CR 1/4 or below, no flying or swim speed)");
    expect(on.toggles.find(t => t.id === "wild-shape")).toMatchObject({ on: true });
    // the later Wild Shape rows (levels 4 and 8) do not add a second switch or a problem
    expect(stats(pc("druid", 8, { wis: 16 }), R).progress.problems).toEqual([]);
    expect(stats(pc("druid", 8, { wis: 16 }), R).toggles.filter(t => t.id === "wild-shape")).toHaveLength(1);
  });

  it("10. Fighting Style Archery: +2 to ranged attack rolls", () => {
    const base = { inventory: gear("longbow", "longsword") };
    const none = stats(pc("fighter", 1, { dex: 16 }, base), R);
    const archer = stats(pc("fighter", 1, { dex: 16 }, { ...base, choices: FIGHTING_STYLE("archery") }), R);
    expect(attack(none, "Longbow").toHit).toBe(5);
    expect(attack(archer, "Longbow").toHit).toBe(7);
    expect(archer.progress.options["fighter-fighting-style"]).toEqual(["fighter-fighting-style-archery"]);
    expect(attack(archer, "Longsword").toHit).toBe(attack(none, "Longsword").toHit);
  });

  it("11. Fighting Style Defense: +1 AC while wearing armor (Fighter in chain mail has AC 17)", () => {
    const withStyle = { choices: FIGHTING_STYLE("defense") };
    expect(stats(pc("fighter", 1, { dex: 14 }, { ...withStyle, inventory: gear("chain-mail") }), R).ac.value).toBe(17);
    expect(stats(pc("fighter", 1, { dex: 14 }, { inventory: gear("chain-mail") }), R).ac.value).toBe(16);
    expect(stats(pc("fighter", 1, { dex: 14 }, withStyle), R).ac.value).toBe(12);
  });

  it("12. Fighting Style Dueling: +2 damage with one melee weapon in hand, not with two weapons or a two-handed one", () => {
    const duel = { choices: FIGHTING_STYLE("dueling") };
    expect(attack(stats(pc("fighter", 1, { str: 16 }, { ...duel, inventory: gear("longsword") }), R), "Longsword").damage).toBe("1d8+5 slashing");
    expect(attack(stats(pc("fighter", 1, { str: 16 }, { inventory: gear("longsword") }), R), "Longsword").damage).toBe("1d8+3 slashing");
    expect(attack(stats(pc("fighter", 1, { str: 16 }, { ...duel, inventory: gear("greataxe") }), R), "Greataxe").damage).toBe("1d12+3 slashing");
    expect(attack(stats(pc("fighter", 1, { str: 16 }, { ...duel, inventory: gear("longsword", "shortsword") }), R), "Longsword").damage).toBe("1d8+3 slashing");
    expect(attack(stats(pc("fighter", 1, { str: 16 }, { ...duel, inventory: gear("longsword") }), R), "Unarmed Strike").damage).toBe("4 bludgeoning");
  });
});
