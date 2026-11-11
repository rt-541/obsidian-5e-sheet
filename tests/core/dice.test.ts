import { rollD20, rollDice, rollKeepHigher, parseDice, seeded } from "../../src/core/dice";
import { seq } from "../fixtures/attack-options";

const fixed = (...vals: number[]) => { let i = 0; return () => (vals[i++ % vals.length] - 1) / 20 + 0.0001; }; // d20 faces

describe("rollD20", () => {
  it("normal roll adds the modifier", () => {
    const r = rollD20({ title: "Insight", mod: 6, mode: "normal", rng: fixed(14) });
    expect(r.total).toBe(20); expect(r.natural).toBe(14); expect(r.detail).toBe("d20(14) +6");
  });
  it("advantage keeps the higher, disadvantage the lower", () => {
    expect(rollD20({ title: "x", mod: 0, mode: "adv", rng: fixed(3, 17) }).natural).toBe(17);
    expect(rollD20({ title: "x", mod: 0, mode: "dis", rng: fixed(3, 17) }).natural).toBe(3);
  });
  it("sources from effects apply and are named", () => {
    const r = rollD20({ title: "Stealth", mod: 2, mode: "normal", dis: ["Poisoned"], rng: fixed(15, 4) });
    expect(r.natural).toBe(4); expect(r.detail).toBe("d20(4) dis [15, 4] +2 (dis: Poisoned)");
  });
  it("advantage and disadvantage cancel regardless of count", () => {
    const r = rollD20({ title: "x", mod: 1, mode: "adv", dis: ["Poisoned", "Prone"], rng: fixed(9, 19) });
    expect(r.natural).toBe(9); expect(r.dice).toEqual([9]); expect(r.detail).toContain("adv+dis cancel");
  });
  it("autofail short-circuits", () => {
    const r = rollD20({ title: "DEX save", mod: 5, mode: "adv", fail: ["Paralyzed"] });
    expect(r.total).toBe("fail"); expect(r.detail).toBe("Automatic failure (Paralyzed)"); expect(r.dice).toEqual([]);
  });
  it("flags natural 20 and 1", () => {
    expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: fixed(20) }).crit).toBe(true);
    expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: fixed(1) }).fumble).toBe(true);
  });
});

describe("rollDice", () => {
  it("parses multi-term expressions with labels", () => {
    expect(parseDice("1d8+3 + 1d6 fire")).toEqual([{ n: 1, faces: 8, bonus: 3 }, { n: 1, faces: 6, bonus: 0, label: "fire" }]);
    expect(parseDice("2d8-1")).toEqual([{ n: 2, faces: 8, bonus: -1 }]);
    expect(parseDice("1 piercing")).toEqual([{ n: 0, faces: 0, bonus: 1, label: "piercing" }]);
  });
  it("flat damage rolls no dice", () => {
    const r = rollDice("Bite", "1 piercing", seeded(1));
    expect(r.total).toBe(1); expect(r.dice).toEqual([]); expect(r.detail).toBe("1 piercing");
  });
  it("rejects junk", () => {
    expect(() => parseDice("d8")).toThrow("bad dice: d8");
    expect(() => parseDice("1d0")).toThrow();
    expect(() => parseDice("101d6")).toThrow();
  });
  it("sums all terms", () => {
    const r = rollDice("Hit", "2d6+1 + 1d4", seeded(42));
    expect(r.dice).toHaveLength(3);
    expect(r.total).toBe(r.dice.reduce((a, b) => a + b, 0) + 1);
  });
  it("seeded is deterministic", () => {
    expect(rollDice("a", "4d6", seeded(7)).dice).toEqual(rollDice("a", "4d6", seeded(7)).dice);
  });
  it("rollKeepHigher rolls twice and keeps the higher total", () => {
    const k = rollKeepHigher("x", "1d8+3 slashing", seq(0.125, 0.75));
    expect(k.total).toBe(10); expect(k.dice).toEqual([2, 7]);
    expect(k.detail.startsWith("rolled twice: 5 and 10, kept 10")).toBe(true);
  });
});
