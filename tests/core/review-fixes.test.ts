import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, writeInto, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { apply, type Action } from "../../src/core/actions";
import { thalia } from "../fixtures/notes";

const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
const base = (): Character => { const p = parseNote(thalia); if (p.kind !== "character") throw new Error(); return p.value; };
const lim = (c: Character) => { const ctx = { registry: r }; return { self: deriveCharacter(c, ctx), companions: [], chargesMax: () => 3, derive: (v: Character) => deriveCharacter(v, ctx) }; };

describe("exhaustion halves HP max", () => {
  it("damage taken at exhaustion 4 is not hidden, and survives dropping to exhaustion 3", () => {
    let c = base();
    for (const a of [{ type: "condition", id: "exhaustion", level: 4 }, { type: "damage", amount: 10 }, { type: "condition", id: "exhaustion", level: 3 }] as Action[]) c = apply(c, a, lim(c)).value;
    expect(c.hp.current).toBe(11);
    expect(deriveCharacter(c, { registry: r }).hp).toMatchObject({ current: 11, max: 43 });
  });
  it("damage works against the halved max even when the stored current is above it", () => {
    const c = base(); c.hp.current = 40; c.conditions = { exhaustion: 4 };
    expect(apply(c, { type: "damage", amount: 10 }, lim(c)).value.hp.current).toBe(11);
  });
});

describe("never silently rewrites hand-written data", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["unknown save", { proficiencies: { saves: ["Wis", "cha"] } }],
    ["hitDice scalar", { hitDice: { d8: 2 } }],
    ["spellSlots scalar", { spellSlots: { "1": 2 } }],
    ["bad reset", { resources: [{ name: "Rage", max: 2, reset: "Short" }] }],
    ["bad companion kind", { companions: [{ creature: "owl", kind: "pet" }] }],
    ["text weight", { inventory: [{ name: "Rope", weight: "10 lb" }] }],
    ["text prepared", { spells: [{ id: "bless", prepared: "yes" }] }],
    ["text overcome", { injuries: [{ id: "x", overcome: "no" }] }],
  ];
  for (const [name, patch] of bad) it(`${name} makes the note read-only`, () => {
    const p = parseNote({ ...structuredClone(thalia), ...patch }); if (p.kind !== "character") throw new Error();
    expect(p.writable).toBe(false); expect(p.errors.length).toBeGreaterThan(0);
  });
  it("keeps extra keys on list entries through a parse and write", () => {
    const fm: Record<string, unknown> = { ...structuredClone(thalia), coins: { pp: 0, gp: 47, ep: 0, sp: 12, cp: 30 },
      classes: [{ class: "cleric", level: 5, subclass: "life", note: "x" }],
      inventory: [{ name: "Rope", qty: 1, equipped: false, attuned: false, note: "50 ft", charges: { used: 1, label: "uses" } }],
      resources: [{ name: "Rage", max: 2, used: 0, reset: "short", url: "u" }],
      companions: [{ creature: "owl", name: "Hoot", kind: "familiar", hp: { temp: 0, max: 3 }, conditions: {}, color: "brown" }],
      spells: [{ id: "bless", prepared: true, src: "book" }], injuries: [{ id: "scar", overcome: false, when: "d3" }],
      hitDice: { d8: { used: 1, tag: 1 } }, spellSlots: { "1": { used: 1, tag: 1 } } };
    const before = structuredClone(fm);
    const p = parseNote(fm); if (p.kind !== "character") throw new Error();
    expect(p.errors).toEqual([]);
    p.value.hp.current = 7; writeInto(fm, p.value);
    expect(fm).toEqual({ ...before, hp: { ...(before.hp as object), current: 7 } });
  });
});
