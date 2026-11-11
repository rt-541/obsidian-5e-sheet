import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader } from "../../src/content/vault-loader";
import { parseNote } from "../../src/core/character";
import { deriveCharacter, deriveCompanion } from "../../src/core/derive";
import { spellRows } from "../../src/core/spells";
import { fakeVault, type Notes } from "../fixtures/library";
import { thalia } from "../fixtures/notes";

const W = "compendium/5e/WotC", K = "compendium/5e/Kobold Press";
/** Library notes (frontmatter in the generator's shape, invented bodies) that share ids with SRD content. */
const notes = (): Notes => ({
  [`${W}/Items/Ring of Protection.md`]: { fm: { type: "5e-item", schema: 1, id: "ring-of-protection", name: "Ring of Protection", source: "DMG", item_type: "Ring", rarity: "rare", attunement: true, magic: true }, body: "An invented sentence." },
  [`${W}/Spells/Fireball.md`]: { fm: { type: "5e-spell", schema: 1, id: "fireball", name: "Fireball", source: "PHB", level: 3, school: "evocation", casting_time: "1 action", range: "150 feet", components: "V, S, M (a pinch)", duration: "Instantaneous", classes: ["wizard"], tags: ["5e/save/dex", "5e/damage/fire"] }, body: "An invented sentence." },
  [`${W}/Creatures/Owl.md`]: { fm: { type: "5e-creature", schema: 1, id: "owl", name: "Owl", source: "MM", size: "Tiny", creature_type: "beast", ac: 11, hp: 1, hp_formula: "1d4 - 1", speed: "5 ft., fly 60 ft.", abilities: { str: 3, dex: 13, con: 8, int: 2, wis: 12, cha: 7 }, cr: "0", cr_value: 0 }, body: "An invented sentence." },
});
const setup = async (extra: Notes = {}) => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const l = new VaultLoader(r, fakeVault({ ...notes(), ...extra }), "compendium/5e"); await l.indexAll();
  return { r, l };
};
const thaliaChar = () => { const p = parseNote(thalia); if (p.kind !== "character") throw new Error(); return p.value; };

describe("library entries do not downgrade SRD mechanics (without opening the browser card)", () => {
  it("ring of protection still gives +1 AC and +1 saves", async () => {
    const { r } = await setup();
    expect(r.get("item", "ring-of-protection")!.sourceName).toBe("WotC (SRD)");
    const s = deriveCharacter(thaliaChar(), { registry: r });
    expect(s.ac).toEqual({ value: 19, sources: ["Chain mail", "Shield", "Ring of protection"] });
    expect(s.saves.wis).toEqual({ mod: 7, prof: true }); expect(s.saves.str).toEqual({ mod: 3, prof: false });
  });
  it("fireball keeps its dice and half damage on a success", async () => {
    const { r } = await setup();
    const g = r.get<any>("spell", "fireball")!;
    expect(g.sourceName).toBe("WotC (SRD)"); expect(g.data.save.onSuccess).toBe("half");
    const c = { ...thaliaChar(), spells: [{ id: "fireball", prepared: true }] };
    const row = spellRows(c, deriveCharacter(c, { registry: r }), { registry: r }).own.find(x => x.id === "fireball")!;
    expect(row.damage).toBe("8d6");
  });
  it("owl companion keeps its attack and traits", async () => {
    const { r } = await setup();
    const o = deriveCompanion(thaliaChar().companions[0], { registry: r })!;
    expect(o.attacks[0]).toEqual({ name: "Talons", toHit: 3, damage: "1 slashing", target: { kind: "attack" } });
    expect(r.get<any>("creature", "owl")!.data.traits).toHaveLength(2);
  });
  it("the library entry still shows in the browser, and wins when there is no SRD entry or the SRD source is off", async () => {
    const { r } = await setup();
    expect(r.getAll("spell", "fireball").map(e => e.sourceName)).toEqual(["WotC", "WotC (SRD)"]);
    expect(r.get("spell", "fireball", { sources: { "WotC (SRD)": false } })!.sourceName).toBe("WotC");
  });
});

describe("generated library folders are found by their marker", () => {
  const kobold = (): Notes => ({
    [`${K}/.dnd-compendium-generated`]: {},
    [`${K}/Creatures/Dread Hound.md`]: { fm: { type: "5e-creature", schema: 1, id: "dread-hound", name: "Dread Hound", source: "ToB", size: "Large", creature_type: "fiend", ac: 14, hp: 45, hp_formula: "6d10 + 12", speed: "40 ft.", abilities: { str: 16, dex: 14, con: 14, int: 6, wis: 12, cha: 8 }, cr: "3", cr_value: 3 }, body: "An invented sentence." },
    [`${K}/Items/Odd Trinket.md`]: { fm: { type: "5e-item", schema: 1, id: "odd-trinket", name: "Odd Trinket", source: "ToB", item_type: "Weapon", rarity: "rare" }, body: "An invented sentence." },
    [`${K}/Creatures/Broken.md`]: { fm: { type: "5e-creature", schema: 1, id: "broken", name: "Broken", source: "ToB" }, body: "x" },
    [`${K}/Books/Tome/01 Intro.md`]: { fm: { type: "5e-spell", name: "Embedded" }, body: "x" },
    [`${K}/Index/Creatures.md`]: { fm: { type: "5e-spell", name: "Index page" }, body: "x" },
    [`${K}/Items/Ring of Protection.md`]: { fm: { type: "5e-item", schema: 1, id: "ring-of-protection", name: "Ring of Protection", source: "ToB", item_type: "Ring" }, body: "x" },
  });
  const withMarker = (n: Notes) => { const a = fakeVault(n); a.exists = async p => p in n; return a; };
  const index = async (n: Notes) => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    const a = withMarker({ ...notes(), ...n }); await new VaultLoader(r, a, "compendium/5e").indexAll(); return { r, a };
  };

  it("is library content: frontmatter only, no problems, reference-only when unmappable, Books and Index skipped", async () => {
    const { r, a } = await index(kobold());
    expect(a.reads).toEqual([]);
    expect(r.problems()).toEqual([]);
    const hound = r.get<any>("creature", "dread-hound")!;
    expect(hound).toMatchObject({ sourceName: "Kobold Press", library: true, book: "ToB" });
    expect(hound.data.hp.average).toBe(45);
    expect(r.getAll("creature", "broken")[0].referenceOnly).toBeDefined();
    expect(r.get("item", "odd-trinket")!.data).toMatchObject({ kind: "weapon" });
    expect(r.listAll("spell").filter(e => e.library).map(e => e.name)).toEqual(["Fireball"]);
    expect(r.referenceOnlyCount()).toBe(1);
  });
  it("ranks below user sources and above the SRD, and never beats SRD mechanics", async () => {
    const { r } = await index({ ...kobold(), "compendium/5e/Homebrew/Items/Odd Trinket.md": { fm: { type: "5e-item", name: "Odd Trinket", kind: "gear" } } });
    expect(r.get("item", "odd-trinket")!.sourceName).toBe("Homebrew");
    expect(r.getAll("item", "ring-of-protection").map(e => e.sourceName)).toEqual(["WotC", "Kobold Press", "WotC (SRD)"]);
    expect(r.get("item", "ring-of-protection")!.sourceName).toBe("WotC (SRD)");
  });
  it("a folder without the marker stays a user source", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    const n: Notes = { [`${K}/Creatures/Broken.md`]: { fm: { type: "5e-creature", name: "Broken" } } };
    const a = fakeVault(n); a.exists = async () => false;
    await new VaultLoader(r, a, "compendium/5e").indexAll();
    expect(r.problems()).toHaveLength(1);
  });
});
