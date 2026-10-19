// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { thalia } from "../fixtures/notes";
import { sheet } from "./review-helpers";
import { setup } from "./spells-helpers";

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
  it("an own-spell row keeps its prepared dot inside the name cell, spaced from the name", () => {
    const s = setup({ ...thalia, spells: [{ id: "test-spark", prepared: true }] }, "mobile");
    s.click('[data-tab="spells"]');
    const dot = s.q('[data-spell="test-spark"] [data-act="prepare"]');
    expect(dot.parentElement!.classList.contains("fe-grow")).toBe(true);
    expect(dot.parentElement).toBe(s.q('[data-spell="test-spark"]').querySelector(".fe-grow"));
    expect(css).toMatch(/\.fe-grow > \.fe-dot \{[^}]*margin-right: 6px/);
  });
});
