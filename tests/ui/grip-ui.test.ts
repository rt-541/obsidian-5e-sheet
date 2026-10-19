// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { Character } from "../../src/core/character";
import { addWeapons } from "../fixtures/weapons";
import { LAYOUTS, setup } from "./inventory-helpers";

type S = ReturnType<typeof setup>;
const css = readFileSync("styles.css", "utf8");

describe.each(LAYOUTS)("1H / 2H switch (%s)", layout => {
  const row = (s: S) => s.q('[data-feature="attacks"] [data-attack="0"]');
  it("a versatile weapon gets 1H | 2H, and 2H uses the bigger die and is remembered", () => {
    const s = setup(layout, { inventory: [{ id: "ash-cudgel", equipped: true }] }, addWeapons);
    expect([...row(s).querySelectorAll(".fe-grip .fe-mode-opt")].map(b => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["1H", "true"], ["2H", "false"]]);
    s.click(row(s).querySelector('[data-hands="2"]'));
    expect(row(s).querySelector(".fe-atk-dmg")!.textContent).toBe("1d8+3");
    expect((s.saved.at(-1) as Character).inventory[0].hands).toBe(2);
    const again = setup(layout, s.saved.at(-1)!, addWeapons);
    expect(row(again).querySelector('[data-hands="2"]')!.getAttribute("aria-pressed")).toBe("true");
  });
  it("weapons that are not versatile, and companions' attacks, have no switch", () => {
    const s = setup(layout, { inventory: [{ id: "dagger", equipped: true }] }, addWeapons);
    expect(s.q('[data-feature="attacks"] .fe-grip')).toBeNull();
  });
  it("with a shield on, 2H is greyed out and offers a one-tap Put away shield", () => {
    const s = setup(layout, { inventory: [{ id: "ash-cudgel", equipped: true }, { id: "oak-buckler", equipped: true }] }, addWeapons);
    const two = row(s).querySelector<HTMLElement>('[data-hands="2"]')!, ac = s.ctl.stats()!.ac.value;
    expect(two.getAttribute("aria-disabled")).toBe("true"); expect(two.title).toBe("Put away your shield to use two hands");
    s.click(two);
    expect(s.q('[data-note="grip-shield"]').textContent).toContain("Put away your shield to use two hands.");
    s.click(s.q('[data-act="put-away-shield"]'));
    expect(s.char().inventory.map(e => e.equipped)).toEqual([true, false]); expect(s.char().inventory[0].hands).toBe(2);
    expect(s.notices.at(-1)).toBe("Oak Buckler put away. Ash Cudgel in two hands.");
    expect(s.ctl.stats()!.ac.value).toBe(ac - 2); expect(s.q('[data-note="grip-shield"]')).toBeNull();
  });
  it("Not now closes the question and changes nothing", () => {
    const s = setup(layout, { inventory: [{ id: "ash-cudgel", equipped: true }, { id: "oak-buckler", equipped: true }] }, addWeapons);
    s.click(row(s).querySelector('[data-hands="2"]')); s.click(s.q('[data-act="grip-cancel"]'));
    expect(s.q('[data-note="grip-shield"]')).toBeNull(); expect(s.saved).toHaveLength(0);
  });
  it("equipping a shield from the inventory flips a two-handed weapon to 1H and says so", () => {
    const s = setup(layout, { inventory: [{ id: "ash-cudgel", equipped: true, hands: 2 }, { id: "oak-buckler" }] }, addWeapons);
    s.click(s.row("Oak Buckler").querySelector(".fe-btn:not([data-act])"));
    expect(s.notices.at(-1)).toBe("Ash Cudgel switched to one hand (shield equipped).");
    expect(row(s).querySelector('[data-hands="1"]')!.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("grip styles", () => {
  it("has the blocked and prompt rules", () => {
    expect(css).toContain(".fe-sheet button.fe-mode-opt.is-blocked {");
    expect(css).toContain(".fe-grip-prompt {");
  });
});
