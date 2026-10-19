// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { MOBILE, TABLET } from "../../src/ui/layouts";
import { thalia } from "../fixtures/notes";
import { sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");

describe("phone and tablet order", () => {
  it("phone combat puts HP controls, death saves, attacks and resources first", () =>
    expect(MOBILE.tabs[0].columns[0].slice(0, 4)).toEqual(["hp-controls", "death-saves", "attacks", "resources"]));
  it("tablet balances its columns: features under the checks, rest in the fight column", () => {
    const [left, right] = TABLET.tabs[0].columns;
    expect(left.at(-1)).toBe("traits"); expect(right.slice(0, 4)).toEqual(["hp-controls", "death-saves", "attacks", "resources"]);
  });
  it("the phone header stays put and covers the pane's top padding (tablet too)", () => {
    expect(css).toMatch(/\.fe-mobile \.fe-pinned \{[^}]*position: sticky; top: 0;/);
    expect(css).toMatch(/\.fe-tablet \.fe-pinned, \.fe-mobile \.fe-pinned \{[^}]*box-shadow: 0 -10px 0 var\(--background-primary\)/);
  });
  it("the phone tab strip is a grid of equal columns, never a sideways scroll", () => {
    expect(css).toMatch(/\.fe-mobile \.fe-tabs \{[^}]*display: grid; grid-template-columns: repeat\(var\(--fe-tabs\), minmax\(0, 1fr\)\);[^}]*overflow-x: visible/);
    const s = sheet("mobile", thalia); expect(s.q("nav.fe-tabs").style.getPropertyValue("--fe-tabs")).toBe(String(s.all(".fe-tab").length));
  });
});
