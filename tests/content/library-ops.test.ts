import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { VaultLoader } from "../../src/content/vault-loader";
import { parseNote } from "../../src/core/character";
import { progress } from "../../src/core/progression";
import { fakeVault, LIB_ROOT, type Notes } from "../fixtures/library";

/**
 * Op-format library notes (the importer writes classes, subclasses, races and feats in the op format) load as usable entries;
 * one that fails validation is reference-only. A bundled entry of the same id keeps precedence. Every name here is invented.
 */
const CLS = `${LIB_ROOT}/Classes/Test Fighter`;
const notes: Notes = {
  [`${CLS}/Test Fighter.md`]: { fm: { type: "5e-class", schema: 1, id: "test-fighter", name: "Test Fighter", source: "TST", hitDie: 10, saves: ["str", "con"],
    subclassLevel: 3, tags: ["5e/class", "5e/source/tst"],
    levels: {
      1: [{ id: "steady-breath", op: "feature", name: "Steady Breath", text: "Invented." }, { id: "res-steady-breath", op: "resource", name: "Steady Breath", max: 1, reset: "short" }],
      3: [{ id: "subclass", op: "subclass" }],
    } } },
  [`${CLS}/Subclasses/Path of Sparks.md`]: { fm: { type: "5e-subclass", schema: 1, id: "path-of-sparks", name: "Path of Sparks", source: "TST",
    tags: ["5e/subclass", "5e/source/tst"], levels: { 3: [{ id: "spark-step", op: "feature", name: "Spark Step", text: "Invented." }] } } },
  [`${LIB_ROOT}/Races/Testling/Testling.md`]: { fm: { type: "5e-race", schema: 1, id: "testling", name: "Testling", source: "TST", size: "Small", speed: 25,
    tags: ["5e/race", "5e/source/tst"], grants: [{ id: "tiny-trick", op: "feature", name: "Tiny Trick", text: "Invented." }] } },
  [`${LIB_ROOT}/Classes/Broken/Broken.md`]: { fm: { type: "5e-class", schema: 1, id: "broken", name: "Broken", source: "TST", hitDie: "big", tags: ["5e/class"] } },
  [`${LIB_ROOT}/Classes/Fighter/Fighter.md`]: { fm: { type: "5e-class", schema: 1, id: "fighter", name: "Fighter", source: "TST", hitDie: 6, levels: {} } },
};

const setup = async () => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  await new VaultLoader(r, fakeVault(notes), "compendium/5e").indexAll();
  return r;
};

describe("op-format library notes", () => {
  it("a library class and its subclass are usable and level like homebrew", async () => {
    const r = await setup();
    const cls = r.get<any>("class", "test-fighter")!;
    expect(cls.library).toBe(true); expect(cls.referenceOnly).toBeUndefined(); expect(cls.sourceName).toBe("WotC"); expect(cls.book).toBe("TST");
    expect(r.get<any>("subclass", "path-of-sparks")!.data.class).toBe("test-fighter");
    const p = parseNote({ type: "5e-character", name: "T", classes: [{ class: "test-fighter", subclass: "path-of-sparks", level: 3 }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { max: 10, current: 10, temp: 0 } });
    if (p.kind !== "character") throw new Error("not a character");
    const pr = progress(p.value, r);
    expect(pr.problems).toEqual([]);
    expect(pr.features.map(f => f.name)).toEqual(expect.arrayContaining(["Steady Breath", "Spark Step"]));
  });
  it("a library race is usable", async () => {
    expect((await setup()).get<any>("race", "testling")!.referenceOnly).toBeUndefined();
  });
  it("a broken library class is reference only, never a user problem", async () => {
    const r = await setup();
    expect(r.problems()).toEqual([]);
    expect(r.getAll<any>("class", "broken")[0].referenceOnly).toBeTruthy();
  });
  it("the bundled class of the same id keeps precedence, so characters keep their recorded choices", async () => {
    const r = await setup();
    expect(r.get<any>("class", "fighter")!.source).toBe("srd");
    expect(r.getAll<any>("class", "fighter").some(e => e.library)).toBe(true);
  });
});
