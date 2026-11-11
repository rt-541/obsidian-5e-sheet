import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { apply, type Action } from "../../src/core/actions";
import { diceAt, spellRows } from "../../src/core/spells";
import { restStandard } from "../../src/rules/rests";
import { resolveRules } from "../../src/rules/module";
import { thalia } from "../fixtures/notes";

const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
r.add("vault", "item", { name: "Wand of Sparks", kind: "wondrous", attunement: true, charges: { max: 3, reset: "dawn" },
  grants: { spells: [{ id: "burning-hands", charges: 2, level: 3, dc: 15 }, { id: "ghost-spell", atWill: true }] } }, { path: "W.md" });
r.add("vault", "item", { name: "Cloak of Light", kind: "wondrous", attunement: false,
  grants: { spells: [{ id: "bless", perDay: 1 }, { id: "light" }] } }, { path: "C.md" });
const ctx = { registry: r };

const mk = (extra: object = {}, inv: object[] = []): Character => {
  const p = parseNote({ ...thalia, spells: [{ id: "cure-wounds", prepared: true }, { id: "burning-hands", prepared: true }, { id: "fire-bolt", prepared: true },
    { id: "bless", prepared: true }, { id: "detect-magic", prepared: true }, { id: "made-up", prepared: true }], ...extra,
    inventory: inv.length ? inv : (thalia as any).inventory });
  if (p.kind !== "character") throw new Error(); return p.value;
};
const lim = (c: Character) => ({ self: deriveCharacter(c, ctx), companions: [], chargesMax: () => 3, ctx });
const run = (c: Character, ...as: Action[]) => as.reduce((acc, a) => {
  const out = apply(acc.value, a, lim(acc.value));
  return { value: out.value, error: out.error ?? acc.error, note: out.note ?? acc.note };
}, { value: c, error: undefined as string | undefined, note: undefined as string | undefined });
const rows = (c: Character) => spellRows(c, deriveCharacter(c, ctx), ctx);
const wand = (attuned: boolean, used = 0) => ({ id: "wand-of-sparks", equipped: true, attuned, charges: { used } });

describe("diceAt", () => {
  it("takes the highest key at or below the level", () => {
    expect(diceAt({ "1": "1d10", "5": "2d10", "11": "3d10" }, 5)).toBe("2d10");
    expect(diceAt({ "1": "1d10", "5": "2d10", "11": "3d10" }, 10)).toBe("2d10");
    expect(diceAt({ "1": "1d10" }, 0)).toBeUndefined();
    expect(diceAt(undefined, 3)).toBeUndefined();
  });
});

describe("spellRows", () => {
  it("own spells carry damage, heal and dc at the right level", () => {
    const { own } = rows(mk());
    const get = (id: string) => own.find(x => x.id === id)!;
    expect(get("burning-hands").damage).toBe("3d6"); expect(get("burning-hands").dc).toBe(14);
    expect(get("fire-bolt").damage).toBe("2d10"); expect(get("fire-bolt").attack).toBe(6);
    expect(get("cure-wounds").heal).toBe("1d8+3");
    expect(get("bless").concentration).toBe(true);
    expect(get("cure-wounds").source).toEqual({ kind: "own", prepared: true });
  });
  it("an unknown spell id is a row with known false", () => {
    const row = rows(mk()).own.find(x => x.id === "made-up")!;
    expect(row.known).toBe(false); expect(row.name).toBe("made-up"); expect(row.data).toBeUndefined();
  });
  it("an item spell is hidden until the item is attuned, and hidden again after", () => {
    expect(rows(mk({}, [wand(false)])).fromItems).toEqual([]);
    const on = run(mk({}, [wand(false)]), { type: "attune", index: 0, on: true });
    const list = rows(on.value).fromItems;
    expect(list.map(x => x.id)).toEqual(["burning-hands", "ghost-spell"]);
    expect(list[0]).toMatchObject({ castLevel: 3, dc: 15, damage: "5d6", known: true, source: { kind: "item", itemIndex: 0, itemName: "Wand of Sparks", chargesLeft: 3 } });
    expect(list[1].known).toBe(false);
    expect(rows(run(on.value, { type: "attune", index: 0, on: false }).value).fromItems.length).toBe(0);
  });
  it("junk grants never crash the list", () => {
    const bad = new Registry(); registerBuiltinTypes(bad); loadSrd(bad);
    expect(bad.add("vault", "item", { name: "Junk", kind: "wondrous", grants: { spells: "fireball" } }, { path: "J.md" })).not.toBeNull();
    const c = mk({}, [{ id: "junk", equipped: true }]);
    expect(() => spellRows(c, deriveCharacter(c, { registry: bad }), { registry: bad })).not.toThrow();
  });
});

describe("cast", () => {
  it("an own spell spends a slot of its level", () => {
    const out = run(mk(), { type: "cast", spell: "burning-hands" });
    expect(out.error).toBeUndefined(); expect(out.value.spellSlots["1"].used).toBe(2);
  });
  it("upcasting spends the chosen level and damage follows it", () => {
    const out = run(mk(), { type: "cast", spell: "burning-hands", level: 3 });
    expect(out.value.spellSlots["3"].used).toBe(2); expect(out.value.spellSlots["1"].used).toBe(1);
  });
  it("refuses with no free slot or below the spell's level and changes nothing", () => {
    const c = mk();
    const full = run(c, { type: "cast", spell: "burning-hands", level: 3 }, { type: "cast", spell: "burning-hands", level: 3 });
    expect(full.error).toBe("No level 3 slots left"); expect(full.value.spellSlots["3"].used).toBe(2);
    expect(run(c, { type: "cast", spell: "burning-hands", level: 7 }).error).toBe("No level 7 slots left");
    const low = run(mk({ spells: [{ id: "fireball", prepared: true }] }), { type: "cast", spell: "fireball", level: 2 });
    expect(low.error).toBe("Can't cast below the spell's level"); expect(low.value.spellSlots["2"]).toBeUndefined();
  });
  it("cantrips cost nothing", () => {
    const c = mk(); const out = run(c, { type: "cast", spell: "fire-bolt" });
    expect(out.error).toBeUndefined(); expect(out.value.spellSlots).toEqual(c.spellSlots);
  });
  it("an unknown spell is refused", () => {
    expect(run(mk(), { type: "cast", spell: "made-up" }).error).toBe("Spell missing from compendium");
  });
  it("item charges are spent and refused when short", () => {
    const c = mk({}, [wand(true)]);
    const one = run(c, { type: "cast", spell: "burning-hands", item: 0 });
    expect(one.value.inventory[0].charges).toEqual({ used: 2 }); expect(one.value.spellSlots["1"].used).toBe(1);
    const two = run(one.value, { type: "cast", spell: "burning-hands", item: 0 });
    expect(two.error).toBe("Not enough charges"); expect(two.value.inventory[0].charges).toEqual({ used: 2 });
  });
  it("an unattuned item cannot cast", () => {
    const out = run(mk({}, [wand(false)]), { type: "cast", spell: "burning-hands", item: 0 });
    expect(out.error).toBeDefined(); expect(out.value.inventory[0].charges).toEqual({ used: 0 });
  });
  it("perDay is refused after the uses run out and a long rest restores it", () => {
    const c = mk({}, [{ id: "cloak-of-light", equipped: true }]);
    const once = run(c, { type: "cast", spell: "bless", item: 0 });
    expect(once.value.inventory[0].spellUses).toEqual({ bless: 1 });
    expect(rows(once.value).fromItems[0].source).toMatchObject({ usesLeft: 0 });
    const again = run(once.value, { type: "cast", spell: "bless", item: 0 });
    expect(again.error).toBe("No uses left today");
    const rest = restStandard.rests.find(x => x.id === "long")!;
    const slept = rest.apply({ c: once.value, stats: deriveCharacter(once.value, ctx), registry: r, rules: resolveRules([restStandard], []) });
    expect(slept.value.inventory[0].spellUses).toBeUndefined();
    expect(run(slept.value, { type: "cast", spell: "bless", item: 0 }).error).toBeUndefined();
  });
  it("short rests leave per-day uses alone", () => {
    const once = run(mk({}, [{ id: "cloak-of-light", equipped: true }]), { type: "cast", spell: "bless", item: 0 });
    const rest = restStandard.rests.find(x => x.id === "short")!;
    const out = rest.apply({ c: once.value, stats: deriveCharacter(once.value, ctx), registry: r, rules: {} });
    expect(out.value.inventory[0].spellUses).toEqual({ bless: 1 });
  });
  it("at-will item spells cost nothing", () => {
    const c = mk({}, [{ id: "cloak-of-light", equipped: true }]);
    const out = run(c, { type: "cast", spell: "light", item: 0 });
    expect(out.error).toBeUndefined(); expect(out.value.spellSlots).toEqual(c.spellSlots);
  });
  it("a second concentration spell replaces the first and says so", () => {
    const a = run(mk(), { type: "cast", spell: "bless" });
    expect(a.value.concentration).toBe("bless"); expect(a.note).toBeUndefined();
    const b = run(a.value, { type: "cast", spell: "detect-magic" });
    expect(b.value.concentration).toBe("detect-magic"); expect(b.note).toBe("Concentration on Bless ends");
    expect(run(b.value, { type: "endConcentration" }).value.concentration).toBeUndefined();
  });
  it("a refused cast leaves concentration alone", () => {
    const a = run(mk({ concentration: "bless" }), { type: "cast", spell: "detect-magic", level: 9 });
    expect(a.error).toBeDefined(); expect(a.value.concentration).toBe("bless");
  });
});
