import { parseNote, writeInto, newCharacter } from "../../src/core/character";
import { thalia } from "../fixtures/notes";

describe("concentration and spellUses", () => {
  it("absent by default and not written for untouched notes", () => {
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    expect(p.value.concentration).toBeUndefined();
    expect(p.value.inventory.every(e => e.spellUses === undefined)).toBe(true);
    const fm: Record<string, unknown> = structuredClone(thalia);
    writeInto(fm, p.value);
    expect("concentration" in fm).toBe(false);
    expect(JSON.stringify(fm.inventory)).not.toContain("spellUses");
    expect(JSON.stringify(newCharacter("x"))).not.toContain("concentration");
  });
  it("round-trips concentration and spellUses", () => {
    const fm: Record<string, unknown> = { ...structuredClone(thalia), concentration: "bless",
      inventory: [{ id: "warhammer", equipped: true, spellUses: { bless: 1, light: 2 } }] };
    const p = parseNote(fm); if (p.kind !== "character") throw new Error();
    expect(p.errors).toEqual([]); expect(p.writable).toBe(true);
    expect(p.value.concentration).toBe("bless"); expect(p.value.inventory[0].spellUses).toEqual({ bless: 1, light: 2 });
    const out: Record<string, unknown> = {};
    writeInto(out, p.value);
    expect(out.concentration).toBe("bless"); expect((out.inventory as any)[0].spellUses).toEqual({ bless: 1, light: 2 });
    const cleared = structuredClone(p.value); delete cleared.concentration;
    const out2: Record<string, unknown> = { ...out }; writeInto(out2, cleared);
    expect(out2.concentration).toBeUndefined();
  });
  it("concentration: 5 is an error and read-only", () => {
    const p = parseNote({ ...structuredClone(thalia), concentration: 5 }); if (p.kind !== "character") throw new Error();
    expect(p.errors).toContain("concentration: must be text"); expect(p.writable).toBe(false); expect(p.value.concentration).toBeUndefined();
  });
  it("bad spellUses are errors", () => {
    const p = parseNote({ ...structuredClone(thalia), inventory: [{ id: "warhammer", spellUses: { bless: "x" } }, { id: "shield", spellUses: 3 }] });
    if (p.kind !== "character") throw new Error();
    expect(p.errors).toEqual(["inventory[0].spellUses.bless: must be a whole number from 0", "inventory[1].spellUses: must be a mapping"]);
    expect(p.writable).toBe(false);
  });
});
