import { editionRegistry } from "../fixtures/editions";

describe("edition pin: content", () => {
  it("an existing character resolves the same entries when another generated library shares its ids", async () => {
    const { r } = await editionRegistry({ only: ["WotC", "Test Press"] });   // no 2024 library yet
    expect(r.get("spell", "glint")!.sourceName).toBe("Homebrew");            // homebrew wins
    expect(r.get("item", "tin-blade")!.sourceName).toBe("WotC");
    expect((r.get<any>("item", "tin-blade")!.data).weapon.dmg).toBe("1d6");
    expect(r.list("spell").filter(e => e.id === "glint")).toHaveLength(1);
    expect(r.getAll("item", "tin-blade").map(e => e.sourceName)).toEqual(["WotC", "Test Press"]);
    // scoped() filters `list` only; `get` stays unfiltered so characters already using a switched-off source keep working.
    const off = r.scoped({ WotC: false });
    expect(off.list("item").find(e => e.id === "tin-blade")!.sourceName).toBe("Test Press");
    expect(off.get("item", "tin-blade")!.sourceName).toBe("WotC");
  });
  it("a library note carrying edition, replaces and an edition tag reads exactly like one without", async () => {
    const a = await editionRegistry({ only: ["WotC"] }), b = await editionRegistry({ only: ["WotC"], stampPlain: true });
    for (const t of ["spell", "item", "class", "feat", "race", "subclass", "background", "creature", "condition"])
      expect(b.r.listAll(t).map(e => [e.id, e.data])).toEqual(a.r.listAll(t).map(e => [e.id, e.data]));
    expect(b.r.problems()).toEqual([]); expect(b.r.referenceOnlyCount()).toBe(a.r.referenceOnlyCount());
  });
});
