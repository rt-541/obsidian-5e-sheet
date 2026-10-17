import { existsSync, readFileSync } from "node:fs";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { VaultLoader, type VaultAdapter, type VaultNote } from "../../src/content/vault-loader";
import { parseNote } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { missingIds } from "../../src/core/effects";

/**
 * Validates a real vault layout (Stage C migration check). Skipped unless VAULT_JSON points at the output of
 * scripts/vault-to-json.py run on the vault root. VAULT_ROOT is the compendium folder inside it (default compendium/5e).
 * The JSON holds the user's note text, so it lives outside git.
 */
const file = process.env.VAULT_JSON;
const root = (process.env.VAULT_ROOT ?? "compendium/5e").replace(/\/+$/, "");
const run = file && existsSync(file) ? describe : describe.skip;
interface Dump { path: string; fm: Record<string, unknown> | null; body: string }

run("vault layout", () => {
  const notes: Dump[] = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const byPath = new Map(notes.map(n => [n.path, n]));
  const adapter: VaultAdapter = {
    listMarkdown: folder => notes.map(n => n.path).filter(p => p.startsWith(folder + "/")),
    read: async (path): Promise<VaultNote> => ({ path, frontmatter: byPath.get(path)?.fm ?? undefined, body: byPath.get(path)?.body ?? "" }),
  };
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const loader = new VaultLoader(r, adapter, root);
  beforeAll(async () => { await loader.indexAll(); });

  it("every note validates", () => { expect(r.problems()).toEqual([]); });

  it("subclasses attach to their parent class by folder", () => {
    const subs = (cls: string) => r.list<{ class?: string }>("subclass").filter(e => e.data.class === cls).map(e => e.name).sort();
    if (notes.some(n => n.path.startsWith(`${root}/Roll20/Classes/Tactician/`)))
      expect(subs("tactician")).toEqual(expect.arrayContaining(["Grandmaster", "Mentalist", "Scholar", "War Mind"]));
    if (notes.some(n => n.path.startsWith(`${root}/Homebrew/Classes/Tactician/Subclasses/`)))
      expect(subs("tactician")).toEqual(expect.arrayContaining(["Arbiter", "Field Marshal", "Spymaster", "Wyrm Strategist"]));
    if (notes.some(n => n.path.startsWith(`${root}/Critical Role/Classes/Blood Hunter/`)))
      expect(subs("blood-hunter").length).toBe(4);
  });

  it("every content note carries the 5e tag scheme", () => {
    for (const n of notes.filter(n => n.path.startsWith(root + "/") && typeof n.fm?.type === "string" && n.fm.type.startsWith("5e-"))) {
      const tags = (n.fm!.tags ?? []) as string[], t = (n.fm!.type as string).slice(3);
      expect(tags, n.path).toContain(`5e/${t}`);
      expect(tags.some(x => x.startsWith("5e/source/")), n.path).toBe(true);
      expect(tags.some(x => /^source\//.test(x)), n.path).toBe(false);
    }
  });

  it("Azur derives the recorded numbers and every referenced id resolves", () => {
    const azur = notes.find(n => n.path.endsWith("Characters/Azur.md"));
    if (!azur) return;
    const p = parseNote(azur.fm);
    if (p.kind !== "character") throw new Error("Azur is not a character");
    const s = deriveCharacter(p.value, { registry: r });
    expect(s.ac.value).toBe(19);
    expect(s.saves.int.mod).toBe(7);
    expect(s.skills.find(x => x.id === "investigation")!.mod).toBe(10);
    expect(s.resources.find(x => x.name === "Perfect Plan Dice")!.max).toBe(7);
    expect(s.progress.dcs.find(x => x.name === "Analysis")!.dc).toBe(15);
    expect(s.missing).toEqual([]);
    expect(s.progress.unknown).toEqual([]);
    expect(s.progress.problems).toEqual([]);
  });

  it("each homebrew Tactician subclass levels to 18 without problems", () => {
    const azur = notes.find(n => n.path.endsWith("Characters/Azur.md"));
    const subs = notes.filter(n => n.path.startsWith(`${root}/Homebrew/Classes/Tactician/Subclasses/`));
    if (!azur || !subs.length) return;
    for (const sc of subs) {
      const id = (sc.fm!.name as string).toLowerCase().replace(/ /g, "-");
      const p = parseNote({ ...azur.fm, classes: [{ class: "tactician", subclass: id, level: 18 }], levelLog: [] });
      if (p.kind !== "character") throw new Error("not a character");
      const s = deriveCharacter(p.value, { registry: r });
      expect(s.progress.problems, id).toEqual([]);
      expect(s.progress.unknown, id).toEqual([]);
      const levels = new Set(s.progress.features.filter(f => f.sourceKind === "subclass").map(f => f.level));
      expect([...levels].sort((a, b) => a - b), id).toEqual([3, 6, 10, 15, 18]);
    }
  });

  it("characters and examples resolve their item and condition ids", () => {
    for (const n of notes.filter(n => /(Characters|Examples)\//.test(n.path))) {
      const p = parseNote(n.fm);
      if (p.kind !== "character") continue;
      expect(missingIds(p.value, r), n.path).toEqual([]);
    }
  });
});
