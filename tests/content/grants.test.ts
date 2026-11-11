import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };
const item = (extra: Record<string, unknown>) => ({ name: "Wand", kind: "wondrous", ...extra });

describe("item grants", () => {
  it("normalises charges, perDay and atWill grants", () => {
    const r = reg();
    expect(r.add("vault", "item", item({ charges: { max: 3, reset: "dawn" }, grants: { spells: [
      { id: "burning-hands", charges: 2, level: 2, dc: 13 }, { id: "bless", perDay: 1 }, { id: "light", atWill: true }, { id: "shield" }, { id: "fire-bolt", attack: 5 },
    ] } }), { path: "W.md" })).toBeNull();
    const g = r.get<any>("item", "wand")!.data.grants;
    expect(g.spells).toEqual([
      { id: "burning-hands", cost: { kind: "charges", amount: 2 }, level: 2, dc: 13 },
      { id: "bless", cost: { kind: "perDay", uses: 1 } },
      { id: "light", cost: { kind: "atWill" } },
      { id: "shield", cost: { kind: "atWill" } },
      { id: "fire-bolt", cost: { kind: "atWill" }, attack: 5 },
    ]);
  });
  it("items without grants have none", () => {
    const r = reg(); r.add("vault", "item", item({}), { path: "W.md" });
    expect(r.get<any>("item", "wand")!.data.grants).toBeUndefined();
  });
  it("a string grants.spells is a problem, not a crash", () => {
    expect(reg().add("vault", "item", item({ grants: { spells: "fireball" } }), { path: "W.md" })!.errors).toEqual(["grants.spells: must be a list"]);
  });
  it("a non-mapping grants is a problem", () => {
    expect(reg().add("vault", "item", item({ grants: 4 }), { path: "W.md" })!.errors).toEqual(["grants: must be a mapping"]);
  });
  it("entries need a text id", () => {
    expect(reg().add("vault", "item", item({ grants: { spells: [{ id: 5 }, "x"] } }), { path: "W.md" })!.errors)
      .toEqual(["grants.spells[0].id: must be text", "grants.spells[1]: must be a mapping"]);
  });
  it("charges cost needs the item to have charges", () => {
    expect(reg().add("vault", "item", item({ grants: { spells: [{ id: "bless", charges: 1 }] } }), { path: "W.md" })!.errors)
      .toEqual(["grants.spells[0]: charges needs the item to have charges"]);
  });
  it("only one of charges, perDay, atWill", () => {
    const p = reg().add("vault", "item", item({ charges: { max: 1, reset: "dawn" }, grants: { spells: [{ id: "bless", charges: 1, perDay: 1 }] } }), { path: "W.md" })!;
    expect(p.errors).toEqual(["grants.spells[0]: use only one of charges, perDay or atWill"]);
  });
  it("unknown spell ids are not an item problem", () => {
    expect(reg().add("vault", "item", item({ grants: { spells: [{ id: "no-such-spell" }] } }), { path: "W.md" })).toBeNull();
  });
});
