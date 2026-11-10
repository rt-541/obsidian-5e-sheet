import { findOverlay, overlayEntries, overlayKeys, overlayNames, overlayOwner, overlayProblems, setBuiltinMechanics } from "../../src/content/overlay";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { feat, gear, homebrewFeat, pc, put, srdRegistry, stats, subclass } from "../fixtures/overlay";

describe("built-in mechanics data", () => {
  it("every bundled entry passes the same validators as notes", () => {
    expect(overlayProblems()).toEqual([]);
    expect(overlayKeys().length).toBeGreaterThan(100);
  });

  it("extra damage types are a single word, so attack rows can double the dice on a critical hit", () => {
    for (const e of overlayEntries()) for (const x of e.effects.extraDamage ?? []) expect(x.type, e.key).toMatch(/^[a-z]+$/);
  });

  it("looks a feature up by name the way libraries and homebrew spell it", () => {
    expect(overlayNames("Slayer's Prey")).toContain("slayers-prey");
    expect(overlayNames("Extra Attack (2)")).toEqual(["extra-attack-2", "extra-attack"]);
    expect(overlayNames("Rage (XGE)")).toContain("rage");
    expect(overlayNames("Eldritch Invocation: Agonizing Blast")).toContain("agonizing-blast");
    expect(overlayNames("Wild Shape (CR 1/4 or below, no flying or swim speed)")).toContain("wild-shape");
    expect(overlayOwner("path-of-the-berserker")).toBe("berserker");
    expect(overlayOwner("The Hexblade")).toBe("hexblade");
    expect(overlayOwner("draconic-bloodline")).toBe("draconic");
    expect(overlayOwner("Oath of Devotion")).toBe("devotion");
  });

  it("finds entries by kind and owner, with * for any owner, and subrace traits as race traits", () => {
    expect(findOverlay("class", ["barbarian"], "Rage")?.key).toBe("class:barbarian:rage");
    expect(findOverlay("class", ["fighter"], "Rage")).toBeUndefined();
    expect(findOverlay("option", ["fighter-fighting-style"], "Archery")?.key).toBe("option:*:archery");
    expect(findOverlay("subrace", ["hill-dwarf", "dwarf"], "Dwarven Toughness")?.key).toBe("race:*:dwarven-toughness");
    expect(findOverlay("feat", [], "Great Weapon Master", undefined, "2014")?.key).toBe("feat::great-weapon-master@2014");
    expect(findOverlay("subclass", ["path-of-the-berserker"], "Rage")).toBeUndefined();
  });
});

describe("built-in mechanics precedence", () => {
  const monk = (r: Registry) => stats(pc("monk", 5, { dex: 18, wis: 16 }), r);

  it("fills in a feature whose note has no effects, and marks the row as built in", () => {
    const s = monk(srdRegistry());
    expect(s.ac.value).toBe(17);
    const row = s.progress.features.find(f => f.name === "Unarmored Defense")!;
    expect(row.overlay).toBe("class:monk:unarmored-defense");
    expect(s.progress.overlay.used).toContain("class:monk:unarmored-defense");
  });

  it("a note that has its own effects wins, and the skipped entry is listed (not a problem)", () => {
    const r = srdRegistry();
    put(r, "class", { name: "Monk", hitDie: 8, levels: { 1: [feat("Unarmored Defense", { effects: { acFormula: { base: 11, abils: ["dex"] } } })] } });
    const s = monk(r);
    expect(s.ac.value).toBe(15);
    expect(s.progress.overlay.skipped).toContain("class:monk:unarmored-defense");
    expect(s.progress.problems).toEqual([]);
    expect(s.progress.features.find(f => f.name === "Unarmored Defense")!.overlay).toBeUndefined();
  });

  it("overlay: false on a feature keeps the built-in mechanics out", () => {
    const r = srdRegistry();
    put(r, "class", { name: "Monk", hitDie: 8, levels: { 1: [feat("Unarmored Defense", { overlay: false })] } });
    expect(monk(r).ac.value).toBe(14);
  });

  it("overlay: false on a whole note keeps its features free of built-in mechanics, and must be true or false", () => {
    const r = srdRegistry();
    put(r, "class", { name: "Monk", hitDie: 8, overlay: false, levels: { 1: [feat("Unarmored Defense")] } });
    expect(monk(r).ac.value).toBe(14);
    const bad = new Registry(); registerBuiltinTypes(bad);
    expect(bad.add("vault", "class", { name: "X", hitDie: 8, overlay: "no" }, { path: "x.md" })?.errors.join()).toMatch(/overlay: must be true or false/);
    expect(bad.add("vault", "feat", { name: "Y", overlay: 3, grants: [] }, { path: "y.md" })?.errors.join()).toMatch(/overlay: must be true or false/);
    expect(bad.add("vault", "item", { name: "Z", kind: "gear", overlay: 3 }, { path: "z.md" })?.errors.join()).toMatch(/overlay: must be true or false/);
    expect(bad.add("vault", "class", { name: "W", hitDie: 8, levels: { 1: [{ op: "feature", name: "A", overlay: "x" }] } }, { path: "w.md" })?.errors.join()).toMatch(/overlay: must be true or false/);
  });

  it("the plugin setting turns every built-in entry off", () => {
    const r = srdRegistry();
    setBuiltinMechanics(false);
    try { expect(monk(r).ac.value).toBe(14); } finally { setBuiltinMechanics(true); }
    expect(monk(r).ac.value).toBe(17);
  });

  it("a feature that appears at several levels counts once", () => {
    // SRD Monk lists Unarmored Movement at levels 2 and 9: the speed bonus must not be added twice.
    const s = stats(pc("monk", 10, { dex: 10 }), srdRegistry());
    expect(s.speed.value).toBe(50);
  });

  it("an item with no effects or switch of its own is filled in; an item with its own is left alone; overlay: false opts out", () => {
    const r = srdRegistry();
    put(r, "item", { name: "Embercladding", kind: "wondrous", attunement: true });
    put(r, "item", { name: "Stormweave Voidblade", kind: "weapon", weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee" }, effects: { note: "mine" } });
    put(r, "item", { name: "Water Orb", kind: "wondrous", overlay: false });
    const s = stats(pc("fighter", 1, {}, { inventory: [{ id: "embercladding", equipped: true, attuned: true }] }), r);
    expect(s.toggles.map(t => t.id)).toEqual(["flame-aura"]);
    const own = stats(pc("fighter", 1, {}, { inventory: gear("stormweave-voidblade") }), r);
    expect(own.toggles).toEqual([]);
    expect(own.notes.map(n => n.text)).toEqual(["mine"]);
  });

  it("a feat is filled in the same way, and a homebrew note of the same id as an SRD one wins", () => {
    const r = srdRegistry();
    homebrewFeat(r, "Tough");
    expect(stats(pc("fighter", 3, {}, { feats: ["tough"] }), r).hp.max).toBe(20 + 6);
  });

  it("subclass features of another source's class are filled in by owner", () => {
    const r = srdRegistry();
    subclass(r, "Gloom Stalker", "ranger", 3, ["Dread Ambusher"]);
    const s = stats(pc("ranger", 3, { dex: 14, wis: 16 }, { classes: [{ class: "ranger", level: 3, subclass: "gloom-stalker" }] }), r);
    expect(s.initiative).toBe(2 + 3);
  });
});
