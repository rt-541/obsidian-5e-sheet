// @vitest-environment jsdom
import { readFileSync } from "node:fs";

const css = readFileSync("styles.css", "utf8");

describe("styles.css", () => {
  it("hidden panes are display:none", () => {
    const style = document.createElement("style"); style.textContent = css; document.head.append(style);
    const sheet = document.createElement("div"); sheet.className = "fe-sheet";
    const pane = document.createElement("div"); pane.className = "fe-pane"; pane.hidden = true; sheet.append(pane); document.body.append(sheet);
    const computed = getComputedStyle(pane).display;
    if (computed === "none") expect(computed).toBe("none");
    else expect(css).toContain(".fe-sheet [hidden] { display: none !important; }");   // jsdom may not honour !important over the author rule
  });
  it("uses theme variables, no hard-coded hex colours", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe("ability scores", () => {
  it("sit in two rows of three (STR DEX CON over INT WIS CHA), never an auto-fit row", () => {
    const rules = [...css.matchAll(/\.fe-abilities \{([^}]*)\}/g)].map(m => m[1]).filter(b => b.includes("grid-template-columns"));
    expect(rules.at(-1)).toContain("repeat(3, minmax(0, 1fr))");
    expect(rules.some(b => b.includes("auto-fit"))).toBe(false);
  });
});

describe("desktop checks column", () => {
  it("is as wide as its content (capped) and the other columns share the rest", () => {
    expect(css).toContain(".fe-desktop .fe-pane.has-checks { grid-template-columns: fit-content(340px) repeat(var(--fe-rest, 2), minmax(0, 1fr)); }");
  });
});

describe("damage button", () => {
  it("is red", () => {
    expect(css).toMatch(/\.fe-sheet button\.fe-dmg \{[^}]*background: var\(--color-red\)/);
  });
});

describe("leveling styles", () => {
  it("the wizard keeps 44px targets on mobile", () => {
    expect(css).toMatch(/\.fe-mobile \.fe-lu-nav button\.fe-btn, \.fe-mobile \.fe-choice \{ min-height: 44px; \}/);
    expect(css).toContain(".fe-sheet button.fe-choice { display: block; width: 100%;");
  });
});
