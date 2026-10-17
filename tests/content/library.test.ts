import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, libraryFixtures, LIB_ROOT } from "../fixtures/library";

const setup = async (extra: Record<string, { fm?: Record<string, unknown>; body?: string }> = {}, srd = false) => {
  const r = new Registry(); registerBuiltinTypes(r); if (srd) loadSrd(r);
  const a = fakeVault({ ...libraryFixtures(), ...extra });
  const l = new VaultLoader(r, a, "compendium/5e");
  await l.indexAll();
  return { r, a, l };
};
const lib = <T>(r: Registry, type: string, id: string) => r.getAll<T>(type, id).find(e => e.library)!;

describe("library adapter", () => {
  it("indexes the library from frontmatter only: no body is read, source is WotC, the book is kept", async () => {
    const { r, a } = await setup();
    expect(a.reads).toEqual([]);
    const e = lib<any>(r, "spell", "aganazzar");
    expect(e.sourceName).toBe("WotC"); expect(e.book).toBe("XGtE"); expect(e.library).toBe(true);
    expect(r.problems()).toEqual([]);
  });

  it("spells: snake_case fields, components, save and damage type from tags", async () => {
    const { r } = await setup();
    const d = lib<any>(r, "spell", "aganazzar").data;
    expect(d).toMatchObject({ name: "Aganazzar", level: 2, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V", "S", "M"],
      material: "a red dragon's scale", concentration: false, ritual: false, classes: ["wizard"], save: { abil: "dex", onSuccess: "none" }, damage: { type: "fire" } });
    expect(lib<any>(r, "spell", "absorb-elements").data.components).toEqual(["S"]);
    expect(lib<any>(r, "spell", "absorb-elements").data.classes).toEqual(["druid", "ranger", "sorcerer", "wizard"]);
  });

  it("spells: the body adds damage dice per slot, half on save, higher-level text and rules, read once and cached", async () => {
    const { r, a } = await setup();
    const e = lib<any>(r, "spell", "aganazzar");
    await r.hydrate(e); await r.hydrate(e);
    expect(a.reads).toHaveLength(1);
    expect(e.data.damage).toEqual({ type: "fire", bySlot: { 2: "3d8", 3: "4d8", 4: "5d8", 5: "6d8", 6: "7d8", 7: "8d8", 8: "9d8", 9: "10d8" } });
    expect(e.data.save).toEqual({ abil: "dex", onSuccess: "half" });
    expect(e.data.higherLevel).toMatch(/^When you cast this spell using a spell slot of 3rd level or higher/);
    expect(e.data.rules).toMatch(/^A made-up line of flame/); expect(e.data.rules).not.toMatch(/Higher/); expect(e.data.rules).not.toMatch(/^# /);
  });

  it("spells: healing parses to dice plus MOD; ambiguous damage is left out", async () => {
    const { r } = await setup();
    const cure = lib<any>(r, "spell", "cure-wounds"); await r.hydrate(cure);
    expect(cure.data.heal.bySlot).toMatchObject({ 1: "1d8+MOD", 2: "2d8+MOD", 9: "9d8+MOD" });
    const absorb = lib<any>(r, "spell", "absorb-elements"); await r.hydrate(absorb);
    expect(absorb.data.damage).toBeUndefined();   // "extra 1d6 damage of the triggering type": no stated type, not unambiguous
    expect(absorb.data.higherLevel).toBeDefined();
  });

  it("items: item_type maps to kind, rarity and attunement are kept, the body is the rules text", async () => {
    const { r } = await setup();
    expect(lib<any>(r, "item", "adamantine-armor").data).toMatchObject({ kind: "armor", rarity: "uncommon", attunement: false });
    expect(lib<any>(r, "item", "alchemy-jug").data.kind).toBe("wondrous");
    expect(lib<any>(r, "item", "elixir-of-health").data.kind).toBe("consumable");
    expect(lib<any>(r, "item", "akaasit-blade").data.kind).toBe("weapon");
    const e = lib<any>(r, "item", "alchemy-jug"); await r.hydrate(e);
    expect(e.data.rules).toBe("An invented sentence about a jug.");
    expect(e.data.effects).toEqual({});
  });

  it("creatures: stat block fields map, attacks come from the Actions section when opened", async () => {
    const { r } = await setup();
    const c = lib<any>(r, "creature", "1-hippogriff");
    expect(c.data).toMatchObject({ name: "1 Hippogriff", size: "Large", ctype: "monstrosity", ac: 11, hp: { average: 19, formula: "3d10 + 3" },
      speed: { walk: 40, fly: 60 }, abilities: { str: 17, dex: 13, con: 13, int: 2, wis: 12, cha: 8 }, skills: { perception: 5 }, cr: "1" });
    expect(c.data.attacks).toEqual([]);
    await r.hydrate(c);
    expect(c.data.attacks).toEqual([
      { name: "Peck", toHit: 4, damage: "1d8+3", note: "piercing" },
      { name: "Screech", save: { abil: "wis", dc: 12 } },
    ]);
  });

  it("creatures: a generator review flag is kept as a badge, missing size and type fall back", async () => {
    const { r } = await setup();
    const c = lib<any>(r, "creature", "frost-salamander");
    expect(c.needsReview).toEqual(["name missing in OCR, inferred from the text", "size/type line missing in OCR"]);
    expect(c.data).toMatchObject({ size: "Medium", ctype: "creature", ac: 17, speed: { walk: 60, climb: 40 }, saves: { con: 8, wis: 4 } });
    expect(c.referenceOnly).toBeUndefined();
  });

  it("creatures: missing stat block fields make the creature reference only, never a problem", async () => {
    const { r, a } = await setup();
    a.notes[`${LIB_ROOT}/Creatures/Half.md`] = { fm: { type: "5e-creature", schema: 1, id: "half", name: "Half Beast", source: "MM", cr: "1/4" } };
    const l = new VaultLoader(r, a, "compendium/5e"); await l.changed(`${LIB_ROOT}/Creatures/Half.md`);
    const e = r.getAll("creature", "half")[0];
    expect(e.referenceOnly).toMatch(/ac/); expect(e.sourceName).toBe("WotC");
    expect(r.get("creature", "half")).toBeUndefined(); expect(r.list("creature").map(x => x.id)).not.toContain("half");
    expect(r.listAll("creature").map(x => x.id)).toContain("half");
    expect(r.referenceOnlyCount()).toBe(1); expect(r.problems()).toEqual([]);
  });

  it("conditions: name and text; the SRD condition's effects apply when the id matches, with the library text shown", async () => {
    const { r } = await setup({}, true);
    const srd = r.srdEntry<any>("condition", "blinded")!;
    const e = lib<any>(r, "condition", "blinded"); await r.hydrate(e);
    expect(e.data.effects).toEqual(srd.data.effects);
    expect(e.data.rules).toBe("An invented sentence about being unable to see.");
    expect(r.get<any>("condition", "blinded")!.sourceName).toBe("WotC");
  });

  it("books, the index and the marker are skipped; non-content notes never become problems", async () => {
    const { r } = await setup({
      [`${LIB_ROOT}/Books/Player's Handbook/01 Intro.md`]: { fm: { type: "5e-spell", name: "Embedded" } },
      [`${LIB_ROOT}/Index/Spells.md`]: { fm: { type: "5e-spell", name: "Index page" } },
      [`${LIB_ROOT}/5e Library.md`]: {},
      [`${LIB_ROOT}/.dnd-compendium-generated`]: {},
    });
    expect(r.listAll("spell").map(e => e.name).sort()).toEqual(["Absorb Elements", "Aganazzar", "Cure Wounds"]);
    expect(r.problems()).toEqual([]);
  });

  it("a library spell with a bad level is reference only, a user spell with the same defect is a problem", async () => {
    const { r, a } = await setup({
      [`${LIB_ROOT}/Spells/Broken.md`]: { fm: { type: "5e-spell", id: "broken", name: "Broken", level: "two" } },
      "compendium/5e/Homebrew/Spells/Mine.md": { fm: { type: "5e-spell", name: "Mine", level: "two" } },
    });
    expect(r.referenceOnlyCount()).toBe(1);
    expect(r.problems().map(p => p.path)).toEqual(["compendium/5e/Homebrew/Spells/Mine.md"]);
    expect(a.reads).toEqual(["compendium/5e/Homebrew/Spells/Mine.md"]);   // only the user note was read
  });

  it("body text is never turned into HTML or links: wikilinks become plain words", async () => {
    const { r, a } = await setup();
    a.notes[`${LIB_ROOT}/Items/Linked.md`] = { fm: { type: "5e-item", id: "linked", name: "Linked", item_type: "Potion" }, body: "# Linked\n\nRemoves [[compendium/5e/WotC/Conditions/Blinded|blinded]] and ![[x]] <b>y</b>.\n\n---\n*Source: [[a|b]], p. 3*" };
    await new VaultLoader(r, a, "compendium/5e").changed(`${LIB_ROOT}/Items/Linked.md`);
    const e = lib<any>(r, "item", "linked"); await r.hydrate(e);
    expect(e.data.rules).toBe("Removes blinded and  <b>y</b>.");
  });
});
