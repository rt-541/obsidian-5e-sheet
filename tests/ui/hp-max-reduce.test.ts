// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

function setup(layout: "desktop" | "mobile", hp: object = { max: 40, current: 30, temp: 0 }) {
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: mechanicsRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(5) };
  const p = parseNote({ ...tester, hp }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const amount = (n: number) => { const a = q('[data-feature="hp-controls"] .fe-amt') as HTMLInputElement; a.value = String(n); a.dispatchEvent(new Event("input", { bubbles: true })); };
  return { ctl, root, saved, notices, q, amount, last: () => saved[saved.length - 1] as Character };
}

for (const layout of ["desktop", "mobile"] as const) describe(`temporary max HP reduction (${layout})`, () => {
  it("Lower max takes the amount off the maximum, keeps current within it, and says so on the HP card", () => {
    const s = setup(layout);
    s.amount(15); s.q('[data-act="hp-max-lower"]').click();
    expect(s.last().hp).toEqual({ max: 40, current: 25, temp: 0, reduced: 15 });
    expect(s.ctl.stats()!.hp.max).toBe(25);
    expect(s.q('[data-feature="hp"]').textContent).toContain("Max HP lowered by 15");
    s.amount(5); s.q('[data-act="hp-max-lower"]').click();
    expect(s.last().hp.reduced).toBe(20); expect(s.ctl.stats()!.hp.max).toBe(20);
  });
  it("Restore max puts the maximum back without healing", () => {
    const s = setup(layout, { max: 40, current: 12, temp: 0, reduced: 10 });
    expect(s.ctl.stats()!.hp.max).toBe(30);
    s.q('[data-act="hp-max-restore"]').click();
    expect(s.last().hp).toEqual({ max: 40, current: 12, temp: 0 });
    expect(s.q('[data-act="hp-max-restore"]')).toBeNull();
  });
  it("the reduction can't take the maximum below 1", () => {
    const s = setup(layout, { max: 10, current: 10, temp: 0 });
    s.amount(50); s.q('[data-act="hp-max-lower"]').click();
    expect(s.last().hp.reduced).toBe(9); expect(s.ctl.stats()!.hp.max).toBe(1);
  });
  it("a long rest ends the reduction and heals to the full maximum", () => {
    const s = setup(layout, { max: 40, current: 5, temp: 0, reduced: 10 });
    s.ctl.open({ kind: "rest", id: "long" });
    expect(s.q('[data-panel="rest"]').textContent).toContain("Max HP back to normal");
    s.q('[data-act="rest-apply"]').click();
    expect(s.ctl.character!.hp.reduced).toBeUndefined();
    expect(s.ctl.character!.hp.current).toBe(40);
  });
  it("a note with a bad reduced value is reported", () => {
    const p = parseNote({ ...tester, hp: { max: 40, current: 30, temp: 0, reduced: -3 } });
    expect(p.kind === "character" && p.errors.some(e => e.startsWith("hp.reduced"))).toBe(true);
  });
});
