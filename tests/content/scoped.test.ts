import { Registry, sourceLabel } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";

const mk = () => {
  const r = new Registry(); registerBuiltinTypes(r);
  r.add("srd", "condition", { name: "Dazed", effects: {} });
  r.add("vault", "condition", { name: "Rattled", effects: {} }, { path: "compendium/5e/Roll20/Conditions/Rattled.md", sourceName: "Roll20" });
  r.add("vault", "condition", { name: "Dazed", effects: {} }, { path: "compendium/5e/Roll20/Conditions/Dazed.md", sourceName: "Roll20" });
  return r;
};

describe("scoped registry", () => {
  it("list leaves out switched-off sources, get stays unfiltered so existing characters keep working", () => {
    const r = mk(), s = r.scoped({ Roll20: false });
    expect(s.list("condition").map(e => e.name)).toEqual(["Dazed"]);
    expect(s.list<any>("condition")[0].sourceName).toBe("WotC (SRD)");
    expect(s.get("condition", "rattled")?.sourceName).toBe("Roll20");
    expect(r.list("condition")).toHaveLength(2);
  });
  it("no switches returns the registry itself", () => {
    const r = mk(); expect(r.scoped(undefined)).toBe(r); expect(r.scoped({})).toBe(r); expect(r.scoped({ Roll20: true })).toBe(r);
  });
  it("follows later changes to the underlying registry", () => {
    const r = mk(), s = r.scoped({ Roll20: false });
    r.add("vault", "condition", { name: "Wobbly", effects: {} }, { path: "compendium/5e/Homebrew/Wobbly.md", sourceName: "Homebrew" });
    expect(s.list("condition").map(e => e.name)).toEqual(["Dazed", "Wobbly"]);
  });
});

describe("sourceLabel", () => {
  it("shows the book for library notes and the source name otherwise", () => {
    expect(sourceLabel({ sourceName: "WotC", library: true, book: "PHB" })).toBe("WotC · PHB");
    expect(sourceLabel({ sourceName: "WotC", library: true })).toBe("WotC");
    expect(sourceLabel({ sourceName: "Roll20" })).toBe("Roll20");
    expect(sourceLabel({ sourceName: "WotC (SRD)" })).toBe("WotC (SRD)");
  });
});
