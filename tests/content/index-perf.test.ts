import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, type Notes } from "../fixtures/library";

const N = 3500, L = "compendium/5e/WotC";
/** Synthetic library metadata in the generator's shape (no real book text). */
function synthetic(): Notes {
  const notes: Notes = {};
  for (let i = 0; i < N; i++) {
    const k = i % 4, id = `entry-${i}`, name = `Entry ${i}`;
    if (k === 0) notes[`${L}/Spells/${name}.md`] = { fm: { type: "5e-spell", schema: 1, id, name, source: "PHB", level: i % 10, school: "evocation", casting_time: "1 action", range: "60 feet", components: "V, S, M (a pinch)", duration: "Instantaneous", classes: ["wizard"], tags: ["5e/spell", "5e/save/dex", "5e/damage/fire"] } };
    else if (k === 1) notes[`${L}/Items/${name}.md`] = { fm: { type: "5e-item", schema: 1, id, name, source: "DMG", item_type: "Wondrous Item", rarity: "rare", attunement: false, magic: true } };
    else if (k === 2) notes[`${L}/Creatures/${name}.md`] = { fm: { type: "5e-creature", schema: 1, id, name, source: "MM", size: "Medium", creature_type: "beast", ac: 12, hp: 20, hp_formula: "4d8 + 2", speed: "30 ft., swim 30 ft.", abilities: { str: 10, dex: 12, con: 10, int: 2, wis: 10, cha: 6 }, cr: "1/2", cr_value: 0.5 } };
    else notes[`${L}/Conditions/${name}.md`] = { fm: { type: "5e-condition", schema: 1, id, name, source: "PHB" } };
  }
  return notes;
}

describe("index 3,500 library entries", () => {
  it("indexes from frontmatter only, quickly, without reading a single note body", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    const a = fakeVault(synthetic());
    const t0 = performance.now();
    const n = await new VaultLoader(r, a, "compendium/5e").indexAll();
    const ms = performance.now() - t0;
    expect(n).toBe(N);
    expect(a.reads).toHaveLength(0);
    expect(r.libraryCount()).toBe(N); expect(r.referenceOnlyCount()).toBe(0); expect(r.problems()).toEqual([]);
    expect(r.listAll()).toHaveLength(N);
    expect(ms).toBeLessThan(2000);   // generous for CI; measured around a tenth of this
    console.debug(`indexed ${N} library entries in ${ms.toFixed(0)} ms`);
  });

  it("sends one change notification for the whole index, not one per note", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    let n = 0; r.onChange(() => n++);
    await new VaultLoader(r, fakeVault(synthetic()), "compendium/5e").indexAll();
    expect(n).toBe(1);
  });

  it("yields to the UI while indexing, so timers and input are not starved", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    let ticks = 0; const timer = setInterval(() => ticks++, 0);
    await new VaultLoader(r, fakeVault(synthetic()), "compendium/5e").indexAll();
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(5);
  });

  it("opening one entry reads exactly one body, and the LRU serves repeats", async () => {
    const r = new Registry(); registerBuiltinTypes(r);
    const a = fakeVault({ ...synthetic(), [`${L}/Spells/Entry 0.md`]: { ...synthetic()[`${L}/Spells/Entry 0.md`], body: "# Entry 0\n\nIt deals 2d6 fire damage." } });
    await new VaultLoader(r, a, "compendium/5e").indexAll();
    const e = r.get<any>("spell", "entry-0")!;
    await r.hydrate(e); await r.bodyOf(e); await r.bodyOf(e);
    expect(a.reads).toEqual([`${L}/Spells/Entry 0.md`]);
  });
});
