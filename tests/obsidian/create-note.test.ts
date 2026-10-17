import { buildCharacter, characterFrontmatter, newDraft } from "../../src/core/builder";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { createNote, parentOf, renderNote, type NoteIO } from "../../src/obsidian/create-note";
import { homebrewRegistry } from "../fixtures/homebrew";

/** JSON is YAML, so the fake stringify lets the test read the frontmatter back the way Obsidian's metadata cache would. */
const stringify = (o: Record<string, unknown>) => JSON.stringify(o, null, 2);
const fakeVault = () => {
  const files = new Map<string, string>(), folders = new Set<string>();
  const io: NoteIO = {
    exists: p => files.has(p) || folders.has(p),
    ensureFolder: async p => { let b = ""; for (const part of p.split("/")) { b = b ? `${b}/${part}` : part; folders.add(b); } },
    create: async (p, t) => { files.set(p, t); },
  };
  return { io, files, folders };
};
const frontmatterOf = (text: string) => JSON.parse(/^---\n([\s\S]*?)\n---\n/.exec(text)![1]) as Record<string, unknown>;

describe("renderNote", () => {
  it("frontmatter between fences, then the body", () => {
    expect(renderNote({ a: 1 }, "Hello", () => "a: 1\n")).toBe("---\na: 1\n---\n\nHello\n");
  });
  it("parentOf", () => { expect(parentOf("a/b/c.md")).toBe("a/b"); expect(parentOf("c.md")).toBe(""); });
});

describe("createNote", () => {
  const reg = homebrewRegistry();
  const draft = { ...newDraft(), name: "Vex", race: "skink", background: "cartographer", classId: "skirmisher", method: "standard-array" as const,
    scores: { str: 8, dex: 15, con: 13, int: 14, wis: 10, cha: 12 }, choices: { "race:skink:choose-2": ["elvish"], "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] } };

  it("creates folders and a note whose frontmatter parses and is writable", async () => {
    const r = buildCharacter(draft, reg, seeded(2)); if ("error" in r) throw new Error(r.error);
    const v = fakeVault();
    await createNote(v.io, "5e-sheet/Characters/Vex.md", characterFrontmatter(r.value), "Notes.", stringify);
    expect([...v.folders]).toEqual(["5e-sheet", "5e-sheet/Characters"]);
    const parsed = parseNote(frontmatterOf(v.files.get("5e-sheet/Characters/Vex.md")!));
    expect(parsed.kind).toBe("character");
    if (parsed.kind !== "character") return;
    expect(parsed.errors).toEqual([]); expect(parsed.writable).toBe(true); expect(parsed.value).toEqual(r.value);
    expect(v.files.get("5e-sheet/Characters/Vex.md")).toMatch(/\n---\n\nNotes\.\n$/);
  });
  it("never overwrites an existing note", async () => {
    const v = fakeVault(); v.files.set("Vex.md", "mine");
    await expect(createNote(v.io, "Vex.md", { type: "5e-character" }, "x", stringify)).rejects.toThrow("already exists");
    expect(v.files.get("Vex.md")).toBe("mine");
  });
});
