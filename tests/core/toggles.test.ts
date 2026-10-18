import { validateToggle } from "../../src/content/types/toggle";
import { act, derive, makeChar, mechanicsRegistry, restLong, restShort } from "../fixtures/mechanics";

const R = mechanicsRegistry();
const now = (o: object = {}) => derive(makeChar(o), R);
const toggle = (s: ReturnType<typeof now>, id: string) => s.toggles.find(t => t.id === id)!;

describe("toggle declarations", () => {
  const v = (x: unknown, name = "Rage Of Old") => { const e: string[] = []; return { out: validateToggle(x, "toggle", name, e), e }; };
  it("defaults the id to the slug of the name, and the rest to a long rest", () => {
    expect(v({}).out).toEqual({ id: "rage-of-old", endsOn: "long" });
  });
  it("reads cost, group, while, value and endsOn", () => {
    expect(v({ id: "rage", cost: { resource: "Rage", amount: 1 }, group: "forms", while: ["!armor:heavy"], value: { min: 1, max: 3, label: "Bonus" }, endsOn: "never" }).out)
      .toEqual({ id: "rage", cost: { resource: "Rage", amount: 1 }, group: "forms", while: ["!armor:heavy"], value: { min: 1, max: 3, label: "Bonus" }, endsOn: "never" });
    expect(v({ cost: { slot: 2 } }).out?.cost).toEqual({ slot: 2 });
    expect(v({ cost: { charges: 1 } }).out?.cost).toEqual({ charges: 1 });
  });
  it("says what is wrong in words and rejects the toggle", () => {
    const a = v({ cost: {}, group: 3, while: ["nonsense"], value: { min: 0, max: 3, label: "x" }, endsOn: "tomorrow" });
    expect(a.out).toBeUndefined();
    expect(a.e.join("\n")).toMatch(/cost: needs a resource, a slot or charges/);
    expect(a.e.join("\n")).toMatch(/group: must be text/);
    expect(a.e.join("\n")).toMatch(/unknown condition nonsense/);
    expect(a.e.join("\n")).toMatch(/value: must be/);
    expect(a.e.join("\n")).toMatch(/endsOn: must be short, long or never/);
  });
  it("a feature or option with a bad toggle makes the whole note invalid", () => {
    const r = mechanicsRegistry();
    const p = r.add("vault", "feat", { name: "Bad", grants: [{ op: "feature", name: "X", toggle: { endsOn: "never ever" } }] }, { path: "bad.md" });
    expect(p?.errors.join()).toMatch(/endsOn/);
  });
});

describe("a toggle's own effects count only while it is on", () => {
  it("off: nothing changes; on: the effects apply", () => {
    const off = now();
    expect(toggle(off, "fury")).toMatchObject({ on: false, name: "Fury" });
    expect(off.traits.resist).toEqual([]);
    const on = now({ active: { fury: true } });
    expect(toggle(on, "fury").on).toBe(true);
    expect(on.traits.resist).toEqual(["bludgeoning"]);
  });
  it("the other effects of a feature can ride the toggle with while", () => {
    const r = mechanicsRegistry();
    r.add("vault", "feat", { name: "Fury Rider", grants: [{ op: "effect", effects: { modifiers: [{ target: "speed", value: 5 }], while: ["toggle:fury"] } }] }, { path: "rider.md" });
    expect(derive(makeChar({ feats: ["fury-rider"] }), r).speed.value).toBe(30);
    expect(derive(makeChar({ feats: ["fury-rider"], active: { fury: true } }), r).speed.value).toBe(35);
  });
  it("an item toggle gates the item's effects, and only while the item works", () => {
    const r = mechanicsRegistry();
    r.add("vault", "item", { name: "Flame Plate", kind: "wondrous", toggle: {}, effects: { resist: ["fire"] } }, { path: "plate.md" });
    const inv = [{ id: "flame-plate", equipped: true }];
    expect(derive(makeChar({ inventory: inv }), r).traits.resist).toEqual([]);
    expect(derive(makeChar({ inventory: inv, active: { "flame-plate": true } }), r).traits.resist).toEqual(["fire"]);
    expect(derive(makeChar({ inventory: [{ id: "flame-plate", equipped: false }], active: { "flame-plate": true } }), r).toggles.some(t => t.id === "flame-plate")).toBe(false);
    expect(derive(makeChar({ inventory: inv }), r).toggles.filter(t => t.itemIndex !== undefined).map(t => [t.id, t.itemIndex])).toEqual([["flame-plate", 0]]);
  });
  it("while on the toggle suppresses it without clearing it", () => {
    const light = now({ active: { careful: true } });
    expect(light.ac.value).toBe(now().ac.value + 2);
    const heavy = now({ active: { careful: true }, inventory: [{ id: "chain-mail", equipped: true }] });
    expect(toggle(heavy, "careful")).toMatchObject({ on: true, suppressed: true });
    expect(heavy.ac.value).toBe(now({ inventory: [{ id: "chain-mail", equipped: true }] }).ac.value);
  });
  it("a value toggle feeds toggle_<id> to formulas", () => {
    const base = now().attacks, ab = (n: number) => derive(makeChar({ active: { focus: n }, inventory: [{ id: "dagger", equipped: true }] }), R).attacks[0].toHit!;
    expect(base).toBeDefined();
    expect(ab(3) - ab(1)).toBe(2);
    expect(toggle(now({ active: { focus: 2 } }), "focus").value).toBe(2);
  });
});

describe("switching a toggle", () => {
  it("starting spends the cost and ending is free", () => {
    const c = makeChar(), on = act(c, { type: "toggle", id: "fury", on: true }, R);
    expect(on.error).toBeUndefined();
    expect(on.value.active.fury).toBe(true); expect(on.value.uses.fury).toBe(1);
    expect(on.note).toBe("Fury started. 1 Fury spent.");
    const off = act(on.value, { type: "toggle", id: "fury", on: false }, R);
    expect(off.value.active.fury).toBeUndefined(); expect(off.value.uses.fury).toBe(1);
  });
  it("refuses in words when nothing is left, and changes nothing", () => {
    const c = makeChar({ uses: { fury: 2 } }), out = act(c, { type: "toggle", id: "fury", on: true }, R);
    expect(out.error).toBe("No Fury left, so Fury can't start. Take a rest first.");
    expect(out.value).toBe(c);
  });
  it("a spell slot cost spends the lowest slot that is high enough", () => {
    const c = makeChar({ classes: [{ class: "wizard", level: 3 }] });
    const out = act(c, { type: "toggle", id: "spark", on: true }, R);
    expect(out.error).toMatch(/isn.t on this character/);
    const r = mechanicsRegistry();
    r.add("vault", "feat", { name: "Sparky", grants: [{ op: "feature", name: "Spark Two", toggle: { cost: { slot: 2 } } }] }, { path: "sparky.md" });
    const w = makeChar({ classes: [{ class: "wizard", level: 3 }], feats: ["sparky"], spellSlots: { "2": { used: 0 } } });
    const ok = act(w, { type: "toggle", id: "spark-two", on: true }, r);
    expect(ok.value.spellSlots["2"].used).toBe(1); expect(ok.note).toContain("level 2 spell slot spent");
    const none = act({ ...w, spellSlots: { "1": { used: 0 }, "2": { used: 3 } } }, { type: "toggle", id: "spark-two", on: true }, r);
    expect(none.error).toBe("No spell slot of level 2 or higher left, so Spark Two can't start.");
  });
  it("item charges are spent from the item that holds the toggle", () => {
    const r = mechanicsRegistry();
    r.add("vault", "item", { name: "Storm Blade", kind: "weapon", weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee" }, charges: { max: 3, reset: "dawn" }, toggle: { cost: { charges: 2 } }, effects: { resist: ["lightning"] } }, { path: "blade.md" });
    const c = makeChar({ inventory: [{ id: "storm-blade", equipped: true }] });
    const on = act(c, { type: "toggle", id: "storm-blade", on: true }, r);
    expect(on.value.inventory[0].charges).toEqual({ used: 2 }); expect(on.note).toBe("Storm Blade started. 2 charges spent.");
    const again = act({ ...on.value, active: {} }, { type: "toggle", id: "storm-blade", on: true }, r);
    expect(again.error).toBe("Not enough charges left, so Storm Blade can't start.");
  });
  it("one active per group: starting a stance ends the other", () => {
    const hi = act(makeChar(), { type: "toggle", id: "high-stance", on: true }, R);
    const lo = act(hi.value, { type: "toggle", id: "low-stance", on: true }, R);
    expect(lo.value.active).toEqual({ "low-stance": true }); expect(lo.note).toBe("Low Stance started. High Stance ended.");
  });
  it("a value toggle starts at its minimum, is clamped, and can be changed while on", () => {
    const a = act(makeChar(), { type: "toggle", id: "focus", on: true }, R);
    expect(a.value.active.focus).toBe(1);
    const b = act(a.value, { type: "toggle", id: "focus", on: true, value: 9 }, R);
    expect(b.value.active.focus).toBe(3);
    expect(act(makeChar(), { type: "toggle", id: "focus", on: true, value: 2 }, R).value.active.focus).toBe(2);
  });
});

describe("rests end toggles", () => {
  const on = makeChar({ active: { "high-stance": true, fury: true, focus: 2 } });
  it("a short rest ends the short ones only; a long rest ends the long ones too", () => {
    const s = restShort(on, R);
    expect(s.value.active).toEqual({ fury: true, focus: 2 });
    expect(s.summary).toContain("High Stance ends");
    const l = restLong(on, R);
    expect(l.value.active).toEqual({});
    expect(l.summary).toEqual(expect.arrayContaining(["High Stance ends", "Fury ends"]));
  });
  it("a toggle that never ends stays", () => {
    const r = mechanicsRegistry();
    r.add("vault", "feat", { name: "Forever", grants: [{ op: "feature", name: "Oath", toggle: { endsOn: "never" } }] }, { path: "oath.md" });
    expect(restLong(makeChar({ feats: ["forever"], active: { oath: true } }), r).value.active).toEqual({ oath: true });
  });
});
