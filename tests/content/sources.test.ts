import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { compareSources, locate, sourceOn } from "../../src/content/sources";
import { registerBuiltinTypes } from "../../src/content/types";
import { campaignType } from "../../src/content/types/campaign";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, type Notes } from "../fixtures/library";

const R = "compendium/5e";
const setup = async (notes: Notes, srd = false) => {
  const r = new Registry(); registerBuiltinTypes(r); if (srd) loadSrd(r);
  const a = fakeVault(notes), l = new VaultLoader(r, a, R); await l.indexAll();
  return { r, a, l };
};
const cond = (name: string, extra: Record<string, unknown> = {}) => ({ fm: { type: "5e-condition", name, ...extra } });
const cls = (name: string, extra: Record<string, unknown> = {}) => ({ fm: { type: "5e-class", name, hitDie: 8, saves: ["str", "con"], ...extra } });
const sub = (name: string, extra: Record<string, unknown> = {}) => ({ fm: { type: "5e-subclass", name, levels: {}, ...extra } });

describe("source from folder", () => {
  it("the first folder under the root is the source; notes in the root are Homebrew; bundled content is WotC (SRD)", async () => {
    const { r } = await setup({
      [`${R}/Roll20/Items/Charm.md`]: { fm: { type: "5e-item", name: "Charm", kind: "gear" } },
      [`${R}/Critical Role/Conditions/Hex.md`]: cond("Hex"),
      [`${R}/Loose.md`]: cond("Loose"),
      [`${R}/My Table/Deep/Er/Still.md`]: cond("Still"),
    }, true);
    expect(r.get("item", "charm")!.sourceName).toBe("Roll20");
    expect(r.get("condition", "hex")!.sourceName).toBe("Critical Role");
    expect(r.get("condition", "loose")!.sourceName).toBe("Homebrew");
    expect(r.get("condition", "still")!.sourceName).toBe("My Table");
    expect(r.get("condition", "poisoned")!.sourceName).toBe("WotC (SRD)");
    expect(r.sources()).toEqual(["Homebrew", "Critical Role", "My Table", "Roll20", "WotC (SRD)"]);
  });

  it("a frontmatter source is ignored: the folder decides", async () => {
    const { r } = await setup({ [`${R}/Roll20/Hex.md`]: cond("Hex", { source: "Homebrew" }) });
    expect(r.get("condition", "hex")!.sourceName).toBe("Roll20");
  });

  it("moving a note between source folders changes its source live", async () => {
    const { r, a, l } = await setup({ [`${R}/Homebrew/Hex.md`]: cond("Hex") });
    a.notes[`${R}/Roll20/Hex.md`] = a.notes[`${R}/Homebrew/Hex.md`]; delete a.notes[`${R}/Homebrew/Hex.md`];
    await l.renamed(`${R}/Roll20/Hex.md`, `${R}/Homebrew/Hex.md`);
    expect(r.getAll("condition", "hex").map(e => e.sourceName)).toEqual(["Roll20"]);
  });

  it("locate: paths outside the root and non-notes are not content", () => {
    expect(locate(R, "other/X.md")).toBeNull(); expect(locate(R, `${R}/a.png`)).toBeNull();
    expect(locate(`${R}/`, `${R}/Roll20/x/y.md`)).toEqual({ source: "Roll20", rest: ["x", "y.md"] });
  });
});

describe("precedence", () => {
  const same = {
    [`${R}/Roll20/Hex.md`]: cond("Hex", { rules: "roll20" }), [`${R}/Homebrew/Hex.md`]: cond("Hex", { rules: "homebrew" }),
    [`${R}/Critical Role/Hex.md`]: cond("Hex", { rules: "cr" }), [`${R}/WotC/Conditions/Hex.md`]: { fm: { type: "5e-condition", id: "hex", name: "Hex", source: "PHB" } },
  };
  it("Homebrew > other user sources alphabetically > WotC library > WotC (SRD)", async () => {
    const { r } = await setup(same);
    r.add("srd", "condition", { id: "hex", name: "Hex", rules: "srd" });
    expect(r.getAll("condition", "hex").map(e => e.sourceName)).toEqual(["Homebrew", "Critical Role", "Roll20", "WotC", "WotC (SRD)"]);
    expect(r.get<any>("condition", "hex")!.sourceName).toBe("Homebrew");
    expect(r.list("condition")).toHaveLength(1);
    expect(r.listAll("condition")).toHaveLength(5);
  });
  it("without Homebrew the alphabetically first user source wins; the library beats the SRD", async () => {
    const { r } = await setup(same);
    r.add("srd", "condition", { id: "hex", name: "Hex" });
    r.removePath(`${R}/Homebrew/Hex.md`);
    expect(r.get("condition", "hex")!.sourceName).toBe("Critical Role");
    r.removePath(`${R}/Critical Role/Hex.md`); r.removePath(`${R}/Roll20/Hex.md`);
    // The library note maps no mechanics here (the SRD entry was added after indexing), so the SRD entry keeps the sheet (see precedence.test.ts).
    expect(r.get("condition", "hex")!.sourceName).toBe("WotC (SRD)");
    expect(r.getAll("condition", "hex").map(e => e.sourceName)).toEqual(["WotC", "WotC (SRD)"]);
    r.removePath(`${R}/WotC/Conditions/Hex.md`);
    expect(r.get("condition", "hex")!.sourceName).toBe("WotC (SRD)");
  });
  it("compareSources orders groups", () => {
    expect(["WotC (SRD)", "WotC", "Roll20", "Homebrew", "Critical Role"].sort(compareSources)).toEqual(["Homebrew", "Critical Role", "Roll20", "WotC", "WotC (SRD)"]);
  });
});

describe("campaign source switches", () => {
  it("parses sources, absent means on, bad values are errors", () => {
    const ok = campaignType.validate({ name: "C", sources: { Roll20: false, "Critical Role": true } });
    expect(ok.value!.sources).toEqual({ Roll20: false, "Critical Role": true });
    expect(campaignType.validate({ name: "C" }).value!.sources).toEqual({});
    expect(campaignType.validate({ name: "C", sources: { Roll20: "no" } }).errors).toEqual(["sources.Roll20: must be true or false"]);
    expect(campaignType.validate({ name: "C", sources: [] }).errors).toEqual(["sources: must be a mapping such as { Roll20: false }"]);
    expect(sourceOn({ Roll20: false }, "Roll20")).toBe(false); expect(sourceOn({ Roll20: false }, "Homebrew")).toBe(true); expect(sourceOn(undefined, "x")).toBe(true);
  });
  it("off sources are left out of list and get; the next source takes over; the browser lists still see everything", async () => {
    const { r } = await setup({
      [`${R}/Homebrew/Hex.md`]: cond("Hex"), [`${R}/Roll20/Hex.md`]: cond("Hex"), [`${R}/Roll20/Only.md`]: cond("Only"),
    });
    const sources = { Homebrew: false, Roll20: true };
    expect(r.get("condition", "hex", { sources })!.sourceName).toBe("Roll20");
    expect(r.list("condition", { sources: { Roll20: false } }).map(e => e.id)).toEqual(["hex"]);
    expect(r.get("condition", "only", { sources: { Roll20: false } })).toBeUndefined();
    expect(r.get("condition", "only")).toBeDefined();   // without switches (a character already using it) it still resolves
    expect(r.listAll("condition")).toHaveLength(3);
  });
});

describe("class and subclass folders", () => {
  const T = `${R}/Roll20/Classes/Tactician`;
  it("a subclass takes its class from its folder, even when its frontmatter says otherwise", async () => {
    const { r } = await setup({
      [`${T}/Tactician.md`]: cls("Tactician"),
      [`${T}/Subclasses/Scholar.md`]: sub("Scholar", { class: "wizard" }),
      [`${R}/Roll20/Classes/Odd Class/Subclasses/NoClass.md`]: sub("Free"),
    });
    expect(r.get<any>("class", "tactician")!.sourceName).toBe("Roll20");
    expect(r.get<any>("subclass", "scholar")!.data.class).toBe("tactician");
    expect(r.get<any>("subclass", "free")!.data.class).toBe("odd-class");
    expect(r.problems()).toEqual([]);
  });
  it("a homebrew subclass attaches to another source's class by folder name", async () => {
    const { r } = await setup({ [`${T}/Tactician.md`]: cls("Tactician"), [`${R}/Homebrew/Classes/Tactician/Subclasses/Arbiter.md`]: sub("Arbiter") });
    const e = r.get<any>("subclass", "arbiter")!;
    expect(e.sourceName).toBe("Homebrew"); expect(e.data.class).toBe("tactician");
    expect(r.list<any>("subclass").filter(s => s.data.class === "tactician").map(s => s.name)).toEqual(["Arbiter"]);
  });
  it("an explicit class id on the class note is what subclasses attach to, whichever loads first", async () => {
    const notes = { [`${T}/Subclasses/Scholar.md`]: sub("Scholar"), [`${T}/Tactician.md`]: cls("Tactician", { id: "tact" }) };
    const { r } = await setup(notes);
    expect(r.get<any>("class", "tact")).toBeDefined();
    expect(r.get<any>("subclass", "scholar")!.data.class).toBe("tact");
  });
  it("renaming the class folder keeps its subclasses attached to the (renamed) class", async () => {
    const { r, a, l } = await setup({ [`${T}/Tactician.md`]: cls("Tactician"), [`${T}/Subclasses/Scholar.md`]: sub("Scholar") });
    const N = `${R}/Roll20/Classes/Warlord`;
    for (const [from, to] of [[`${T}/Tactician.md`, `${N}/Tactician.md`], [`${T}/Subclasses/Scholar.md`, `${N}/Subclasses/Scholar.md`]]) {
      a.notes[to] = a.notes[from]; delete a.notes[from]; await l.renamed(to, from);
    }
    expect(r.get<any>("class", "tactician")).toBeDefined();
    // The class note keeps its id (its name), the subclass follows the class note in the same folder.
    expect(r.get<any>("subclass", "scholar")!.data.class).toBe("tactician");
  });
  it("moving only the class note away re-points subclasses to the folder name", async () => {
    const { r, a, l } = await setup({ [`${T}/Tactician.md`]: cls("Tactician", { id: "tact" }), [`${T}/Subclasses/Scholar.md`]: sub("Scholar") });
    expect(r.get<any>("subclass", "scholar")!.data.class).toBe("tact");
    delete a.notes[`${T}/Tactician.md`]; l.deleted(`${T}/Tactician.md`);
    expect(r.get<any>("subclass", "scholar")!.data.class).toBe("tactician");
  });
});
