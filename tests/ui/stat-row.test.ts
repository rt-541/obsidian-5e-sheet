// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { DESKTOP, MOBILE, NPC_DESKTOP, NPC_MOBILE, STAT_TILES, TABLET, placed } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { maren } from "../fixtures/notes";
import { LAYOUTS, setup } from "./inventory-helpers";

const css = readFileSync("styles.css", "utf8");
const tileIds = (el: Element) => [...el.children].map(e => (e as HTMLElement).dataset.feature);

describe.each(LAYOUTS)("stat row (%s)", layout => {
  it("one row of four tiles, in order, not in the header", () => {
    const s = setup(layout), rows = s.all('[data-row="stats"]');
    expect(rows).toHaveLength(1);
    expect(tileIds(rows[0])).toEqual(["ac", "initiative", "speed", "passive-perception"]);
    expect([...rows[0].children].every(e => e.tagName === "DIV")).toBe(true);
    expect(s.q('.fe-pinned [data-feature="ac"], .fe-pinned [data-feature="initiative"], .fe-pinned [data-feature="speed"]')).toBeNull();
    expect(s.q('.fe-pinned [data-feature="hp"]') !== null).toBe(layout !== "desktop");
  });
  it("sits at the top of the middle (desktop) or fight (tablet, phone) column", () => {
    const s = setup(layout), row = s.q('[data-row="stats"]'), col = row.parentElement!;
    expect(col.firstElementChild).toBe(row);
    const pane = row.closest<HTMLElement>("[data-pane]")!.dataset.pane;
    expect(pane).toBe(layout === "mobile" ? "combat" : "main");
    if (layout === "desktop") expect([...row.closest(".fe-pane")!.children].indexOf(col)).toBe(1);
  });
  it("keeps each tile's glossary label and breakdown", () => {
    const s = setup(layout);
    expect(s.q('[data-row="stats"] [data-feature="ac"] [data-ref="glossary:armor-class"]')).toBeTruthy();
    expect(s.q('[data-row="stats"] [data-feature="ac"][data-ref="why:ac"]')).toBeTruthy();
  });
  it("a hidden tile leaves the others; all four hidden leaves no empty row", () => {
    const three = setup(layout, { sheet: { hide: ["speed"], show: [] } });
    expect(tileIds(three.q('[data-row="stats"]'))).toEqual(["ac", "initiative", "passive-perception"]);
    const none = setup(layout, { sheet: { hide: ["ac", "initiative", "speed", "passive-perception"], show: [] } });
    expect(none.q('[data-row="stats"]')).toBeNull();
  });
});

describe("stat row placement", () => {
  it.each([["desktop", DESKTOP], ["tablet", TABLET], ["mobile", MOBILE], ["npc desktop", NPC_DESKTOP], ["npc mobile", NPC_MOBILE]] as const)("%s places each tile once", (_n, l) => {
    for (const t of STAT_TILES) expect(placed(l).filter(f => f === t), t).toHaveLength(1);
  });
  it("labels wrap inside a narrow tile instead of overflowing into the next", () => {
    expect(css).toMatch(/\.fe-stat-row \.fe-stat-l \{[^}]*overflow-wrap: break-word/);
    expect(css).toMatch(/\.fe-stat-row \.fe-stat-v \{[^}]*overflow-wrap: break-word/);
  });
  it("the tiles get a four-wide grid, two-wide on a phone", () => {
    expect(css).toContain(".fe-stat-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(css).toContain(".fe-mobile .fe-stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
  });
});

describe.each([["desktop", false], ["mobile", true]] as const)("NPC stat row (%s)", (_n, mobile) => {
  it("is first in its column", () => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(11), body: "" };
    const p = parseNote(maren); if (p.kind === "none") throw new Error("not a sheet");
    const root = document.createElement("div"); document.body.append(root);
    mountSheet(root, new SheetController(host, p), mobile);
    const rows = root.querySelectorAll('[data-row="stats"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].parentElement!.firstElementChild).toBe(rows[0]);
  });
});
