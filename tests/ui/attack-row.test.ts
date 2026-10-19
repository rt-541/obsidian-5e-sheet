// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { Registry } from "../../src/content/registry";
import { compactDamage } from "../../src/ui/attacks-ui";
import { addWeapons } from "../fixtures/weapons";
import { LAYOUTS, setup } from "./inventory-helpers";

const css = readFileSync("styles.css", "utf8");
const glowAndWeapons = (r: Registry) => {
  addWeapons(r);
  r.add("vault", "feat", { name: "Glow Training", grants: [{ op: "effect", effects: { weaponRule: [{ match: ["all"], magical: true, note: "Hits glow faintly." }] } }] }, { path: "glow-training.md" });
};

describe("compactDamage", () => {
  it.each([["1d8+3 slashing", "1d8+3"], ["1d8+3 slashing + 1d6 fire", "1d8+3 + 1d6"], ["4 bludgeoning", "4"], ["2d6", "2d6"]])("%s", (a, b) => expect(compactDamage(a)).toBe(b));
});

describe.each(LAYOUTS)("attack row (%s)", layout => {
  it("one line: name, +N Atk / dice, Crit", () => {
    const s = setup(layout, { inventory: [{ id: "ash-cudgel", equipped: true }] }, addWeapons), a = s.ctl.stats()!.attacks[0];
    const row = s.q('[data-feature="attacks"] [data-attack="0"]');
    expect(row.querySelector(".fe-grow")!.textContent).toBe("Ash Cudgel");
    expect(row.querySelector(".fe-atk")!.textContent).toBe(`${a.toHit! >= 0 ? "+" : ""}${a.toHit} Atk`);
    expect(row.querySelector(".fe-attack-sep")!.textContent).toBe("/");
    const dmg = row.querySelector<HTMLElement>(".fe-atk-dmg")!;
    expect(dmg.textContent).toBe("1d6+3"); expect(dmg.getAttribute("aria-label")).toBe("Ash Cudgel damage: 1d6+3 bludgeoning");
    expect(row.querySelector(".fe-crit")!.textContent).toBe("Crit");
    s.click(row.querySelector(".fe-atk")); expect(s.ctl.lastRoll!.title).toBe("Ash Cudgel to hit");
    s.click(dmg); expect(s.ctl.lastRoll!.title).toBe("Ash Cudgel damage");
  });
  it("notes move off the row into the hover card or the tap panel", () => {
    const s = setup(layout, { feats: ["glow-training"], inventory: [{ id: "ash-cudgel", equipped: true }] }, glowAndWeapons);
    expect(s.q('[data-feature="attacks"] .fe-note')).toBeNull();
    const mark = s.q('[data-attack="0"] .fe-attack-note-mark'); expect(mark.textContent).toBe("notes");
    if (layout === "desktop") {
      vi.useFakeTimers(); mark.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300);
      expect(document.querySelector(".fe-popover")!.textContent).toContain("Hits glow faintly."); vi.useRealTimers();
    } else { s.click(mark); expect(s.q('[data-panel="details"]').textContent).toContain("Hits glow faintly."); }
  });
});

describe("attack row styles", () => {
  it("is one nowrap line on desktop and wraps under the name on phone and tablet", () => {
    expect(css).toMatch(/\.fe-attack \{ display: flex; flex-wrap: nowrap;/);
    expect(css).toMatch(/\.fe-mobile \.fe-attack, \.fe-tablet \.fe-attack \{ flex-wrap: wrap; \}/);
    expect(css).toMatch(/\.fe-attack-ctl \{ flex: none; display: inline-flex;/);
    expect(css).toContain(".fe-sheet button.fe-atk-dmg");
  });
});
