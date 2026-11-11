// @vitest-environment jsdom
import { newCharacter, parseNote, writeInto, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const scout = { type: "5e-class", name: "Scout", hitDie: 8, levels: { 1: [
  { op: "feature", id: "terrain", name: "Favored Terrain", optional: true, text: "Pick a terrain you know well." }] } };
const reg = homebrewRegistry([scout]);

describe.each([["desktop", false], ["mobile", true]] as const)("optional feature page on the %s layout", (_n, mobile) => {
  it("asks yes or no, blocks Next until answered, and the answer lands in the level log", () => {
    const fm: Record<string, unknown> = { type: "5e-character", name: "Newbie" }; writeInto(fm, { ...newCharacter("Newbie"), abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 } });
    const saved: (Character | Npc)[] = [];
    const host: SheetHost = { registry: reg, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(2), body: "" };
    const p = parseNote(fm); if (p.kind === "none") throw new Error();
    const ctl = new SheetController(host, p), root = document.createElement("div");
    document.body.append(root); mountSheet(root, ctl, mobile);
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
    click('[data-act="level-up"]'); click('[data-class="scout"]'); click('[data-act="lu-next"]'); click('[data-act="lu-next"]');
    expect(q('[data-step="class:scout:1:terrain"]').textContent).toContain("Take optional feature Favored Terrain?");
    expect((q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(true);
    click('[data-opt="yes"]'); expect((q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(false);
    click('[data-act="lu-next"]');
    expect(q('[data-step="summary"]').textContent).toContain("Optional feature: Favored Terrain (taken)");
    click('[data-act="lu-apply"]');
    expect((saved[saved.length - 1] as Character).levelLog[0].choices["class:scout:1:terrain"]).toBe(true);
  });
});
