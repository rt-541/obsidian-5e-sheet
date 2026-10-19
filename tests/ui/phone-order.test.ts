// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { MOBILE, STAT_TILES, TABLET } from "../../src/ui/layouts";
import { thalia } from "../fixtures/notes";
import { sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");

describe("phone and tablet order", () => {
  it("phone combat puts HP controls, death saves, the roll mode, attacks and resources first", () =>
    { expect(MOBILE.tabs[0].columns[0][0]).toEqual(STAT_TILES); expect(MOBILE.tabs[0].columns[0].slice(1, 6)).toEqual(["hp-controls", "death-saves", "roll-mode", "attacks", "resources"]); });
  it("tablet balances its columns: features under the checks, rest in the fight column", () => {
    const [left, right] = TABLET.tabs[0].columns;
    expect(left.at(-1)).toBe("traits"); expect(right[0]).toEqual(STAT_TILES); expect(right.slice(1, 6)).toEqual(["hp-controls", "death-saves", "roll-mode", "attacks", "resources"]);
  });
  it("the phone header stays put and covers the pane's top padding (tablet too)", () => {
    expect(css).toMatch(/\.fe-mobile \.fe-pinned \{[^}]*position: sticky; top: 0;/);
    expect(css).toMatch(/\.fe-tablet \.fe-pinned, \.fe-mobile \.fe-pinned \{[^}]*box-shadow: 0 -10px 0 var\(--background-primary\)/);
  });
  it("the phone tab strip is a grid of equal columns, never a sideways scroll", () => {
    expect(css).toMatch(/\.fe-mobile \.fe-tabs \{[^}]*display: grid; grid-template-columns: repeat\(var\(--fe-tabs\), minmax\(0, 1fr\)\);[^}]*overflow-x: visible/);
    const s = sheet("mobile", thalia); expect(s.q("nav.fe-tabs").style.getPropertyValue("--fe-tabs")).toBe(String(s.all(".fe-tab").length));
  });
  it("phone tabs use short labels that fit seven equal columns", () => {
    const s = sheet("mobile", thalia);
    expect(s.all(".fe-tab").map(t => t.textContent)).toEqual(["Fight", "Combo", "Check", "Spell", "Gear", "Pets", "More"]);
    expect(css).toMatch(/\.fe-mobile button\.fe-tab \{[^}]*font-size: var\(--font-ui-smaller, 12px\)/);
  });
  it("the phone pinned header stays small: Level up and Roll log sit at the top of More", () => {
    expect(MOBILE.pinned).not.toContain("level-up"); expect(MOBILE.pinned).not.toContain("roll-log");
    expect(MOBILE.pinned.length).toBeLessThanOrEqual(8);
    expect(MOBILE.tabs.find(t => t.id === "more")!.columns[0].slice(0, 2)).toEqual(["level-up", "roll-log"]);
  });
});
