import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { LIBRARY_MARKER } from "../../src/content/sources";
import { VaultLoader } from "../../src/content/vault-loader";
import { editionNotes, editionRegistry } from "../fixtures/editions";
import { fakeVault } from "../fixtures/library";
import { characterEdition, readEdition } from "../../src/core/edition";
import { canonRef, provenanceLine, qualifyRef, refFor, splitRef } from "../../src/content/edition";

describe("edition stamps", () => {
  it("reads editions as text or number", () => {
    expect(readEdition(2024)).toBe("2024"); expect(readEdition("2014")).toBe("2014"); expect(readEdition("2025")).toBeUndefined(); expect(characterEdition({})).toBe("2014");
  });
  it("stamps entries: unstamped library 2014, stamped 2024, SRD 2014, hand-made none", async () => {
    const { r } = await editionRegistry();
    expect(r.getAll("spell", "hush")[0].edition).toBe("2014"); expect(r.getAll("spell", "nova")[0].edition).toBe("2024");
    expect(r.srdEntry("condition", "prone")!.edition).toBe("2014"); expect(r.getAll("spell", "spark")[0].edition).toBeUndefined();
  });
  it("hand-made with edition that edition: a bare number loads as text", async () => {
    const notes = { ...editionNotes(), "compendium/5e/Homebrew/Spells/Ember.md": { fm: { type: "5e-spell", name: "Ember", level: 1, school: "Evocation", classes: ["wizard"], edition: 2024 }, body: "" } };
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    await new VaultLoader(r, fakeVault(notes, { markers: ["WotC 2024", "Test Press"].map(f => `compendium/5e/${f}/${LIBRARY_MARKER}`) }), "compendium/5e").indexAll();
    expect(r.getAll("spell", "ember")[0].edition).toBe("2024");
  });
  it("reference-only library notes keep their edition: stamped 2024, unstamped 2014", async () => {
    const bad = (fm: Record<string, unknown>) => ({ fm: { type: "5e-spell", schema: 1, id: "dud", name: "Dud", source: "TST", tags: ["5e/spell"], ...fm }, body: "" });
    const notes = { ...editionNotes(), "compendium/5e/WotC 2024/Spells/Dud.md": bad({ edition: 2024 }), "compendium/5e/Test Press/Spells/Dud.md": bad({}) };
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    await new VaultLoader(r, fakeVault(notes, { markers: ["WotC 2024", "Test Press"].map(f => `compendium/5e/${f}/${LIBRARY_MARKER}`) }), "compendium/5e").indexAll();
    const duds = r.getAll<any>("spell", "dud");
    expect(duds.every(d => d.referenceOnly)).toBe(true);
    expect(duds.find(d => d.sourceName === "WotC 2024")!.edition).toBe("2024"); expect(duds.find(d => d.sourceName === "Test Press")!.edition).toBe("2014");
  });
  it("keeps replaces as ids and nothing else", async () => {
    const { r } = await editionRegistry();
    expect(r.getAll<any>("class", "warden").find(e => e.edition === "2024")!.replaces).toEqual(["lantern-keeper"]);
  });
  it("splits and builds references", () => {
    expect(splitRef("glint@2014")).toEqual({ id: "glint", edition: "2014" }); expect(splitRef("a@b")).toEqual({ id: "a@b" });
    expect(qualifyRef("glint", "2024")).toBe("glint@2024");
    expect(canonRef("glint@2024", "2024")).toBe("glint"); expect(canonRef("glint@2014", "2024")).toBe("glint@2014");
  });
  it("refFor is plain for the own edition or none, else qualified", async () => {
    const { r } = await editionRegistry();
    const n = r.getAll("spell", "nova")[0], sp = r.getAll("spell", "spark")[0];
    expect(refFor(n, "2024")).toBe("nova"); expect(refFor(n, "2014")).toBe("nova@2024"); expect(refFor(sp, "2014")).toBe("spark");
  });
  it("provenanceLine names book and edition", async () => {
    const { r } = await editionRegistry();
    expect(provenanceLine(r.getAll("spell", "nova")[0])).toBe("WotC 2024 · TST · 2024 rules");
    expect(provenanceLine(r.getAll("spell", "hush")[0])).toBe("WotC · TST · 2014 rules");
    expect(provenanceLine(r.getAll("spell", "spark")[0])).toBe("Homebrew");
    expect(provenanceLine({ ...r.getAll("spell", "nova")[0], book: undefined })).toBe("WotC 2024 · 2024 rules");
  });
});
