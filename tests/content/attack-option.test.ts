import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { validateAttackOption } from "../../src/content/types/attack-option";
import { validateOps, validateOptions } from "../../src/content/types/ops";
import { libraryMeta } from "../../src/content/library";
import { overlayProblems } from "../../src/content/overlay";

const bad = (v: unknown) => { const x: string[] = []; validateAttackOption(v, "attackOption", "X", x); return x.join(" | "); };

describe("attackOption field", () => {
  it("accepts good declarations", () => {
    const e: string[] = [];
    expect(validateAttackOption({ toHit: "1d4", resource: "Focus Dice" }, "attackOption", "Test Focus", e)).toEqual({ id: "test-focus", toHit: "1d4", resource: "Focus Dice" });
    expect(e).toEqual([]);
    expect(validateAttackOption({ scale: { 1: "1d4", 5: "2d4" }, oncePerTurn: true }, "a", "X", [])).toEqual({ id: "x", scale: { 1: "1d4", 5: "2d4" }, oncePerTurn: true });
    expect(validateAttackOption({ onHit: "{test-scale}" }, "a", "X", [])).toEqual({ id: "x", onHit: "{test-scale}" });
  });
  it("names each bad field in plain words", () => {
    expect(bad({})).toContain("attackOption: needs toHit, onHit, scale or reroll");
    expect(bad({ toHit: "a lot" })).toContain("attackOption.toHit: must be dice like 1d4");
    expect(bad({ onHit: "1d4", scale: { 1: "1d4" } })).toContain("attackOption: use onHit or scale, not both");
    expect(bad({ scale: { 0: "1d4" } })).toContain("attackOption.scale: must map levels 1 to 20 to dice like 2d4");
    expect(bad({ reroll: "yes" })).toContain("attackOption.reroll: must be true or false");
    expect(bad({ reroll: true, on: "attack:sideways" })).toContain("attackOption.on: unknown roll tag attack:sideways");
    expect(bad({ reroll: true, resource: "" })).toContain("attackOption.resource: must be text");
  });
  it("gets through a feature op, an option def, an item and library meta", () => {
    const e: string[] = [];
    const ops = validateOps([{ op: "feature", name: "Test Focus", attackOption: { toHit: "1d4" } }], "ops", { kind: "subclass", options: {} }, e);
    expect(e).toEqual([]);
    expect((ops[0] as any).attackOption.id).toBe("test-focus");
    const opts = validateOptions({ styles: [{ name: "Test Style", effects: {}, attackOption: { reroll: true } }] }, "options", e);
    expect(e).toEqual([]);
    expect(opts.styles[0].attackOption?.id).toBe("test-style");
    const r = new Registry(); registerBuiltinTypes(r);
    expect(r.add("vault", "item", { name: "Test Hunting Blade", kind: "weapon", weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee" }, attackOption: { onHit: "1d6", oncePerTurn: true } })).toBeNull();
    expect(r.get<any>("item", "test-hunting-blade")!.data.attackOption.onHit).toBe("1d6");
    expect(libraryMeta("item", { name: "X", item_type: "Weapon", attackOption: { reroll: true } }).raw.attackOption).toEqual({ reroll: true });
    expect(overlayProblems()).toEqual([]);
  });
});
