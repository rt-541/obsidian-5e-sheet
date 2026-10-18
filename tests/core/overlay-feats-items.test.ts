import { VaultLoader } from "../../src/content/vault-loader";
import { planResolve } from "../../src/core/levelup";
import { act, restLong } from "../fixtures/mechanics";
import { fakeVault, LIB_ROOT } from "../fixtures/library";
import { attack, feat, gear, homebrewFeat, pc, pcSub, put, srdRegistry, stats, subclass, switchOn } from "../fixtures/overlay";

const R = srdRegistry();
const withFeat = (name: string, features?: (string | Record<string, unknown>)[], extra: Record<string, unknown> = {}) => homebrewFeat(srdRegistry(), name, features, extra);

describe("built-in mechanics: feats", () => {
  it("39. Tough: twice your level in extra hit points", () => {
    const r = withFeat("Tough");
    expect(stats(pc("fighter", 3, {}, { feats: ["tough"] }), r).hp.max).toBe(26);
    expect(stats(pc("fighter", 5, {}, { feats: ["tough"] }), r).hp.max).toBe(30);
    expect(stats(pc("fighter", 5), r).hp.max).toBe(20);
  });

  it("40. Alert: +5 initiative", () => {
    const r = withFeat("Alert");
    const s = stats(pc("fighter", 1, { dex: 14 }, { feats: ["alert"] }), r);
    expect(s.initiative).toBe(2 + 5);
    expect(s.notes.map(n => n.text).join()).toMatch(/cannot be surprised/);
  });

  it("41. Mobile and Squat Nimbleness: more speed, and Squat Nimbleness asks for Acrobatics or Athletics", () => {
    const r = srdRegistry();
    homebrewFeat(r, "Mobile"); homebrewFeat(r, "Squat Nimbleness");
    expect(stats(pc("fighter", 1, {}, { feats: ["mobile"] }), r).speed.value).toBe(40);
    const squat = pc("fighter", 1, {}, { feats: ["squat-nimbleness"] });
    expect(stats(squat, r).speed.value).toBe(35);
    const pending = stats(squat, r).progress.pending.find(q => q.key === "feat:squat-nimbleness:ov-squat-nimbleness-skill")!;
    expect(pending.op).toMatchObject({ what: "skills", from: ["acrobatics", "athletics"], count: 1 });
    const picked = stats(pc("fighter", 1, {}, { feats: ["squat-nimbleness"], choices: { [pending.key]: ["athletics"] } }), r);
    expect(picked.progress.proficiencies.skills).toContain("athletics");
    expect(picked.progress.pending.map(q => q.key)).not.toContain(pending.key);
  });

  it("42. Observant: +5 to passive Perception and Investigation", () => {
    const r = withFeat("Observant");
    const base = stats(pc("fighter", 1, { wis: 14, int: 12 }), r), s = stats(pc("fighter", 1, { wis: 14, int: 12 }, { feats: ["observant"] }), r);
    expect(s.passives.perception).toBe(base.passives.perception + 5);
    expect(s.passives.investigation).toBe(base.passives.investigation + 5);
    expect(s.passives.insight).toBe(base.passives.insight);
  });

  it("43. Resilient: proficiency in the saving throw of the ability the player raised", () => {
    const r = withFeat("Resilient", undefined, { ability: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"], count: 1, amount: 1 } }] });
    const base = { feats: ["resilient"] };
    const picked = stats(pc("fighter", 1, { wis: 12 }, { ...base, choices: { "feat:resilient:ability": ["wis"] } }), r);
    expect(picked.saves.wis).toMatchObject({ prof: true, mod: 1 + 2 });
    const none = stats(pc("fighter", 1, { wis: 12 }, base), r);
    expect(none.saves.wis.prof).toBe(false);
    expect(none.progress.problems).toEqual([]);
  });

  it("44. Lucky: three luck points a day and a button to spend one", () => {
    const r = withFeat("Lucky");
    const s = stats(pc("fighter", 1, {}, { feats: ["lucky"] }), r);
    expect(s.resources.find(x => x.id === "luck-points")).toMatchObject({ max: 3, reset: "long" });
    expect(s.progress.features.find(f => f.name === "Lucky")!.action).toMatchObject({ name: "Luck Point", cost: { resource: "Luck Points" } });
    expect(s.progress.problems).toEqual([]);
  });

  it("45. Sharpshooter and Great Weapon Master: a switch for -5 to hit and +10 damage on the right weapons, kept through rests", () => {
    const r = srdRegistry();
    homebrewFeat(r, "Sharpshooter"); homebrewFeat(r, "Great Weapon Master");
    const archer = pc("fighter", 1, { dex: 16, str: 16 }, { feats: ["sharpshooter"], inventory: gear("longbow", "greataxe") });
    const off = stats(archer, r), on = stats(switchOn(archer, r, "power-attack-ss"), r);
    expect(attack(off, "Longbow")).toMatchObject({ toHit: 5, damage: "1d8+3 piercing" });
    expect(attack(on, "Longbow")).toMatchObject({ toHit: 0, damage: "1d8+13 piercing" });
    expect(attack(on, "Greataxe").toHit).toBe(attack(off, "Greataxe").toHit);
    const gwm = pc("fighter", 1, { str: 16, dex: 16 }, { feats: ["great-weapon-master"], inventory: gear("longbow", "greataxe", "longsword") });
    const g = stats(switchOn(gwm, r, "power-attack-gwm"), r);
    expect(attack(g, "Greataxe")).toMatchObject({ toHit: 0, damage: "1d12+13 slashing" });
    expect(attack(g, "Longsword").toHit).toBe(5);
    expect(attack(g, "Longbow").toHit).toBe(5);
    expect(restLong(switchOn(archer, r, "power-attack-ss"), r).value.active).toEqual({ "power-attack-ss": true });
  });

  it("46. Giant feats: Infernal Constitution, Ember of the Fire Giant, Fury of the Frost Giant", () => {
    const r = srdRegistry();
    for (const n of ["Infernal Constitution", "Ember of the Fire Giant", "Fury of the Frost Giant"]) homebrewFeat(r, n);
    const of = (f: string) => stats(pc("fighter", 5, {}, { feats: [f] }), r);
    expect(of("infernal-constitution").traits.resist).toEqual(["cold", "poison"]);
    expect(of("infernal-constitution").notes.map(n => n.text).join()).toMatch(/poisoned/);
    expect(of("ember-of-the-fire-giant").traits.resist).toEqual(["fire"]);
    expect(of("ember-of-the-fire-giant").resources.find(x => x.id === "searing-ignition")).toMatchObject({ max: 3, reset: "long" });
    expect(of("fury-of-the-frost-giant").traits.resist).toEqual(["cold"]);
    expect(of("fury-of-the-frost-giant").resources.find(x => x.id === "frigid-retaliation")).toMatchObject({ max: 3, reset: "long" });
  });

  it("47. Fighting Initiate, Eldritch Adept, Martial Adept and Metamagic Adept: a pick from the other class's list, and their resources", () => {
    const r = srdRegistry();
    for (const n of ["Fighting Initiate", "Eldritch Adept", "Martial Adept", "Metamagic Adept"]) homebrewFeat(r, n);
    const c = (f: string, choices: object = {}) => pc("fighter", 1, {}, { feats: [f], choices });
    const pend = (f: string) => stats(c(f), r).progress.pending.map(q => q.key);
    expect(pend("fighting-initiate")).toContain("feat:fighting-initiate:ov-fighting-initiate-style");
    expect(pend("eldritch-adept")).toContain("feat:eldritch-adept:ov-eldritch-adept-invocation");
    expect(pend("metamagic-adept")).toContain("feat:metamagic-adept:ov-metamagic-adept-options");
    // the fighting style the player picks works like the Fighter's own
    const step = planResolve(c("fighting-initiate"), r).find(x => x.key === "feat:fighting-initiate:ov-fighting-initiate-style")!;
    expect((step as { options: { id: string }[] }).options.map(o => o.id)).toContain("fighter-fighting-style-defense");
    const defensive = stats(pc("fighter", 1, { dex: 14 }, { feats: ["fighting-initiate"], inventory: gear("chain-mail"),
      choices: { "feat:fighting-initiate:ov-fighting-initiate-style": ["fighter-fighting-style-defense"] } }), r);
    expect(defensive.ac.value).toBe(17);
    expect(defensive.progress.pending.map(q => q.key)).not.toContain("feat:fighting-initiate:ov-fighting-initiate-style");
    const meta = stats(c("metamagic-adept", { "feat:metamagic-adept:ov-metamagic-adept-options": ["metamagic-careful-spell", "metamagic-quickened-spell"] }), r);
    expect(meta.progress.options["sorcerer:metamagic-1"]).toEqual(["metamagic-careful-spell", "metamagic-quickened-spell"]);
    expect(meta.resources.find(x => x.id === "sorcery-points-metamagic-adept")).toMatchObject({ max: 2, reset: "long" });
    // Martial Adept: the Superiority Die is there even when no maneuver list is loaded, and nothing is left hanging
    const martial = stats(c("martial-adept"), r);
    expect(martial.resources.find(x => x.id === "superiority-dice-martial-adept")).toMatchObject({ max: 1, reset: "short" });
    expect(martial.progress.pending.map(q => q.key)).not.toContain("feat:martial-adept:ov-martial-adept-maneuvers");
    expect(martial.progress.problems).toEqual([]);
  });
});

describe("built-in mechanics: Blood Hunter options and items", () => {
  const bloodHunter = (levels: Record<number, unknown[]>, options: Record<string, unknown[]> = {}) => {
    const r = srdRegistry();
    put(r, "class", { name: "Blood Hunter", hitDie: 10, ...(Object.keys(options).length ? { options } : {}), levels });
    return r;
  };

  it("48. Hybrid Transformation: Start spends the use; Strength advantage, resistances, Feral Might damage and a Predatory Strike", () => {
    const r = bloodHunter({ 1: [feat("Hunter's Bane")] });
    subclass(r, "Order of the Lycan", "blood-hunter", 3, ["Hybrid Transformation"]);
    const c = pcSub("blood-hunter", 3, "order-of-the-lycan", { str: 16 }, { inventory: gear("longsword") });
    const off = stats(c, r);
    expect(attack(off, "Longsword").damage).toBe("1d8+3 slashing");
    expect(off.attacks.map(a => a.name)).not.toContain("Predatory Strike");
    expect(off.resources.find(x => x.id === "hybrid-transformation")).toMatchObject({ max: 1, reset: "short" });
    const on = stats(switchOn(c, r, "hybrid"), r);
    expect(attack(on, "Longsword").damage).toBe("1d8+4 slashing");
    expect(attack(on, "Predatory Strike").damage).toBe("1d6+4 slashing");
    expect(on.traits.resist).toEqual(["nonmagical bludgeoning", "nonmagical piercing", "nonmagical slashing"]);
    expect(on.effects.find(e => e.source === "Hybrid Transformation")!.effects.adv).toEqual(["check:str", "save:str"]);
    expect(on.resources.find(x => x.id === "hybrid-transformation")!.used).toBe(1);
    expect(on.progress.problems).toEqual([]);
  });

  it("49. Crimson Rite: one rite at a time adds a Hemocraft die of its damage type to weapon hits", () => {
    const r = bloodHunter({ 1: [feat("Crimson Rite"), { op: "choose", id: "rites", what: "option", list: "crimson-rites", count: 2 }] },
      { "crimson-rites": [{ name: "Rite of the Flame", text: "Fire." }, { name: "Rite of the Frozen", text: "Cold." }, { name: "Rite of the Dawn", text: "Radiant." }] });
    const c = pc("blood-hunter", 5, { str: 16 }, { inventory: gear("longsword"), choices: { "class:blood-hunter:1:rites": ["rite-of-the-flame", "rite-of-the-frozen"] } });
    const s = stats(c, r);
    expect(attack(s, "Longsword").damage).toBe("1d8+3 slashing");
    expect(s.progress.scales["hemocraft-die"]).toBe("1d6");
    const flame = stats(switchOn(c, r, "rite-of-the-flame"), r);
    expect(attack(flame, "Longsword").damage).toBe("1d8+3 slashing + 1d6 fire");
    const frozen = switchOn(switchOn(c, r, "rite-of-the-flame"), r, "rite-of-the-frozen");
    expect(frozen.active).toEqual({ "rite-of-the-frozen": true });
    expect(attack(stats(frozen, r), "Longsword").damage).toBe("1d8+3 slashing + 1d6 cold");
    expect(s.progress.problems).toEqual([]);
    // Rite of the Dawn also resists necrotic damage
    const dawn = stats(switchOn(pc("blood-hunter", 5, { str: 16 }, { choices: { "class:blood-hunter:1:rites": ["rite-of-the-dawn", "rite-of-the-flame"] } }), r, "rite-of-the-dawn"), r);
    expect(dawn.traits.resist).toEqual(["necrotic"]);
  });

  it("50. Mutagens: each is a switch that ends at a short rest", () => {
    const r = bloodHunter({ 1: [{ op: "choose", id: "mutagens", what: "option", list: "mutagen-formulas", count: 5 }] },
      { "mutagen-formulas": ["Rapidity", "Precision", "Mobility", "Nighteye", "Aether"].map(name => ({ name, text: `${name} mutagen.` })) });
    const picks = ["rapidity", "precision", "mobility", "nighteye", "aether"];
    const c = pc("blood-hunter", 1, {}, { choices: { "class:blood-hunter:1:mutagens": picks } });
    const base = stats(c, r);
    expect(base.toggles.map(t => t.id)).toEqual(picks.map(p => `mutagen-${p}`));
    expect(base.speed.value).toBe(30);
    expect(stats(switchOn(c, r, "mutagen-rapidity"), r).speed.value).toBe(40);
    expect(stats(switchOn(c, r, "mutagen-precision"), r).crit).toEqual({ range: 19 });
    expect(stats(switchOn(c, r, "mutagen-mobility"), r).conditionImmune).toEqual(["grappled", "restrained"]);
    expect(stats(switchOn(c, r, "mutagen-nighteye"), r).senses.darkvision).toBe(60);
    expect(stats(switchOn(c, r, "mutagen-aether"), r).speed.other).toBe("fly 20");
    expect(restLong(switchOn(c, r, "mutagen-rapidity"), r).value.active).toEqual({});
    expect(base.progress.problems).toEqual([]);
  });

  it("51. Embercladding and the Stormweave Voidblade: item switches, from a homebrew note and from the library's shape", async () => {
    const r = srdRegistry();
    put(r, "item", { name: "Stormweave Voidblade", kind: "weapon", attunement: true, weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee" }, charges: { max: 3, reset: "dawn" } });
    // a library note: frontmatter shape only, invented body
    const lib = fakeVault({ [`${LIB_ROOT}/Items/Embercladding.md`]: { fm: { type: "5e-item", schema: 1, id: "embercladding", name: "Embercladding", source: "XGtE", page: 1,
      item_type: "Wondrous Item", rarity: "rare", attunement: true, magic: true, tags: ["5e/item", "5e/item/wondrous-item", "5e/rarity/rare", "5e/source/xgte"] }, body: "# Embercladding\n\nAn invented sentence about armor." } });
    await new VaultLoader(r, lib, "compendium/5e").indexAll();
    const worn = [{ id: "embercladding", qty: 1, equipped: true, attuned: true }, { id: "stormweave-voidblade", qty: 1, equipped: true, attuned: true }];
    const c = pc("fighter", 1, { str: 16 }, { inventory: worn });
    const off = stats(c, r);
    expect(off.toggles.map(t => [t.id, t.itemIndex])).toEqual([["flame-aura", 0], ["storm-charge", 1]]);
    expect(attack(off, "Stormweave Voidblade").damage).toBe("1d8+3 slashing");
    // the Voidblade spends one charge to carry lightning
    const res = act(c, { type: "toggle", id: "storm-charge", on: true }, r);
    expect(res.error).toBeUndefined();
    expect(res.value.inventory[1].charges).toEqual({ used: 1 });
    const on = stats(res.value, r);
    expect(attack(on, "Stormweave Voidblade").damage).toBe("1d8+3 slashing + 1 lightning");
    // Embercladding's flame aura is a switch whose effect is written out in words
    const aura = stats(switchOn(c, r, "flame-aura"), r);
    expect(aura.notes.map(n => n.text).join()).toMatch(/Flame Aura/);
    expect(r.problems()).toEqual([]);
  });
});
