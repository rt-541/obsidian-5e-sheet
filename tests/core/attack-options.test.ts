import { describe, expect, it } from "vitest";
import { parseNote, writeInto } from "../../src/core/character";
import { optChar, optionsRegistry } from "../fixtures/attack-options";
import { derive, makeChar, tester } from "../fixtures/mechanics";

describe("declared attack options", () => {
  const r = optionsRegistry();

  it("lists a feat's option with its resource", () => {
    const st = derive(optChar({ feats: ["test-focus"] }), r);
    expect(st.attackOptions).toEqual([expect.objectContaining({ id: "test-focus", name: "Test Focus", kind: "declared", on: false, toHit: "1d4", tag: "attack",
      resource: { id: "focus-dice", name: "Focus Dice", left: 3, max: 3, unlimited: false } })]);
  });

  it("shows the switch state and what is left of the resource", () => {
    expect(derive(optChar({ feats: ["test-focus"], optionsOn: ["test-focus"], uses: { "focus-dice": 1 } }), r).attackOptions[0]).toMatchObject({ on: true, resource: { left: 2 } });
  });

  it("reads an inline scale at the owner level", () => {
    expect(derive(optChar({ feats: ["test-analysis"] }), r).attackOptions[0].onHit).toBe("1d4");
    expect(derive(optChar({ feats: ["test-analysis"], classes: [{ class: "tester", level: 5 }] }), r).attackOptions[0].onHit).toBe("2d4");
  });

  it("counts an item option only while the item works", () => {
    expect(derive(optChar({ inventory: [{ id: "test-hunting-blade", equipped: true }] }), r).attackOptions[0])
      .toMatchObject({ id: "test-hunting-blade", ref: "item:test-hunting-blade", onHit: "1d6", oncePerTurn: true });
    expect(derive(optChar({ inventory: [{ id: "test-hunting-blade", equipped: false }] }), r).attackOptions).toEqual([]);
  });

  it("says in plain words when the resource is missing", () => {
    expect(derive(optChar({ feats: ["test-lost"] }), r).attackOptions[0].problem).toBe("needs Missing Dice, which this character doesn't have");
  });

  it("gives Savage Attacker its built-in reroll", () => {
    const reg = optionsRegistry();
    reg.add("vault", "feat", { name: "Savage Attacker", grants: [{ op: "feature", name: "Savage Attacker" }] }, { path: "sa.md" });
    expect(derive(optChar({ feats: ["savage-attacker"] }), reg).attackOptions[0]).toMatchObject({ reroll: true, oncePerTurn: true, tag: "attack:weapon" });
  });

  it("reads optionsOn and optionsOff and never writes them when absent", () => {
    expect(parseNote({ ...tester, optionsOn: ["a"], optionsOff: ["extra:b"] })).toMatchObject({ value: { optionsOn: ["a"], optionsOff: ["extra:b"] }, errors: [] });
    const fm: Record<string, unknown> = {}; writeInto(fm, makeChar());
    expect("optionsOn" in fm || "optionsOff" in fm).toBe(false);
    const bad = parseNote({ ...tester, optionsOn: "a" });
    expect(bad.kind === "character" && bad.errors).toContain("optionsOn: must be a list");
  });

  it("removes the keys from an existing note when the lists are gone", () => {
    const fm: Record<string, unknown> = { optionsOn: ["a"], optionsOff: ["extra:b"] };
    writeInto(fm, makeChar());
    expect("optionsOn" in fm || "optionsOff" in fm).toBe(false);
  });
});

describe("extra damage switches", () => {
  const r = optionsRegistry();

  it("shows extra damage as a switch that starts on", () => {
    const on = derive(optChar({ feats: ["test-ember"] }), r);
    expect(on.attackOptions).toEqual([expect.objectContaining({ id: "extra:test-ember", kind: "extra", on: true, adds: "1d6 fire", tag: "attack:weapon" })]);
    expect(on.attacks.find(a => a.name === "Longsword")!.damage).toContain("1d6 fire");
  });

  it("leaves the damage out when the switch is off", () => {
    const off = derive(optChar({ feats: ["test-ember"], optionsOff: ["extra:test-ember"] }), r);
    expect(off.attackOptions[0].on).toBe(false);
    expect(off.attacks.find(a => a.name === "Longsword")!.damage).not.toContain("fire");
  });
});
