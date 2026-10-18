import { validateEffects } from "../../src/content/types/effects";
import { critDamageOf } from "../../src/core/dice";
import { describeEffects } from "../../src/ui/widgets";
import { carrier, mechanicsRegistry } from "../fixtures/mechanics";

const R = mechanicsRegistry();
const withFx = carrier(R);
const parse = (v: unknown) => { const e: string[] = []; return { out: validateEffects(v, "effects", e), e }; };
const row = (s: ReturnType<typeof withFx>, name: string) => s.attacks.find(a => a.name === name)!;
const inv = (...ids: string[]) => ({ inventory: ids.map(id => ({ id, equipped: true })) });
// A Monk-like 5th level character: Dex 18, Wis 16, proficiency +3 (character level 5 in the test class)
const monk = { abilities: { str: 10, dex: 18, con: 14, int: 10, wis: 16, cha: 8 }, classes: [{ class: "tester", level: 5 }] };
const MARTIAL = [{ op: "scale", name: "Martial Arts Die", values: { 1: "1d4", 5: "1d6", 11: "1d8" } }];

describe("the built-in Unarmed Strike", () => {
  it("every character has one: 1 + Strength modifier, proficient", () => {
    const s = withFx({}, { abilities: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    expect(row(s, "Unarmed Strike")).toMatchObject({ toHit: 5, damage: "4 bludgeoning", target: { kind: "attack", abil: "str", range: "melee", tags: ["unarmed"] } });
    expect(row(s, "Unarmed Strike").critDamage).toBeUndefined();
  });
  it("a weak character still does no less than 0", () => {
    expect(row(withFx({}, { abilities: { str: 1, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }), "Unarmed Strike").damage).toBe("0 bludgeoning");
  });
});

describe("weaponRule", () => {
  const rule = { weaponRule: [{ match: ["monk", "unarmed"], abils: ["dex"], die: "{martial-arts-die}" }] };
  it("is validated", () => {
    expect(parse(rule).out.weaponRule).toEqual(rule.weaponRule);
    const bad = parse({ weaponRule: [{ match: [], abils: ["luck"], die: "big" }, { match: ["monk"] }, { match: ["Monk!"], magical: "yes" }, "x"] });
    const text = bad.e.join("\n");
    expect(text).toMatch(/weaponRule\[0\].match/); expect(text).toMatch(/weaponRule\[0\].abils/); expect(text).toMatch(/weaponRule\[0\].die/);
    expect(text).toMatch(/weaponRule\[1\]: change something/); expect(text).toMatch(/weaponRule\[2\].match/); expect(text).toMatch(/weaponRule\[2\].magical/); expect(text).toMatch(/weaponRule\[3\]: must be a mapping/);
    expect(bad.out.weaponRule).toBeUndefined();
  });
  it("Martial Arts: unarmed strikes use Dex and the martial arts die", () => {
    const s = withFx(rule, monk, MARTIAL);
    expect(row(s, "Unarmed Strike")).toMatchObject({ toHit: 4 + 3, damage: "1d6+4 bludgeoning", critDamage: "2d6+4 bludgeoning", target: { abil: "dex" } });
  });
  it("monk weapons (shortsword and simple melee weapons without two-handed or heavy) use it too; other weapons do not", () => {
    const s = withFx({ weaponRule: [{ match: ["monk"], abils: ["dex"], die: "{martial-arts-die}" }] }, { ...monk, ...inv("shortsword", "quarterstaff", "greataxe", "longsword") }, MARTIAL);
    expect(row(s, "Shortsword").damage).toBe("1d6+4 piercing");
    expect(row(s, "Quarterstaff")).toMatchObject({ damage: "1d6+4 bludgeoning", target: { abil: "dex" } });   // the staff is a Strength weapon, the rule lets it use Dex
    expect(row(s, "Longsword")).toMatchObject({ target: { abil: "str" }, damage: "1d8 slashing" });
    expect(row(s, "Greataxe")).toMatchObject({ target: { abil: "str" }, damage: "1d12 slashing" });
  });
  it("the larger die wins, in both directions", () => {
    const s = withFx({ weaponRule: [{ match: ["all"], die: "1d6" }] }, inv("longsword", "dagger"));
    expect(row(s, "Longsword").damage).toBe("1d8+3 slashing");
    expect(row(s, "Dagger").damage).toBe("1d6+3 piercing");
  });
  it("a die that grows with the scale (martial arts at level 11)", () => {
    expect(row(withFx(rule, { ...monk, classes: [{ class: "tester", level: 11 }] }, MARTIAL), "Unarmed Strike").damage).toBe("1d8+4 bludgeoning");
  });
  it("matches a weapon by its id or one of its properties", () => {
    const s = withFx({ weaponRule: [{ match: ["light"], abils: ["dex"] }, { match: ["longsword"], die: "2d6" }] }, { ...monk, ...inv("handaxe", "longsword") });
    expect(row(s, "Handaxe").target.abil).toBe("dex");
    expect(row(s, "Longsword")).toMatchObject({ target: { abil: "str" } });
    expect(row(s, "Longsword").damage).toBe("2d6 slashing");
  });
  it("magical tags the row so weapon:magic rules reach it", () => {
    const s = withFx({ weaponRule: [{ match: ["unarmed"], magical: true }], modifiers: [{ target: "damage", value: 2, on: "weapon:magic" }] });
    expect(row(s, "Unarmed Strike").damage).toBe("6 bludgeoning");
    expect(row(withFx({ modifiers: [{ target: "damage", value: 2, on: "weapon:magic" }] }), "Unarmed Strike").damage).toBe("4 bludgeoning");
  });
  it("a damage modifier can be aimed at unarmed strikes", () => {
    expect(row(withFx({ modifiers: [{ target: "damage", value: 1, on: "weapon:unarmed" }] }, inv("longsword")), "Unarmed Strike").damage).toBe("5 bludgeoning");
    expect(row(withFx({ modifiers: [{ target: "damage", value: 1, on: "weapon:unarmed" }] }, inv("longsword")), "Longsword").damage).toBe("1d8+3 slashing");
  });
  it("a note shows on the matching attacks, with where it came from", () => {
    expect(row(withFx({ weaponRule: [{ match: ["unarmed"], die: "1d4", note: "Tavern brawling" }] }), "Unarmed Strike").note).toMatch(/carrier-\d+: Tavern brawling/);
  });
  it("two light weapons in hand add an off-hand attack with no positive ability modifier", () => {
    const s = withFx({}, inv("dagger", "handaxe"));
    expect(row(s, "Handaxe (off-hand)")).toMatchObject({ damage: "1d6 slashing", target: { tags: expect.arrayContaining(["offhand", "handaxe", "light"]) } });
    expect(row(s, "Handaxe").damage).toBe("1d6+3 slashing");
    expect(row(s, "Handaxe (off-hand)").note).toMatch(/Bonus action/);
  });
  it("Two-Weapon Fighting (addMod) puts the modifier back on the off-hand attack", () => {
    const s = withFx({ weaponRule: [{ match: ["offhand"], addMod: true }] }, inv("dagger", "handaxe"));
    expect(row(s, "Handaxe (off-hand)").damage).toBe("1d6+3 slashing");
    expect(row(s, "Dagger").damage).toBe("1d4+3 piercing");
  });
  it("a negative modifier still applies to the off-hand attack", () => {
    const s = withFx({}, { ...inv("dagger", "handaxe"), abilities: { str: 6, dex: 6, con: 10, int: 10, wis: 10, cha: 10 } });
    expect(row(s, "Handaxe (off-hand)").damage).toBe("1d6-2 slashing");
  });
  it("no off-hand attack for one weapon, or for a heavy or non-light pair", () => {
    expect(withFx({}, inv("handaxe")).attacks.map(a => a.name)).toEqual(["Handaxe", "Unarmed Strike"]);
    expect(withFx({}, inv("longsword", "handaxe")).attacks.map(a => a.name)).toEqual(["Longsword", "Handaxe", "Unarmed Strike"]);
  });
  it("says it in words", () => {
    expect(describeEffects({ weaponRule: [{ match: ["monk", "unarmed"], abils: ["dex"], die: "{martial-arts-die}" }] })).toBe("monk weapons and unarmed strikes: use Dexterity if it is better, damage die is at least your martial arts die");
    expect(describeEffects({ weaponRule: [{ match: ["offhand"], addMod: true }] })).toBe("off-hand attacks: add your ability modifier to damage");
  });
});

describe("weapons (natural and feature weapons)", () => {
  const bite = { weapons: [{ name: "Bite", dmg: "1d6", type: "piercing", ab: "str" as const }] };
  it("is validated", () => {
    expect(parse({ weapons: [{ name: "Claws", dmg: "1d4", type: "slashing", ab: ["str", "dex"], range: "melee", bonus: "prof", tag: "natural" }] }).out.weapons)
      .toEqual([{ name: "Claws", dmg: "1d4", type: "slashing", ab: ["str", "dex"], range: "melee", bonus: "prof", tag: "natural" }]);
    const bad = parse({ weapons: [{ dmg: "big", type: "", ab: "luck", range: "far", bonus: "1 +", tag: "No Way" }] });
    const text = bad.e.join("\n");
    for (const k of ["name", "dmg", "type", "ab", "range", "bonus", "tag"]) expect(text).toContain(`weapons[0].${k}`);
    expect(bad.out.weapons).toBeUndefined();
  });
  it("adds an attack row built like a weapon: proficient, ability modifier, scoped bonuses", () => {
    const s = withFx(bite);
    expect(row(s, "Bite")).toMatchObject({ toHit: 3 + 2, damage: "1d6+3 piercing", critDamage: "2d6+3 piercing", target: { kind: "attack", abil: "str", range: "melee", tags: ["bite"] } });
    expect(row(withFx({ ...bite, modifiers: [{ target: "attack", value: 1, on: "weapon:bite" }] }), "Bite").toHit).toBe(6);
  });
  it("the best of several abilities, finesse, a ranged weapon, a bonus formula and a tag", () => {
    const s = withFx({ weapons: [{ name: "Spit", dmg: "1d4", type: "acid", ab: ["con", "dex"], range: "ranged", bonus: "prof", tag: "breath" }, { name: "Claws", dmg: "1d4", type: "slashing", ab: "finesse" }] },
      { abilities: { str: 8, dex: 12, con: 18, int: 10, wis: 10, cha: 10 } });
    expect(row(s, "Spit")).toMatchObject({ target: { abil: "con", range: "ranged", tags: ["spit", "breath"] }, toHit: 4 + 2 + 2, damage: "1d4+6 acid" });
    expect(row(s, "Claws").target.abil).toBe("dex");
  });
  it("the damage can be a scale", () => {
    const s = withFx({ weapons: [{ name: "Psychic Blade", dmg: "{blade-die}", type: "psychic", ab: "dex" }] }, {}, [{ op: "scale", name: "Blade Die", values: { 1: "1d6" } }]);
    expect(row(s, "Psychic Blade").damage).toBe("1d6+2 psychic");
  });
  it("the same name from two sources is one attack", () => {
    R.add("vault", "feat", { name: "Second Bite", grants: [{ op: "effect", effects: bite }] }, { path: "sb.md" });
    expect(withFx(bite, { feats: ["second-bite"] }).attacks.filter(a => a.name === "Bite")).toHaveLength(1);
  });
  it("only while its gate holds (a beast shape toggle)", () => {
    const fx = { ...bite, while: ["toggle:fury"] };
    expect(withFx(fx).attacks.some(a => a.name === "Bite")).toBe(false);
    expect(withFx(fx, { active: { fury: true } }).attacks.some(a => a.name === "Bite")).toBe(true);
  });
  it("says it in words", () => expect(describeEffects(bite)).toBe("Attack: Bite 1d6 piercing (melee, Strength)"));
});

describe("extraDamage", () => {
  it("is validated", () => {
    expect(parse({ extraDamage: [{ dice: "1d8", type: "radiant", on: "attack:melee", per: "turn", note: "Smite" }, { dice: "prof", type: "weapon" }] }).out.extraDamage)
      .toEqual([{ dice: "1d8", type: "radiant", on: "attack:melee", per: "turn", note: "Smite" }, { dice: "prof", type: "weapon" }]);
    const bad = parse({ extraDamage: [{ dice: "lots +", type: 3, on: "nope", per: "often", note: 1 }] });
    for (const k of ["dice", "type", "on", "per", "note"]) expect(bad.e.join("\n")).toContain(`extraDamage[0].${k}`);
  });
  it("is appended to every matching attack row", () => {
    const s = withFx({ extraDamage: [{ dice: "1d6", type: "fire", on: "attack:melee" }] }, inv("longsword", "shortbow"));
    expect(row(s, "Longsword").damage).toBe("1d8+3 slashing + 1d6 fire");
    expect(row(s, "Shortbow").damage).toBe("1d6+2 piercing");
    expect(row(s, "Unarmed Strike").damage).toBe("4 bludgeoning + 1d6 fire");
  });
  it("with no tag it applies to every row, and `weapon` uses the damage type of the weapon hit", () => {
    const s = withFx({ extraDamage: [{ dice: "1d4", type: "weapon" }] }, inv("longsword"));
    expect(row(s, "Longsword").damage).toBe("1d8+3 slashing + 1d4 slashing");
  });
  it("a tag can aim it: only unarmed strikes, or only a named weapon", () => {
    const s = withFx({ extraDamage: [{ dice: "2", type: "force", on: "weapon:unarmed" }] }, inv("longsword"));
    expect(row(s, "Unarmed Strike").damage).toBe("4 bludgeoning + 2 force"); expect(row(s, "Longsword").damage).toBe("1d8+3 slashing");
  });
  it("a formula such as prof is worked out to a number; a {scale} is filled in", () => {
    const s = withFx({ extraDamage: [{ dice: "prof", type: "necrotic", on: "weapon:longsword" }, { dice: "{smite-die}", type: "radiant", on: "weapon:longsword" }] }, inv("longsword"), [{ op: "scale", name: "Smite Die", values: { 1: "2d8" } }]);
    expect(row(s, "Longsword").damage).toBe("1d8+3 slashing + 2 necrotic + 2d8 radiant");
  });
  it("once per turn and notes show on the attack", () => {
    const s = withFx({ extraDamage: [{ dice: "1d8", type: "radiant", per: "turn", note: "Divine Strike" }] }, inv("longsword"));
    expect(row(s, "Longsword").note).toMatch(/the extra damage applies once per turn\. .*Divine Strike/);
    expect(row(s, "Longsword").damage).toBe("1d8+3 slashing + 1d8 radiant");
  });
  it("the extra dice are doubled on a critical hit", () => {
    expect(row(withFx({ extraDamage: [{ dice: "1d6", type: "fire" }] }, inv("longsword")), "Longsword").critDamage).toBe("2d8+3 slashing + 2d6 fire");
  });
  it("a roll that cannot be worked out is reported and left off", () => {
    const s = withFx({ extraDamage: [{ dice: "mystery", type: "fire" }] }, inv("longsword"));
    expect(row(s, "Longsword").damage).toBe("1d8+3 slashing"); expect(s.progress.problems.join()).toMatch(/extra damage mystery cannot be worked out/);
  });
  it("an item's own extra damage and an effect's extra damage both show", () => {
    R.add("vault", "item", { name: "Flame Tongue", kind: "weapon", weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee", extraDamage: "2d6 fire" }, attunement: false }, { path: "ft.md" });
    expect(row(withFx({ extraDamage: [{ dice: "1d4", type: "cold" }] }, inv("flame-tongue")), "Flame Tongue").damage).toBe("1d8+3 slashing + 2d6 fire + 1d4 cold");
  });
  it("says it in words", () => {
    expect(describeEffects({ extraDamage: [{ dice: "1d8", type: "radiant", on: "attack:melee", per: "turn" }] })).toBe("Extra 1d8 radiant damage on melee attacks, once per turn");
    expect(describeEffects({ extraDamage: [{ dice: "prof", type: "weapon" }] })).toBe("Extra prof damage on weapon attacks");
  });
});

describe("critDice", () => {
  it("is validated", () => {
    expect(parse({ critDice: [{ extra: 1 }, { extra: "floor(level / 5)", on: "attack:melee" }] }).out.critDice).toEqual([{ extra: 1 }, { extra: "floor(level / 5)", on: "attack:melee" }]);
    const bad = parse({ critDice: [{ extra: "1 +", on: "nope" }, 3] });
    expect(bad.e.join("\n")).toMatch(/critDice\[0\].extra/); expect(bad.e.join("\n")).toMatch(/critDice\[0\].on/); expect(bad.e.join("\n")).toMatch(/critDice\[1\]: must be a mapping/);
  });
  it("adds weapon dice to the critical hit damage", () => {
    const s = withFx({ critDice: [{ extra: 1 }] }, inv("longsword", "greataxe"));
    expect(row(s, "Longsword")).toMatchObject({ damage: "1d8+3 slashing", critDamage: "3d8+3 slashing" });
    expect(row(s, "Greataxe").critDamage).toBe("3d12+3 slashing");
  });
  it("sums across sources and works out formulas", () => {
    R.add("vault", "feat", { name: "Savage", grants: [{ op: "effect", effects: { critDice: [{ extra: 1 }] } }] }, { path: "sv.md" });
    const s = withFx({ critDice: [{ extra: "floor(level / 5)" }] }, { ...inv("longsword"), classes: [{ class: "tester", level: 10 }], feats: ["savage"] });
    expect(row(s, "Longsword").critDamage).toBe("5d8+3 slashing");
  });
  it("only on the rows its tag names", () => {
    const s = withFx({ critDice: [{ extra: 1, on: "attack:melee" }] }, inv("longsword", "shortbow"));
    expect(row(s, "Longsword").critDamage).toBe("3d8+3 slashing"); expect(row(s, "Shortbow").critDamage).toBe("2d6+2 piercing");
  });
  it("extra dice are weapon dice: a flat unarmed strike gets none", () => {
    expect(row(withFx({ critDice: [{ extra: 2 }] }), "Unarmed Strike").critDamage).toBeUndefined();
  });
  it("says it in words", () => {
    expect(describeEffects({ critDice: [{ extra: 1, on: "attack:melee" }] })).toBe("Critical hits roll 1 extra weapon damage die on melee attacks");
    expect(describeEffects({ critDice: [{ extra: 2 }] })).toBe("Critical hits roll 2 extra weapon damage dice");
  });
});

describe("critDamageOf", () => {
  it("doubles every die count and keeps flat numbers", () => {
    expect(critDamageOf("1d8+3 slashing")).toBe("2d8+3 slashing");
    expect(critDamageOf("1d8+3 slashing + 2d6 fire + 2 force")).toBe("2d8+3 slashing + 4d6 fire + 2 force");
    expect(critDamageOf("1d8+3 slashing", 2)).toBe("4d8+3 slashing");
    expect(critDamageOf("5 bludgeoning")).toBeUndefined();
  });
});
