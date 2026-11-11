import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { validateEffects } from "../../src/content/types/effects";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { gateHolds, NO_GATES, validGate } from "../../src/core/gates";
import { describeEffects } from "../../src/ui/widgets";
import { thalia } from "../fixtures/notes";

/** Thalia wears chain mail (heavy armor) and a shield. */
const reg = () => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const ring = (name: string, w: string[]) => r.add("vault", "item", { name, kind: "wondrous", effects: { modifiers: [{ target: "ac", value: 1 }], while: w } }, { path: `${name}.md` });
  ring("Gate armor worn", ["armor:worn"]); ring("Gate no armor", ["armor:none"]); ring("Gate not heavy", ["!armor:heavy"]); ring("Gate heavy", ["armor:heavy"]);
  ring("Gate shield", ["shield:worn"]); ring("Gate no shield", ["shield:none"]); ring("Gate dual", ["wield:dual"]); ring("Gate rage", ["toggle:rage"]);
  ring("Gate conc", ["concentrating"]); ring("Gate two", ["armor:heavy", "shield:none"]);
  r.add("vault", "feat", { name: "Gated feat", grants: [{ id: "g", op: "effect", effects: { modifiers: [{ target: "ac", value: 1 }], while: ["toggle:rage"] } }] }, { path: "f.md" });
  return r;
};
const R = reg();
const char = (o: object = {}): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(JSON.stringify(p)); return p.value; };
const ac = (item: string, o: object = {}) => {
  const inv = (o as { inventory?: object[] }).inventory ?? thalia.inventory;
  return deriveCharacter(char({ ...o, inventory: [...inv, { id: item, equipped: true }] }), { registry: R }).ac.value;
};
const base = (o: object = {}) => deriveCharacter(char(o), { registry: R }).ac.value;
const noArmor = { inventory: [{ id: "warhammer", equipped: true }] };

describe("while gates", () => {
  it("armor gates follow the worn armor", () => {
    expect(ac("gate-armor-worn")).toBe(base() + 1);
    expect(ac("gate-heavy")).toBe(base() + 1);
    expect(ac("gate-not-heavy")).toBe(base());
    expect(ac("gate-no-armor")).toBe(base());
    expect(ac("gate-armor-worn", noArmor)).toBe(base(noArmor));
    expect(ac("gate-no-armor", noArmor)).toBe(base(noArmor) + 1);
    expect(ac("gate-not-heavy", noArmor)).toBe(base(noArmor) + 1);
  });
  it("light armor is light and medium is medium", () => {
    const inv = (id: string) => ({ inventory: [{ id, equipped: true }] });
    expect(ac("gate-not-heavy", inv("leather-armor"))).toBe(base(inv("leather-armor")) + 1);
    expect(ac("gate-heavy", inv("scale-mail"))).toBe(base(inv("scale-mail")));
  });
  it("shield gates", () => {
    expect(ac("gate-shield")).toBe(base() + 1);
    expect(ac("gate-no-shield")).toBe(base());
    expect(ac("gate-no-shield", noArmor)).toBe(base(noArmor) + 1);
    expect(ac("gate-shield", noArmor)).toBe(base(noArmor));
  });
  it("every gate in the list must hold", () => {
    expect(ac("gate-two")).toBe(base());
    expect(ac("gate-two", { inventory: [{ id: "chain-mail", equipped: true }] })).toBe(base({ inventory: [{ id: "chain-mail", equipped: true }] }) + 1);
  });
  it("wield:dual needs two weapons in hand", () => {
    const one = { inventory: [{ id: "warhammer", equipped: true }] }, two = { inventory: [{ id: "warhammer", equipped: true }, { id: "dagger", equipped: true }] };
    expect(ac("gate-dual", one)).toBe(base(one)); expect(ac("gate-dual", two)).toBe(base(two) + 1);
    const unequipped = { inventory: [{ id: "warhammer", equipped: true }, { id: "dagger", equipped: false }] };
    expect(ac("gate-dual", unequipped)).toBe(base(unequipped));
  });
  it("toggle gates read the active states of the note, for items and for class and feat effects", () => {
    expect(ac("gate-rage")).toBe(base());
    expect(ac("gate-rage", { active: { rage: true } })).toBe(base({ active: { rage: true } }) + 1);
    expect(base({ feats: ["gated-feat"] })).toBe(base());
    expect(base({ feats: ["gated-feat"], active: { rage: true } })).toBe(base({ active: { rage: true } }) + 1);
    expect(ac("gate-rage", { active: { rage: false } })).toBe(base());
  });
  it("concentrating follows the concentration spell", () => {
    expect(ac("gate-conc")).toBe(base());
    expect(ac("gate-conc", { concentration: "bless" })).toBe(base({ concentration: "bless" }) + 1);
  });
  it("a gated block that does not hold is not listed among the active effects", () => {
    const off = deriveCharacter(char({ inventory: [...thalia.inventory, { id: "gate-rage", equipped: true }] }), { registry: R });
    expect(off.effects.map(e => e.source)).not.toContain("Gate rage");
    const on = deriveCharacter(char({ active: { rage: true }, inventory: [...thalia.inventory, { id: "gate-rage", equipped: true }] }), { registry: R });
    expect(on.effects.map(e => e.source)).toContain("Gate rage");
  });
  it("gate helper basics", () => {
    expect(validGate("armor:worn")).toBe(true); expect(validGate("!toggle:rage")).toBe(true); expect(validGate("armor:purple")).toBe(false); expect(validGate("toggle:")).toBe(false);
    expect(gateHolds("!armor:heavy", { ...NO_GATES, armor: "heavy" })).toBe(false);
  });
  it("the validator names a bad gate", () => {
    const e: string[] = [];
    validateEffects({ while: ["armor:worn", "armor:purple"], modifiers: [{ target: "ac", value: 1 }] }, "effects", e);
    expect(e).toEqual(["effects.while[1]: unknown condition armor:purple"]);
  });
});

describe("gates in plain words", () => {
  it("effects say when they apply", () => {
    expect(describeEffects({ modifiers: [{ target: "ac", value: 1 }], while: ["armor:worn"] })).toBe("AC +1 (only while wearing armor)");
    expect(describeEffects({ modifiers: [{ target: "damage", value: 2, on: "attack:melee+str" }], while: ["toggle:rage"] })).toBe("Damage +2 for melee attacks and Strength attacks (only while Rage is on)");
    expect(describeEffects({ modifiers: [{ target: "speed", value: 10 }], while: ["!armor:heavy", "shield:none"] })).toBe("Speed +10 (only while not in heavy armor and with no shield)");
  });
});
