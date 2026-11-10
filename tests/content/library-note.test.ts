import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { LIBRARY_MARKER } from "../../src/content/sources";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, type Notes } from "../fixtures/library";

/** A library that reached this machine through Obsidian Sync: no dot-file, only the `5e-library` root note. Every name and number is invented. */
const R = "compendium/5e", TIN = `${R}/Tin Press`, ZINC = `${R}/Zinc Press`;
type Fm = Record<string, unknown>;
const libNote = (extra: Fm = {}): { fm: Fm; body: string } => ({ fm: { type: "5e-library", schema: 1, generated: true, edition: "2014", ...extra }, body: "" });
const spell = (id: string, name: string, level: number, extra: Fm = {}) => ({ fm: { type: "5e-spell", schema: 1, id, name, source: "TST", level, school: "evocation", ritual: false,
  casting_time: "1 action", range: "30 feet", components: "V, S", duration: "Instantaneous", concentration: false, classes: ["wizard"], tags: ["5e/spell"], ...extra }, body: "Invented." });
const blade = (id: string, name: string, extra: Fm = {}) => ({ fm: { type: "5e-item", schema: 1, id, name, source: "TST", item_type: "Weapon", rarity: "none", attunement: false,
  magic: false, kind: "weapon", weapon: { dmg: "1d6", type: "slashing" }, tags: ["5e/item"], ...extra }, body: "Invented." });
const press = (dir: string, extra: Fm = {}): Notes => ({
  [`${dir}/Spells/Glint.md`]: spell("glint", "Glint", 3, extra), [`${dir}/Items/Tin-blade.md`]: blade("tin-blade", "Tin-blade", extra),
});
const homebrew: Notes = { [`${R}/Homebrew/Spells/Glint.md`]: { fm: { type: "5e-spell", name: "Glint", level: 4, school: "Evocation", classes: ["wizard"] }, body: "" } };

async function load(notes: Notes, opts: { markers?: string[] } = {}) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const vault = fakeVault(notes, opts), loader = new VaultLoader(r, vault, R);
  await loader.indexAll();
  return { r, vault, loader };
}
const lib = (r: Registry, type: string, id: string) => r.getAll(type, id).find(e => e.sourceName === "Tin Press")?.library === true;

describe("a library recognised by its root note", () => {
  it("marks entries as library, reads no bodies, ranks below Homebrew, and hides the note", async () => {
    const { r, vault } = await load({ ...press(TIN), [`${TIN}/5e Library.md`]: libNote(), ...homebrew });
    expect(lib(r, "spell", "glint")).toBe(true); expect(lib(r, "item", "tin-blade")).toBe(true);
    expect(vault.reads.filter(p => p.startsWith(TIN))).toEqual([]);
    expect(r.get("spell", "glint")!.sourceName).toBe("Homebrew");
    expect(r.getAll("spell", "5e Library")).toEqual([]); expect(r.problems()).toEqual([]);
    expect([...vault.reads]).not.toContain(`${TIN}/5e Library.md`);
  });
  it("arrival order: entries indexed first are re-classified when the note arrives, and again when it goes", async () => {
    const { r, vault, loader } = await load({ ...press(TIN), ...homebrew });
    expect(lib(r, "spell", "glint")).toBe(false); expect(lib(r, "item", "tin-blade")).toBe(false);
    const p = `${TIN}/5e Library.md`; vault.notes[p] = libNote();
    await loader.changed(p);
    expect(lib(r, "spell", "glint")).toBe(true); expect(lib(r, "item", "tin-blade")).toBe(true);
    expect(r.problems()).toEqual([]);
    delete vault.notes[p]; await loader.deleted(p);
    expect(lib(r, "spell", "glint")).toBe(false); expect(lib(r, "item", "tin-blade")).toBe(false);
  });
  it("a rename away from the root drops the classification; a rename into it adds it", async () => {
    const { r, vault, loader } = await load({ ...press(TIN), [`${TIN}/5e Library.md`]: libNote() });
    const from = `${TIN}/5e Library.md`, to = `${TIN}/Books/5e Library.md`;
    vault.notes[to] = vault.notes[from]; delete vault.notes[from]; await loader.renamed(to, from);
    expect(lib(r, "spell", "glint")).toBe(false);
    vault.notes[from] = vault.notes[to]; delete vault.notes[to]; await loader.renamed(from, to);
    expect(lib(r, "spell", "glint")).toBe(true);
  });
  it("re-classifies inside one batch so views rebuild once", async () => {
    const { r, vault, loader } = await load({ ...press(TIN) });
    let n = 0; r.onChange(() => n++);
    const p = `${TIN}/5e Library.md`; vault.notes[p] = libNote(); await loader.changed(p);
    expect(n).toBe(1);
  });
  it("editions: a stamped library is 2024 only, an unstamped one is 2014", async () => {
    const notes: Notes = { ...press(`${R}/Zinc Press`, { edition: "2024" }), [`${ZINC}/5e Library.md`]: libNote({ edition: "2024" }),
      ...press(TIN, {}), [`${TIN}/5e Library.md`]: libNote({ edition: undefined }) };
    const { r } = await load(notes);
    expect(r.forEdition("2024").get("spell", "glint")!.sourceName).toBe("Zinc Press");
    expect(r.forEdition("2014").get("spell", "glint")!.sourceName).toBe("Tin Press");
    expect(r.forEdition("2014").get<{ level: number }>("spell", "glint")!.data.level).toBe(3);
    expect(r.getAll("spell", "glint").find(e => e.sourceName === "Tin Press")!.edition).toBe("2014");
  });
  it("a hand-made source with an ordinary root note is not a library", async () => {
    const { r } = await load({ ...press(TIN), [`${TIN}/Notes.md`]: spell("ember", "Ember", 1) });
    expect(lib(r, "spell", "glint")).toBe(false); expect(r.getAll("spell", "ember")[0].library).toBeFalsy();
  });
  it("the dot-file marker and the WotC folder still work, with or without a note", async () => {
    const { r } = await load({ ...press(TIN), ...press(`${R}/WotC`) }, { markers: [`${TIN}/${LIBRARY_MARKER}`] });
    expect(lib(r, "spell", "glint")).toBe(true);
    expect(r.getAll("spell", "glint").find(e => e.sourceName === "WotC")!.library).toBe(true);
  });
  it("book text and index pages inside a note-marked library are skipped", async () => {
    const { r } = await load({ [`${TIN}/5e Library.md`]: libNote(), [`${TIN}/Books/Ch1.md`]: spell("bk", "Bk", 1), [`${TIN}/Index/All.md`]: spell("ix", "Ix", 1) });
    expect(r.getAll("spell", "bk")).toEqual([]); expect(r.getAll("spell", "ix")).toEqual([]);
  });
  it("changing one source's library note does not re-read another source", async () => {
    const { vault, loader } = await load({ ...press(TIN), [`${TIN}/5e Library.md`]: libNote(), ...press(ZINC), [`${ZINC}/5e Library.md`]: libNote() });
    const before = [...vault.reads];
    await loader.changed(`${TIN}/5e Library.md`);
    expect(vault.reads.filter(p => p.startsWith(ZINC))).toEqual(before.filter(p => p.startsWith(ZINC)));
  });
  it("works through adapter.read when the adapter has no metadata cache", async () => {
    const vault = fakeVault({ ...press(TIN), [`${TIN}/5e Library.md`]: libNote() }); delete vault.frontmatter;
    const r = new Registry(); registerBuiltinTypes(r);
    await new VaultLoader(r, vault, R).indexAll();
    expect(lib(r, "spell", "glint")).toBe(true); expect(r.problems()).toEqual([]);
  });
});
