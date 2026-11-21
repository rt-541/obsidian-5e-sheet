import { parseNote, type Character } from "../../src/core/character";
import { changeLevelHp } from "../../src/core/levelup";

/** An invented level 3 character: CON 14 (+2), d10 hit die, one rolled level and one average level. */
function hero(): Character {
  const p = parseNote({
    type: "5e-character", schema: 1, name: "Pell", classes: [{ class: "warden", level: 3 }],
    abilities: { str: 12, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, hp: { max: 27, current: 20, temp: 0 },
    levelLog: [
      { class: "warden", level: 1, hp: { method: "first", die: 10, gained: 10, added: 12 }, choices: {} },
      { class: "warden", level: 2, hp: { method: "roll", die: 10, gained: 2, added: 4 }, choices: {} },
      { class: "warden", level: 3, hp: { method: "average", die: 10, gained: 6, added: 8 }, choices: {} },
    ],
  });
  if (p.kind === "none" || p.value.type !== "5e-character") throw new Error("not a character");
  return p.value;
}

describe("changing the hit points a past level gave", () => {
  it("a higher roll raises the level's record, the maximum and current hit points by the difference", () => {
    const r = changeLevelHp(hero(), 1, 9);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.levelLog[1].hp).toEqual({ method: "roll", die: 10, gained: 9, added: 11 });
    expect(r.value.hp.max).toBe(34); expect(r.value.hp.current).toBe(27);
    expect(r.note).toContain("Level 2");
  });
  it("an average level can be changed to a roll; a lower roll lowers the maximum and keeps current within it", () => {
    const c = hero(); c.hp.current = 27;
    const r = changeLevelHp(c, 2, 1);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.levelLog[2].hp).toEqual({ method: "roll", die: 10, gained: 1, added: 3 });
    expect(r.value.hp.max).toBe(22); expect(r.value.hp.current).toBe(22);
  });
  it("a level always gives at least 1 hit point", () => {
    const c = hero(); c.abilities.con = 3;          // -4
    c.levelLog[1].hp = { method: "roll", die: 10, gained: 2, added: 1 };
    const r = changeLevelHp(c, 1, 1);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.levelLog[1].hp.added).toBe(1); expect(r.value.hp.max).toBe(27);
  });
  it("refuses the first level, a recorded level, an unknown level and a roll outside the die", () => {
    expect(changeLevelHp(hero(), 0, 5)).toHaveProperty("error");
    expect(changeLevelHp(hero(), 7, 5)).toHaveProperty("error");
    expect(changeLevelHp(hero(), 1, 0)).toHaveProperty("error");
    expect(changeLevelHp(hero(), 1, 11)).toHaveProperty("error");
    const c = hero(); c.levelLog[1].hp = { method: "recorded", gained: 6 };
    expect(changeLevelHp(c, 1, 5)).toHaveProperty("error");
  });
  it("leaves the input untouched", () => {
    const c = hero(), before = JSON.stringify(c);
    changeLevelHp(c, 1, 9);
    expect(JSON.stringify(c)).toBe(before);
  });
});
