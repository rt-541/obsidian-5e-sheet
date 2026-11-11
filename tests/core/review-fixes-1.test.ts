import { applyLevel } from "../../src/core/levelup";
import { explainChange, flattenChange } from "../../src/core/level-diff";
import { act } from "../fixtures/mechanics";
import { pc, srdRegistry, stats, switchOn } from "../fixtures/overlay";

const R = srdRegistry();

describe("Extra Attack from the overlay", () => {
  it("raises attacks per action for martial classes and the Fighter's later levels", () => {
    const n = (cls: string, lvl: number) => stats(pc(cls, lvl, { str: 16, dex: 16, wis: 14 }), R).attacksPerAction;
    expect([n("fighter", 4), n("fighter", 5), n("fighter", 11), n("fighter", 20)]).toEqual([1, 2, 3, 4]);
    expect([n("barbarian", 4), n("barbarian", 5), n("monk", 4), n("monk", 5), n("paladin", 5), n("ranger", 5)]).toEqual([1, 2, 1, 2, 2, 2]);
  });
  it("the Barbarian 4 -> 5 explainer shows the ripple", () => {
    const c = pc("barbarian", 4, { str: 16, con: 14 });
    const r = applyLevel(c, { class: "barbarian" }, { hp: { method: "average" }, choices: {} }, R);
    if ("error" in r) throw new Error(r.error);
    expect(flattenChange(explainChange(c, r.value, { registry: R })).join("\n")).toContain("Attacks per action 1 → 2");
  });
});

describe("dropping to 0 hit points", () => {
  it("ends concentration with no save prompt, and ends a Rage", () => {
    const c = pc("cleric", 5, { wis: 16 }, { hp: { max: 30, current: 5, temp: 0 }, concentration: "bless" });
    const out = act(c, { type: "damage", amount: 12 }, R);
    expect(out.value.hp.current).toBe(0);
    expect(out.value.concentration).toBeUndefined();
    expect(out.concentrationCheck).toBeUndefined();
    expect(out.note).toContain("stop concentrating on Bless");
    const raging = switchOn(pc("barbarian", 3, { str: 16, con: 14 }, { hp: { max: 30, current: 5, temp: 0 } }), R, "rage");
    expect(raging.active.rage).toBeTruthy();
    expect(act(raging, { type: "damage", amount: 40 }, R).value.active.rage).toBeUndefined();
  });
});
