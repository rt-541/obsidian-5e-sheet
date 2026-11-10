// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { Registry } from "../../src/content/registry";
import type { Character } from "../../src/core/character";
import { detailCard } from "../../src/ui/details";
import { LAYOUTS, setup } from "./inventory-helpers";

const css = readFileSync("styles.css", "utf8");
const blade = (id: string, name: string, mastery?: string) => ({ id, name, kind: "weapon", attunement: false, weight: 2, weapon: { dmg: "1d6", type: "slashing", ab: "str", range: "melee", ...(mastery ? { mastery } : {}) } });
const add = (r: Registry) => {
  r.add("vault", "mastery", { name: "Snag", rules: "Invented snag text.\n\nSecond invented paragraph." }, { path: "snag.md", id: "snag", sourceName: "Invented Press", edition: "2024" } as never);
  r.add("vault", "mastery", { name: "Hush", rules: "Invented hush text." }, { path: "hush.md", id: "hush" } as never);
  r.add("vault", "item", blade("tin-blade", "Tin Blade", "snag"), { path: "tin-blade.md" });
  r.add("vault", "item", blade("lead-blade", "Lead Blade", "hush"), { path: "lead-blade.md" });
  r.add("vault", "item", blade("pewter-blade", "Pewter Blade", "snag"), { path: "pewter-blade.md" });
};
const over = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

describe.each(LAYOUTS)("weapon mastery (%s)", layout => {
  it("a mastered weapon's attack row shows the property chip and its card", () => {
    const s = setup(layout, { edition: "2024", inventory: [{ id: "tin-blade", equipped: true }], mastery: ["tin-blade"] }, add);
    const chip = s.q(".fe-attack-row .fe-mastery-chip, .fe-attack .fe-mastery-chip");
    expect(chip.textContent).toBe("Snag"); expect(chip.tagName).toBe("BUTTON"); expect(chip.getAttribute("type")).toBe("button"); expect(chip.dataset.ref).toBe("mastery:snag");
    if (layout === "desktop") {
      vi.useFakeTimers(); over(chip); vi.advanceTimersByTime(300);
      const t = document.querySelector(".fe-popover")!.textContent!; vi.useRealTimers();
      expect(t).toContain("Snag"); expect(t).toContain("Invented snag text."); expect(t).toContain("Second invented paragraph.");
    } else {
      s.click(chip); const t = s.q('[data-panel="details"]').textContent!;
      expect(t).toContain("Snag"); expect(t).toContain("Invented snag text."); expect(t).toContain("Second invented paragraph.");
    }
    expect(chip.getAttribute("aria-label")).toBe("Tin Blade: weapon mastery Snag");
  });
  it("the mastery card names its source and edition and the vault note", () => {
    const s = setup(layout, { edition: "2024", inventory: [{ id: "tin-blade", equipped: true }], mastery: ["tin-blade"] }, add);
    const t = detailCard("mastery:snag", s.ctl)!.textContent!;
    expect(t).toContain("Invented Press"); expect(t).toContain("2024 rules"); expect(t).toContain("Source note: snag.md");
  });
  it("Change leaves out weapons from a source the campaign switched off", () => {
    const camp = { name: "T", rules: {}, sources: { "Off Press": false }, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } };
    const s = setup(layout, { edition: "2024", inventory: [{ id: "tin-blade", equipped: true }], mastery: ["tin-blade"] }, r => {
      add(r); r.add("vault", "item", blade("ghost-blade", "Ghost Blade", "snag"), { path: "ghost.md", sourceName: "Off Press" });
    }, camp);
    s.ctl.setEditing(true); s.click(s.q('[data-mastery-row="tin-blade"] button.fe-mastery-change'));
    const opts = s.all('button.fe-mastery-option').map(b => b.dataset.id);
    expect(opts).toContain("pewter-blade"); expect(opts).not.toContain("ghost-blade");
  });
  it("an unmastered weapon shows no chip", () => {
    const s = setup(layout, { inventory: [{ id: "tin-blade", equipped: true }], mastery: ["lead-blade"] }, add);
    expect(s.root.querySelector(".fe-mastery-chip")).toBeNull();
  });
  it("Play mode has no Weapon mastery block; Edit mode lists mastered weapons and says when they change", () => {
    const s = setup(layout, { inventory: [{ id: "tin-blade", equipped: true }], mastery: ["tin-blade", "lead-blade"] }, add);
    expect(s.root.querySelector(".fe-mastery-edit")).toBeNull();
    s.ctl.setEditing(true);
    const block = s.q('[data-feature="attacks"] .fe-mastery-edit'); expect(block.textContent).toContain("Weapon mastery");
    expect(block.textContent).toContain("Tin Blade"); expect(block.textContent).toContain("Lead Blade");
    expect(block.textContent).toContain("You can change these after a long rest.");
    expect(block.querySelectorAll("button.fe-mastery-change").length).toBe(2);
  });
  it("Edit mode changes one mastery for another from the level-up options, leaving out weapons already mastered", () => {
    const s = setup(layout, { inventory: [{ id: "tin-blade", equipped: true }], mastery: ["tin-blade", "lead-blade"] }, add);
    s.ctl.setEditing(true);
    const change = s.q('[data-mastery-row="tin-blade"] button.fe-mastery-change'); expect(change.getAttribute("type")).toBe("button");
    s.click(change);
    const opts = s.all('[data-feature="attacks"] button.fe-mastery-option').map(b => b.dataset.id);
    expect(opts).toContain("pewter-blade"); expect(opts).not.toContain("tin-blade"); expect(opts).not.toContain("lead-blade");
    s.click(s.q('button.fe-mastery-option[data-id="pewter-blade"]'));
    expect(s.char().mastery).toEqual(["pewter-blade", "lead-blade"]);
    expect((s.saved.at(-1) as Character).mastery).toEqual(["pewter-blade", "lead-blade"]);
    expect(s.root.querySelector("button.fe-mastery-option")).toBeNull();
  });
  it("the chip and Change button are 44 px on touch and beat Obsidian's button rules", () => {
    expect(css).toContain(".fe-sheet button.fe-mastery-chip"); expect(css).toContain(".fe-sheet button.fe-mastery-change");
    for (const k of ["chip", "change", "option"]) expect(css).toMatch(new RegExp(`\\.fe-mobile button\\.fe-mastery-${k}[^{]*\\{[^}]*min-height: 44px`));
    for (const k of ["chip", "change", "option"]) expect(css).toMatch(new RegExp(`\\.fe-tablet button\\.fe-mastery-${k}[^{]*\\{[^}]*min-height: 44px`));
  });
});
