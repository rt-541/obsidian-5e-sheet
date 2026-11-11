import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { collectEffects, rollSources, sumModifier, damageTraits, missingIds, itemWorks, notes } from "../../src/core/effects";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };
const actor = (o: Partial<{ conditions: Record<string, number>; inventory: any[]; injuries: any[]; modifiers: any[] }> = {}) =>
  ({ conditions: {}, inventory: [], injuries: [], modifiers: [], ...o });

describe("effects", () => {
  it("poisoned gives disadvantage on attacks, checks, skills and initiative but not saves", () => {
    const l = collectEffects(actor({ conditions: { poisoned: 1 } }), { registry: reg() });
    expect(rollSources(l, { kind: "attack", abil: "str" }).dis).toEqual(["Poisoned"]);
    expect(rollSources(l, { kind: "skill", abil: "dex", skill: "stealth" }).dis).toEqual(["Poisoned"]);
    expect(rollSources(l, { kind: "initiative", abil: "dex" }).dis).toEqual(["Poisoned"]);
    expect(rollSources(l, { kind: "save", abil: "wis" }).dis).toEqual([]);
  });
  it("paralyzed auto-fails str and dex saves only", () => {
    const l = collectEffects(actor({ conditions: { paralyzed: 1 } }), { registry: reg() });
    expect(rollSources(l, { kind: "save", abil: "dex" }).fail).toEqual(["Paralyzed"]);
    expect(rollSources(l, { kind: "save", abil: "con" }).fail).toEqual([]);
  });
  it("exhaustion uses its level's effects and names the level", () => {
    const l = collectEffects(actor({ conditions: { exhaustion: 4 } }), { registry: reg() });
    expect(rollSources(l, { kind: "save", abil: "wis" }).dis).toEqual(["Exhaustion 4"]);
    expect(sumModifier(l, "hpMax")).toEqual({ add: 0, half: true, zero: false, sources: ["Exhaustion 4"] });
    expect(sumModifier(l, "speed").half).toBe(true);
  });
  it("exhaustion above its max is clamped to the last level", () => {
    const l = collectEffects(actor({ conditions: { exhaustion: 9 } }), { registry: reg() });
    expect(l[0].source).toBe("Exhaustion 6");
  });
  it("attunement items only work when attuned", () => {
    const r = reg(), ring = r.get<any>("item", "ring-of-protection")!.data;
    expect(itemWorks({ id: "ring-of-protection", qty: 1, equipped: true, attuned: false }, ring)).toBe(false);
    expect(itemWorks({ id: "ring-of-protection", qty: 1, equipped: true, attuned: true }, ring)).toBe(true);
    const l = collectEffects(actor({ inventory: [{ id: "ring-of-protection", qty: 1, equipped: true, attuned: true }, { id: "shield", qty: 1, equipped: true, attuned: false }] }), { registry: r });
    expect(sumModifier(l, "ac")).toEqual({ add: 3, half: false, zero: false, sources: ["Ring of protection", "Shield"] });
    expect(sumModifier(l, "save").add).toBe(1);
  });
  it("unequipped items do nothing", () => {
    const l = collectEffects(actor({ inventory: [{ id: "shield", qty: 1, equipped: false, attuned: false }] }), { registry: reg() });
    expect(sumModifier(l, "ac").add).toBe(0);
  });
  it("homebrew injury applies unless overcome; Tremors-style attack:!str", () => {
    const r = reg();
    r.add("vault", "injury", { name: "Tremors", effects: { dis: ["attack:!str"] } }, { path: "i/Tremors.md" });
    const on = collectEffects(actor({ injuries: [{ id: "tremors", overcome: false }] }), { registry: r });
    expect(rollSources(on, { kind: "attack", abil: "dex", range: "ranged" }).dis).toEqual(["Tremors"]);
    expect(rollSources(on, { kind: "attack", abil: "str", range: "melee" }).dis).toEqual([]);
    const off = collectEffects(actor({ injuries: [{ id: "tremors", overcome: true }] }), { registry: r });
    expect(off).toEqual([]);
  });
  it("campaign weather affects march and navigation only", () => {
    const l = collectEffects(actor(), { registry: reg(), campaign: { name: "C", rules: {}, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" }, weather: { name: "Heavy rain", adv: [], dis: ["march", "navigation"] } } });
    expect(rollSources(l, { kind: "march", abil: "con" }).dis).toEqual(["Weather: Heavy rain"]);
    expect(rollSources(l, { kind: "check", abil: "wis" }).dis).toEqual([]);
  });
  it("character modifiers and damage traits", () => {
    const r = reg();
    r.add("vault", "item", { name: "Emberheart Warhammer", kind: "weapon", attunement: true, weapon: { dmg: "1d8", type: "bludgeoning", ab: "str", range: "melee" }, effects: { resist: ["cold"], note: "Spend a charge for fire" } }, { path: "e.md" });
    const l = collectEffects(actor({ modifiers: [{ target: "ac", value: 1, source: "Blessing" }], inventory: [{ id: "emberheart-warhammer", qty: 1, equipped: true, attuned: true }] }), { registry: r });
    expect(sumModifier(l, "ac").sources).toEqual(["Blessing"]);
    expect(damageTraits(l).resist).toEqual(["cold"]);
    expect(notes(l)).toEqual([{ source: "Emberheart Warhammer", text: "Spend a charge for fire" }]);
  });
  it("unknown ids are reported, not fatal", () => {
    const a = actor({ conditions: { hexed: 1 }, inventory: [{ id: "vorpal-spoon", qty: 1, equipped: true, attuned: false }, { name: "Locket", qty: 1, equipped: false, attuned: false }] });
    expect(collectEffects(a, { registry: reg() })).toEqual([]);
    expect(missingIds(a, reg())).toEqual(["condition:hexed", "item:vorpal-spoon"]);
  });
});
