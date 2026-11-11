import { Registry, slug } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";

describe("registry", () => {
  const mk = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };
  it("slugs names", () => { expect(slug("Ring of Protection")).toBe("ring-of-protection"); expect(slug("  Hoot's Owl!! ")).toBe("hoot-s-owl"); });
  it("vault overrides srd with the same id, removal restores srd", () => {
    const r = mk();
    r.add("srd", "condition", { name: "Poisoned", effects: { dis: ["attack", "check"] } });
    r.add("vault", "condition", { name: "Poisoned", effects: { dis: ["attack"] } }, { path: "Compendium/Poisoned.md" });
    expect(r.get<any>("condition", "poisoned")!.source).toBe("vault");
    expect(r.list("condition")).toHaveLength(1);
    r.removePath("Compendium/Poisoned.md");
    expect(r.get<any>("condition", "poisoned")!.source).toBe("srd");
  });
  it("explicit id wins over the slug", () => {
    const r = mk(); r.add("vault", "condition", { id: "bleed", name: "Bleeding" }, { path: "b.md" });
    expect(r.get("condition", "bleed")).toBeDefined();
  });
  it("problems are tracked per path and cleared when fixed or removed", () => {
    const r = mk();
    r.add("vault", "condition", { name: "X", effects: 3 }, { path: "x.md" });
    expect(r.problems()).toHaveLength(1);
    r.add("vault", "condition", { name: "X", effects: {} }, { path: "x.md" });
    expect(r.problems()).toHaveLength(0);
    r.add("vault", "condition", { name: "X", effects: 3 }, { path: "x.md" });
    r.removePath("x.md");
    expect(r.problems()).toHaveLength(0);
  });
  it("re-adding a path replaces the old entry even if renamed", () => {
    const r = mk();
    r.add("vault", "condition", { name: "Old" }, { path: "c.md" });
    r.add("vault", "condition", { name: "New" }, { path: "c.md" });
    expect(r.list<any>("condition").map(e => e.name)).toEqual(["New"]);
  });
  it("unknown type is a problem, not a throw", () => {
    expect(mk().add("vault", "spaceship", { name: "X" }, { path: "s.md" })).toEqual({ path: "s.md", errors: ["unknown content type spaceship"] });
  });
  it("notifies listeners once per change", () => {
    const r = mk(); let n = 0; const off = r.onChange(() => n++);
    r.add("vault", "condition", { name: "A" }, { path: "a.md" }); r.removePath("a.md"); off(); r.add("vault", "condition", { name: "B" }, { path: "b.md" });
    expect(n).toBe(2);
  });
});
