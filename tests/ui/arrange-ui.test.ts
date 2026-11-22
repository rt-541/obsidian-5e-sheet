// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { DESKTOP } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

function setup(layout: "desktop" | "tablet" | "mobile", extra: object = {}) {
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: mechanicsRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(5) };
  const p = parseNote({ ...tester, ...extra }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  return { ctl, root, saved, q, all, last: () => saved[saved.length - 1] as Character };
}
/** Feature ids of a main-tab column, top to bottom. */
const column = (root: HTMLElement, i: number) => [...root.querySelectorAll<HTMLElement>('[data-pane="main"] .fe-col')[i].querySelectorAll<HTMLElement>(":scope > [data-slot]")].map(e => e.dataset.slot);
const mainDefault = (i: number) => DESKTOP.tabs[0].columns[i].map(s => (typeof s === "string" ? s : "stat-tiles"));

describe("moving sections in Edit mode", () => {
  it("Play mode has no move bars", () => {
    const s = setup("desktop");
    expect(s.q("[data-act=move-up]")).toBeNull(); expect(s.q("[data-slot]")).toBeNull();
  });
  it("Edit mode wraps each section of the tab columns in a move bar with its name; the header does not move", () => {
    const s = setup("desktop"); s.ctl.setEditing(true);
    const bar = s.q('[data-slot="resources"] .fe-move');
    expect(bar.textContent).toContain("Class resources");
    expect(bar.getAttribute("draggable")).toBe("true");
    expect(s.q('.fe-pinned [data-slot]')).toBeNull();
  });
  it("arrows move a section, save it in the note and redraw in the new place", () => {
    const s = setup("desktop"); s.ctl.setEditing(true);
    const right = column(s.root, 2) as string[], first = right[0], second = right.find((k, i) => i > 0 && s.q(`[data-slot="${k}"]`))!;
    (s.q(`[data-slot="${second}"] [data-act=move-up]`) as HTMLButtonElement).click();
    expect(column(s.root, 2).slice(0, 2)).toEqual([second, first]);
    expect(s.last().sheet.arrange?.desktop?.main[2].indexOf(second)).toBeLessThan(s.last().sheet.arrange!.desktop!.main[2].indexOf(first));
    (s.q(`[data-slot="${second}"] [data-act=move-left]`) as HTMLButtonElement).click();
    expect(column(s.root, 1)).toContain(second); expect(column(s.root, 2)).not.toContain(second);
  });
  it("a button that cannot move is disabled", () => {
    const s = setup("desktop"); s.ctl.setEditing(true);
    const top = column(s.root, 0)[0];
    expect((s.q(`[data-slot="${top}"] [data-act=move-up]`) as HTMLButtonElement).disabled).toBe(true);
    expect((s.q(`[data-slot="${top}"] [data-act=move-left]`) as HTMLButtonElement).disabled).toBe(true);
    expect((s.q(`[data-slot="${top}"] [data-act=move-right]`) as HTMLButtonElement).disabled).toBe(false);
  });
  it("dragging a bar onto another section puts it before that section; onto a column's empty end puts it last", () => {
    const s = setup("desktop"); s.ctl.setEditing(true);
    const from = column(s.root, 2)[0], onto = column(s.root, 0)[1];
    s.q(`[data-slot="${from}"] .fe-move`).dispatchEvent(new Event("dragstart", { bubbles: true }));
    s.q(`[data-slot="${onto}"]`).dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    const left = column(s.root, 0);
    expect(left.indexOf(from)).toBe(left.indexOf(onto) - 1);
    s.q(`[data-slot="${from}"] .fe-move`).dispatchEvent(new Event("dragstart", { bubbles: true }));
    s.all('[data-pane="main"] .fe-col')[2].dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(column(s.root, 2).at(-1)).toBe(from);
  });
  it("Reset layout appears once something moved and puts the default back for this layout only", () => {
    const s = setup("desktop", { sheet: { hide: [], show: [], arrange: { desktop: { main: [mainDefault(1), mainDefault(0), mainDefault(2)] }, mobile: { combat: [["hp-controls"]] } } } });
    s.ctl.setEditing(true);
    expect(column(s.root, 0)[0]).toBe("stat-tiles");
    s.q("[data-act=reset-arrange]").click();
    expect(s.last().sheet.arrange).toEqual({ mobile: { combat: [["hp-controls"]] } });
    expect(column(s.root, 0)[0]).toBe(mainDefault(0)[0]);
    expect(s.q("[data-act=reset-arrange]")).toBeNull();
  });
  it("a saved order is used in Play mode too, and the note round-trips it", () => {
    const s = setup("desktop", { sheet: { hide: [], show: [], arrange: { desktop: { main: [mainDefault(1), mainDefault(0), mainDefault(2)] } } } });
    const firstCol = s.root.querySelectorAll('[data-pane="main"] .fe-col')[0];
    expect(firstCol.querySelector(':scope > .fe-stat-row')).not.toBeNull();
    expect(s.ctl.errors).toEqual([]);
  });
  it("each layout keeps its own order; tablet and phone get the same bars", () => {
    for (const layout of ["tablet", "mobile"] as const) {
      const s = setup(layout); s.ctl.setEditing(true);
      const bars = s.all(".fe-move");
      expect(bars.length).toBeGreaterThan(3);
      const btn = s.all("[data-act=move-down]").find(b => !(b as HTMLButtonElement).disabled)!;
      btn.click();
      expect(Object.keys(s.last().sheet.arrange ?? {})).toEqual([layout]);
    }
  });
  it("a bad arrange block is reported, not crashed on", () => {
    const p = parseNote({ ...tester, sheet: { hide: [], show: [], arrange: { desktop: { main: "nope" } } } });
    expect(p.kind === "character" && p.errors.some(e => e.includes("sheet.arrange.desktop.main"))).toBe(true);
  });
});
