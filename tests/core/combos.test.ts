import { parseNote, writeInto } from "../../src/core/character";
import { comboChoices, comboViews, encodeThing, validateCombo, withField, withThing } from "../../src/core/combos";
import { deriveCharacter } from "../../src/core/derive";
import { act, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";

const r = mechanicsRegistry();
const combo = (steps: object[], extra: object = {}) => ({ name: "Stun Lock", when: "A dangerous target", steps, ...extra });
const views = (o: object = {}) => { const c = makeChar(o), st = deriveCharacter(c, { registry: r }); return comboViews(c, st, [], { registry: r }); };

describe("combos in the note", () => {
  it("a note without combos has none, and a combo reads back with its steps", () => {
    expect(makeChar().combos).toEqual([]);
    const c = makeChar({ combos: [combo([{ action: "Bonus action", text: "Start Fury.", use: { feature: "class:tester:1:fury", resource: "Fury", cost: 1 } }], { notes: "Save one." })] });
    expect(c.combos).toHaveLength(1);
    expect(c.combos[0].steps[0]).toEqual({ action: "Bonus action", text: "Start Fury.", use: { feature: "class:tester:1:fury", resource: "Fury", cost: 1 } });
    expect(c.combos[0].notes).toBe("Save one.");
  });
  it("action names are forgiven: bonus, Bonus Action and a missing action all read as the proper word", () => {
    const c = makeChar({ combos: [combo([{ action: "bonus", text: "a" }, { action: "Bonus Action", text: "b" }, { text: "c" }, { action: "reaction", text: "d" }])] });
    expect(c.combos[0].steps.map(s => s.action)).toEqual(["Bonus action", "Bonus action", "Action", "Reaction"]);
  });
  it("mistakes are named in words and the sheet is read-only", () => {
    const p = parseNote({ ...tester, combos: [{ when: "x", steps: [] }, combo([{ action: "Dance", text: "x" }, { action: "Action", text: 4 }, { action: "Action", text: "x", use: { cost: "two" } }])] });
    if (p.kind !== "character") throw new Error("no");
    expect(p.writable).toBe(false);
    expect(p.errors).toEqual(expect.arrayContaining(["combos[0]: must have a name", expect.stringContaining("combos[1].steps[0].action: must be one of Action, Bonus action"), "combos[1].steps[1].text: must be text", "combos[1].steps[2].use.cost: must be a whole number from 0"]));
  });
  it("unrelated fields in a combo survive a save, and an unused combos list is not written", () => {
    const c = makeChar({ combos: [combo([{ action: "Action", text: "x", mood: "grim" }], { author: "Sam" })] });
    const fm: Record<string, unknown> = {}; writeInto(fm, c);
    expect((fm.combos as { author: string }[])[0].author).toBe("Sam");
    const none: Record<string, unknown> = {}; writeInto(none, makeChar());
    expect("combos" in none).toBe(false);
  });
});

describe("saving, moving and pinning combos", () => {
  const valid = { name: " Opener ", when: " Start of a fight ", steps: [{ action: "Action", text: "Hit it." }] };
  it("adds a combo, trimming the name, and replaces one in place", () => {
    const a = act(makeChar(), { type: "combo", combo: valid }, r).value;
    expect(a.combos).toEqual([{ name: "Opener", when: "Start of a fight", steps: [{ action: "Action", text: "Hit it." }] }]);
    const b = act(a, { type: "combo", index: 0, combo: { ...a.combos[0], name: "Opener 2" } }, r).value;
    expect(b.combos.map(k => k.name)).toEqual(["Opener 2"]);
  });
  it("refuses an empty combo in plain words and leaves the note alone", () => {
    const c = makeChar();
    expect(act(c, { type: "combo", combo: { ...valid, name: "  " } }, r).error).toBe("Give the combo a name.");
    expect(act(c, { type: "combo", combo: { ...valid, steps: [] } }, r).error).toBe("Add at least one step.");
    expect(act(c, { type: "combo", combo: { ...valid, steps: [{ action: "Action", text: " " }] } }, r).error).toContain("Step 1 is empty");
    expect(validateCombo({ ...valid, steps: [{ action: "Action", text: " ", use: { attack: "x" } }] })).toBeUndefined();
  });
  it("moves, pins and deletes", () => {
    let c = makeChar({ combos: [combo([{ text: "a" }], { name: "One" }), combo([{ text: "b" }], { name: "Two" })] });
    c = act(c, { type: "comboMove", index: 1, by: -1 }, r).value; expect(c.combos.map(k => k.name)).toEqual(["Two", "One"]);
    c = act(c, { type: "comboMove", index: 0, by: -1 }, r).value; expect(c.combos.map(k => k.name)).toEqual(["Two", "One"]);   // already first
    c = act(c, { type: "comboPin", index: 1, on: true }, r).value; expect(c.combos[1].pinned).toBe(true);
    c = act(c, { type: "comboPin", index: 1, on: false }, r).value; expect(c.combos[1].pinned).toBeUndefined();
    c = act(c, { type: "comboRemove", index: 0 }, r).value; expect(c.combos.map(k => k.name)).toEqual(["One"]);
  });
});

describe("the form's picker values", () => {
  it("a pick replaces the earlier pick but keeps the resource, cost and dice", () => {
    const u = withThing({ attack: "Bite", resource: "Ki", cost: 1, dice: "1d4" }, "spell|fireball");
    expect(u).toEqual({ spell: "fireball", resource: "Ki", cost: 1, dice: "1d4" });
    expect(encodeThing(u)).toBe("spell|fireball");
    expect(withThing(u, "cattack|0|Bite")).toEqual({ companion: 0, attack: "Bite", resource: "Ki", cost: 1, dice: "1d4" });
    expect(encodeThing({ companion: 0, attack: "Bite" })).toBe("cattack|0|Bite");
    expect(withThing({ attack: "x" }, "")).toBeUndefined();
  });
  it("clearing the resource also clears its cost", () => {
    expect(withField({ resource: "Ki", cost: 2 }, "resource", "")).toBeUndefined();
    expect(withField({ resource: "Ki", cost: 2 }, "cost", 3)).toEqual({ resource: "Ki", cost: 3 });
  });
  it("the picker lists the character's own things", () => {
    const c = makeChar({ spells: [{ id: "magic-missile", prepared: true }], inventory: [{ id: "dagger", equipped: true }] });
    const g = comboChoices(c, deriveCharacter(c, { registry: r }), [], { registry: r }), labels = Object.fromEntries(g.map(x => [x.label, x.options.map(o => o.label)]));
    expect(labels["Your spells"]).toEqual(["Magic Missile"]);
    expect(labels["Class and race features"]).toEqual(expect.arrayContaining(["Fury (Tester 1)"]));
    expect(labels["Items"]).toEqual(["Dagger"]);
  });
});

describe("a combo as the sheet shows it", () => {
  const fury = (cost: number) => combo([{ action: "Bonus action", text: "Rage.", use: { resource: "Fury", cost } }, { action: "Free", text: "Rage again.", use: { resource: "Fury", cost } }]);
  it("is ready when every resource covers the cost", () => {
    const v = views({ combos: [fury(1)] })[0];
    expect(v.ready).toBe(true); expect(v.readyText).toBe("Ready"); expect(v.steps.map(s => s.out)).toEqual([false, false]);
    expect(v.steps[0].resource).toMatchObject({ cost: 1, left: 2 });
  });
  it("is partly ready when the total cost is more than what is left, naming the shortage", () => {
    const v = views({ combos: [fury(1)], uses: { fury: 1 } })[0];
    expect(v.ready).toBe(false); expect(v.readyText).toBe("Partly: needs 2 fury (1 left)");
    expect(v.steps.map(s => s.out)).toEqual([false, true]);    // the first step can be paid, the second cannot
  });
  it("finds attacks, spells, features and class DCs, and reports what is missing in words", () => {
    const v = views({ spells: [{ id: "magic-missile", prepared: true }], inventory: [{ id: "dagger", equipped: false }], combos: [combo([
      { text: "a", use: { attack: "Dagger" } }, { text: "b", use: { spell: "magic-missile" } }, { text: "c", use: { feature: "class:tester:1:fury" } },
      { text: "d", use: { attack: "Nothing" } }, { text: "e", use: { item: "dagger" } }, { text: "f", use: { spell: "wish" } }, { text: "g", use: { dice: "1d6+{prof}" } }])] })[0];
    expect(v.steps[1].spell?.name).toBe("Magic Missile"); expect(v.steps[2].feature?.name).toBe("Fury"); expect(v.steps[2].toggle?.id).toBe("fury");
    expect(v.steps[3].problems).toEqual(["Nothing is not one of the attacks on this sheet"]); expect(v.steps[3].out).toBe(true);
    expect(v.steps[4].item).toMatchObject({ name: "Dagger", works: false }); expect(v.steps[4].out).toBe(true);
    expect(v.steps[5].problems).toEqual(["wish is not one of your spells"]);
    expect(v.readyText).toContain("Dagger (not equipped)");
  });
  it("a leveled spell with no slot left makes the combo partly ready", () => {
    const v = views({ spells: [{ id: "magic-missile", prepared: true }], classes: [{ class: "wizard", level: 1 }], spellSlots: { "1": { used: 2 } }, combos: [combo([{ text: "Cast.", use: { spell: "magic-missile" } }])] })[0];
    expect(v.steps[0].spellCastable).toBe(false); expect(v.readyText).toBe("Partly: needs a spell slot (none left)");
  });
  it("a companion's step shows who acts", () => {
    const c = makeChar({ companions: [{ creature: "wolf", name: "Fang" }], combos: [combo([{ text: "Fang bites.", use: { companion: 0, attack: "Bite" } }])] });
    const st = deriveCharacter(c, { registry: r });
    const wolf = { ...st, attacks: [{ name: "Bite", toHit: 4, damage: "2d4+2", target: { kind: "attack" as const } }] };
    const v = comboViews(c, st, [wolf], { registry: r })[0].steps[0];
    expect(v.who).toBe("Fang"); expect(v.attack).toMatchObject({ name: "Bite", toHit: 4, who: 0 });
  });
});
