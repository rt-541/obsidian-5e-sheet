import { NoteStore, campaignLink, stripFrontmatter, type Timers } from "../../src/obsidian/store";
import { parseNote, type Character } from "../../src/core/character";
import { thalia } from "../fixtures/notes";

function clock() {
  let now = 0, id = 0; const jobs = new Map<number, { at: number; fn: () => void }>();
  const t: Timers & { advance(ms: number): Promise<void> } = {
    set: (fn, ms) => { jobs.set(++id, { at: now + ms, fn }); return id; },
    clear: h => { jobs.delete(h as number); },
    now: () => now,
    async advance(ms) { now += ms; for (const [k, j] of [...jobs]) if (j.at <= now) { jobs.delete(k); j.fn(); } await Promise.resolve(); await Promise.resolve(); },
  };
  return t;
}
const base = (): Character => { const p = parseNote(thalia); if (p.kind !== "character") throw new Error(); return p.value; };

describe("NoteStore", () => {
  it("ten rapid changes become one write of the latest value", async () => {
    const files: Record<string, Record<string, unknown>> = { "T.md": structuredClone(thalia) };
    let writes = 0;
    const t = clock(), s = new NoteStore({ process: async (p, fn) => { writes++; fn(files[p]); } }, 300, t);
    let c = base();
    for (let i = 1; i <= 10; i++) { c = structuredClone(c); c.hp.current = 31 - i; s.queue("T.md", c); await t.advance(50); }
    expect(writes).toBe(0);
    await t.advance(300);
    expect(writes).toBe(1); expect((files["T.md"].hp as { current: number }).current).toBe(21);
  });
  it("own writes are recognised for a short window", async () => {
    const t = clock(), s = new NoteStore({ process: async () => {} }, 300, t);
    s.queue("T.md", base()); await t.advance(300);
    expect(s.isOwnWrite("T.md")).toBe(true); await t.advance(2000); expect(s.isOwnWrite("T.md")).toBe(false);
  });
  it("an external edit during a pending change keeps the local change and the external extra keys", async () => {
    const files: Record<string, Record<string, unknown>> = { "T.md": structuredClone(thalia) };
    const t = clock(), s = new NoteStore({ process: async (p, fn) => fn(files[p]) }, 300, t);
    const c = base(); c.hp.current = 5; s.queue("T.md", c);
    files["T.md"] = { ...files["T.md"], hp: { max: 43, current: 40, temp: 0 }, syncedTag: "from phone" };   // Sync rewrites the file
    expect(s.pending("T.md")!.type).toBe("5e-character");
    await t.advance(300);
    expect((files["T.md"].hp as { current: number }).current).toBe(5); expect(files["T.md"].syncedTag).toBe("from phone");
  });
  it("flush writes immediately (used when the view closes)", async () => {
    let writes = 0; const s = new NoteStore({ process: async () => { writes++; } }, 300, clock());
    s.queue("T.md", base()); await s.flush(); expect(writes).toBe(1); expect(s.pending("T.md")).toBeUndefined();
  });
  it("rename moves a pending write to the new path", async () => {
    const seen: string[] = [], t = clock(), s = new NoteStore({ process: async p => { seen.push(p); } }, 300, t);
    s.queue("Old.md", base()); s.rename("Old.md", "New.md"); await t.advance(300); expect(seen).toEqual(["New.md"]);
  });
});

describe("helpers", () => {
  it("campaign links", () => {
    expect(campaignLink("[[Ekron Campaign]]")).toBe("Ekron Campaign");
    expect(campaignLink("[[Ekron Campaign|the campaign]]")).toBe("Ekron Campaign");
    expect(campaignLink("Ekron Campaign")).toBe("Ekron Campaign");
    expect(campaignLink("")).toBeNull(); expect(campaignLink(undefined)).toBeNull();
  });
  it("strips frontmatter", () => {
    expect(stripFrontmatter("---\ntype: 5e-item\n---\nForged in ash.\n")).toBe("Forged in ash.");
    expect(stripFrontmatter("No frontmatter")).toBe("No frontmatter");
  });
});
