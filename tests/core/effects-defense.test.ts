import { validateEffects } from "../../src/content/types/effects";
import { describeEffects } from "../../src/ui/widgets";
import { act, derive, makeChar, mechanicsRegistry } from "../fixtures/mechanics";

const R = mechanicsRegistry();
/** Give the test character a feat whose only job is to carry this effects block. */
let n = 0;
const withFx = (effects: object, o: object = {}) => {
  const id = `carrier-${++n}`;
  R.add("vault", "feat", { name: id, grants: [{ op: "effect", effects }] }, { path: `${id}.md` });
  return derive(makeChar({ ...o, feats: [id, ...((o as { feats?: string[] }).feats ?? [])] }), R);
};
const parse = (v: unknown) => { const e: string[] = []; return { out: validateEffects(v, "effects", e), e }; };
const chain = { inventory: [{ id: "chain-mail", equipped: true }] }, scale = { inventory: [{ id: "scale-mail", equipped: true }] };
const shield = { id: "shield", equipped: true };

describe("acFormula", () => {
  it("is validated", () => {
    expect(parse({ acFormula: { base: 10, abils: ["dex", "wis"], noShield: true } }).out.acFormula).toEqual({ base: 10, abils: ["dex", "wis"], noShield: true });
    const bad = parse({ acFormula: { base: "ten", abils: ["luck"], withArmor: 1 } });
    expect(bad.out.acFormula).toBeUndefined();
    expect(bad.e.join("\n")).toMatch(/acFormula.base/); expect(bad.e.join("\n")).toMatch(/acFormula.abils/); expect(bad.e.join("\n")).toMatch(/acFormula.withArmor/);
  });
  it("Unarmored Defense (10 + Dex + Con) beats the plain 10 + Dex with no armor", () => {
    const s = withFx({ acFormula: { base: 10, abils: ["dex", "con"] } });
    expect(s.ac.value).toBe(10 + 2 + 2);
    expect(s.ac.sources[0]).toMatch(/carrier/);
  });
  it("is not used when it would be lower than the normal formula", () => {
    expect(withFx({ acFormula: { base: 8 } }).ac.value).toBe(12);
  });
  it("body armor switches it off unless withArmor", () => {
    const plain = derive(makeChar(chain), R).ac.value;
    expect(withFx({ acFormula: { base: 10, abils: ["dex", "con"] } }, chain).ac.value).toBe(plain);
    expect(withFx({ acFormula: { base: 18, abils: ["con"], withArmor: true } }, chain).ac.value).toBe(18 + 2);
  });
  it("noShield: a worn shield turns it off, other bonuses still add", () => {
    const fx = { acFormula: { base: 10, abils: ["dex", "con"], noShield: true as const } };
    expect(withFx(fx, { inventory: [shield] }).ac.value).toBe(12 + 2);
    expect(withFx(fx).ac.value).toBe(14);
    expect(withFx({ ...fx, modifiers: [{ target: "ac", value: 1 }] }).ac.value).toBe(15);
  });
  it("only a formula whose while gate holds counts", () => {
    expect(withFx({ acFormula: { base: 13, abils: ["dex"] }, while: ["toggle:fury"] }).ac.value).toBe(12);
    expect(withFx({ acFormula: { base: 13, abils: ["dex"] }, while: ["toggle:fury"] }, { active: { fury: true } }).ac.value).toBe(15);
  });
  it("says it in words", () => expect(describeEffects(parse({ acFormula: { base: 10, abils: ["dex", "wis"], noShield: true } }).out)).toBe("AC is 10 + Dexterity + Wisdom when you wear no armor and no shield"));
});

describe("armorDexMax", () => {
  const medium = { inventory: [{ id: "scale-mail", equipped: true }] };
  it("is validated", () => {
    expect(parse({ armorDexMax: 3 }).out.armorDexMax).toBe(3);
    expect(parse({ armorDexMax: 1 }).e.join()).toMatch(/armorDexMax/);
    expect(parse({ armorDexMax: "3" }).e.join()).toMatch(/armorDexMax/);
  });
  it("raises the Dex cap of medium armor only", () => {
    const dex = { abilities: { str: 14, dex: 18, con: 14, int: 10, wis: 12, cha: 8 } };
    const base = derive(makeChar({ ...medium, ...dex }), R).ac.value;
    expect(withFx({ armorDexMax: 3 }, { ...medium, ...dex }).ac.value).toBe(base + 1);
    expect(withFx({ armorDexMax: 3 }, { ...chain, ...dex }).ac.value).toBe(derive(makeChar({ ...chain, ...dex }), R).ac.value);
    expect(withFx({ armorDexMax: 3 }, dex).ac.value).toBe(derive(makeChar(dex), R).ac.value);
  });
  it("never lowers the cap, and a Dex of 14 does not use the extra room", () => {
    expect(withFx({ armorDexMax: 3 }, medium).ac.value).toBe(derive(makeChar(medium), R).ac.value);
  });
  it("the highest cap wins", () => {
    const dex = { abilities: { str: 14, dex: 20, con: 14, int: 10, wis: 12, cha: 8 }, ...medium };
    R.add("vault", "feat", { name: "Cap four", grants: [{ op: "effect", effects: { armorDexMax: 4 } }] }, { path: "cap4.md" });
    R.add("vault", "feat", { name: "Cap three", grants: [{ op: "effect", effects: { armorDexMax: 3 } }] }, { path: "cap3.md" });
    expect(derive(makeChar({ ...dex, feats: ["cap-three", "cap-four"] }), R).ac.value).toBe(derive(makeChar(dex), R).ac.value + 2);
  });
  it("says it in words", () => expect(describeEffects({ armorDexMax: 3 })).toBe("Medium armor lets you add up to +3 Dexterity to AC"));
  it("scale mail stays at +2 without it", () => expect(derive(makeChar({ ...scale, abilities: { str: 14, dex: 18, con: 14, int: 10, wis: 12, cha: 8 } }), R).ac.value).toBe(14 + 2));
});

describe("attacks (attacks per action)", () => {
  it("is validated", () => {
    expect(parse({ attacks: 2 }).out.attacks).toBe(2);
    expect(parse({ attacks: "1 + floor(level / 5)" }).out.attacks).toBe("1 + floor(level / 5)");
    expect(parse({ attacks: "two" }).out.attacks).toBe("two");   // an unknown name is only found when it is worked out
    expect(parse({ attacks: "1 +" }).e.join()).toMatch(/attacks/);
  });
  it("is 1 by default, the highest source wins, and formulas can use level", () => {
    expect(derive(makeChar(), R).attacksPerAction).toBe(1);
    expect(withFx({ attacks: 2 }).attacksPerAction).toBe(2);
    R.add("vault", "feat", { name: "Three Swings", grants: [{ op: "effect", effects: { attacks: 3 } }] }, { path: "three.md" });
    R.add("vault", "feat", { name: "Two Swings", grants: [{ op: "effect", effects: { attacks: 2 } }] }, { path: "two.md" });
    expect(derive(makeChar({ feats: ["two-swings", "three-swings"] }), R).attacksPerAction).toBe(3);
    expect(withFx({ attacks: "1 + floor(level / 5)" }, { classes: [{ class: "tester", level: 10 }] }).attacksPerAction).toBe(3);
  });
  it("a gated source counts only while its toggle is on", () => {
    expect(withFx({ attacks: 2, while: ["toggle:fury"] }).attacksPerAction).toBe(1);
    expect(withFx({ attacks: 2, while: ["toggle:fury"] }, { active: { fury: true } }).attacksPerAction).toBe(2);
  });
  it("a formula that cannot be worked out is reported and ignored", () => {
    const s = withFx({ attacks: "mystery" });
    expect(s.attacksPerAction).toBe(1); expect(s.progress.problems.join()).toMatch(/attacks unknown name mystery/);
  });
  it("says it in words", () => expect(describeEffects({ attacks: 2 })).toBe("Attacks per Attack action: 2"));
});

describe("senses", () => {
  it("is validated", () => {
    expect(parse({ senses: { darkvision: 60, blindsight: 10 } }).out.senses).toEqual({ darkvision: 60, blindsight: 10 });
    const bad = parse({ senses: { x: 1, truesight: -1 } });
    expect(bad.e.join("\n")).toMatch(/senses.x: unknown sense/); expect(bad.e.join("\n")).toMatch(/senses.truesight/);
  });
  it("the longest range of each sense wins", () => {
    R.add("vault", "feat", { name: "Dark Eyes", grants: [{ op: "effect", effects: { senses: { darkvision: 120, blindsight: 10 } } }] }, { path: "de.md" });
    const s = withFx({ senses: { darkvision: 60, tremorsense: 30, truesight: 15, telepathy: 120 } }, { feats: ["dark-eyes"] });
    expect(s.senses).toEqual({ darkvision: 120, blindsight: 10, tremorsense: 30, truesight: 15, telepathy: 120 });
    expect(derive(makeChar({ feats: ["dark-eyes"] }), R).senses).toEqual({ darkvision: 120, blindsight: 10 });
  });
  it("darkvisionAdd needs darkvision from somewhere else, otherwise darkvision applies", () => {
    const fx = { senses: { darkvision: 60, darkvisionAdd: 30 } };
    expect(withFx(fx).senses.darkvision).toBe(60);
    expect(withFx(fx, { race: "elf" }).senses.darkvision).toBe(90);
    expect(withFx({ senses: { darkvisionAdd: 30 } }).senses.darkvision).toBeUndefined();
  });
  it("race darkvision from a grant and the senses effect share one pool", () => {
    expect(derive(makeChar({ race: "elf" }), R).darkvision).toBe(60);
    expect(withFx({ senses: { darkvision: 120 } }, { race: "elf" }).darkvision).toBe(120);
  });
  it("says it in words", () => expect(describeEffects({ senses: { darkvision: 60, blindsight: 10 } })).toBe("You see in the dark up to 60 ft. · Blindsight 10 ft."));
});

describe("speeds", () => {
  it("is validated", () => {
    expect(parse({ speeds: { fly: "walk", swim: 30, hover: true } }).out.speeds).toEqual({ fly: "walk", swim: 30, hover: true });
    const bad = parse({ speeds: { fly: "fast", jump: 5, hover: "yes" } });
    expect(bad.e.join("\n")).toMatch(/speeds.fly/); expect(bad.e.join("\n")).toMatch(/speeds.jump: unknown speed/); expect(bad.e.join("\n")).toMatch(/speeds.hover/);
  });
  it("walk means the walking speed, including speed bonuses", () => {
    expect(withFx({ speeds: { fly: "walk" } }).speed.other).toBe("fly 30");
    expect(withFx({ speeds: { fly: "walk", climb: 20 }, modifiers: [{ target: "speed", value: 10 }] }).speed.other).toBe("fly 40, climb 20");
    expect(withFx({ speeds: { fly: 60, hover: true } }).speed.other).toBe("fly 60 (hover)");
  });
  it("the best of each mode wins and the walking speed is unchanged", () => {
    R.add("vault", "feat", { name: "Fins", grants: [{ op: "effect", effects: { speeds: { swim: 40 } } }] }, { path: "fins.md" });
    const s = withFx({ speeds: { swim: 30, burrow: 10 } }, { feats: ["fins"] });
    expect(s.speed.other).toBe("swim 40, burrow 10"); expect(s.speed.value).toBe(30);
  });
  it("a grant op accepts speeds too", () => {
    R.add("vault", "feat", { name: "Wings", grants: [{ op: "grant", speeds: { fly: "walk" } }] }, { path: "wings.md" });
    expect(derive(makeChar({ feats: ["wings"] }), R).speed.other).toBe("fly 30");
    expect(R.add("vault", "feat", { name: "Bad Wings", grants: [{ op: "grant", speeds: { fly: "up" } }] }, { path: "bw.md" })?.errors.join()).toMatch(/speeds.fly/);
  });
  it("while gates apply", () => {
    expect(withFx({ speeds: { fly: "walk" }, while: ["toggle:fury"] }).speed.other).toBe("");
    expect(withFx({ speeds: { fly: "walk" }, while: ["toggle:fury"] }, { active: { fury: true } }).speed.other).toBe("fly 30");
  });
  it("says it in words", () => expect(describeEffects({ speeds: { fly: "walk", swim: 20, hover: true } })).toBe("Fly speed equal to your walking speed (hover) · Swim speed 20 ft."));
});

describe("abilityBonus", () => {
  it("is validated", () => {
    expect(parse({ abilityBonus: { str: 4, dex: "prof" } }).out.abilityBonus).toEqual({ str: 4, dex: "prof" });
    const bad = parse({ abilityBonus: { luck: 1, str: "1 +" } });
    expect(bad.e.join("\n")).toMatch(/abilityBonus.luck: unknown ability/); expect(bad.e.join("\n")).toMatch(/abilityBonus.str/);
  });
  it("raises the score before the modifier, up to 20 by default", () => {
    const s = withFx({ abilityBonus: { str: 4 } });
    expect(s.abilities.str).toBe(20); expect(s.mods.str).toBe(5);
    expect(withFx({ abilityBonus: { str: 8 } }).abilities.str).toBe(20);
  });
  it("a higher maxScore lifts the cap", () => {
    const s = withFx({ abilityBonus: { str: 8 }, maxScore: { abil: "str", max: 24 } });
    expect(s.abilities.str).toBe(24); expect(s.mods.str).toBe(7);
  });
  it("the raised score feeds saves, skills, attacks, carry and formulas", () => {
    const s = withFx({ abilityBonus: { str: 4 } }, { inventory: [{ id: "longsword", equipped: true }] });
    expect(s.saves.str.mod).toBe(5 + 2);
    expect(s.skills.find(k => k.id === "athletics")!.mod).toBe(5);
    expect(s.attacks[0].toHit).toBe(5);
    expect(s.carry.capacity).toBe(20 * 15);
  });
  it("a formula can use proficiency, and only works while its gate holds", () => {
    expect(withFx({ abilityBonus: { dex: "prof" } }).abilities.dex).toBe(16);
    expect(withFx({ abilityBonus: { dex: 2 }, while: ["toggle:fury"] }).abilities.dex).toBe(14);
    expect(withFx({ abilityBonus: { dex: 2 }, while: ["toggle:fury"] }, { active: { fury: true } }).abilities.dex).toBe(16);
  });
  it("the stored score on the note is not changed", () => {
    expect(withFx({ abilityBonus: { str: 4 } }).abilities.str).toBe(20);
    expect(makeChar().abilities.str).toBe(16);
  });
  it("says it in words", () => expect(describeEffects({ abilityBonus: { str: 4, con: "prof" } })).toBe("Strength +4 · Constitution + prof"));
});

describe("conditionImmune", () => {
  it("is validated and listed", () => {
    expect(parse({ conditionImmune: ["poisoned", "disease"] }).out.conditionImmune).toEqual(["poisoned", "disease"]);
    expect(parse({ conditionImmune: "poisoned" }).e.join()).toMatch(/conditionImmune/);
    expect(withFx({ conditionImmune: ["poisoned", "frightened"] }).conditionImmune).toEqual(["poisoned", "frightened"]);
  });
  it("refuses the condition in words, and refuses nothing else", () => {
    const c = makeChar();
    R.add("vault", "feat", { name: "Clean Blood", grants: [{ op: "effect", effects: { conditionImmune: ["poisoned"] } }] }, { path: "cb.md" });
    const c2 = makeChar({ feats: ["clean-blood"] });
    const no = act(c2, { type: "condition", id: "poisoned", level: 1 }, R);
    expect(no.error).toBe("Can't be poisoned: Feat: Clean Blood protects against it.");
    expect(no.value).toBe(c2);
    expect(act(c2, { type: "condition", id: "frightened", level: 1 }, R).value.conditions.frightened).toBe(1);
    expect(act(c, { type: "condition", id: "poisoned", level: 1 }, R).value.conditions.poisoned).toBe(1);
  });
  it("a toggle can grant it: Mindless Rage style", () => {
    const r = mechanicsRegistry();
    r.add("vault", "feat", { name: "Calm", grants: [{ op: "effect", effects: { conditionImmune: ["frightened"], while: ["toggle:fury"] } }] }, { path: "calm.md" });
    const off = makeChar({ feats: ["calm"] }), on = makeChar({ feats: ["calm"], active: { fury: true } });
    expect(act(off, { type: "condition", id: "frightened", level: 1 }, r).error).toBeUndefined();
    expect(act(on, { type: "condition", id: "frightened", level: 1 }, r).error).toMatch(/Calm protects/);
  });
  it("says it in words", () => expect(describeEffects({ conditionImmune: ["poisoned", "frightened"] })).toBe("Can't be poisoned or frightened"));
});
