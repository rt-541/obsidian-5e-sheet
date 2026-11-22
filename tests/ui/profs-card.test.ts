// @vitest-environment jsdom
import { parseNote, writeInto, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { DESKTOP, MOBILE, TABLET } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

function setup(layout: "desktop" | "tablet" | "mobile", extra: object = {}) {
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: mechanicsRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(5) };
  const p = parseNote({ ...tester, ...extra }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  return { ctl, root, saved, notices, q, last: () => saved[saved.length - 1] as Character };
}
const card = (s: ReturnType<typeof setup>) => s.q('[data-feature="profs"]');
const type = (el: HTMLElement, v: string) => { (el as HTMLInputElement).value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };

describe("languages and proficiencies card", () => {
  it("sits at the bottom of the left column on desktop and tablet, and at the end of the phone's Check tab", () => {
    for (const l of [DESKTOP, TABLET]) expect(l.tabs.find(t => t.id === "main")!.columns[0].at(-1)).toBe("profs");
    expect(MOBILE.tabs.find(t => t.id === "checks")!.columns[0].at(-1)).toBe("profs");
  });
  it("lists languages and the other proficiencies, the note's own ones included", () => {
    const s = setup("desktop", { languages: ["Infernal"], proficiencies: { saves: [], skills: [], expertise: [], other: ["Smith's Tools"] } });
    const text = card(s).textContent!;
    expect(text).toContain("Languages"); expect(text).toContain("Infernal");
    expect(text).toContain("Armor, weapons and tools"); expect(text).toContain("Smith's Tools");
    expect(s.ctl.errors).toEqual([]);
  });
  it("Edit mode adds a proficiency and a language to the note, and removes only the ones the note added", () => {
    for (const layout of ["desktop", "tablet", "mobile"] as const) {
      const s = setup(layout); s.ctl.setEditing(true);
      type(s.q('[data-keep="prof-add-other"]'), "Smith's Tools"); s.q('[data-act="prof-add-other"]').click();
      expect(s.last().proficiencies.other).toEqual(["Smith's Tools"]);
      type(s.q('[data-keep="prof-add-languages"]'), "Infernal"); s.q('[data-act="prof-add-languages"]').click();
      expect(s.last().languages).toContain("Infernal");
      // adding the same one again (any case) changes nothing
      type(s.q('[data-keep="prof-add-other"]'), "smith's tools"); s.q('[data-act="prof-add-other"]').click();
      expect(s.last().proficiencies.other).toEqual(["Smith's Tools"]);
      (s.q('[data-remove-other="Smith\'s Tools"]') as HTMLElement).click();
      expect(s.last().proficiencies.other ?? []).toEqual([]);
      const removable = [...card(s).querySelectorAll("[data-remove-other]")].length;
      expect(removable).toBe(0);
    }
  });
  it("Play mode has no add boxes or remove buttons", () => {
    const s = setup("desktop", { proficiencies: { saves: [], skills: [], expertise: [], other: ["Smith's Tools"] } });
    expect(card(s).querySelector("input, [data-remove-other]")).toBeNull();
  });
  it("the note keeps proficiencies.other and drops it again when empty", () => {
    const p = parseNote({ ...tester, proficiencies: { saves: [], skills: [], expertise: [], other: ["Smith's Tools"] } });
    if (p.kind !== "character") throw new Error("not a character");
    const fm: Record<string, unknown> = { type: "5e-character", name: p.value.name }; writeInto(fm, p.value);
    expect((fm.proficiencies as { other?: string[] }).other).toEqual(["Smith's Tools"]);
  });
});
