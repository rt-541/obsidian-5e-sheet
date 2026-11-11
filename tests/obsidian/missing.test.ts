import { NoteStore, type Timers } from "../../src/obsidian/store";
import { parseNote } from "../../src/core/character";
import { thalia } from "../fixtures/notes";

describe("NoteStore missing target", () => {
  it("reports a write whose note no longer exists instead of dropping it silently", async () => {
    const jobs: (() => void)[] = [];
    const t: Timers = { set: fn => { jobs.push(fn); return jobs.length; }, clear: () => {}, now: () => 0 };
    const missing: string[] = [];
    const s = new NoteStore({ process: async () => false }, 300, t, 1500, p => missing.push(p));
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    s.queue("Gone.md", p.value);
    await s.flush();
    expect(missing).toEqual(["Gone.md"]);
  });
});
