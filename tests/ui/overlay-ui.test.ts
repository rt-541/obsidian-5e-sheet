// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { srdRegistry } from "../fixtures/overlay";
import { tester } from "../fixtures/mechanics";

function setup(note: object, mobile: boolean) {
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: srdRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [] };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, notices, q, click };
}
const barbarian = { race: "human", classes: [{ class: "barbarian", level: 5 }], abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } };

for (const mobile of [false, true]) describe(`built-in mechanics on the sheet (${mobile ? "mobile" : "desktop"})`, () => {
  it("a Barbarian from the SRD gets a Start Rage button, and starting it spends a use and says what changes", () => {
    const s = setup(barbarian, mobile);
    const card = s.q('[data-toggle-card="rage"]');
    expect((card.querySelector("button") as HTMLElement).textContent).toBe("Start Rage");
    expect(card.textContent).toContain("Costs 1 Rage.");
    s.click('[data-toggle="rage"]');
    expect((s.ctl.value as Character).active.rage).toBe(true);
    expect(s.notices).toEqual(["Rage started. 1 Rage spent."]);
    expect(s.q('[data-toggle-card="rage"]').textContent).toContain("Rage is on:");
    expect(s.q('[data-toggle-card="rage"]').textContent).toMatch(/Resist bludgeoning/);
  });

  it("features the plugin filled in carry a built-in badge that says where the numbers came from", () => {
    const s = setup(barbarian, mobile);
    const badge = s.q('[data-builtin="class:barbarian:fast-movement"]');
    expect(badge.textContent).toBe("built-in");
    expect(badge.getAttribute("title")).toMatch(/Your note does not have any/);
    expect(s.q('[data-key] [data-builtin="class:barbarian:rage"]')).toBeTruthy();
    // features with no built-in numbers have no badge
    expect(s.root.querySelectorAll('[data-key$=":danger-sense"] [data-builtin]')).toHaveLength(0);
  });
});
