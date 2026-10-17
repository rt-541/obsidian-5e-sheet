import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, type Notes } from "../fixtures/library";
import { templateNotes } from "../fixtures/templates";

const load = async (notes: Notes) => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  await new VaultLoader(r, fakeVault(notes), "compendium/5e").indexAll();
  return r;
};

describe("library schema in user notes", () => {
  it("all nine dnd-compendium templates load as usable entries from a Homebrew path", async () => {
    const r = await load(templateNotes());
    expect(r.problems()).toEqual([]);
    for (const [type, id] of [["background", "forge-apprentice"], ["class", "ember-warden"], ["subclass", "oath-of-the-pyre"], ["condition", "frostbitten"],
      ["creature", "ember-hound"], ["feat", "ember-adept"], ["item", "emberheart-band"], ["race", "emberkin"], ["spell", "cinder-lash"]]) {
      const e = r.get(type, id);
      expect(e, `${type}/${id}`).toBeDefined();
      expect(e!.sourceName).toBe("Homebrew"); expect(e!.referenceOnly).toBeUndefined();
    }
  });

  it("a snake_case spell becomes the same data as the native spelling (body adds dice and higher levels)", async () => {
    const r = await load(templateNotes());
    const snake = r.get<any>("spell", "cinder-lash")!.data;
    expect(snake).toMatchObject({ level: 1, school: "Evocation", castingTime: "1 bonus action", components: ["V", "S", "M"], material: "a pinch of ash",
      classes: ["sorcerer", "wizard"], save: { abil: "dex", onSuccess: "half" } });
    expect(snake.damage.bySlot).toMatchObject({ 1: "2d6", 2: "3d6", 9: "10d6" });
    const native = await load({ "compendium/5e/Homebrew/Native.md": { body: "Native.", fm: { type: "5e-spell", id: "cinder-lash", name: "Cinder Lash", level: 1, school: "Evocation",
      castingTime: "1 bonus action", range: "30 feet", components: ["V", "S", "M"], material: "a pinch of ash", duration: "Instantaneous", concentration: false, ritual: false,
      classes: ["sorcerer", "wizard"], save: { abil: "dex", onSuccess: "half" }, damage: { type: "fire", bySlot: snake.damage.bySlot } } } });
    const n = native.get<any>("spell", "cinder-lash")!.data;
    for (const k of ["level", "school", "castingTime", "range", "components", "material", "duration", "save", "damage", "classes"]) expect(snake[k]).toEqual(n[k]);
  });

  it("creatures and items map their snake_case fields", async () => {
    const r = await load(templateNotes());
    expect(r.get<any>("creature", "ember-hound")!.data).toMatchObject({ ac: 14, hp: { average: 45, formula: "6d8 + 18" }, speed: { walk: 40 }, ctype: "elemental", cr: "2" });
    expect(r.get<any>("creature", "ember-hound")!.data.attacks[0]).toMatchObject({ name: "Bite", toHit: 4 });
    expect(r.get<any>("item", "emberheart-band")!.data).toMatchObject({ kind: "wondrous", rarity: "uncommon", attunement: true });
  });

  it("native fields win when both spellings are present", async () => {
    const r = await load({ "compendium/5e/Homebrew/Mixed.md": { body: "Mixed.", fm: { type: "5e-spell", id: "mixed", name: "Mixed", level: 2, school: "Abjuration",
      castingTime: "1 action", casting_time: "1 minute", range: "Self", components: ["V"], duration: "1 round", concentration: false, ritual: false, classes: [] } } });
    expect(r.get<any>("spell", "mixed")!.data).toMatchObject({ castingTime: "1 action", components: ["V"] });
  });

  it("stays strict: a snake_case note that cannot be adapted is still a listed problem", async () => {
    const r = await load({ "compendium/5e/Homebrew/Bad.md": { body: "Bad.", fm: { type: "5e-spell", id: "bad", name: "Bad", level: 12, casting_time: "1 action", components: "V" } } });
    expect(r.get("spell", "bad")).toBeUndefined();
    expect(r.problems().map(p => p.path)).toEqual(["compendium/5e/Homebrew/Bad.md"]);
  });
});
