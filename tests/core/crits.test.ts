import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { rollD20 } from "../../src/core/dice";
import { critInfo } from "../../src/core/effects";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { thalia } from "../fixtures/notes";

/** A random source whose d20 always lands on `n`. */
const landing = (n: number) => () => (n - 1) / 20 + 0.001;

describe("crit range on a roll", () => {
  it("a natural 20 is always a crit, and the range moves it down", () => {
    expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: landing(20) }).crit).toBe(true);
    expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: landing(19) }).crit).toBe(false);
    const r = rollD20({ title: "x", mod: 0, mode: "normal", rng: landing(19), critRange: 19 });
    expect(r.crit).toBe(true); expect(r.detail).toContain("you crit on 19-20");
    expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: landing(18), critRange: 19 }).crit).toBe(false);
    expect(rollD20({ title: "x", mod: 0, mode: "normal", rng: landing(18), critRange: 18 }).crit).toBe(true);
  });
  it("a natural 1 is still a fumble, not a crit", () => {
    const r = rollD20({ title: "x", mod: 0, mode: "normal", rng: landing(1), critRange: 19 });
    expect(r.crit).toBe(false); expect(r.fumble).toBe(true);
  });
  it("with advantage the kept die decides", () => {
    const seq = [19, 3]; let i = 0;
    const r = rollD20({ title: "x", mod: 0, mode: "adv", rng: () => (seq[i++] - 1) / 20 + 0.001, critRange: 19 });
    expect(r.natural).toBe(19); expect(r.crit).toBe(true);
  });
});

describe("crit range from effects", () => {
  const fx = [{ source: "Champion", effects: { critRange: 19, critOn: "attack:melee" } }, { source: "Improved", effects: { critRange: 18, critOn: "attack:ranged" } },
    { source: "Analyze", effects: { critRange: 19, critVs: "analyzed creatures" } }];
  it("uses the lowest range among effects that apply to the roll", () => {
    expect(critInfo(fx, { kind: "attack", abil: "str", range: "melee" }).range).toBe(19);
    expect(critInfo(fx, { kind: "attack", abil: "dex", range: "ranged" }).range).toBe(18);
    expect(critInfo([fx[0]], { kind: "attack", abil: "dex", range: "ranged" }).range).toBe(20);
  });
  it("a range that only works against something is a hint, not a crit", () => {
    const i = critInfo([fx[2]], { kind: "attack", abil: "str", range: "melee" });
    expect(i.range).toBe(20); expect(i.hints).toEqual(["19-20 is a critical hit against analyzed creatures (Analyze)"]);
  });
});

describe("the sheet flags crits at the derived range", () => {
  function sheet(rng: () => number) {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    r.add("vault", "item", { name: "Keen charm", kind: "wondrous", effects: { critRange: 19, critOn: "attack:melee" } }, { path: "k.md" });
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng };
    const p = parseNote({ ...thalia, inventory: [...thalia.inventory, { id: "keen-charm", equipped: true }] }); if (p.kind !== "character") throw new Error();
    return new SheetController(host, p);
  }
  it("a melee attack that lands on 19 is a crit; a ranged one and a skill check are not", () => {
    const c = sheet(landing(19));
    expect(c.roll("Warhammer to hit", 5, { kind: "attack", abil: "str", range: "melee" }).crit).toBe(true);
    expect(c.roll("Bow to hit", 5, { kind: "attack", abil: "dex", range: "ranged" }).crit).toBe(false);
    expect(c.roll("Athletics", 5, { kind: "skill", abil: "str", skill: "athletics" }).crit).toBe(false);
  });
});
