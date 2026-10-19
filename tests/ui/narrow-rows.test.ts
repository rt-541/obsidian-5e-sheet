// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { thalia } from "../fixtures/notes";
import { sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");

describe("narrow rows", () => {
  it("names never break mid-word", () => {
    expect(css).not.toContain("overflow-wrap: anywhere");
    expect(css).toMatch(/\.fe-inv-name, \.fe-spell-name[^{]*\{[^}]*overflow-wrap: break-word/);
  });
  it("on phone and tablet the name takes its own line and the buttons sit under it", () => {
    for (const l of ["mobile", "tablet"]) for (const row of ["inv", "attack", "trait"])
      expect(css).toMatch(new RegExp(`\\.fe-${l} \\.fe-${row} > \\.fe-grow[^{]*\\{[^}]*flex: 1 1 100%`));
    expect(css).toMatch(/\.fe-mobile \.fe-step-ctl[^{]*\{[^}]*flex: 1 1 100%/);
    expect(css).toMatch(/\.fe-attack > \.fe-grow \{[^}]*min-width: 7em/);
  });
  it("rows keep their name element as the first .fe-grow child so the rule applies", () => {
    const s = sheet("mobile", { ...thalia, inventory: [{ id: "warhammer", equipped: true }] });
    s.click(s.q('[data-tab="gear"]'));
    expect(s.q('[data-feature="inventory"] .fe-inv').firstElementChild!.classList.contains("fe-grow")).toBe(true);
  });
});
