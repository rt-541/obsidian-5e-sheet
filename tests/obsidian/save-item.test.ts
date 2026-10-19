import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseItemBlock } from "../../src/content/itemblock";
import type { NoteIO } from "../../src/obsidian/create-note";
import { saveItem } from "../../src/obsidian/save-item";

const stringify = (o: Record<string, unknown>) => JSON.stringify(o);
const fakeVault = () => {
  const files = new Map<string, string>();
  const io: NoteIO = { exists: p => files.has(p), ensureFolder: async () => undefined, create: async (p, t) => { files.set(p, t); } };
  return { io, files };
};
const draft = (name: string) => parseItemBlock(`${name}\nWondrous item, rare (requires attunement)\nWeight: 2 lb.\nA lamp that hums.\nIt has 3 charges. It regains 1d3 charges daily at dawn.`).draft;
const setup = () => { const registry = new Registry(); registerBuiltinTypes(registry); loadSrd(registry); const v = fakeVault();
  return { registry, v, deps: { registry, io: v.io, compendiumFolder: "compendium/5e/", stringify } }; };

describe("saveItem (the host contract behind SheetHost.saveItem)", () => {
  it("writes Homebrew/Items/<Name>.md in the native frontmatter and registers it at once", async () => {
    const { registry, v, deps } = setup();
    const r = await saveItem(deps, draft("Humming Lamp"));
    expect(r).toEqual({ id: "humming-lamp", name: "Humming Lamp", path: "compendium/5e/Homebrew/Items/Humming Lamp.md" });
    const fm = JSON.parse(/^---\n([\s\S]*?)\n---/.exec(v.files.get(r.path)!)![1]);
    expect(fm).toMatchObject({ type: "5e-item", id: "humming-lamp", kind: "wondrous", charges: { max: 3, reset: "dawn" } });
    expect(registry.get("item", "humming-lamp")).toMatchObject({ name: "Humming Lamp", sourceName: "Homebrew", path: r.path });
  });
  it("never overwrites: a taken file name or an existing item id gets (2), (3)", async () => {
    const { v, deps } = setup();
    const names = [(await saveItem(deps, draft("Humming Lamp"))).name, (await saveItem(deps, draft("Humming Lamp"))).name, (await saveItem(deps, draft("Humming Lamp"))).name];
    expect(names).toEqual(["Humming Lamp", "Humming Lamp (2)", "Humming Lamp (3)"]);
    expect(v.files.size).toBe(3);
    expect((await saveItem(deps, draft("Dagger"))).name).toBe("Dagger (2)");   // a bundled item id is never shadowed
  });
  it("refuses an invalid draft in plain words and writes nothing", async () => {
    const { v, deps } = setup();
    await expect(saveItem(deps, { ...draft("X"), name: " " })).rejects.toThrow("Give the item a name.");
    expect(v.files.size).toBe(0);
  });
});
