import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { spellType } from "../../src/content/types/spell";
import { blankSpellDraft, spellDataToDraft, spellDraftToNote, validateSpellDraft, type SpellDraft } from "../../src/content/spell-note";
import type { NoteIO } from "../../src/obsidian/create-note";
import { saveSpell, updateSpell, type SpellIO } from "../../src/obsidian/save-spell";

const stringify = (o: Record<string, unknown>) => JSON.stringify(o);
const draft = (extra: Partial<SpellDraft> = {}): SpellDraft => ({ ...blankSpellDraft(), name: "Test Spark", description: "A spark jumps to a creature you can see.", classes: ["wizard"],
  dice: "2d6", dtype: "lightning", save: "dex", onSuccess: "half", ...extra });

describe("spell draft to note", () => {
  it("writes the native spell frontmatter, and it round-trips through spellType.validate", () => {
    const { id, fm, body } = spellDraftToNote(draft({ m: true, material: "a copper pin", concentration: true, higherLevel: "One more die per slot." }));
    expect(id).toBe("test-spark");
    expect(fm).toMatchObject({ type: "5e-spell", id: "test-spark", name: "Test Spark", level: 1, school: "Evocation", components: ["V", "S", "M"], material: "a copper pin",
      concentration: true, classes: ["wizard"], save: { abil: "dex", onSuccess: "half" }, damage: { type: "lightning", bySlot: { "1": "2d6" } }, higherLevel: "One more die per slot." });
    expect(body).toBe("A spark jumps to a creature you can see.");
    const r = spellType.validate({ ...fm, rules: body });
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ name: "Test Spark", damage: { type: "lightning" }, rules: body });
    expect(Object.values(fm).includes(null)).toBe(false);
  });

  it("a cantrip's damage scales by caster level, and healing keeps the MOD token", () => {
    const c = spellDraftToNote(draft({ name: "Glow Ward", level: 0, dice: "1d8", dtype: "radiant", save: "" })).fm;
    expect(c.damage).toEqual({ type: "radiant", byCharLevel: { "1": "1d8" } });
    expect(spellType.validate(c).errors).toEqual([]);
    const h = spellDraftToNote(draft({ name: "Mend Spark", dice: "", dtype: "", save: "", heal: "1d8", healMod: true })).fm;
    expect(h.heal).toEqual({ bySlot: { "1": "1d8+MOD" } });
    expect(spellType.validate(h).errors).toEqual([]);
  });

  it("reads a spell back into a draft; a copy of a library spell keeps mechanics, not the rules text", () => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    const e = r.get<import("../../src/content/types/spell").SpellData>("spell", "acid-arrow")!;
    const mine = spellDataToDraft(e.data), copy = spellDataToDraft(e.data, { withoutText: true });
    expect(mine.dice).toBe("4d4"); expect(mine.dtype).toBe("acid"); expect(mine.attack).toBe("ranged"); expect(mine.m).toBe(true);
    expect(copy).toMatchObject({ dice: "4d4", dtype: "acid", description: "", higherLevel: "", m: true });
    expect(copy.material).toBe(e.data.material);
  });
});

describe("validateSpellDraft says what is wrong in plain words", () => {
  it("accepts a good draft", () => expect(validateSpellDraft(draft())).toEqual([]));
  it.each([
    [{ name: " " }, "Give the spell a name."],
    [{ description: "" }, "Describe what the spell does."],
    [{ castingTime: "" }, "Say how long it takes to cast, like 1 action."],
    [{ m: true, material: "" }, "You ticked Material: say what the material is, or untick it."],
    [{ dice: "lots" }, "Write the damage as dice, like 2d6 or 1d8+2."],
    [{ dtype: "" }, "Pick the kind of damage (fire, cold ...)."],
    [{ level: 0, heal: "1d8" }, "Healing needs a spell of 1st level or higher."],
  ] as [Partial<SpellDraft>, string][])("%j", (extra, msg) => expect(validateSpellDraft(draft(extra))).toContain(msg));
});

const fakeVault = () => {
  const files = new Map<string, string>(), fms = new Map<string, Record<string, unknown>>();
  const io: SpellIO = { exists: p => files.has(p), ensureFolder: async () => undefined, create: async (p, t) => { files.set(p, t); },
    processFrontMatter: async (p, fn) => { const fm = fms.get(p); if (!fm) return false; fn(fm); return true; },
    replaceBody: async (p, b) => { files.set(p, `BODY:${b}`); } };
  return { io: io as NoteIO & SpellIO, files, fms };
};
const setup = () => { const registry = new Registry(); registerBuiltinTypes(registry); loadSrd(registry); const v = fakeVault();
  return { registry, v, deps: { registry, io: v.io, compendiumFolder: "compendium/5e/", stringify } }; };

describe("saveSpell (the host contract behind SheetHost.saveSpell)", () => {
  it("writes Homebrew/Spells/<Name>.md and registers it at once", async () => {
    const { registry, v, deps } = setup();
    const r = await saveSpell(deps, draft());
    expect(r).toEqual({ id: "test-spark", name: "Test Spark", path: "compendium/5e/Homebrew/Spells/Test Spark.md" });
    const text = v.files.get(r.path)!;
    const fm = JSON.parse(/^---\n([\s\S]*?)\n---/.exec(text)![1]);
    expect(spellType.validate({ ...fm, rules: "x" }).errors).toEqual([]);
    expect(text).toContain("A spark jumps to a creature you can see.");
    expect(registry.get("spell", "test-spark")).toMatchObject({ name: "Test Spark", sourceName: "Homebrew", path: r.path, source: "vault" });
  });

  it("never overwrites: a taken name, or an id a library spell already has, gets (2)", async () => {
    const { v, deps } = setup();
    const a = await saveSpell(deps, draft()), b = await saveSpell(deps, draft()), c = await saveSpell(deps, draft({ name: "Acid Arrow" }));
    expect([a.name, b.name, c.name]).toEqual(["Test Spark", "Test Spark (2)", "Acid Arrow (2)"]);
    expect(v.files.size).toBe(3);
  });

  it("refuses an invalid draft in plain words and writes nothing", async () => {
    const { v, deps } = setup();
    await expect(saveSpell(deps, draft({ name: "" }))).rejects.toThrow("Give the spell a name.");
    expect(v.files.size).toBe(0);
  });
});

describe("updateSpell rewrites a vault note's spell fields and keeps the rest", () => {
  it("keeps id, other properties and the body; refreshes the registry", async () => {
    const { registry, v } = setup();
    const path = "compendium/5e/Homebrew/Spells/Test Spark.md";
    const fm = { type: "5e-spell", id: "test-spark", name: "Test Spark", source: "Homebrew", tags: ["mine"], aliases: ["Spark"], level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet",
      components: ["V"], duration: "Instantaneous", concentration: false, ritual: false, classes: ["wizard"], damage: { type: "fire", bySlot: { "1": "1d4" } } };
    v.fms.set(path, structuredClone(fm));
    registry.add("vault", "spell", fm, { path, body: "Old words.", sourceName: "Homebrew" });
    const d = spellDataToDraft(registry.get<import("../../src/content/types/spell").SpellData>("spell", "test-spark")!.data, { description: "Old words." });
    expect(d.dice).toBe("1d4");
    const r = await updateSpell({ registry, io: v.io }, { id: "test-spark", path, sourceName: "Homebrew", body: "Old words." }, { ...d, name: "Test Spark Prime", level: 2, dice: "3d6", dtype: "cold", range: "Self" });
    expect(r.id).toBe("test-spark");
    const saved = v.fms.get(path)!;
    expect(saved).toMatchObject({ id: "test-spark", tags: ["mine"], aliases: ["Spark"], name: "Test Spark Prime", level: 2, range: "Self", damage: { type: "cold", bySlot: { "2": "3d6" } } });
    expect(spellType.validate({ ...saved, rules: "x" }).errors).toEqual([]);
    expect(v.files.has(path)).toBe(false);   // description unchanged: the body is not touched
    expect(registry.get<import("../../src/content/types/spell").SpellData>("spell", "test-spark")!.data).toMatchObject({ name: "Test Spark Prime", level: 2, range: "Self", rules: "Old words." });
  });

  it("replaces the body only when the description changed", async () => {
    const { registry, v } = setup();
    const path = "n.md", fm = { type: "5e-spell", id: "x", name: "Glow Ward", level: 0, school: "Abjuration", castingTime: "1 action", range: "Self", components: ["V"], duration: "1 hour", concentration: false, ritual: false, classes: [] };
    v.fms.set(path, structuredClone(fm)); registry.add("vault", "spell", fm, { path, body: "Old.", sourceName: "Homebrew" });
    await updateSpell({ registry, io: v.io }, { id: "x", path, sourceName: "Homebrew", body: "Old." }, { ...blankSpellDraft(), name: "Glow Ward", level: 0, school: "Abjuration", range: "Self", duration: "1 hour", description: "New words." });
    expect(v.files.get(path)).toBe("BODY:New words.");
  });

  it("says so when the note is gone", async () => {
    const { registry, v } = setup();
    await expect(updateSpell({ registry, io: v.io }, { id: "x", path: "gone.md", sourceName: "Homebrew" }, draft())).rejects.toThrow("no longer exists");
  });
});
