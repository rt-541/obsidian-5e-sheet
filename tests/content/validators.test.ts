import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };

describe("validators", () => {
  it("accepts a homebrew condition with effects", () => {
    const r = reg();
    expect(r.add("vault", "condition", { name: "Frostbitten", effects: { dis: ["save:dex", "check:dex"], modifiers: [{ target: "speed", value: -10 }] } }, { path: "Compendium/Frostbitten.md", body: "Brr." })).toBeNull();
    const e = r.get<any>("condition", "frostbitten")!;
    expect(e.data.effects.dis).toEqual(["save:dex", "check:dex"]); expect(e.data.rules).toBe("Brr."); expect(e.data.category).toBe("condition");
  });
  it("injury type sets category injury", () => {
    const r = reg(); r.add("vault", "injury", { name: "Limping", effects: { modifiers: [{ target: "speed", value: -5 }] } });
    expect(r.get<any>("injury", "limping")!.data.category).toBe("injury");
  });
  it("rejects hostile or broken effects with readable errors", () => {
    const r = reg();
    const p = r.add("vault", "condition", { name: "Bad", effects: "lol" }, { path: "C/Bad.md" });
    expect(p).toEqual({ path: "C/Bad.md", errors: ["effects: must be a mapping"] });
    const q = r.add("vault", "item", { name: "Bad ring", kind: "wondrous", effects: { modifiers: [{ target: "ac", value: "x" }, { target: "luck", value: 1 }] } }, { path: "C/Ring.md" });
    expect(q!.errors).toEqual(["effects.modifiers[0].value: must be a number, half or zero", "effects.modifiers[1].target: unknown target luck"]);
    expect(r.get("item", "bad-ring")).toBeUndefined();
  });
  it("rejects unknown roll targets", () => {
    const p = reg().add("vault", "condition", { name: "X", effects: { adv: ["attack", "flying"] } }, { path: "x.md" });
    expect(p!.errors).toEqual(["effects.adv[1]: unknown roll target flying"]);
  });
  it("item weapon damage must parse", () => {
    const p = reg().add("vault", "item", { name: "Odd blade", kind: "weapon", weapon: { dmg: "lots", type: "slashing", ab: "str", range: "melee" } }, { path: "o.md" });
    expect(p!.errors).toEqual(["weapon.dmg: bad dice: lots"]);
  });
  it("DM magic weapon validates and keeps extras", () => {
    const r = reg();
    expect(r.add("vault", "item", { name: "Emberheart Warhammer", kind: "weapon", rarity: "rare", attunement: true, weight: 2,
      weapon: { dmg: "1d8", type: "bludgeoning", ab: "str", range: "melee", bonus: 1, extraDamage: "1d6 fire" },
      charges: { max: 3, reset: "dawn" }, effects: { resist: ["cold"] } }, { path: "Compendium/Items/Emberheart Warhammer.md" })).toBeNull();
    const d = r.get<any>("item", "emberheart-warhammer")!.data;
    expect(d.weapon.bonus).toBe(1); expect(d.charges).toEqual({ max: 3, reset: "dawn" }); expect(d.effects.resist).toEqual(["cold"]);
  });
  it("names containing HTML are kept as plain strings", () => {
    const r = reg(); r.add("vault", "condition", { name: "<img src=x onerror=alert(1)>", effects: {} }, { path: "h.md" });
    expect(r.list<any>("condition")[0].name).toBe("<img src=x onerror=alert(1)>");
  });
  it("creature needs abilities and ac", () => {
    const p = reg().add("vault", "creature", { name: "Blob", size: "Small", ctype: "ooze" }, { path: "b.md" });
    expect(p!.errors).toContain("ac: must be a number");
    expect(p!.errors).toContain("abilities.str: must be a number");
  });
  it("campaign defaults", () => {
    const r = reg(); r.add("vault", "campaign", { name: "Ekron Campaign", rules: { "rest-excursion": true } });
    const d = r.get<any>("campaign", "ekron-campaign")!.data;
    expect(d.rules).toEqual({ "rest-excursion": true }); expect(d.calendar.holyDay).toBe("Sunday"); expect(d.sections).toEqual({ hide: [], show: [] });
    expect(d.leveling).toBeUndefined();                                   // absent means milestone
  });
  it("campaign leveling is xp or milestone, anything else is an error", () => {
    const r = reg();
    expect(r.add("vault", "campaign", { name: "A", leveling: "xp" })).toBeNull(); expect(r.get<any>("campaign", "a")!.data.leveling).toBe("xp");
    expect(r.add("vault", "campaign", { name: "B", leveling: "milestone" })).toBeNull();
    expect(r.add("vault", "campaign", { name: "C", leveling: "story" }, { path: "c.md" })!.errors).toEqual(["leveling: must be one of xp, milestone"]);
  });
});
