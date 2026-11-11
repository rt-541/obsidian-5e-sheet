// @vitest-environment jsdom
import { parseNote, writeInto, newCharacter } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { deriveCharacter } from "../../src/core/derive";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const base = { type: "5e-character", schema: 1, name: "Lang", classes: [{ class: "skirmisher", level: 1 }], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { max: 8, current: 8, temp: 0 } };

describe("manual languages", () => {
  it("parses languages, defaults to empty and rejects non-text", () => {
    const ok = parseNote({ ...base, languages: ["Infernal"] });
    expect(ok.kind === "character" && ok.value.languages).toEqual(["Infernal"]);
    const none = parseNote(base);
    expect(none.kind === "character" && none.value.languages).toEqual([]);
    const bad = parseNote({ ...base, languages: "Infernal" });
    expect(bad.kind === "character" && bad.errors.length).toBeGreaterThan(0);
  });
  it("writes only when set", () => {
    const fm: Record<string, unknown> = { ...base };
    const c = newCharacter("Lang"); writeInto(fm, c); expect("languages" in fm).toBe(false);
    c.languages = ["Infernal"]; writeInto(fm, c); expect(fm.languages).toEqual(["Infernal"]);
  });
  it("merges into derived languages without duplicates", () => {
    const p = parseNote({ ...base, languages: ["Infernal", "infernal"] });
    if (p.kind !== "character") throw new Error();
    const st = deriveCharacter(p.value, { registry: homebrewRegistry() });
    const langs = st.languages ?? [];
    expect(langs).toContain("Infernal");
    expect(new Set(langs.map(l => l.toLowerCase())).size).toBe(langs.length);
  });
  it("is editable in Edit mode and shown in Play mode", () => {
    const host: SheetHost = { registry: homebrewRegistry(), ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3) };
    const p = parseNote({ ...base, languages: ["Infernal"] }); if (p.kind === "none") throw new Error();
    const ctl = new SheetController(host, p), root = document.createElement("div"); document.body.append(root); mountSheet(root, ctl, false);
    ctl.setEditing(true);
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Languages"]')!;
    expect(input.value).toBe("Infernal");
    input.value = "Infernal, Sylvan"; input.dispatchEvent(new Event("change"));
    expect((ctl.value as { languages: string[] }).languages).toEqual(["Infernal", "Sylvan"]);
    ctl.setEditing(false);
    expect(root.textContent).toContain("Infernal, Sylvan");
  });
});
