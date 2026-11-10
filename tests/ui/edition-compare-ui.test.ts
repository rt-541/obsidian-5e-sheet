// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { compareRegistry } from "../fixtures/edition-compare";
import { LAYOUTS, sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");
afterEach(() => document.body.replaceChildren());

const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const note = (o: Record<string, unknown> = {}) => ({ type: "5e-character", schema: 1, name: "Pip", abilities: SCORES, hp: { max: 20, current: 20, temp: 0 }, classes: [{ class: "lantern-keeper", subclass: "dusk", level: 3 }],
  spells: [{ id: "glint", prepared: true }], ...o });
async function mount(layout: (typeof LAYOUTS)[number], n: Record<string, unknown>, opts: { no2024?: boolean; md?: boolean } = {}) {
  const { r, vault } = await compareRegistry({ no2024: opts.no2024 });
  const rendered: string[] = [];
  const s = sheet(layout, n, [], { registry: r, ...(opts.md ? { renderMarkdown: (md: string, el: HTMLElement) => { rendered.push(md); el.append(Object.assign(document.createElement("p"), { textContent: `md:${md}` })); } } : {}) });
  s.ctl.open({ kind: "edition-changes" });
  const part = () => s.root.querySelector<HTMLElement>('[data-panel="edition-changes"] [data-part="character"]')!;
  await vi.waitFor(() => expect(part().querySelector(".fe-edition-loading")).toBeNull());
  return { ...s, r, vault, rendered, part };
}
const titles = (el: ParentNode) => [...el.querySelectorAll<HTMLElement>("[data-group] > .fe-name")].map(e => e.textContent);

for (const layout of LAYOUTS) {
  describe(`what changed, part two (${layout})`, () => {
    it("part two sits under part one with the character's groups and the no-counterpart sentence", async () => {
      const s = await mount(layout, note());
      const panel = s.q('[data-panel="edition-changes"] .fe-panel-body');
      const one = panel.querySelector(".fe-edition-changes")!, two = s.part();
      expect(one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(one.querySelectorAll('[data-part="character"]')).toHaveLength(0);
      expect(titles(two)).toEqual(expect.arrayContaining(["Class: Lantern-keeper (levels 1 to 3)", "Subclass: Dusk (levels 1 to 3)", "Spell: Glint"]));
      expect(two.querySelector('[data-group="subclass:dusk"]')!.textContent).toContain("The 2024 books have no version of this subclass; your table can keep using the 2014 one");
      expect(two.querySelector('[data-group="spell:glint"]')!.textContent).toContain("Spell level: level 1 in the 2014 books, level 2 in the 2024 books");
      expect(s.root.querySelector('[data-part="character"] [data-change]')).toBeNull();
    });
    it("Show all levels widens every class to level 20 and back", async () => {
      const s = await mount(layout, note());
      const btn = () => s.part().querySelector<HTMLElement>("button.fe-all-levels")!;
      expect(btn().textContent).toBe("Show all levels"); expect(btn().getAttribute("type")).toBe("button");
      expect(s.part().textContent).not.toContain("Flare");
      s.click(btn());
      await vi.waitFor(() => expect(s.part().textContent).toContain("Flare"));
      expect(titles(s.part())[0]).toBe("Class: Lantern-keeper (all levels, 1 to 20)");
      expect(btn().textContent).toBe("Show only my levels");
      s.click(btn());
      await vi.waitFor(() => expect(s.part().textContent).not.toContain("Flare"));
    });
    it("Read both shows the two notes' text side by side through the markdown renderer", async () => {
      const s = await mount(layout, note(), { md: true });
      const g = () => s.part().querySelector<HTMLElement>('[data-group="spell:glint"]')!;
      s.click(g().querySelector("button.fe-read-both"));
      await vi.waitFor(() => expect(g().querySelector(".fe-read-both-pane")).not.toBeNull());
      const cols = [...g().querySelectorAll<HTMLElement>(".fe-read-col")];
      expect(cols.map(c => c.dataset.edition)).toEqual(["2014", "2024"]);
      expect(cols[0].textContent).toContain("md:A bolt deals 2d6 fire damage to the target.");
      expect(cols[1].textContent).toContain("md:A bolt deals 3d6 fire damage to the target.");
      expect(s.rendered).toHaveLength(2);
      expect(s.q('[data-panel="edition-changes"]').querySelectorAll(".fe-read-both-pane")).toHaveLength(1);
      s.click(g().querySelector("button.fe-read-both"));   // Hide both
      expect(g().querySelector(".fe-read-both-pane")).toBeNull();
    });
    it("Read both falls back to plain text and has no button on a group without a counterpart", async () => {
      const s = await mount(layout, note());
      s.click(s.part().querySelector('[data-group="spell:glint"] button.fe-read-both'));
      await vi.waitFor(() => expect(s.part().querySelector(".fe-read-body")).not.toBeNull());
      expect(s.part().querySelector(".fe-read-body")!.textContent).toBe("A bolt deals 2d6 fire damage to the target.");
      expect(s.part().querySelector('[data-group="subclass:dusk"] button')).toBeNull();
    });
    it("a missing 2024 library says so and points at docs/IMPORTING.md", async () => {
      const s = await mount(layout, note(), { no2024: true });
      const t = s.part().textContent!;
      expect(t).toContain("The 2024 books are not in the compendium yet"); expect(t).toContain("docs/IMPORTING.md");
      expect(s.part().querySelectorAll("button")).toHaveLength(0);
    });
    it("the panel is part one only for a sheet with nothing to read, and opens only the paired notes", async () => {
      const s = await mount(layout, note({ spells: [{ id: "glint", prepared: true }, { id: "hush", prepared: false }] }));
      expect(s.vault.reads.some(p => p.includes("Pad-") || p.includes("Hush"))).toBe(false);
    });
    it("closing the panel forgets the comparison", async () => {
      const s = await mount(layout, note());
      s.ctl.close();
      expect(s.ctl.editionCompare).toBeNull();
    });
  });
}

describe("part two sizing", () => {
  it("Read both stacks on a phone", () => {
    expect(css).toMatch(/\.fe-sheet\.fe-mobile \.fe-read-both-pane, \.fe-mobile \.fe-sheet \.fe-read-both-pane[^{]*\{ grid-template-columns: 1fr; \}/);
  });
  it("its buttons are 44 px on tablet and phone and use .fe-sheet button.x", () => {
    for (const b of ["fe-all-levels", "fe-read-both"]) {
      expect(css).toContain(`.fe-sheet button.${b}`);
      expect(css).toMatch(new RegExp(`\\.fe-sheet\\.fe-mobile button\\.${b}, \\.fe-sheet\\.fe-tablet button\\.${b}, \\.fe-mobile \\.fe-sheet button\\.${b}, \\.fe-tablet \\.fe-sheet button\\.${b}[^{]*\\{ min-height: 44px; \\}`));
    }
  });
});
