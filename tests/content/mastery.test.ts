import { describe, expect, it } from "vitest";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { itemType } from "../../src/content/types/item";
import { masteryType } from "../../src/content/types/mastery";
import { LIBRARY_MARKER } from "../../src/content/sources";
import { VaultLoader } from "../../src/content/vault-loader";
import { homebrewRegistry } from "../fixtures/homebrew";
import { fakeVault } from "../fixtures/library";
import { parseNote, writeInto } from "../../src/core/character";
import { thalia } from "../fixtures/notes";

const ROOT = "compendium/5e";
const weapon = (mastery?: unknown) => ({ name: "Tin Blade", kind: "weapon", attunement: false, weight: 2,
  weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee", ...(mastery !== undefined ? { mastery } : {}) } });

describe("weapon mastery data", () => {
  it("a mastery note is a library entry with its text as rules", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    const a = fakeVault({ [`${ROOT}/WotC 2024/Masteries/Snag.md`]: { fm: { type: "5e-mastery", schema: 1, id: "snag", name: "Snag", source: "TST", edition: "2024" }, body: "# Snag\n\nAn invented sentence about snagging." } },
      { markers: [`${ROOT}/WotC 2024/${LIBRARY_MARKER}`] });
    await new VaultLoader(r, a, ROOT).indexAll();
    const e = r.get<any>("mastery", "snag")!;
    expect(e).toBeDefined(); expect(e.library).toBe(true); expect(e.data.name).toBe("Snag");
    await r.hydrate(e);
    expect(e.data.rules).toBe("An invented sentence about snagging.");
    expect(r.problems()).toEqual([]);
  });
  it("a user mastery note's body is its rules too", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    const a = fakeVault({ [`${ROOT}/Homebrew/Masteries/Hook.md`]: { fm: { type: "5e-mastery", name: "Hook" }, body: "Invented hook text." } });
    await new VaultLoader(r, a, ROOT).indexAll();
    expect(r.get<any>("mastery", "hook")!.data).toMatchObject({ name: "Hook", rules: "Invented hook text." });
  });
  it("the mastery type needs a name", () => {
    expect(masteryType.validate({ name: "Snag", rules: "x" }).value).toEqual({ name: "Snag", rules: "x" });
    expect(masteryType.validate({}).errors.length).toBeGreaterThan(0);
  });
  it("an item's weapon may name a mastery and a bad value is an error", () => {
    expect(itemType.validate(weapon("snag") as never).value!.weapon!.mastery).toBe("snag");
    expect(itemType.validate(weapon() as never).value!.weapon).not.toHaveProperty("mastery");
    expect(itemType.validate(weapon(5) as never).errors.join()).toMatch(/weapon\.mastery/);
    expect(itemType.validate(weapon("") as never).errors.join()).toMatch(/weapon\.mastery/);
  });
  it("the choose op accepts what: mastery and checks count against from", () => {
    const ok = (op: Record<string, unknown>) => homebrewRegistry([{ type: "5e-class", name: "Maker", hitDie: 8, levels: { 1: [{ op: "choose", what: "mastery", ...op }] } }]);
    expect(() => ok({ count: 2 })).not.toThrow();
    expect(() => ok({ count: 1, from: ["tin-blade", "pewter-blade"] })).not.toThrow();
    expect(() => ok({ count: 3, from: ["tin-blade"] })).toThrow(/more than the 1 choices/);
    expect(() => ok({ count: 0 })).toThrow(/count/);
  });
  it("a character without mastery loads and is never written with one", () => {
    const p = parseNote(structuredClone(thalia)); if (p.kind !== "character") throw new Error();
    expect(p.value.mastery).toBeUndefined();
    const fm = structuredClone(thalia) as Record<string, unknown>; writeInto(fm, p.value);
    expect(fm).not.toHaveProperty("mastery");
  });
  it("mastery ids round-trip like feats", () => {
    const fm = { ...structuredClone(thalia), mastery: ["tin-blade", "pewter-blade"] } as Record<string, unknown>;
    const p = parseNote(fm); if (p.kind !== "character") throw new Error();
    expect(p.value.mastery).toEqual(["tin-blade", "pewter-blade"]);
    const out: Record<string, unknown> = {}; writeInto(out, p.value);
    expect(out.mastery).toEqual(["tin-blade", "pewter-blade"]);
    expect(parseNote({ ...structuredClone(thalia), mastery: "x" }).kind === "character" && (parseNote({ ...structuredClone(thalia), mastery: "x" }) as any).errors.length).toBeGreaterThan(0);
  });
});
