// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { CHARACTER_FEATURES, DESKTOP, MOBILE, NARROW_PX, NPC_DESKTOP, TABLET, WIDE_PX, layoutFor, pickLayout, placed } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

const css = readFileSync("styles.css", "utf8");

function setup(note: object, layout: "desktop" | "tablet" | "mobile") {
  const r = mechanicsRegistry(), host: SheetHost = { registry: r, ruleDefaults: {}, save: () => undefined, notify: () => undefined, log: [], rng: seeded(3) };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  return { ctl, root, q: (sel: string) => root.querySelector(sel) as HTMLElement, all: (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)] };
}
const feats = (el: Element) => [...el.querySelectorAll<HTMLElement>(":scope > [data-feature]")].map(e => e.dataset.feature);

describe("choosing a layout", () => {
  const env = (o: Partial<{ isMobile: boolean; isTablet: boolean; width: number }>) => ({ isMobile: false, isTablet: false, width: 1400, ...o });
  it("a layout picked in settings is always used", () => {
    for (const l of ["desktop", "tablet", "mobile"] as const) for (const w of [300, 900, 1600]) expect(pickLayout(l, env({ width: w, isMobile: true, isTablet: true }))).toBe(l);
  });
  it("auto: phones get mobile, tablets get tablet", () => {
    expect(pickLayout("auto", env({ isMobile: true, width: 900 }))).toBe("mobile");
    expect(pickLayout("auto", env({ isMobile: true, isTablet: true, width: 1200 }))).toBe("tablet");
    expect(pickLayout("auto", env({ isMobile: true, isTablet: true, width: 1000 }))).toBe("tablet");
  });
  it("auto on a tablet in a pane too narrow for two columns falls back to the phone layout", () => {
    expect(pickLayout("auto", env({ isMobile: true, isTablet: true, width: NARROW_PX - 1 }))).toBe("mobile");
  });
  it("auto on a computer follows the pane width: under 700 mobile, 700 to 1100 tablet, wider desktop", () => {
    expect([300, NARROW_PX - 1].map(w => pickLayout("auto", env({ width: w })))).toEqual(["mobile", "mobile"]);
    expect([NARROW_PX, 900, WIDE_PX].map(w => pickLayout("auto", env({ width: w })))).toEqual(["tablet", "tablet", "tablet"]);
    expect([WIDE_PX + 1, 1800].map(w => pickLayout("auto", env({ width: w })))).toEqual(["desktop", "desktop"]);
  });
  it("true and false still mean mobile and desktop for older callers, and an NPC has no tablet version of its own", () => {
    expect(layoutFor(false, true)).toBe(MOBILE); expect(layoutFor(false, false)).toBe(DESKTOP); expect(layoutFor(false, "tablet")).toBe(TABLET);
    expect(layoutFor(true, "tablet")).toBe(NPC_DESKTOP);
  });
  it("the Layout setting offers Tablet and the view picks the layout from it", () => {
    const settings = readFileSync("src/obsidian/settings.ts", "utf8"), view = readFileSync("src/obsidian/character-view.ts", "utf8");
    expect(settings).toMatch(/tablet: "Tablet"/); expect(settings).toMatch(/layout: LayoutSetting/);
    expect(view).toMatch(/pickLayout\(this\.plugin\.data\.settings\.layout, \{ isMobile: Platform\.isMobile, isTablet: Platform\.isTablet/);
    expect(view).toMatch(/this\.pick\(\) !== this\.layoutName/);   // a resize across a boundary rebuilds the sheet
  });
});

describe("the tablet layout", () => {
  it("places every feature exactly once", () => {
    expect([...placed(TABLET)].sort()).toEqual([...CHARACTER_FEATURES].sort());
  });
  it("has the six tabs and the sticky header from the plan", () => {
    const s = setup({}, "tablet");
    expect(s.all(".fe-tab").map(t => t.textContent)).toEqual(["Main", "Combos", "Spells", "Gear", "Features", "More"]);
    expect(feats(s.q(".fe-pinned"))).toEqual(["identity", "hp", "conditions", "concentration", "level-up", "roll-log"]);
    expect(s.root.classList.contains("fe-tablet")).toBe(true); expect(s.root.classList.contains("fe-mobile")).toBe(false);
  });
  it("Main has two columns: the checks, then what you use in a fight", () => {
    const s = setup({}, "tablet"), cols = s.all('[data-pane="main"] .fe-col');
    expect(cols.map(c => feats(c))).toEqual([
      ["abilities", "saves", "skills", "settings", "traits"],
      ["hp-controls", "death-saves", "roll-mode", "attacks", "resources", "toggles", "pinned-spells", "pinned-combos", "spell-dc", "spell-slots", "coins", "hit-dice", "rests", "active-effects"]]);
  });
  it("the other tabs hold what the plan says", () => {
    const s = setup({}, "tablet"), pane = (id: string) => s.all(`[data-pane="${id}"] .fe-col`).map(c => feats(c));
    expect(pane("combos")).toEqual([["combos"]]); expect(pane("spells")).toEqual([["spells"]]);
    expect(pane("gear")).toEqual([["inventory"]]); expect(pane("features")).toEqual([["features"]]);
    expect(pane("more")).toEqual([["companions"], ["inspiration", "prof", "xp", "play-edit", "notes"]]);
  });
  it("Rage-style switches, attacks and combos work from the tablet's Main tab", () => {
    const s = setup({ inventory: [{ id: "dagger", equipped: true }], combos: [{ name: "Opener", when: "", pinned: true, steps: [{ action: "Action", text: "Stab.", use: { attack: "Dagger" } }] }] }, "tablet");
    (s.q('[data-pane="main"] [data-toggle="fury"]')).click();
    expect((s.ctl.value as { active: Record<string, unknown> }).active.fury).toBe(true);
    expect(s.q('[data-pane="main"] [data-feature="pinned-combos"] .fe-name').textContent).toBe("Opener");
    (s.q('[data-pane="main"] [data-feature="pinned-combos"] .fe-roll')).click();
    expect(s.ctl.lastRoll?.title).toBe("Dagger to hit");
  });
  it("a tap opens the detail card instead of a hover popover", () => {
    const s = setup({ inventory: [{ id: "dagger", equipped: true }] }, "tablet");
    s.q('[data-pane="main"] [data-feature="active-effects"]').dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(document.querySelector(".fe-popover")).toBeNull();
  });
  it("the roll log opens as a panel", () => {
    const s = setup({}, "tablet"); s.q('[data-feature="roll-log"]').click();
    expect(s.q('[data-panel="log"]')).toBeTruthy();
  });
});

describe("tablet styles", () => {
  it("the header stays put and the pane has columns", () => {
    expect(css).toMatch(/\.fe-tablet \.fe-pinned \{ position: sticky; top: 0;/);
    expect(css).toMatch(/\.fe-tablet \.fe-pane \{ grid-auto-flow: column;/);
  });
  it("buttons, rolls, tabs, chips and fields are at least 44px tall", () => {
    expect(css).toMatch(/\.fe-tablet button\.fe-btn, \.fe-tablet button\.fe-roll, \.fe-tablet button\.fe-tab, \.fe-tablet button\.fe-chip, \.fe-tablet button\.fe-chip-add \{ min-height: 44px; \}/);
    expect(css).toMatch(/\.fe-tablet select, \.fe-tablet input:not\(\[type="checkbox"\]\), \.fe-tablet textarea \{ min-height: 44px; \}/);
    expect(css).toMatch(/button\.fe-switch \{ width: 68px; height: 44px;/);
  });

  it("phone switches are 44px tall like tablet ones", () => {
    expect(css).toMatch(/\.fe-sheet\.fe-mobile button\.fe-switch \{ width: 68px; height: 44px;/);
    expect(css).toMatch(/\.fe-mobile \.fe-switch::after \{ top: 4px; left: 4px; width: 24px; height: 24px; \}/);
  });
});
