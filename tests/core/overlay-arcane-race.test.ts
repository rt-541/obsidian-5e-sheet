import { planResolve } from "../../src/core/levelup";
import { spellRows } from "../../src/core/spells";
import { attack, feat, gear, pc, pcSub, put, race, srdRegistry, stats, subclass, switchOn } from "../fixtures/overlay";
import { makeChar } from "../fixtures/mechanics";

const R = srdRegistry();
const pactBlade = { name: "Pact Blade", kind: "weapon", weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee", category: "martial", props: ["pact"] } };
const withPactBlade = () => { const r = srdRegistry(); put(r, "item", pactBlade); return r; };
const INVOCATIONS = (...ids: string[]) => ({ "class:warlock:2:eldritch-invocations-pick": ids.map(i => `eldritch-invocation-${i}`) });

describe("built-in mechanics: warlock, wizard and races", () => {
  it("25. Agonizing Blast: Charisma added to each beam of Eldritch Blast", () => {
    const own = (level: number, picks: object) => {
      const c = pc("warlock", level, { cha: 16 }, { spells: [{ id: "eldritch-blast", prepared: true }], choices: picks });
      return spellRows(c, stats(c, R), { registry: R }).own.find(x => x.id === "eldritch-blast")!.damage;
    };
    const picks = INVOCATIONS("agonizing-blast");
    expect(own(2, picks)).toBe("1d10 + 3");
    expect(own(5, picks)).toMatch(/ \+ 6$/);
    expect(own(2, INVOCATIONS("beast-speech"))).toBe("1d10");
  });

  it("26. Lifedrinker: extra necrotic damage equal to Charisma (at least 1) with the pact weapon", () => {
    const r = withPactBlade();
    const c = pc("warlock", 12, { cha: 16 }, { inventory: gear("pact-blade"), choices: INVOCATIONS("lifedrinker") });
    expect(attack(stats(c, r), "Pact Blade").damage).toBe("1d8 slashing + 3 necrotic");
    const plain = pc("warlock", 12, { cha: 16 }, { inventory: gear("pact-blade") });
    expect(attack(stats(plain, r), "Pact Blade").damage).toBe("1d8 slashing");
  });

  it("27. Eldritch Smite: a Use button with the damage of a first-level pact slot", () => {
    const r = srdRegistry();
    put(r, "class", { name: "Warlock", hitDie: 8, options: { "eldritch-invocations": [{ name: "Eldritch Smite", text: "Smite with your pact weapon." }] },
      levels: { 1: [{ op: "choose", id: "inv", what: "option", list: "eldritch-invocations", count: 1 }] } });
    const s = stats(pc("warlock", 5, {}, { choices: { "class:warlock:1:inv": ["eldritch-smite"] } }), r);
    const row = s.progress.features.find(f => f.name === "Eldritch Smite")!;
    expect(row.action).toMatchObject({ name: "Eldritch Smite", damage: "2d8 force" });
    expect(row.overlay).toBe("option:eldritch-invocations:eldritch-smite");
  });

  it("28. Hexblade Hex Warrior: the pact weapon uses Charisma, with medium armor, shield and martial weapon training", () => {
    const r = withPactBlade();
    subclass(r, "The Hexblade", "warlock", 1, ["Hex Warrior"]);
    const withHex = stats(pcSub("warlock", 1, "the-hexblade", { str: 10, cha: 16 }, { inventory: gear("pact-blade") }), r);
    const without = stats(pc("warlock", 1, { str: 10, cha: 16 }, { inventory: gear("pact-blade") }), r);
    expect(attack(withHex, "Pact Blade")).toMatchObject({ toHit: 3 + 2, damage: "1d8+3 slashing" });
    expect(attack(without, "Pact Blade")).toMatchObject({ toHit: 0, proficient: false });
    expect(attack(withHex, "Pact Blade").proficient).toBeUndefined();
    expect(withHex.progress.proficiencies.other).toEqual(expect.arrayContaining(["Medium Armor", "Shields", "Martial Weapons"]));
  });

  it("29. Bladesong: Start spends a use; Intelligence added to AC and concentration saves, +10 speed, advantage on Acrobatics; off in medium armor", () => {
    const r = srdRegistry();
    subclass(r, "Bladesinging", "wizard", 2, ["Bladesong"]);
    const c = pcSub("wizard", 2, "bladesinging", { dex: 14, int: 16, con: 14 });
    const off = stats(c, r);
    expect(off.ac.value).toBe(12);
    const on = stats(switchOn(c, r, "bladesong"), r);
    expect(on.ac.value).toBe(15);
    expect(on.speed.value).toBe(40);
    expect(on.concentrationSave).toBe(off.concentrationSave + 3);
    expect(on.saves.con.mod).toBe(off.saves.con.mod);
    expect(on.effects.find(e => e.source === "Bladesong")!.effects.adv).toEqual(["skill:acrobatics"]);
    expect(on.resources.find(x => x.id === "bladesong")).toMatchObject({ used: 1, max: 2 });
    const armored = stats({ ...switchOn(c, r, "bladesong"), inventory: gear("breastplate") }, r);
    expect(armored.toggles.find(t => t.id === "bladesong")).toMatchObject({ on: true, suppressed: true });
    expect(armored.speed.value).toBe(30);
  });

  it("30. Tactical Wit and Temporal Awareness: Intelligence added to initiative", () => {
    const r = srdRegistry();
    subclass(r, "War Magic", "wizard", 2, ["Tactical Wit"]);
    subclass(r, "Chronurgy Magic", "wizard", 2, ["Temporal Awareness"]);
    expect(stats(pcSub("wizard", 2, "war-magic", { dex: 14, int: 16 }), r).initiative).toBe(2 + 3);
    expect(stats(pcSub("wizard", 2, "chronurgy-magic", { dex: 14, int: 16 }), r).initiative).toBe(2 + 3);
    expect(stats(pc("wizard", 2, { dex: 14, int: 16 }), r).initiative).toBe(2);
  });

  it("31. Hill Dwarf Dwarven Toughness: +1 hit point maximum for every level", () => {
    expect(stats(pc("fighter", 3, {}, { race: "dwarf", subrace: "hill-dwarf" }), R).hp.max).toBe(23);
    expect(stats(pc("fighter", 7, {}, { race: "dwarf", subrace: "hill-dwarf" }), R).hp.max).toBe(27);
    expect(stats(pc("fighter", 3, {}, { race: "dwarf" }), R).hp.max).toBe(20);
  });

  it("32. Racial resistances and immunities, from the SRD and from homebrew", () => {
    const dwarf = stats(pc("fighter", 1, {}, { race: "dwarf" }), R);
    expect(dwarf.traits.resist).toEqual(["poison"]);
    expect(dwarf.notes.map(n => n.text)).toContain("Advantage on saving throws against poison.");
    expect(stats(pc("fighter", 1, {}, { race: "tiefling" }), R).traits.resist).toEqual(["fire"]);
    const r = srdRegistry();
    race(r, "Aasimar", ["Celestial Resistance"]);
    race(r, "Goliath", ["Mountain Born"]);
    race(r, "Shadar-kai", ["Necrotic Resistance"]);
    race(r, "Warforged", ["Constructed Resilience"]);
    race(r, "Plasmoid", ["Poison Immunity"]);
    race(r, "Dhampir", ["Undead Nature"]);
    race(r, "Kalashtar", ["Psychic Resilience"]);
    const of = (id: string) => stats(pc("fighter", 1, {}, { race: id }), r);
    expect(of("aasimar").traits.resist).toEqual(["necrotic", "radiant"]);
    expect(of("goliath").traits.resist).toEqual(["cold"]);
    expect(of("shadar-kai").traits.resist).toEqual(["necrotic"]);
    expect(of("kalashtar").traits.resist).toEqual(["psychic"]);
    expect(of("warforged")).toMatchObject({ conditionImmune: ["disease"], traits: { resist: ["poison"] } });
    expect(of("plasmoid")).toMatchObject({ conditionImmune: ["poisoned"], traits: { immune: ["poison"] } });
    expect(of("dhampir").conditionImmune).toEqual(["poisoned", "exhaustion", "disease"]);
  });

  it("33. Natural Armor: the race's base AC, the better of that and worn armor where the race allows", () => {
    const r = srdRegistry();
    for (const n of ["Lizardfolk", "Locathah", "Loxodon", "Tortle"]) race(r, n, ["Natural Armor"]);
    race(r, "Thri-kreen", ["Chameleon Carapace"]);
    race(r, "Autognome", ["Armored Casing"]);
    const ac = (id: string, o: object = {}) => stats(pc("fighter", 1, { dex: 14, con: 14 }, { race: id, ...o }), r).ac.value;
    expect(ac("lizardfolk")).toBe(15);
    expect(ac("lizardfolk", { inventory: gear("leather-armor") })).toBe(15);
    expect(ac("lizardfolk", { inventory: gear("chain-mail") })).toBe(16);
    expect(ac("thri-kreen")).toBe(15);
    expect(ac("autognome")).toBe(15);
    expect(ac("locathah")).toBe(14);
    expect(ac("loxodon")).toBe(14);
    expect(ac("tortle")).toBe(17);
    expect(stats(pc("fighter", 1, {}, { race: "tortle" }), r).notes.map(n => n.text).join()).toMatch(/cannot wear other armor/);
  });

  it("34. Relentless Endurance and Stone's Endurance: a once-a-day Use button with its own use", () => {
    const half = stats(pc("fighter", 1, {}, { race: "half-orc" }), R);
    expect(half.resources.find(x => x.id === "relentless-endurance")).toMatchObject({ max: 1, reset: "long", used: 0 });
    expect(half.progress.features.find(f => f.name === "Relentless Endurance")!.action).toMatchObject({ name: "Relentless Endurance", cost: { resource: "Relentless Endurance" } });
    expect(half.progress.problems).toEqual([]);
    const r = srdRegistry();
    race(r, "Goliath", ["Stone's Endurance"]);
    const g = stats(pc("fighter", 1, {}, { race: "goliath" }), r);
    expect(g.resources.find(x => x.id === "stone-s-endurance")).toMatchObject({ max: 1, reset: "short" });
    expect(g.progress.features.find(f => f.name === "Stone's Endurance")!.action!.cost).toEqual({ resource: "Stone's Endurance" });
    expect(g.progress.problems).toEqual([]);
  });

  it("35. Breath Weapon: save DC 8 + proficiency + Constitution, damage dice by level, once per short rest", () => {
    const s = stats(pc("fighter", 6, { con: 14 }, { race: "dragonborn" }), R);
    expect(s.progress.dcs.find(d => d.id === "breath-weapon")).toMatchObject({ dc: 8 + 3 + 2, abil: "con" });
    expect(s.progress.scales["breath-dice"]).toBe("3d6");
    expect(s.resources.find(x => x.id === "breath-weapon")).toMatchObject({ max: 1, reset: "short" });
    expect(s.progress.features.find(f => f.name === "Breath Weapon")!.action).toMatchObject({ save: { abil: "dex", dc: "Breath Weapon" }, damage: "{breath-dice}", cost: { resource: "Breath Weapon" } });
    expect(stats(pc("fighter", 1, {}, { race: "dragonborn" }), R).progress.scales["breath-dice"]).toBe("2d6");
    expect(s.progress.problems).toEqual([]);
  });

  it("36. Draconic Ancestry: the player picks a colour, which gives the matching resistance", () => {
    const key = "race:dragonborn:ov-draconic-ancestry-pick";
    const c = pc("fighter", 1, {}, { race: "dragonborn" });
    expect(stats(c, R).progress.pending.map(q => q.key)).toContain(key);
    const step = planResolve(c, R).find(x => x.key === key)!;
    expect(step).toMatchObject({ kind: "pick", what: "option", count: 1 });
    expect((step as { options: unknown[] }).options).toHaveLength(10);
    const red = stats(makeChar({ ...pc("fighter", 1, {}, { race: "dragonborn" }), choices: { [key]: ["red"] } }), R);
    expect(red.traits.resist).toEqual(["fire"]);
    expect(red.progress.pending.map(q => q.key)).not.toContain(key);
    expect(stats(pc("fighter", 1, {}, { race: "dragonborn", choices: { [key]: ["white"] } }), R).traits.resist).toEqual(["cold"]);
  });

  it("37. Shell Defense, Shifting and Celestial Revelation: switches with what they change in words", () => {
    const r = srdRegistry();
    race(r, "Tortle", ["Natural Armor", "Shell Defense"]);
    race(r, "Shifter", ["Shifting"]);
    race(r, "Aasimar", ["Celestial Revelation"]);
    put(r, "subrace", { name: "Beasthide", race: "shifter", grants: [feat("Shifting Feature")] });
    put(r, "subrace", { name: "Swiftstride", race: "shifter", grants: [feat("Shifting Feature")] });
    put(r, "subrace", { name: "Wildhunt", race: "shifter", grants: [feat("Shifting Feature")] });
    put(r, "subrace", { name: "Longtooth", race: "shifter", grants: [feat("Shifting Feature")] });
    const tortle = pc("fighter", 1, { dex: 10 }, { race: "tortle" });
    const shell = stats(switchOn(tortle, r, "shell-defense"), r);
    expect(shell.ac.value).toBe(21);
    expect(shell.speed.value).toBe(0);
    expect(shell.effects.find(e => e.source === "Shell Defense")!.effects).toMatchObject({ adv: ["save:str", "save:con"], dis: ["save:dex"] });
    expect(stats(tortle, r).ac.value).toBe(17);
    const shifter = (sub: string, on: boolean) => { const c = pc("fighter", 1, { str: 16 }, { race: "shifter", subrace: sub }); return stats(on ? switchOn(c, r, "shifting") : c, r); };
    expect(shifter("beasthide", false).ac.value).toBe(10);
    expect(shifter("beasthide", true).ac.value).toBe(11);
    expect(shifter("beasthide", true).resources.find(x => x.id === "shifting")).toMatchObject({ used: 1, max: 1 });
    expect(shifter("swiftstride", false).speed.value).toBe(30);
    expect(shifter("swiftstride", true).speed.value).toBe(40);
    expect(shifter("wildhunt", true).effects.some(e => e.effects.adv?.includes("check:wis"))).toBe(true);
    expect(shifter("wildhunt", false).effects.some(e => e.effects.adv?.includes("check:wis"))).toBe(false);
    expect(attack(shifter("longtooth", true), "Fangs")).toMatchObject({ damage: "1d6+3 piercing" });
    expect(shifter("longtooth", false).attacks.map(a => a.name)).not.toContain("Fangs");
    const aasimar = stats(switchOn(pc("fighter", 3, {}, { race: "aasimar" }), r, "celestial-revelation"), r);
    expect(aasimar.toggles.find(t => t.id === "celestial-revelation")).toMatchObject({ on: true });
    expect(aasimar.resources.find(x => x.id === "celestial-revelation")).toMatchObject({ used: 1 });
  });

  it("38. Innate spellcasting: cantrip at once, a spell each at levels 3 and 5 once per long rest, with a save DC", () => {
    const tiefling = (level: number) => stats(pc("fighter", level, { cha: 14 }, { race: "tiefling" }), R);
    expect(tiefling(1).progress.grantedSpells.map(g => g.id)).toEqual(["thaumaturgy"]);
    expect(tiefling(3).progress.grantedSpells.map(g => g.id)).toEqual(["thaumaturgy", "hellish-rebuke"]);
    expect(tiefling(5).progress.grantedSpells.map(g => g.id)).toEqual(["thaumaturgy", "hellish-rebuke", "darkness"]);
    expect(tiefling(5).resources.filter(x => ["hellish-rebuke", "darkness"].includes(x.id)).map(x => [x.id, x.max, x.reset])).toEqual([["hellish-rebuke", 1, "long"], ["darkness", 1, "long"]]);
    expect(tiefling(1).resources.map(x => x.id)).not.toContain("hellish-rebuke");
    expect(tiefling(5).progress.dcs.find(d => d.id === "infernal-legacy")).toMatchObject({ dc: 8 + 3 + 2, abil: "cha" });
    const r = srdRegistry();
    race(r, "Drow", ["Drow Magic"]); race(r, "Duergar", ["Duergar Magic"]); race(r, "Githyanki", ["Githyanki Psionics"]); race(r, "Firbolg", ["Firbolg Magic"]);
    const ids = (race: string, level: number) => stats(pc("fighter", level, {}, { race }), r).progress.grantedSpells.map(g => g.id);
    expect(ids("drow", 5)).toEqual(["dancing-lights", "faerie-fire", "darkness"]);
    expect(ids("duergar", 5)).toEqual(["enlarge-reduce", "invisibility"]);
    expect(ids("githyanki", 5)).toEqual(["mage-hand", "jump", "misty-step"]);
    expect(ids("firbolg", 1)).toEqual(["detect-magic", "disguise-self"]);
    expect(stats(pc("fighter", 1, { wis: 14 }, { race: "firbolg" }), r).progress.dcs[0]).toMatchObject({ abil: "wis", dc: 8 + 2 + 2 });
  });
});
