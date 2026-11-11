import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader, type VaultAdapter, type VaultNote } from "../../src/content/vault-loader";

function fake(notes: Record<string, { fm?: Record<string, unknown>; body?: string }>): VaultAdapter & { notes: typeof notes } {
  return {
    notes,
    listMarkdown: folder => Object.keys(notes).filter(p => p.startsWith(folder + "/")),
    read: async (path): Promise<VaultNote> => ({ path, frontmatter: notes[path]?.fm, body: notes[path]?.body ?? "" }),
  };
}
const setup = (notes: Record<string, { fm?: Record<string, unknown>; body?: string }>, folder = "Compendium") => {
  const r = new Registry(); registerBuiltinTypes(r); const a = fake(notes); return { r, a, l: new VaultLoader(r, a, folder) };
};

describe("VaultLoader", () => {
  it("indexes content notes under the folder only", async () => {
    const { r, l } = setup({
      "Compendium/Items/Emberheart Warhammer.md": { fm: { type: "5e-item", name: "Emberheart Warhammer", kind: "weapon", weapon: { dmg: "1d8", type: "bludgeoning", ab: "str", range: "melee" } }, body: "Forged in ash." },
      "Compendium/Conditions/Bleeding.md": { fm: { type: "5e-condition", name: "Bleeding" } },
      "Compendium/Thalia.md": { fm: { type: "5e-character", name: "Thalia" } },
      "Compendium/readme.md": {},
      "Elsewhere/Spoon.md": { fm: { type: "5e-item", name: "Spoon", kind: "gear" } },
    });
    expect(await l.indexAll()).toBe(2);
    expect(r.get<any>("item", "emberheart-warhammer")!.data.rules).toBe("Forged in ash.");
    expect(r.get("item", "spoon")).toBeUndefined();
  });
  it("a copied-in DM file appears on change, edits apply, delete removes", async () => {
    const { r, a, l } = setup({});
    a.notes["Compendium/Items/Ring.md"] = { fm: { type: "5e-item", name: "Ring of Ash", kind: "wondrous", attunement: true } };
    await l.changed("Compendium/Items/Ring.md");
    expect(r.get("item", "ring-of-ash")).toBeDefined();
    a.notes["Compendium/Items/Ring.md"].fm!.name = "Ring of Embers";
    await l.changed("Compendium/Items/Ring.md");
    expect(r.list<any>("item").map(e => e.name)).toEqual(["Ring of Embers"]);
    l.deleted("Compendium/Items/Ring.md");
    expect(r.list("item")).toEqual([]);
  });
  it("broken notes become problems, fixing them clears it", async () => {
    const { r, a, l } = setup({ "Compendium/Bad.md": { fm: { type: "5e-condition", name: "Bad", effects: "nope" } } });
    await l.indexAll(); expect(r.problems()).toEqual([{ path: "Compendium/Bad.md", errors: ["effects: must be a mapping"] }]);
    a.notes["Compendium/Bad.md"].fm!.effects = {}; await l.changed("Compendium/Bad.md"); expect(r.problems()).toEqual([]);
  });
  it("unknown 5e- type is reported", async () => {
    const { r, l } = setup({ "Compendium/X.md": { fm: { type: "5e-spaceship", name: "X" } } });
    await l.indexAll(); expect(r.problems()[0].errors).toEqual(["unknown content type spaceship"]);
  });
  it("type changed away removes the entry; rename out of folder removes it", async () => {
    const { r, a, l } = setup({ "Compendium/A.md": { fm: { type: "5e-condition", name: "A" } }, "Compendium/B.md": { fm: { type: "5e-condition", name: "B" } } });
    await l.indexAll();
    a.notes["Compendium/A.md"].fm = { tags: ["x"] }; await l.changed("Compendium/A.md");
    a.notes["Archive/B.md"] = a.notes["Compendium/B.md"]; delete a.notes["Compendium/B.md"]; await l.renamed("Archive/B.md", "Compendium/B.md");
    expect(r.list("condition")).toEqual([]);
  });
  it("trailing slash in the folder setting is fine, and changing folder re-indexes", async () => {
    const { r, l } = setup({ "Homebrew/Bleed.md": { fm: { type: "5e-condition", name: "Bleed" } } }, "Compendium/");
    await l.indexAll(); expect(r.list("condition")).toEqual([]);
    await l.setFolder("Homebrew/"); expect(r.list("condition")).toHaveLength(1);
  });
});
