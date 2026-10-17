import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd, srdCounts } from "../../src/content/srd";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };

describe("SRD spells", () => {
  const r = reg(); const problems = loadSrd(r);
  it("every bundled spell validates and there are 319", () => {
    expect(problems).toEqual([]);
    expect(srdCounts().spell).toBe(319);
    expect(r.list("spell")).toHaveLength(319);
  });
  it("burning hands is a level 1 dex save for half", () => {
    const d = r.get<any>("spell", "burning-hands")!.data;
    expect(d.level).toBe(1); expect(d.save).toEqual({ abil: "dex", onSuccess: "half" });
    expect(d.damage.bySlot["1"]).toBe("3d6"); expect(d.damage.bySlot["3"]).toBe("5d6"); expect(d.damage.type).toBe("fire");
  });
  it("fire bolt is a ranged cantrip attack scaling by character level", () => {
    const d = r.get<any>("spell", "fire-bolt")!.data;
    expect(d.level).toBe(0); expect(d.attack).toBe("ranged"); expect(d.damage.byCharLevel["5"]).toBe("2d10");
  });
  it("cure wounds heals 1d8+MOD at slot 1", () => expect(r.get<any>("spell", "cure-wounds")!.data.heal.bySlot["1"]).toBe("1d8+MOD"));
  it("bless needs concentration", () => expect(r.get<any>("spell", "bless")!.data.concentration).toBe(true));
  it("the body text becomes rules", () => expect(r.get<any>("spell", "burning-hands")!.data.rules).toMatch(/15-foot cone/));
});

describe("homebrew spells", () => {
  const base = { name: "Zap", level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V"], duration: "Instantaneous" };
  it("accepts a valid note and uses the body as rules", () => {
    const r = reg();
    expect(r.add("vault", "spell", { ...base, damage: { type: "lightning", bySlot: { "1": "1d6 + MOD" } } }, { path: "S/Zap.md", body: "Zaps." })).toBeNull();
    const d = r.get<any>("spell", "zap")!.data;
    expect(d.rules).toBe("Zaps."); expect(d.damage.bySlot["1"]).toBe("1d6+MOD");
  });
  it("rejects a non-numeric level", () => {
    expect(reg().add("vault", "spell", { ...base, level: "x" }, { path: "S/a.md" })!.errors).toContain("level: must be a whole number from 0 to 9");
  });
  it("rejects bad dice, components and save ability", () => {
    const p = reg().add("vault", "spell", { ...base, components: ["V", "Q"], save: { abil: "luck", onSuccess: "half" }, damage: { type: "fire", bySlot: { "1": "lots" } } }, { path: "S/b.md" })!;
    expect(p.errors).toContain("damage.bySlot.1: bad dice: lots");
    expect(p.errors.some(e => e.startsWith("components"))).toBe(true);
    expect(p.errors.some(e => e.startsWith("save.abil"))).toBe(true);
  });
});
