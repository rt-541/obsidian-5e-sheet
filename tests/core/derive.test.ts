import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter, deriveCompanion, deriveNpc } from "../../src/core/derive";
import { thalia, maren } from "../fixtures/notes";

const reg = () => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };
const char = (o: object = {}): Character => { const p = parseNote({ ...thalia, ...o }); if (p.kind !== "character") throw new Error(); return p.value; };

describe("deriveCharacter", () => {
  const s = deriveCharacter(char(), { registry: reg() });
  it("core numbers for Thalia", () => {
    expect(s.level).toBe(5); expect(s.prof).toBe(3); expect(s.mods.wis).toBe(3);
    expect(s.ac).toEqual({ value: 19, sources: ["Chain mail", "Shield", "Ring of protection"] });
    expect(s.saves.wis).toEqual({ mod: 7, prof: true }); expect(s.saves.str).toEqual({ mod: 3, prof: false });
    expect(s.skills.find(k => k.id === "insight")!.mod).toBe(6); expect(s.passivePerception).toBe(13);
    expect(s.spellcasting).toEqual({ abil: "wis", dc: 14, attack: 6 });
    expect(s.slots).toEqual([{ level: "1", max: 4, used: 1 }, { level: "2", max: 3, used: 0 }, { level: "3", max: 2, used: 1 }]);
    expect(s.hitDice).toEqual([{ die: "d8", max: 5, used: 2 }]);
    expect(s.attacks).toEqual([
      { name: "Warhammer", toHit: 5, damage: "1d8+2 bludgeoning", critDamage: "2d8+2 bludgeoning", target: { kind: "attack", abil: "str", range: "melee", tags: ["warhammer", "versatile"] } },
      // every character gets the built-in Unarmed Strike: 1 + Strength modifier damage, always proficient
      { name: "Unarmed Strike", toHit: 5, damage: "3 bludgeoning", target: { kind: "attack", abil: "str", range: "melee", tags: ["unarmed"] } }]);
    expect(s.carry).toEqual({ weight: 63, capacity: 210 }); expect(s.attunedCount).toBe(1); expect(s.missing).toEqual([]);
  });
  it("speed and hp max respond to exhaustion 5", () => {
    const x = deriveCharacter(char({ conditions: { exhaustion: 5 } }), { registry: reg() });
    expect(x.speed.value).toBe(0); expect(x.hp).toEqual({ current: 21, max: 21, temp: 0, maxReduced: true });
  });
  it("unarmored with dex and finesse picks the better ability", () => {
    const x = deriveCharacter(char({ abilities: { str: 8, dex: 16, con: 10, int: 10, wis: 10, cha: 10 }, inventory: [{ id: "rapier", equipped: true }] }), { registry: reg() });
    expect(x.ac.value).toBe(13); expect(x.ac.sources).toEqual(["Unarmored"]);
    expect(x.attacks[0]).toMatchObject({ name: "Rapier", toHit: 6, damage: "1d8+3 piercing", target: { abil: "dex" } });
  });
  it("magic weapon bonus and extra damage only while attuned", () => {
    const r = reg();
    r.add("vault", "item", { name: "Emberheart Warhammer", kind: "weapon", attunement: true, weapon: { dmg: "1d8", type: "bludgeoning", ab: "str", range: "melee", bonus: 1, extraDamage: "1d6 fire" } }, { path: "e.md" });
    const on = deriveCharacter(char({ inventory: [{ id: "emberheart-warhammer", equipped: true, attuned: true }] }), { registry: r });
    expect(on.attacks[0]).toMatchObject({ toHit: 6, damage: "1d8+3 bludgeoning + 1d6 fire" });
    const off = deriveCharacter(char({ inventory: [{ id: "emberheart-warhammer", equipped: true, attuned: false }] }), { registry: r });
    expect(off.attacks[0]).toMatchObject({ toHit: 5, damage: "1d8+2 bludgeoning" });
  });
  it("unknown ids show up in missing and nothing crashes", () => {
    const x = deriveCharacter(char({ classes: [{ class: "artificer", level: 3 }], inventory: [{ id: "vorpal-spoon", equipped: true }] }), { registry: reg() });
    expect(x.missing).toEqual(["item:vorpal-spoon", "class:artificer"]); expect(x.slots).toEqual([]); expect(x.hitDice).toEqual([]);
  });
});

describe("creatures", () => {
  it("familiar owl from the SRD", () => {
    const p = parseNote(thalia); if (p.kind !== "character") throw new Error();
    const o = deriveCompanion(p.value.companions[0], { registry: reg() })!;
    expect(o).toMatchObject({ kind: "companion", name: "Hoot", label: "Owl (familiar)", ac: { value: 11 }, speed: { value: 5, other: "fly 60" }, hp: { current: 1, max: 1 } });
    expect(o.skills.map(k => [k.id, k.mod])).toEqual([["perception", 3], ["stealth", 3]]);
    expect(o.attacks[0]).toEqual({ name: "Talons", toHit: 3, damage: "1 slashing", target: { kind: "attack" } });
  });
  it("companion conditions apply", () => {
    const o = deriveCompanion({ creature: "wolf", name: "Ash", kind: "companion", hp: { temp: 0 }, conditions: { poisoned: 1 } }, { registry: reg() })!;
    expect(o.effects.map(e => e.source)).toEqual(["Poisoned"]); expect(o.hp.current).toBe(11);
  });
  it("unknown companion creature returns undefined", () => {
    expect(deriveCompanion({ creature: "dragon-turtle-pup", name: "X", kind: "companion", hp: { temp: 0 }, conditions: {} }, { registry: reg() })).toBeUndefined();
  });
  it("NPC overrides hp", () => {
    const p = parseNote(maren); if (p.kind !== "npc") throw new Error();
    expect(deriveNpc(p.value, { registry: reg() })!.hp).toEqual({ current: 12, max: 12, temp: 0, maxReduced: false });
  });
});
