import { parseNote, writeInto } from "../../src/core/character";

const note = (extra: Record<string, unknown> = {}) => ({ type: "5e-character", name: "A", ...extra });

describe("character edition", () => {
  it("a note without edition stays without it through parse and write", () => {
    const p = parseNote(note()) as any;
    expect(p.value.edition).toBeUndefined();
    const fm: any = note();
    writeInto(fm, p.value);
    expect("edition" in fm).toBe(false);
  });
  it("reads text and number editions and writes the text", () => {
    expect((parseNote(note({ edition: 2024 })) as any).value.edition).toBe("2024");
    expect((parseNote(note({ edition: "2014" })) as any).value.edition).toBe("2014");
    const p = parseNote(note({ edition: 2024 })) as any;
    const fm: any = note({ edition: 2024 });
    writeInto(fm, p.value);
    expect(fm.edition).toBe("2024");
  });
  it("rejects an unknown edition in plain words", () => {
    const p = parseNote(note({ edition: "3e" })) as any;
    expect(p.errors).toContain("edition: must be 2014 or 2024");
    expect(p.value?.edition).toBeUndefined();
  });
});
