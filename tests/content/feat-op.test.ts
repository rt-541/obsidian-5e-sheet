import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { OP_NAMES } from "../../src/content/types/ops";

const fresh = () => { const r = new Registry(); registerBuiltinTypes(r); return r; };
const addBg = (grants: unknown, name = "Drifter") => fresh().add("vault", "background", { name, grants }, { path: "b.md" });
const addClass = (levels: unknown) => { const r = fresh(); const e = r.add("vault", "class", { name: "Brute", hitDie: 10, levels }, { path: "c.md" }); return { e, r }; };
const addFeat = (raw: object) => { const r = fresh(); const e = r.add("vault", "feat", { name: "F", grants: [], ...raw }, { path: "f.md" }); return { e, r }; };

describe("the feat op and the asi feats list", () => {
  it("is a known op name", () => { expect(OP_NAMES).toContain("feat"); });
  it("accepts a fixed feat or a list of categories in grants, class and subclass levels", () => {
    expect(addBg([{ op: "feat", feat: "keen" }])).toBeNull();
    expect(addBg([{ op: "feat", categories: ["origin", "general"] }])).toBeNull();
    const { e, r } = addClass({ 1: [{ op: "feat", categories: ["style"] }], 4: [{ op: "feat", feat: "keen" }] });
    expect(e).toBeNull();
    expect(r.get<any>("class", "brute")!.data.levels[1][0]).toMatchObject({ op: "feat", categories: ["style"] });
    expect(r.add("vault", "subclass", { name: "Hush", class: "brute", levels: { 3: [{ op: "feat", feat: "keen" }] } }, { path: "s.md" })).toBeNull();
  });
  it("needs exactly one of feat and categories", () => {
    expect(addBg([{ op: "feat", feat: "keen", categories: ["origin"] }])?.errors.join()).toContain("feat op: give feat or categories, not both");
    expect(addBg([{ op: "feat" }])?.errors.join()).toContain("feat op: give feat or categories, not both");
  });
  it("rejects empty categories and a bad feat id", () => {
    expect(addBg([{ op: "feat", categories: [] }])?.errors.join()).toMatch(/categories/);
    expect(addBg([{ op: "feat", categories: [3] }])?.errors.join()).toMatch(/categories/);
    expect(addBg([{ op: "feat", feat: "" }])?.errors.join()).toMatch(/feat/);
  });
  it("a background with a feat op stays a usable entry, not reference-only", () => {
    const r = fresh(); expect(r.add("vault", "background", { name: "Drifter", grants: [{ op: "feat", feat: "keen" }] }, { path: "b.md" })).toBeNull();
    expect(r.get<any>("background", "drifter")!.data.grants[0]).toMatchObject({ op: "feat", feat: "keen" });
  });
  it("asi keeps a feats list of categories and rejects a bad one", () => {
    const { e, r } = addClass({ 4: [{ op: "asi", feats: ["general", "origin"] }], 8: [{ op: "asi" }] });
    expect(e).toBeNull();
    const lv = r.get<any>("class", "brute")!.data.levels;
    expect(lv[4][0]).toMatchObject({ op: "asi", feats: ["general", "origin"] }); expect(lv[8][0].feats).toBeUndefined();
    expect(addClass({ 4: [{ op: "asi", feats: "general" }] }).e?.errors.join()).toMatch(/feats/);
    expect(addClass({ 4: [{ op: "asi", feats: [] }] }).e?.errors.join()).toMatch(/feats/);
  });
  it("a feat may carry a category and a minimum level", () => {
    const { e, r } = addFeat({ category: "origin", minLevel: 4 });
    expect(e).toBeNull(); expect(r.get<any>("feat", "f")!.data).toMatchObject({ category: "origin", minLevel: 4 });
    expect(addFeat({ category: 3 }).e?.errors.join()).toMatch(/category/);
    expect(addFeat({ minLevel: 0 }).e?.errors.join()).toMatch(/minLevel/);
    expect(addFeat({ minLevel: 21 }).e?.errors.join()).toMatch(/minLevel/);
    expect(addFeat({}).r.get<any>("feat", "f")!.data.category).toBeUndefined();
  });
  it("a feat may carry an ability pick, and a bad one is named", () => {
    const { e, r } = addFeat({ abilityPick: { from: ["str", "dex"], patterns: [[1]] } });
    expect(e).toBeNull(); expect(r.get<any>("feat", "f")!.data.abilityPick).toEqual({ from: ["str", "dex"], patterns: [[1]] });
    expect(addFeat({ abilityPick: { from: [], patterns: [[1]] } }).e?.errors[0]).toBe("abilityPick.from: must be a list of abilities");
  });
});
