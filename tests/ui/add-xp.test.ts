// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const note = { type: "5e-character", schema: 1, name: "Pell", classes: [{ class: "skirmisher", level: 2 }], xp: 250,
  abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 }, hp: { max: 17, current: 17, temp: 0 } };

function setup(layout: "desktop" | "tablet" | "mobile") {
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: homebrewRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(1) };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  return { ctl, root, saved, notices, q, last: () => saved[saved.length - 1] as Character };
}

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`add XP (${layout})`, () => {
  it("in Play mode, + XP asks how much was earned and adds it to the total", () => {
    const s = setup(layout);
    expect(s.ctl.editing).toBe(false);
    s.q('[data-act="add-xp"]').click();
    const box = s.q('[data-keep="xp-add"]') as HTMLInputElement;
    expect(box.type).toBe("number");
    box.value = "300"; s.q('[data-act="xp-add-apply"]').click();
    expect(s.last().xp).toBe(550);
    expect(s.notices.at(-1)).toBe("+300 XP (total 550)");
    expect(s.q('[data-keep="xp-add"]')).toBeNull();
  });
  it("Enter adds too; Cancel, empty, zero or negative amounts change nothing", () => {
    const s = setup(layout);
    s.q('[data-act="add-xp"]').click(); s.q('[data-act="xp-add-cancel"]').click();
    expect(s.q('[data-keep="xp-add"]')).toBeNull(); expect(s.saved).toEqual([]);
    s.q('[data-act="add-xp"]').click();
    for (const v of ["", "0", "-5", "abc"]) {
      (s.q('[data-keep="xp-add"]') as HTMLInputElement).value = v; s.q('[data-act="xp-add-apply"]').click();
      expect(s.notices.at(-1)).toBe("Type the XP earned: a whole number above 0.");
    }
    expect(s.saved).toEqual([]);
    const box = s.q('[data-keep="xp-add"]') as HTMLInputElement; box.value = "50";
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(s.last().xp).toBe(300);
  });
});
