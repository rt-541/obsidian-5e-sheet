// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CHARACTER_FEATURES, DESKTOP, MOBILE, NPC_FEATURES, TABLET, placed } from "../../src/ui/layouts";
import { HIT_WINDOW_MS } from "../../src/ui/controller";
import { seq, sheetWith } from "../fixtures/attack-options";

const css = readFileSync("styles.css", "utf8");
const layouts = [["desktop", DESKTOP], ["tablet", TABLET], ["mobile", MOBILE]] as const;

describe("Attack options card and attack row buttons", () => {
  it("every layout places the card once, right before Resources; the phone keeps it between Attacks and Resources", () => {
    for (const [, l] of layouts) {
      expect(placed(l).filter(f => f === "attack-options")).toHaveLength(1);
      const col = l.tabs.flatMap(t => t.columns).find(c => c.includes("attack-options"))!;
      expect(col[col.indexOf("attack-options") + 1]).toBe("resources");
    }
    const mob = MOBILE.tabs.flatMap(t => t.columns).find(c => c.includes("attack-options"))!;
    expect(mob[mob.indexOf("attack-options") - 1]).toBe("attacks");
    expect(CHARACTER_FEATURES).toContain("attack-options"); expect(NPC_FEATURES).not.toContain("attack-options");
  });

  for (const layout of ["desktop", "tablet", "mobile"] as const) describe(layout, () => {
    it("shows each option in words, switches on a tap and disables an option with a problem", () => {
      const s = sheetWith(layout, { feats: ["test-focus", "test-ember", "test-lost"] });
      expect(s.q('[data-attack-option="test-focus"]').textContent).toContain("Test Focus: +1d4 to each attack roll, 3 of 3 Focus Dice left");
      expect(s.q('[data-attack-option="extra:test-ember"]').textContent).toContain("+1d6 fire damage on weapon attacks, added by itself while on");
      expect(s.q('[data-attack-option="test-lost"] button').hasAttribute("disabled")).toBe(true);
      s.click(s.q('[data-attack-option="test-focus"] [data-act="attack-option"]'));
      expect(s.ctl.character!.optionsOn).toEqual(["test-focus"]);
      expect(s.q('[data-attack-option="test-focus"] [data-act="attack-option"]').getAttribute("aria-pressed")).toBe("true");
    });
    it("hides the card when there are no options", () => {
      expect(sheetWith(layout).q('[data-feature="attack-options"]').hidden).toBe(true);
    });
    it("offers a hit-window button after a roll to hit, and rolls damage from it", () => {
      const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      h.click(h.row("Longsword").querySelector('[data-act="to-hit"]'));
      expect(h.row("Longsword").querySelector('[data-act="hit-window"]')!.textContent).toBe("Hit? Roll damage");
      h.click(h.row("Longsword").querySelector('[data-act="hit-window"]'));
      expect(h.host.log[0].title).toBe("Longsword damage"); expect(h.row("Longsword").querySelector('[data-act="hit-window"]')).toBeNull();
    });
    it("takes the hit-window button away after the window runs out", () => {
      const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      vi.useFakeTimers();
      try {
        h.click(h.row("Longsword").querySelector('[data-act="to-hit"]'));
        expect(h.row("Longsword").querySelector('[data-act="hit-window"]')).not.toBeNull();
        vi.advanceTimersByTime(HIT_WINDOW_MS);
        expect(h.row("Longsword").querySelector('[data-act="hit-window"]')).toBeNull();
      } finally { vi.useRealTimers(); }
    });
    it("a combo's own damage step counts as a hit and spends the option's dice", () => {
      const combo = { name: "Strike", when: "", steps: [{ action: "Action", text: "", use: { attack: "Longsword" } }] };
      const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"], combos: [combo] }, seq(0.5));
      h.ctl.setTab("combos");
      const before = h.left("insight-dice").used;
      h.click(h.root.querySelector('[data-step="0"] [title="Longsword: roll damage"]'));
      expect(h.left("insight-dice").used).toBe(before + 1);
    });
  });

  it("styles: switch, 44px targets on tablet and phone, fading hit-window button", () => {
    expect(css).toMatch(/\.fe-sheet button\.fe-opt-switch \{/);
    expect(css).toMatch(/\.fe-sheet\.fe-tablet button\.fe-opt-switch, \.fe-sheet\.fe-mobile button\.fe-opt-switch[^{]*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.fe-sheet button\.fe-hit-window \{[^}]*animation:/);
  });
});
