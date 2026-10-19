// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { glossaryEntry } from "../../src/content/glossary";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry } from "../fixtures/mechanics";
import { maren } from "../fixtures/notes";
import { LAYOUTS, setup } from "./inventory-helpers";

const css = readFileSync("styles.css", "utf8");

describe.each(LAYOUTS)("roll mode slider (%s)", layout => {
  it("is directly above Attacks and not in the header", () => {
    const s = setup(layout);
    expect((s.q('[data-feature="attacks"]').previousElementSibling as HTMLElement).dataset.feature).toBe("roll-mode");
    expect(s.q('.fe-pinned [data-feature="roll-mode"]')).toBeNull();
  });
  it("three stops; the knob shows the mode; one roll snaps it back", () => {
    const s = setup(layout), stops = s.all('[data-feature="roll-mode"] .fe-slider-stop');
    expect(stops.map(b => b.dataset.mode)).toEqual(["dis", "normal", "adv"]);
    expect(stops.map(b => b.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(s.q(".fe-slider").dataset.pos).toBe("1");
    s.click(s.q('[data-mode="adv"]'));
    expect(s.ctl.mode).toBe("adv"); expect(s.q(".fe-slider").dataset.pos).toBe("2");
    s.click(s.q('[data-feature="saves"] .fe-roll'));
    expect(s.ctl.lastRoll!.dice).toHaveLength(2); expect(s.ctl.lastRoll!.detail).toContain(" adv [");
    expect(s.q(".fe-slider").dataset.pos).toBe("1");
  });
  it("arrow keys move one stop", () => {
    const s = setup(layout), g = s.q(".fe-roll-mode");
    g.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); expect(s.ctl.mode).toBe("dis");
    s.q(".fe-roll-mode").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); expect(s.ctl.mode).toBe("normal");
  });
  // Review Focus 4
  it("a mode set beside Attacks applies to the next roll on another tab", () => {
    const s = setup(layout);
    s.click(s.q('[data-mode="dis"]'));
    if (layout === "mobile") s.click(s.q('[data-tab="checks"]'));
    s.click(s.q('[data-feature="skills"] .fe-roll'));
    expect(s.ctl.lastRoll!.detail).toContain(" dis ["); expect(s.ctl.mode).toBe("normal");
  });
});

describe("roll mode slider elsewhere", () => {
  it.each(["desktop", "mobile"] as const)("an NPC on %s has roll-mode directly before attacks", layout => {
    const r = mechanicsRegistry(), p = parseNote(maren); if (p.kind === "none") throw new Error("not a sheet");
    const ctl = new SheetController({ registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(4), body: "" }, p), root = document.createElement("div");
    document.body.append(root); mountSheet(root, ctl, layout);
    const a = root.querySelector('[data-feature="attacks"]');
    expect(a).not.toBeNull(); expect((a!.previousElementSibling as HTMLElement).dataset.feature).toBe("roll-mode");
  });
  it("advantage and disadvantage have plain glossary entries", () => {
    expect(glossaryEntry("advantage")!.title).toBe("Advantage"); expect(glossaryEntry("disadvantage")!.title).toBe("Disadvantage");
  });
  it("stops beat Obsidian's button rules and are 44px on tablet and phone", () => {
    expect(css).toContain(".fe-sheet button.fe-slider-stop {");
    expect(css).toContain(".fe-mobile button.fe-slider-stop, .fe-tablet button.fe-slider-stop { min-height: 44px; }");
  });
});
