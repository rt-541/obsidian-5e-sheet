import { libraryBody, libraryMeta } from "../../src/content/library";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, LIB_ROOT } from "../fixtures/library";

/** What the library adapter reads from generated notes beyond the frontmatter basics. Every name and number is invented. */
const spell = (body: string, level = 0) => libraryBody("spell", libraryMeta("spell", { id: "x", name: "X", level, school: "evocation", casting_time: "1 action",
  range: "60 feet", components: "V, S", duration: "Instantaneous", tags: ["5e/damage/cold"] }).raw, body);

describe("library adapter: cantrips, creatures and native item fields", () => {
  it("a cantrip's tier sentence becomes damage by character level", () => {
    const d = spell("A shard deals 1d6 cold damage. This spell's damage increases by 1d6 when you reach 5th level (2d6), 11th level (3d6), and 17th level (4d6).");
    expect(d.damage).toEqual({ type: "cold", byCharLevel: { 1: "1d6", 5: "2d6", 11: "3d6", 17: "4d6" } });
  });
  it("a cantrip without the tier sentence keeps the same dice at every tier", () => {
    expect(spell("Each beam deals 1d6 cold damage. At higher levels you make more beams.").damage)
      .toEqual({ type: "cold", byCharLevel: { 1: "1d6", 5: "1d6", 11: "1d6", 17: "1d6" } });
  });
  it("flat attack damage and traits are read from a creature's body", () => {
    const body = "# Pip\n\n***Tiny Wings.*** It hovers.\n\n***Sharp Eyes.*** It spots things.\n\n## Actions\n\n***Peck.*** *Melee Weapon Attack:* +2 to hit, reach 5 ft., one target. *Hit:* 1 piercing damage.";
    const raw = libraryBody("creature", {}, body);
    expect(raw.attacks).toEqual([{ name: "Peck", toHit: 2, damage: "1", note: "piercing" }]);
    expect(raw.traits).toEqual([{ name: "Tiny Wings", text: "It hovers." }, { name: "Sharp Eyes", text: "It spots things." }]);
  });
  it("native kind, weapon, armor, effects and charges in a library item's frontmatter are used", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    const W = LIB_ROOT;
    const vault = fakeVault({
      [`${W}/Items/Test Blade.md`]: { fm: { type: "5e-item", schema: 1, id: "test-blade", name: "Test Blade", source: "TST", item_type: "Weapon", rarity: "mundane",
        kind: "weapon", weapon: { dmg: "1d6", type: "slashing", ab: "finesse", range: "melee", category: "martial", props: ["light"] } } },
      [`${W}/Items/Test Plate.md`]: { fm: { type: "5e-item", schema: 1, id: "test-plate", name: "Test Plate", source: "TST", item_type: "Armor", rarity: "mundane",
        kind: "armor", armor: { base: 17, dex: "none", stealthDis: true, strReq: 15 } } },
      [`${W}/Items/Warding Band.md`]: { fm: { type: "5e-item", schema: 1, id: "warding-band", name: "Warding Band", source: "TST", item_type: "Ring", rarity: "rare",
        attunement: true, effects: { modifiers: [{ target: "ac", value: 1 }] }, charges: { max: 3, reset: "dawn" } } },
    });
    await new VaultLoader(r, vault, "compendium/5e").indexAll();
    expect(r.get<any>("item", "test-blade")!.data.weapon).toMatchObject({ dmg: "1d6", ab: "finesse", category: "martial", props: ["light"] });
    expect(r.get<any>("item", "test-plate")!.data).toMatchObject({ kind: "armor", armor: { base: 17, dex: "none", stealthDis: true, strReq: 15 } });
    expect(r.get<any>("item", "warding-band")!.data).toMatchObject({ effects: { modifiers: [{ target: "ac", value: 1 }] }, charges: { max: 3, reset: "dawn" } });
  });
});
