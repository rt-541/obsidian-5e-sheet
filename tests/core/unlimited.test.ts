import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { apply } from "../../src/core/actions";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { progress } from "../../src/core/progression";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };
const char = (cls: string, level: number, uses: Record<string, number> = {}): Character => {
  const p = parseNote({ type: "5e-character", name: "T", classes: [{ class: cls, level }], uses, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, hp: { max: 100, current: 100, temp: 0 } });
  if (p.kind !== "character") throw new Error("bad"); return p.value;
};

describe("unlimited resources", () => {
  it("SRD Barbarian 20: Rage is Unlimited, below 20 it is numeric", () => {
    const r20 = progress(char("barbarian", 20, { rage: 3 }), reg()).resources.find(x => x.id === "rage")!;
    expect(r20).toMatchObject({ unlimited: "Unlimited", used: 0, max: 0 });
    const r19 = progress(char("barbarian", 19), reg()).resources.find(x => x.id === "rage")!;
    expect(r19).toMatchObject({ max: 6 }); expect(r19.unlimited).toBeUndefined();
  });

  it("a resource whose max formula names a scale with text value is unlimited", () => {
    const r = reg();
    expect(r.add("srd", "class", { id: "tester", name: "Tester", hitDie: 8, saves: ["str", "con"], levels: {
      1: [{ op: "scale", id: "s", name: "Uses", values: { 1: 2, 5: "Unlimited" } }, { op: "resource", id: "r", name: "Zeal", max: "uses", reset: "long" }] } })).toBeNull();
    expect(progress(char("tester", 1), r).resources[0]).toMatchObject({ max: 2 });
    expect(progress(char("tester", 5), r).resources[0]).toMatchObject({ unlimited: "Unlimited" });
  });

  it("never runs out: a use is accepted without recording anything", () => {
    const r = reg(), c = char("barbarian", 20), st = deriveCharacter(c, { registry: r });
    expect(st.resources.find(x => x.id === "rage")).toMatchObject({ derived: true, unlimited: "Unlimited" });
    const out = apply(c, { type: "uses", id: "rage", used: 4 }, { self: st, companions: [], chargesMax: () => 0 });
    expect(out.error).toBeUndefined(); expect(out.value.uses.rage).toBeUndefined();
  });
});
