// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

function setup(resources: object[]) {
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: mechanicsRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(5) };
  const p = parseNote({ ...tester, resources }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, "desktop");
  const rows = () => [...root.querySelectorAll<HTMLElement>('[data-feature="resources"] .fe-res-row')].filter(r => /Taming|Smithing/.test(r.textContent ?? ""));
  const button = (row: HTMLElement, text: string) => [...row.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text);
  return { ctl, saved, rows, button, last: () => saved[saved.length - 1] as Character };
}

describe("progress tracks", () => {
  it("Add counts up toward the goal", () => {
    const s = setup([{ name: "Taming", max: 10, used: 3, reset: "none", track: "progress" }]);
    s.button(s.rows()[0], "Add")!.click();
    expect(s.last().resources[0].used).toBe(4);
  });
  it("a finished track says Done instead of an Add that does nothing, and minus still undoes", () => {
    const s = setup([{ name: "Smithing", max: 10, used: 10, reset: "none", track: "progress" }]);
    const row = s.rows()[0];
    expect(s.button(row, "Add")).toBeUndefined();
    const done = s.button(row, "Done")!;
    expect(done.disabled).toBe(true);
    expect(done.title).toContain("complete");
    expect(row.textContent).toContain("10 / 10 (100%)");
    s.button(row, "−")!.click();
    expect(s.last().resources[0].used).toBe(9);
    expect(s.button(s.rows()[0], "Add")).toBeDefined();
  });
});
