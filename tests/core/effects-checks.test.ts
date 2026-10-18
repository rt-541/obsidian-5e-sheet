import { validateEffects } from "../../src/content/types/effects";
import { parseNote } from "../../src/core/character";
import { rollD20 } from "../../src/core/dice";
import { d20Rules } from "../../src/core/effects";
import { spellRows } from "../../src/core/spells";
import { describeEffects } from "../../src/ui/widgets";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { carrier, derive, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";

const R = mechanicsRegistry();
const withFx = carrier(R);
const parse = (v: unknown) => { const e: string[] = []; return { out: validateEffects(v, "effects", e), e }; };
const lvl5 = { classes: [{ class: "tester", level: 5 }] };   // proficiency +3
const skill = (s: ReturnType<typeof withFx>, id: string) => s.skills.find(k => k.id === id)!;
/** A d20 that lands on `n`, then on each following value. */
const dieSeq = (...ns: number[]) => { let i = 0; return () => (ns[Math.min(i++, ns.length - 1)] - 1) / 20 + 0.001; };

describe("halfProf", () => {
  const jack = { halfProf: { on: ["check", "initiative"] } };
  it("is validated", () => {
    expect(parse(jack).out.halfProf).toEqual(jack.halfProf);
    expect(parse({ halfProf: { on: ["check"], roundUp: true } }).out.halfProf).toEqual({ on: ["check"], roundUp: true });
    const bad = parse({ halfProf: { on: ["nope"], roundUp: "yes" } });
    expect(bad.e.join("\n")).toMatch(/halfProf.on/); expect(bad.e.join("\n")).toMatch(/halfProf.roundUp/);
    expect(parse({ halfProf: "all" }).e.join()).toMatch(/halfProf: must be/);
  });
  const base = derive(makeChar({ ...lvl5, proficiencies: { saves: ["str"], skills: ["athletics"], expertise: ["stealth"] } }), R);
  const jack5 = withFx(jack, { ...lvl5, proficiencies: { saves: ["str"], skills: ["athletics"], expertise: ["stealth"] } });
  it("adds half the proficiency bonus (rounded down) to skills, ability checks and initiative the character is not trained in", () => {
    expect(skill(jack5, "arcana").mod).toBe(skill(base, "arcana").mod + 1);
    expect(jack5.checks.dex).toBe(base.checks.dex + 1);
    expect(jack5.initiative).toBe(base.initiative + 1);
  });
  it("leaves trained skills, expertise and saving throws alone", () => {
    expect(skill(jack5, "athletics").mod).toBe(skill(base, "athletics").mod);
    expect(skill(jack5, "stealth").mod).toBe(skill(base, "stealth").mod);
    expect(jack5.saves.str.mod).toBe(base.saves.str.mod); expect(jack5.saves.dex.mod).toBe(base.saves.dex.mod);
  });
  it("passive scores follow", () => {
    expect(jack5.passives.perception).toBe(base.passives.perception + 1);
  });
  it("rounds up when asked: proficiency +3 gives +2", () => {
    const s = withFx({ halfProf: { on: ["check"], roundUp: true } }, lvl5);
    expect(skill(s, "arcana").mod).toBe(skill(base, "arcana").mod + 2);
    expect(s.initiative).toBe(base.initiative + 2);
  });
  it("only the checks it names: Strength, Dexterity and Constitution (Remarkable Athlete)", () => {
    const s = withFx({ halfProf: { on: ["check:str", "check:dex", "check:con"], roundUp: true } }, lvl5);
    expect(skill(s, "acrobatics").mod).toBe(skill(base, "acrobatics").mod + 2);
    expect(skill(s, "arcana").mod).toBe(skill(base, "arcana").mod);
    expect(s.checks.str).toBe(base.checks.str + 2); expect(s.checks.int).toBe(base.checks.int);
    expect(s.initiative).toBe(base.initiative + 2);
  });
  it("two sources do not add up: the larger one counts", () => {
    R.add("vault", "feat", { name: "Half Plus", grants: [{ op: "effect", effects: { halfProf: { on: ["check"], roundUp: true } } }] }, { path: "hp.md" });
    expect(skill(withFx(jack, { ...lvl5, feats: ["half-plus"] }), "arcana").mod).toBe(skill(base, "arcana").mod + 2);
  });
  it("proficiency 2 rounds down to +1 either way", () => {
    expect(skill(withFx(jack), "arcana").mod).toBe(skill(derive(makeChar(), R), "arcana").mod + 1);
  });
  it("says it in words", () => {
    expect(describeEffects(jack)).toBe("Half your proficiency bonus on ability checks and initiative you are not proficient in");
    expect(describeEffects({ halfProf: { on: ["check:str"], roundUp: true } })).toBe("Half your proficiency bonus (rounded up) on Strength checks you are not proficient in");
  });
});

describe("d20Rule", () => {
  it("is validated", () => {
    expect(parse({ d20Rule: [{ on: "check", min: 10, proficient: true }, { on: "attack", reroll: 1 }] }).out.d20Rule).toEqual([{ on: "check", min: 10, proficient: true }, { on: "attack", reroll: 1 }]);
    const bad = parse({ d20Rule: [{ on: "nope", min: 1, reroll: 20, proficient: "y" }, { on: "check" }] });
    for (const m of ["d20Rule\\[0\\].on", "d20Rule\\[0\\].min", "d20Rule\\[0\\].reroll", "d20Rule\\[0\\].proficient", "d20Rule\\[1\\]: give min or reroll"]) expect(bad.e.join("\n")).toMatch(new RegExp(m));
  });
  describe("in the roll", () => {
    it("a die below the minimum counts as the minimum, and the log says so", () => {
      const r = rollD20({ title: "Arcana", mod: 3, mode: "normal", rng: dieSeq(4), min: 10, ruleNotes: ["Reliable Talent"] });
      expect(r.total).toBe(13); expect(r.natural).toBe(10); expect(r.dice).toEqual([4]);
      expect(r.detail).toBe("d20(10) (4 counts as 10: Reliable Talent) +3");
    });
    it("a die at or above the minimum is untouched", () => {
      expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: dieSeq(12), min: 10 }).total).toBe(12);
    });
    it("a low die is rolled again once and the new roll is kept, even when it is worse", () => {
      const r = rollD20({ title: "Attack", mod: 5, mode: "normal", rng: dieSeq(1, 14), reroll: 1, ruleNotes: ["Lucky"] });
      expect(r.total).toBe(19); expect(r.detail).toBe("d20(14) (rerolled 1->14: Lucky) +5");
      expect(rollD20({ title: "Attack", mod: 0, mode: "normal", rng: dieSeq(1, 1, 18), reroll: 1 }).natural).toBe(1);   // the second roll is final
    });
    it("with advantage every die is rerolled on its own", () => {
      const r = rollD20({ title: "x", mod: 0, mode: "adv", rng: dieSeq(1, 15, 2, 9), reroll: 2 });
      expect(r.dice).toEqual([15, 9]); expect(r.natural).toBe(15);
    });
    it("a minimum cannot make a natural 20 or a crit; it is for low dice", () => {
      const r = rollD20({ title: "x", mod: 0, mode: "normal", rng: dieSeq(20), min: 10 });
      expect(r.total).toBe(20); expect(r.crit).toBe(true);
    });
    it("fumble: a minimum of 2 or more means a 1 never counts as a fumble", () => {
      expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: dieSeq(1), min: 10 }).fumble).toBe(false);
      expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: dieSeq(1) }).fumble).toBe(true);
    });
  });
  describe("which rolls", () => {
    const reliable = { d20Rule: [{ on: "check", min: 10, proficient: true }] };
    const s = withFx(reliable);
    it("proficient: only for skills the character is trained in", () => {
      expect(d20Rules(s.effects, { kind: "skill", abil: "int", skill: "arcana" }, true)).toMatchObject({ min: 10 });
      expect(d20Rules(s.effects, { kind: "skill", abil: "int", skill: "arcana" }, false)).toEqual({ notes: [] });
    });
    it("only the roll kinds its tag names", () => {
      expect(d20Rules(s.effects, { kind: "save", abil: "dex" }, true)).toEqual({ notes: [] });
      expect(d20Rules(s.effects, { kind: "attack" }, true)).toEqual({ notes: [] });
    });
    it("the biggest minimum and reroll from several sources win, and the sources are named", () => {
      R.add("vault", "feat", { name: "Lucky Foot", grants: [{ op: "effect", effects: { d20Rule: [{ on: "check", min: 8, reroll: 2 }] } }] }, { path: "lf.md" });
      const t = withFx({ d20Rule: [{ on: "check", min: 10 }, { on: "skill:arcana", reroll: 1 }] }, { feats: ["lucky-foot"] });
      expect(d20Rules(t.effects, { kind: "skill", abil: "int", skill: "arcana" }, false)).toEqual({ min: 10, reroll: 2, notes: expect.arrayContaining(["Feat: Lucky Foot"]) });
    });
    it("a gate keeps it off until the toggle is on", () => {
      const g = { d20Rule: [{ on: "check", min: 10 }], while: ["toggle:fury"] };
      expect(withFx(g).effects.some(x => x.effects.d20Rule)).toBe(false);
      expect(withFx(g, { active: { fury: true } }).effects.some(x => x.effects.d20Rule)).toBe(true);
    });
  });
  describe("on the sheet", () => {
    const rolls = (effects: object, feats: object, target: Parameters<SheetController["roll"]>[2], rng: () => number) => {
      const r = mechanicsRegistry();
      r.add("vault", "feat", { name: "Rule Giver", grants: [{ op: "effect", effects }] }, { path: "rg.md" });
      const log: never[] = [], host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log, rng };
      const p = parseNote({ ...tester, feats: ["rule-giver"], ...feats });
      if (p.kind !== "character") throw new Error();
      return new SheetController(host, p).roll("Arcana", 0, target, {});
    };
    const reliable = { d20Rule: [{ on: "check", min: 10, proficient: true }] };
    it("Reliable Talent lifts a trained skill's low die to 10", () => {
      const skills = { proficiencies: { saves: [], skills: ["arcana"], expertise: [] } };
      expect(rolls(reliable, skills, { kind: "skill", abil: "int", skill: "arcana" }, dieSeq(3)).total).toBe(10);
      expect(rolls(reliable, {}, { kind: "skill", abil: "int", skill: "arcana" }, dieSeq(3)).total).toBe(3);
      expect(rolls(reliable, {}, { kind: "save", abil: "int" }, dieSeq(3)).total).toBe(3);
    });
    it("expertise counts as trained", () => {
      const ex = { proficiencies: { saves: [], skills: [], expertise: ["arcana"] } };
      expect(rolls(reliable, ex, { kind: "skill", abil: "int", skill: "arcana" }, dieSeq(3)).total).toBe(10);
    });
    it("Halfling Lucky rerolls a 1 on any d20", () => {
      const lucky = { d20Rule: [{ on: "attack", reroll: 1 }, { on: "check", reroll: 1 }, { on: "save", reroll: 1 }] };
      expect(rolls(lucky, {}, { kind: "save", abil: "dex" }, dieSeq(1, 12)).total).toBe(12);
    });
  });
  it("says it in words", () => {
    expect(describeEffects({ d20Rule: [{ on: "check", min: 10, proficient: true }] })).toBe("A d20 roll of 9 or lower counts as 10 on ability checks you are proficient in");
    expect(describeEffects({ d20Rule: [{ on: "save", reroll: 1 }] })).toBe("Reroll a d20 of 1 or lower once on saves");
  });
});

describe("spellDamage", () => {
  const own = (effects: object, spells: string[], o: object = {}) => {
    const s = withFx(effects, { spells: spells.map(id => ({ id, prepared: true })), ...o });
    const c = makeChar({ spells: spells.map(id => ({ id, prepared: true })), ...o });
    return spellRows(c, s, { registry: R }).own;
  };
  const dmg = (rows: ReturnType<typeof own>, id: string) => rows.find(r => r.id === id)!.damage;
  it("is validated", () => {
    expect(parse({ spellDamage: [{ spell: "eldritch-blast", add: "cha", perBeam: true }, { school: "evocation", level: 0, damageType: ["fire"], class: "wizard", add: "1d4" }] }).out.spellDamage)
      .toEqual([{ spell: "eldritch-blast", add: "cha", perBeam: true }, { school: "evocation", level: 0, damageType: ["fire"], class: "wizard", add: "1d4" }]);
    const bad = parse({ spellDamage: [{ add: "1 +", level: 12, damageType: [], perBeam: "all", spell: 3 }] });
    for (const k of ["add", "level", "damageType", "perBeam", "spell"]) expect(bad.e.join("\n")).toContain(`spellDamage[0].${k}`);
  });
  it("Agonizing Blast: the ability modifier is added to each beam", () => {
    const fx = { spellDamage: [{ spell: "eldritch-blast", add: "cha", perBeam: true }] };
    const cha = { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 18 } };
    expect(dmg(own(fx, ["eldritch-blast"], cha), "eldritch-blast")).toBe("1d10 + 4");
    expect(dmg(own(fx, ["eldritch-blast"], { ...cha, classes: [{ class: "tester", level: 5 }] }), "eldritch-blast")).toBe("1d10 + 8");
    expect(dmg(own(fx, ["eldritch-blast"], { ...cha, classes: [{ class: "tester", level: 11 }] }), "eldritch-blast")).toBe("1d10 + 12");
    expect(dmg(own(fx, ["eldritch-blast"], { ...cha, classes: [{ class: "tester", level: 17 }] }), "eldritch-blast")).toBe("1d10 + 16");
  });
  it("without perBeam it is added once", () => {
    expect(dmg(own({ spellDamage: [{ spell: "eldritch-blast", add: 2 }] }, ["eldritch-blast"], { classes: [{ class: "tester", level: 5 }] }), "eldritch-blast")).toBe("1d10 + 2");
  });
  it("dice can be added, and beams multiply the dice count", () => {
    expect(dmg(own({ spellDamage: [{ spell: "eldritch-blast", add: "1d4", perBeam: true }] }, ["eldritch-blast"], { classes: [{ class: "tester", level: 5 }] }), "eldritch-blast")).toBe("1d10 + 2d4");
  });
  it("only the spells it names: by school, level, damage type and class", () => {
    const rows = (fx: object) => own({ spellDamage: [fx] }, ["fire-bolt", "fireball", "eldritch-blast", "magic-missile"]);
    expect(dmg(rows({ school: "evocation", add: 1 }), "fireball")).toBe("8d6 + 1");
    expect(dmg(rows({ level: 0, add: 1 }), "fire-bolt")).toBe("1d10 + 1");
    expect(dmg(rows({ level: 0, add: 1 }), "fireball")).toBe("8d6");
    expect(dmg(rows({ damageType: ["fire", "cold"], add: 2 }), "fireball")).toBe("8d6 + 2");
    expect(dmg(rows({ damageType: ["fire", "cold"], add: 2 }), "eldritch-blast")).toBe("1d10");
    expect(dmg(rows({ class: "wizard", add: 1 }), "fireball")).toBe("8d6 + 1");
    expect(dmg(rows({ class: "warlock", add: 1 }), "fireball")).toBe("8d6");
    expect(dmg(rows({ spell: "magic-missile", add: 1 }), "magic-missile")).toBe("3d4+3 + 1");
  });
  it("a formula can use proficiency and level", () => {
    expect(dmg(own({ spellDamage: [{ spell: "fire-bolt", add: "prof + floor(level / 5)" }] }, ["fire-bolt"], { classes: [{ class: "tester", level: 5 }] }), "fire-bolt")).toBe("2d10 + 4");
  });
  it("healing and spells without damage are untouched", () => {
    const rows = own({ spellDamage: [{ add: 5 }] }, ["cure-wounds"]);
    expect(rows.find(r => r.id === "cure-wounds")!.damage).toBeUndefined();
  });
  it("a gate keeps it off", () => {
    expect(dmg(own({ spellDamage: [{ spell: "fire-bolt", add: 1 }], while: ["toggle:fury"] }, ["fire-bolt"]), "fire-bolt")).toBe("1d10");
    expect(dmg(own({ spellDamage: [{ spell: "fire-bolt", add: 1 }], while: ["toggle:fury"] }, ["fire-bolt"], { active: { fury: true } }), "fire-bolt")).toBe("1d10 + 1");
  });
  it("says it in words", () => {
    expect(describeEffects({ spellDamage: [{ spell: "eldritch-blast", add: "cha", perBeam: true }] })).toBe("Extra cha damage on Eldritch Blast (for each beam)");
    expect(describeEffects({ spellDamage: [{ level: 0, damageType: ["fire"], add: 1 }] })).toBe("Extra 1 damage on cantrips, fire spells");
  });
});

describe("roll tags", () => {
  it("concentration reaches only the save made to keep a spell", () => {
    const s = withFx({ modifiers: [{ target: "save", value: 2, on: "concentration" }] });
    const plain = derive(makeChar(), R);
    expect(s.concentrationSave).toBe(plain.concentrationSave + 2);
    expect(s.saves.con.mod).toBe(plain.saves.con.mod);
  });
  it("weapon tags aim at thrown, light, heavy, versatile and named weapons, and + joins them", () => {
    const atk = (on: string, ...ids: string[]) => withFx({ modifiers: [{ target: "attack", value: 1, on }] }, { inventory: ids.map(id => ({ id, equipped: true })) });
    const base = derive(makeChar({ inventory: [{ id: "dagger", equipped: true }, { id: "longsword", equipped: true }, { id: "greataxe", equipped: true }] }), R);
    const hit = (s: typeof base, n: string) => s.attacks.find(a => a.name === n)!.toHit;
    const s = atk("weapon:thrown", "dagger", "longsword", "greataxe");
    expect(hit(s, "Dagger")).toBe(hit(base, "Dagger")! + 1); expect(hit(s, "Longsword")).toBe(hit(base, "Longsword"));
    const heavy = atk("weapon:heavy", "dagger", "longsword", "greataxe");
    expect(hit(heavy, "Greataxe")).toBe(hit(base, "Greataxe")! + 1); expect(hit(heavy, "Dagger")).toBe(hit(base, "Dagger"));
    const vers = atk("weapon:versatile", "dagger", "longsword", "greataxe");
    expect(hit(vers, "Longsword")).toBe(hit(base, "Longsword")! + 1);
    const named = atk("weapon:greataxe", "dagger", "longsword", "greataxe");
    expect(hit(named, "Greataxe")).toBe(hit(base, "Greataxe")! + 1); expect(hit(named, "Longsword")).toBe(hit(base, "Longsword"));
    const both = atk("weapon:light+attack:melee", "dagger", "longsword", "greataxe");
    expect(hit(both, "Dagger")).toBe(hit(base, "Dagger")! + 1); expect(hit(both, "Longsword")).toBe(hit(base, "Longsword"));
  });
  it("unknown weapon and concentration tags are rejected where tags are used", () => {
    expect(parse({ modifiers: [{ target: "damage", value: 1, on: "weapon:Heavy!" }] }).e.join()).toMatch(/unknown roll tag/);
    expect(parse({ modifiers: [{ target: "save", value: 1, on: "concentration:x" }] }).e.join()).toMatch(/unknown roll tag/);
    expect(parse({ modifiers: [{ target: "save", value: 1, on: "concentration" }] }).e).toEqual([]);
  });
});
