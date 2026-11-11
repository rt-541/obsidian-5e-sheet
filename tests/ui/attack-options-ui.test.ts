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
      expect(s.q('[data-attack-option="extra:test-ember"]').textContent).toContain("+1d6 fire damage on weapon attacks, added automatically while on");
      expect(s.q('[data-attack-option="test-lost"] button').hasAttribute("disabled")).toBe(true);
      s.click(s.q('[data-attack-option="test-focus"] [data-act="attack-option"]'));
      expect(s.ctl.character!.optionsOn).toEqual(["test-focus"]);
      expect(s.q('[data-attack-option="test-focus"] [data-act="attack-option"]').getAttribute("aria-pressed")).toBe("true");
    });
    it("disables an option whose pool is empty, with the reason, until dice are back", () => {
      const s = sheetWith(layout, { feats: ["test-focus"], uses: { "focus-dice": 3 } });
      const sw = () => s.q('[data-attack-option="test-focus"] [data-act="attack-option"]');
      expect(sw().hasAttribute("disabled")).toBe(true);
      expect(s.q('[data-attack-option="test-focus"]').textContent).toContain("No Focus Dice left");
      s.ctl.dispatch({ type: "uses", id: "focus-dice", used: 2 });
      expect(sw().hasAttribute("disabled")).toBe(false);
      expect(s.q('[data-attack-option="test-focus"]').textContent).toContain("Test Focus: +1d4 to each attack roll, 1 of 3 Focus Dice left");
    });
    it("hides the card when there are no options", () => {
      expect(sheetWith(layout).q('[data-feature="attack-options"]').hidden).toBe(true);
    });
    const dmgBtn = (h: ReturnType<typeof sheetWith>, name = "Longsword") => h.row(name).querySelector<HTMLElement>(".fe-atk-dmg")!;
    it("arms the row's own damage button after a roll to hit, and pressing it is the hit", () => {
      const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      const plain = dmgBtn(h).querySelector(".fe-lbl-dice")!.textContent!;
      h.click(h.row("Longsword").querySelector('[data-act="to-hit"]'));
      expect(dmgBtn(h).classList.contains("fe-hit-armed")).toBe(true);
      expect(dmgBtn(h).querySelector(".fe-lbl-hit")!.textContent).toBe("Hit?");
      expect(dmgBtn(h).querySelector(".fe-lbl-hit")!.classList.contains("fe-lbl-off")).toBe(false);
      expect(dmgBtn(h).querySelector(".fe-lbl-dice")!.classList.contains("fe-lbl-off")).toBe(true);
      expect(h.row("Longsword").querySelector('[data-act="hit-window"]')).toBeNull();
      h.click(dmgBtn(h));
      expect(h.host.log[0].title).toBe("Longsword damage"); expect(h.left("insight-dice").used).toBe(1);
      expect(dmgBtn(h).classList.contains("fe-hit-armed")).toBe(false); expect(dmgBtn(h).querySelectorAll(".fe-lbl")).toHaveLength(2);
      expect(dmgBtn(h).querySelector(".fe-lbl-hit")!.classList.contains("fe-lbl-off")).toBe(true);
      expect(dmgBtn(h).querySelector(".fe-lbl-dice")!.classList.contains("fe-lbl-off")).toBe(false);
    });
    it("returns to normal when the window runs out, and a miss spends nothing", () => {
      const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
      vi.useFakeTimers();
      try {
        h.click(h.row("Longsword").querySelector('[data-act="to-hit"]'));
        expect(dmgBtn(h).classList.contains("fe-hit-armed")).toBe(true);
        vi.advanceTimersByTime(HIT_WINDOW_MS);
        expect(dmgBtn(h).classList.contains("fe-hit-armed")).toBe(false); expect(h.left("insight-dice").used).toBe(0);
      } finally { vi.useRealTimers(); }
    });
    it("keeps the same min-width armed or not, adds no absolute or fixed element, and the next row's to-hit still rolls", () => {
      const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"], inventory: [{ id: "longsword", equipped: true }, { id: "dagger", equipped: true }] }, seq(0.5));
      const rows = [...h.root.querySelectorAll<HTMLElement>("[data-attack]")];
      expect(dmgBtn(h).querySelectorAll(".fe-lbl")).toHaveLength(2);
      h.click(h.row("Longsword").querySelector('[data-act="to-hit"]'));
      expect(dmgBtn(h).querySelectorAll(".fe-lbl")).toHaveLength(2); expect(dmgBtn(h).getAttribute("style")).toBeNull();
      for (const el of h.q('[data-feature="attacks"]').querySelectorAll<HTMLElement>("*")) expect(["absolute", "fixed"]).not.toContain(el.style.position);
      const other = rows.find(e => !(e.textContent ?? "").includes("Longsword"));
      if (other) {
        h.click(other.querySelector('[data-act="to-hit"]'));
        expect(h.host.log[0].title).toBe(`${other.querySelector(".fe-grow")!.textContent} to hit`);
      }
    });
    it("an option that is on can always be switched off, even once it has a problem", () => {
      const s = sheetWith(layout, { feats: ["test-lost"], optionsOn: ["test-lost"] });
      const sw = () => s.q('[data-attack-option="test-lost"] [data-act="attack-option"]');
      expect(sw().hasAttribute("disabled")).toBe(false);
      s.click(sw());
      expect(s.ctl.character!.optionsOn ?? []).toEqual([]);
      expect(sw().hasAttribute("disabled")).toBe(true);
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

  it("the armed damage button is highlighted in the row itself, with no floating slot", () => {
    expect(css).not.toContain("fe-hit-slot");
    expect(css).toMatch(/\.fe-sheet button\.fe-atk-dmg\.fe-lbl-stack \{[^}]*display: inline-grid/);
    expect(css).toMatch(/\.fe-lbl-stack > \.fe-lbl \{[^}]*grid-area: 1 \/ 1/);
    expect(css).toMatch(/\.fe-lbl-stack > \.fe-lbl\.fe-lbl-off \{[^}]*visibility: hidden/);
    expect(css).toMatch(/\.fe-sheet button\.fe-atk-dmg\.fe-hit-armed \{[^}]*background: var\(--interactive-accent\)/);
  });
  it("styles: off knob is visible, Off/On buttons are 44px wide on touch layouts", () => {
    expect(css).toMatch(/\.fe-opt-switch::after \{[^}]*background: var\(--text-muted\)/);
    expect(css).toMatch(/\.fe-opt-switch\.is-on::after \{[^}]*background: var\(--background-primary\)/);
    expect(css).not.toMatch(/\.fe-mobile button\.fe-mode-opt, \.fe-tablet button\.fe-mode-opt \{[^}]*min-width/);   // the 1H/2H grip switch keeps its size
    expect(css).toMatch(/\.fe-mobile \.fe-setting button\.fe-mode-opt, \.fe-tablet \.fe-setting button\.fe-mode-opt \{[^}]*min-width: 44px/);
  });
  it("styles: switch, 44px targets on tablet and phone, fading armed damage button", () => {
    expect(css).toMatch(/\.fe-sheet button\.fe-opt-switch \{/);
    expect(css).toMatch(/\.fe-sheet\.fe-tablet button\.fe-opt-switch, \.fe-sheet\.fe-mobile button\.fe-opt-switch[^{]*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.fe-sheet button\.fe-atk-dmg\.fe-hit-armed \{[^}]*animation:/);
  });
});
