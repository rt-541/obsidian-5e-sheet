import { describe, expect, it } from "vitest";
import { writeInto } from "../../src/core/character";
import { optChar, optionsRegistry } from "../fixtures/attack-options";
import { act } from "../fixtures/mechanics";

describe("attack option actions", () => {
  const r = optionsRegistry();
  const withFeats = (feats: string[], o: object = {}) => optChar({ feats, ...o });

  it("switches a declared option on and off, keeping the list out of the note when empty", () => {
    const on = act(withFeats(["test-focus"]), { type: "attackOption", id: "test-focus", on: true }, r);
    expect(on.value.optionsOn).toEqual(["test-focus"]);
    const off = act(on.value, { type: "attackOption", id: "test-focus", on: false }, r);
    expect(off.value.optionsOn).toBeUndefined();
  });

  it("switches extra damage off and back on", () => {
    const off = act(withFeats(["test-ember"]), { type: "attackOption", id: "extra:test-ember", on: false }, r);
    expect(off.value.optionsOff).toEqual(["extra:test-ember"]);
    const on = act(off.value, { type: "attackOption", id: "extra:test-ember", on: true }, r);
    expect(on.value.optionsOff).toBeUndefined();
  });

  it("removes the key from an existing note when the last option is switched off", () => {
    const on = act(withFeats(["test-focus"]), { type: "attackOption", id: "test-focus", on: true }, r).value;
    const fm: Record<string, unknown> = { optionsOn: ["test-focus"] };
    writeInto(fm, act(on, { type: "attackOption", id: "test-focus", on: false }, r).value);
    expect("optionsOn" in fm).toBe(false);
  });

  it("refuses in words when the resource is empty", () => {
    const res = act(withFeats(["test-focus"], { uses: { "focus-dice": 3 } }), { type: "attackOption", id: "test-focus", on: true }, r);
    expect(res.error).toContain("No Focus Dice left");
    expect(res.value.optionsOn).toBeUndefined();
  });

  it("refuses when the resource is missing", () => {
    expect(act(withFeats(["test-lost"]), { type: "attackOption", id: "test-lost", on: true }, r).error)
      .toBe("Test Lost needs Missing Dice, which this character doesn't have.");
  });

  it("refuses an unknown id", () => {
    expect(act(withFeats(["test-focus"]), { type: "attackOption", id: "nope", on: true }, r).error).toBe("That attack option isn't on this character.");
  });

  it("spends one of the resource per use and keeps the option on", () => {
    const res = act(withFeats(["test-focus"], { optionsOn: ["test-focus"] }), { type: "attackOptionsUsed", ids: ["test-focus"] }, r);
    expect(res.value.uses["focus-dice"]).toBe(1);
    expect(res.value.optionsOn).toEqual(["test-focus"]);
    expect(res.note).toBeUndefined();
  });

  it("switches off every option on a resource that ran out, and says so", () => {
    const c = withFeats(["test-focus", "test-steady"], { optionsOn: ["test-focus", "test-steady"], uses: { "focus-dice": 2 } });
    const res = act(c, { type: "attackOptionsUsed", ids: ["test-focus"] }, r);
    expect(res.value.uses["focus-dice"]).toBe(3);
    expect(res.value.optionsOn).toBeUndefined();
    expect(res.note).toBe("No Focus Dice left: Test Focus and Test Steady are off.");
  });

  it("switches off a once-per-turn option after use, without a note", () => {
    const res = act(withFeats(["test-savage"], { optionsOn: ["test-savage"] }), { type: "attackOptionsUsed", ids: ["test-savage"] }, r);
    expect(res.value.optionsOn).toBeUndefined();
    expect(res.note).toBeUndefined();
  });

  it("never spends more than the maximum", () => {
    const c = withFeats(["test-focus", "test-steady"], { optionsOn: ["test-focus", "test-steady"], uses: { "focus-dice": 2 } });
    expect(act(c, { type: "attackOptionsUsed", ids: ["test-focus", "test-steady"] }, r).value.uses["focus-dice"]).toBe(3);
  });
});
