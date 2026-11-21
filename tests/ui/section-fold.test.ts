// @vitest-environment jsdom
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

const LAYOUTS = ["desktop", "tablet", "mobile"] as const;
const combo = { name: "Opening Move", when: "First round", pinned: true, steps: [{ action: "Action", text: "Attack once." }, { action: "Bonus", text: "Step back." }] };

function setup(layout: (typeof LAYOUTS)[number], collapsed: string[] = []) {
  const remembered: string[][] = [];
  const host: SheetHost = { registry: mechanicsRegistry(), ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(5),
    collapsedGroups: () => collapsed, setCollapsedGroups: ids => remembered.push(ids) };
  const p = parseNote({ ...tester, inventory: [{ id: "dagger", equipped: true }], combos: [combo] }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  return { ctl, root, remembered, q, all: (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)] };
}
/** The main-page sections: a feature root that is a card with a plain title line. */
const sections = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("[data-feature].fe-card")].filter(el => el.querySelector(":scope > div.fe-card-title"));

for (const layout of LAYOUTS) describe(`section folding (${layout})`, () => {
  it("every titled section card has one toggle in its title, expanded by default", () => {
    const s = setup(layout), all = sections(s.root);
    expect(all.length).toBeGreaterThan(3);
    for (const el of all) {
      const t = el.querySelectorAll(":scope > .fe-card-title [data-act=collapse-section]");
      expect(t.length, el.dataset.feature).toBe(1);
      expect(t[0].getAttribute("aria-expanded")).toBe("true");
    }
  });
  it("the pinned Combos card folds as a whole to its title, is remembered, and opens again", () => {
    const s = setup(layout), card = () => s.q('[data-feature="pinned-combos"]');
    expect(card().querySelectorAll(".fe-combo").length).toBe(1);
    (card().querySelector("[data-act=collapse-section]") as HTMLElement).click();
    expect(card().querySelectorAll(".fe-combo").length).toBe(0);
    expect(card().children).toHaveLength(1);
    expect(card().querySelector(".fe-card-title")!.textContent).toContain("Combos");
    expect(card().querySelector("[data-act=collapse-section]")!.getAttribute("aria-expanded")).toBe("false");
    expect(s.remembered.at(-1)).toEqual(["section:pinned-combos"]);
    (card().querySelector("[data-act=collapse-section]") as HTMLElement).click();
    expect(card().querySelectorAll(".fe-combo").length).toBe(1); expect(s.remembered.at(-1)).toEqual([]);
  });
  it("a section remembered as folded starts folded; others stay open", () => {
    const s = setup(layout, ["section:traits"]);
    expect(s.q('[data-feature="traits"]').children).toHaveLength(1);
    expect(s.q('[data-feature="traits"]').classList.contains("is-folded")).toBe(true);
    expect(s.q('[data-feature="pinned-combos"]').querySelectorAll(".fe-combo").length).toBe(1);
  });
  it("tapping the toggle never opens a glossary card, and a title's glossary link still works", () => {
    const s = setup(layout);
    for (const el of sections(s.root)) {
      const t = el.querySelector(":scope > .fe-card-title") as HTMLElement;
      expect(t.dataset.ref, el.dataset.feature).toBeUndefined();     // the link moved to the title words
      expect((t.querySelector("[data-act=collapse-section]") as HTMLElement).closest("[data-ref]")).toBeNull();
    }
    const linked = s.all("[data-feature].fe-card > .fe-card-title [data-ref]");
    if (linked.length) { linked[0].click(); expect(s.q('[data-panel="details"]')).not.toBeNull(); }
  });
});
