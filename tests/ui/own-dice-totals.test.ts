// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { seeded } from "../../src/core/dice";
import { sheetWith } from "../fixtures/attack-options";

const own = { rules: { "own-dice": true } };
const setTotal = (s: ReturnType<typeof sheetWith>, v: string) => { (s.q('[data-keep="own-total"]') as HTMLInputElement).value = v; };

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`own dice totals (${layout})`, () => {
  it("a Hit Die changes nothing until a total is given, and Roll it for me rolls", () => {
    const s = sheetWith(layout, { ...own, classes: [{ class: "tester", level: 3 }], hp: { max: 20, current: 10, temp: 0 } });   // level 3: two Hit Dice are spent below
    s.click(s.q('[data-feature="hit-dice"] button'));
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 1d8 + 2");
    expect(s.ctl.stats()!.hitDice[0].used).toBe(0); expect(s.ctl.stats()!.hp.current).toBe(10);
    expect(s.q('input[type="number"][data-keep="own-total"]').hasAttribute("required")).toBe(true);
    setTotal(s, "7"); s.click(s.q('[data-act="own-apply"]'));
    expect(s.ctl.stats()!.hitDice[0].used).toBe(1); expect(s.ctl.stats()!.hp.current).toBe(17);
    expect(s.q(".fe-own-roll")).toBeNull();
    s.click(s.q('[data-feature="hit-dice"] button')); s.click(s.q('[data-act="own-roll-for-me"]'));
    expect(s.ctl.stats()!.hitDice[0].used).toBe(2); expect(s.host.log[0].title).toBe("Hit Die d8");
  });

  it("Cancel changes nothing", () => {
    const s = sheetWith(layout, { ...own, hp: { max: 20, current: 10, temp: 0 } });
    s.click(s.q('[data-feature="hit-dice"] button')); s.click(s.q('[data-act="own-close"]'));
    expect(s.q(".fe-own-roll")).toBeNull(); expect(s.ctl.stats()!.hitDice[0].used).toBe(0); expect(s.ctl.stats()!.hp.current).toBe(10);
  });

  it("bad totals are refused in words, and level-up HP checks the die's range", () => {
    const s = sheetWith(layout, own);
    for (const bad of ["", "7.5", "abc", "-"]) {
      s.ctl.rollLevelHp(8); expect(s.ctl.submitTotal(bad)).toBe(false);
      expect(s.q(".fe-own-roll").textContent).toContain("Type the total you rolled, a whole number."); s.ctl.closeOwnRoll();
    }
    s.ctl.startLevelUp(); s.ctl.rollLevelHp(8); expect(s.ctl.submitTotal("9")).toBe(false);
    expect(s.q(".fe-own-roll").textContent).toContain("Type a number from 1 to 8."); expect(s.ctl.levelUp!.hp).toBeUndefined();
    expect(s.ctl.submitTotal("0")).toBe(false);
    expect(s.ctl.submitTotal("5")).toBe(true); expect(s.ctl.levelUp!.hp).toEqual({ method: "roll", roll: 5 });
  });

  it("item healing keeps the item on Cancel and heals the typed total", () => {
    const s = sheetWith(layout, { ...own, inventory: [{ id: "test-tonic", qty: 2 }], hp: { max: 20, current: 5, temp: 0 } });
    s.ctl.useItem(0);
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 2d4 + 2");
    s.click(s.q('[data-act="own-close"]')); expect(s.ctl.character!.inventory[0].qty).toBe(2);
    s.ctl.useItem(0); setTotal(s, "6"); s.click(s.q('[data-act="own-apply"]'));
    expect(s.ctl.character!.inventory[0].qty).toBe(1); expect(s.ctl.stats()!.hp.current).toBe(11);
  });

  it("a negative total is refused for healing, and the item stays", () => {
    const s = sheetWith(layout, { ...own, inventory: [{ id: "test-tonic", qty: 2 }], hp: { max: 20, current: 5, temp: 0 } });
    s.ctl.useItem(0);
    expect(s.ctl.submitTotal("-3")).toBe(false);
    expect(s.q(".fe-own-roll").textContent).toContain("Type a number 0 or more.");
    expect(s.ctl.character!.inventory[0].qty).toBe(2); expect(s.ctl.stats()!.hp.current).toBe(5);
  });

  for (const [name, ds] of [["3 successes", { successes: 3, failures: 0 }], ["3 failures", { successes: 0, failures: 3 }]] as const) {
    it(`no death save button or roll at ${name}`, () => {
      const s = sheetWith(layout, { ...own, hp: { max: 20, current: 0, temp: 0 }, deathSaves: ds });
      expect(s.q('[data-act="death-save-roll"]')).toBeNull();
      s.ctl.rollDeathSave(); expect(s.q(".fe-own-roll")).toBeNull();
      expect(s.ctl.character!.deathSaves).toEqual(ds); expect(s.ctl.stats()!.hp.current).toBe(0);
    });
  }
  it("the death save button shows at 0 hit points with saves left", () => {
    const s = sheetWith(layout, { ...own, hp: { max: 20, current: 0, temp: 0 }, deathSaves: { successes: 2, failures: 2 } });
    expect(s.q('[data-act="death-save-roll"]')).not.toBeNull();
  });

  it("concentration asks for the save total and ends the spell on a low one", () => {
    const s = sheetWith(layout, { ...own, concentration: "bless" });
    s.ctl.concentrationCheck = { dc: 10, spell: "bless" };
    s.ctl.rollConcentration();
    expect(s.q(".fe-own-roll").textContent).toContain("(Constitution save, DC 10)");
    setTotal(s, "9"); s.click(s.q('[data-act="own-apply"]'));
    expect(s.ctl.character!.concentration).toBeUndefined(); expect(s.notices.at(-1)).toMatch(/^Concentration lost/);
    s.ctl.concentrationCheck = { dc: 10, spell: "bless" }; s.ctl.rollConcentration(); setTotal(s, "10"); s.click(s.q('[data-act="own-apply"]'));
    expect(s.notices.at(-1)).toMatch(/^Concentration kept/);
  });

  it("a quick forage says disadvantage and turns the total into days of food", () => {
    const s = sheetWith(layout, { ...own, rules: { "own-dice": true, hexploration: true } });
    s.ctl.forage(true);
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 2d20, keep the lower");
    setTotal(s, "15"); s.click(s.q('[data-act="own-apply"]'));
    expect(s.notices.at(-1)).toMatch(/^Found food for 2 days/);
  });

  it("self damage in an action asks for its total, then hurts", () => {
    const s = sheetWith(layout, { ...own, feats: ["test-blood-price"], hp: { max: 20, current: 20, temp: 0 } });
    const f = s.ctl.stats()!.progress.features.find(x => x.action?.name === "Blood Price")!;
    s.ctl.useAction(f);
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 1d6 for the damage to you");
    expect(s.q(".fe-own-roll").textContent).toContain("Then: you roll 2d6");
    expect(s.ctl.stats()!.hp.current).toBe(20);
    setTotal(s, "4"); s.click(s.q('[data-act="own-apply"]'));
    expect(s.ctl.stats()!.hp.current).toBe(16);
  });

  it("Roll it for me uses the rng", () => {
    const base = seeded(3), spy = vi.fn(() => base());
    const s = sheetWith(layout, { ...own, feats: ["test-blood-price"], hp: { max: 20, current: 20, temp: 0 } }, spy);
    const f = s.ctl.stats()!.progress.features.find(x => x.action?.name === "Blood Price")!;
    s.ctl.useAction(f); s.click(s.q('[data-act="own-roll-for-me"]'));
    expect(spy).toHaveBeenCalledTimes(1); expect(s.ctl.stats()!.hp.current).toBeLessThan(20);
  });
});
