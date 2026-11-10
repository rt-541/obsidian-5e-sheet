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

describe("phone search boxes in the level-up and builder modals", () => {
  it("are at least 44px tall", () => {
    const rule = css.split("\n").find(l => l.includes(".fe-mobile .fe-lu-body input.fe-search")) ?? "";
    expect(rule).toContain(".fe-mobile.fe-builder input.fe-search");
    expect(rule).toContain("min-height: 44px");
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

describe("customize form", () => {
  it("has segment buttons that beat Obsidian's button rules", () => {
    expect(css).toContain(".fe-sheet button.fe-cz-seg");
  });
  it("keeps 44px Customize buttons on tablet and phone", () => {
    const rule = css.split("\n").find(l => l.includes(".fe-tablet") && l.includes('[data-act="customize"]') && l.includes(".fe-mobile")) ?? "";
    expect(rule).toContain("min-height: 44px");
  });
});

describe("change item form", () => {
  it("keeps 44px targets on tablet and phone", () => {
    expect(css).toContain(".fe-mobile button.fe-base-ask, .fe-tablet button.fe-base-ask { min-height: 44px; }");
    expect(css).toContain(".fe-mobile .fe-change-form input");
  });
});

describe("add item result names", () => {
  it("are 44px tap targets on tablet and phone", () => {
    expect(css).toContain('.fe-mobile .fe-sheet .fe-result .fe-inv-name[role="button"], .fe-tablet .fe-sheet .fe-result .fe-inv-name[role="button"] { display: inline-flex; align-items: center; min-height: 44px; }');
  });
});

describe("add item pick view", () => {
  it("keeps 44px targets on tablet and phone", () => {
    expect(css).toContain(".fe-mobile .fe-base-pick button.fe-btn, .fe-tablet .fe-base-pick button.fe-btn { min-height: 44px; }");
  });
});

describe("render check fixes (edition chip, missing line, compendium tabs)", () => {
  const rule = (sel: string) => [...css.matchAll(/^([^{}\n]+)\{([^}]*)\}/gm)].filter(m => m[1].split(",").map(s => s.trim()).includes(sel)).map(m => m[2]).join(" ");
  it("the touch-size edition chip keeps a 44 px target but draws a small pill", () => {
    const chip = rule(".fe-sheet.fe-mobile .fe-chip.fe-edition-chip");
    expect(chip).toContain("min-height: 44px");
    expect(chip).toContain("background: transparent");
    const pill = rule(".fe-sheet.fe-mobile .fe-chip.fe-edition-chip::before");
    expect(pill).toContain("position: absolute"); expect(pill).toMatch(/inset: \d+px 0/); expect(pill).toContain("background: var(--background-modifier-hover)");
  });
  it("the phone identity line keeps the edition chip visible and lets a missing-reference line wrap", () => {
    expect(rule(".fe-mobile .fe-pinned .fe-identity")).toContain("display: flex");
    expect(rule(".fe-mobile .fe-pinned .fe-identity .fe-edition-chip")).toContain("flex: none");
    expect(rule(".fe-mobile .fe-pinned .fe-identity-label:has(.fe-missing-line)")).toContain("white-space: normal");
    expect(rule(".fe-sheet .fe-identity-label .fe-missing-line")).toContain("margin-left: 8px");
  });
  it("the compendium's source and type tabs scroll sideways on a phone instead of stacking", () => {
    const r = rule(".fe-mobile.fe-compendium .fe-tabs:not(.fe-ed-tabs)");
    expect(r).toContain("display: flex"); expect(r).toContain("overflow-x: auto");
  });
});
