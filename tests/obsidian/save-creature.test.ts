import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { blankDraft, type Draft } from "../../src/content/creature-note";
import { creatureType } from "../../src/content/types/creature";
import type { NoteIO } from "../../src/obsidian/create-note";
import { saveCreature } from "../../src/obsidian/save-creature";

const stringify = (o: Record<string, unknown>) => JSON.stringify(o);
const fakeVault = () => {
  const files = new Map<string, string>();
  const io: NoteIO = { exists: p => files.has(p), ensureFolder: async () => undefined, create: async (p, t) => { files.set(p, t); } };
  return { io, files };
};
const draft = (name: string): Draft => ({ ...blankDraft(), name, ac: 12, hpAvg: 9, hpFormula: "2d8", attacks: [{ name: "Nip", toHit: 2, damage: "1d4 piercing" }], traits: [{ name: "Shiny", text: "Glints in the light." }] });
const setup = () => { const registry = new Registry(); registerBuiltinTypes(registry); loadSrd(registry); const v = fakeVault();
  return { registry, v, deps: { registry, io: v.io, compendiumFolder: "compendium/5e/", stringify } }; };

describe("saveCreature (the host contract behind SheetHost.saveCreature)", () => {
  it("writes Homebrew/Creatures/<Name>.md in the native frontmatter and registers it at once", async () => {
    const { registry, v, deps } = setup();
    const r = await saveCreature(deps, draft("Glass Beetle"));
    expect(r).toEqual({ id: "glass-beetle", name: "Glass Beetle", path: "compendium/5e/Homebrew/Creatures/Glass Beetle.md" });
    const text = v.files.get(r.path)!;
    const fm = JSON.parse(/^---\n([\s\S]*?)\n---/.exec(text)![1]);
    expect(fm).toMatchObject({ type: "5e-creature", id: "glass-beetle", name: "Glass Beetle", ac: 12, hp: { average: 9, formula: "2d8" } });
    expect(creatureType.validate(fm).errors).toEqual([]);
    expect(text).toContain("***Shiny.*** Glints in the light.");
    // usable immediately, before the vault re-indexes the file
    expect(registry.get("creature", "glass-beetle")).toMatchObject({ name: "Glass Beetle", sourceName: "Homebrew", path: r.path });
  });

  it("never overwrites: a taken file name or an existing creature id gets (2), (3)", async () => {
    const { registry, v, deps } = setup();
    const a = await saveCreature(deps, draft("Glass Beetle")), b = await saveCreature(deps, draft("Glass Beetle")), c = await saveCreature(deps, draft("Glass Beetle"));
    expect([a.name, b.name, c.name]).toEqual(["Glass Beetle", "Glass Beetle (2)", "Glass Beetle (3)"]);
    expect([a.id, b.id, c.id]).toEqual(["glass-beetle", "glass-beetle-2", "glass-beetle-3"]);
    expect(v.files.size).toBe(3);
    // a name that collides with a bundled creature id is renamed rather than shadowing it
    const wolf = await saveCreature(deps, draft("Wolf"));
    expect(wolf.name).toBe("Wolf (2)");
    expect(registry.get("creature", "wolf")!.sourceName).not.toBe("Homebrew");
  });

  it("refuses an invalid draft in plain words and writes nothing", async () => {
    const { v, deps } = setup();
    await expect(saveCreature(deps, { ...draft("X"), ac: undefined })).rejects.toThrow("Armor Class must be a whole number, like 12.");
    expect(v.files.size).toBe(0);
  });

  it("keeps odd characters out of the file name", async () => {
    const { deps } = setup();
    expect((await saveCreature(deps, draft("Bat/Moth: the [Third]"))).path).toBe("compendium/5e/Homebrew/Creatures/Bat Moth the Third.md");
  });
});
