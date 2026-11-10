import { beforeAll, describe, expect, it } from "vitest";
import { Registry } from "../../src/content/registry";
import { editionRegistry } from "../fixtures/editions";

const own = (es: { source: string; id: string }[]) => es.filter(e => e.source !== "srd").map(e => e.id);

describe("registry edition lens", () => {
  let r: Registry, r24: Registry, r14: Registry;
  beforeAll(async () => { ({ r } = await editionRegistry()); r24 = r.forEdition("2024"); r14 = r.forEdition("2014"); });

  it("homebrew outranks both editions", () => { expect(r24.get("spell", "glint")!.sourceName).toBe("Homebrew"); expect(r14.get("spell", "glint")!.sourceName).toBe("Homebrew"); });
  it("there is no silent fall-back", () => { expect(r24.get("spell", "hush")).toBeUndefined(); expect(r14.get("spell", "nova")).toBeUndefined(); });
  it("a lens lists one row per id and only its edition plus homebrew", () => {
    expect(own(r24.list("spell"))).toEqual(["glint", "nova", "spark"]); expect(own(r14.list("spell"))).toEqual(["glint", "hush", "spark"]);
    expect(r24.list("spell").every(e => e.source !== "srd")).toBe(true);
    expect(r24.get<any>("item", "tin-blade")!.data.weapon.dmg).toBe("1d8"); expect(r14.get<any>("item", "tin-blade")!.data.weapon.dmg).toBe("1d6");
  });
  it("a qualified id resolves that edition exactly", () => {
    expect(r24.get("spell", "hush@2014")!.edition).toBe("2014"); expect(r14.get("spell", "nova@2024")!.edition).toBe("2024");
    expect(r24.get("spell", "spark@2014")).toBeUndefined();
    expect(r.get("spell", "nova@2024")!.edition).toBe("2024");
  });
  it("listEdition is the bring-in list", () => { expect(own(r24.listEdition("spell", "2014"))).toEqual(["glint", "hush"]); });
  it("composes with campaign switches in both orders", () => {
    expect(r24.scoped({ "WotC 2024": false }).list("class")).toEqual([]); expect(r24.scoped({ "WotC 2024": false }).get("class", "warden")).toBeDefined();
    expect(r.scoped({ "WotC 2024": false }).forEdition("2024").list("class")).toEqual([]);
    expect(r.scoped({ "WotC 2024": false }).forEdition("2024").otherEditionHas("class", "lantern-keeper")).toBe("2014");
  });
  it("tells which books have a missing id", () => { expect(r24.otherEditionHas("spell", "hush")).toBe("2014"); expect(r24.otherEditionHas("spell", "zzz")).toBeUndefined(); expect(r24.otherEditionHas("spell", "nova")).toBeUndefined(); expect(r.otherEditionHas("spell", "hush")).toBeUndefined(); });
  it("third-party libraries without a stamp are 2014 (Review Focus 4)", () => { expect(r24.get("item", "tin-blade")!.sourceName).toBe("WotC 2024"); expect(r24.listEdition("item", "2014").some(e => e.sourceName === "Test Press")).toBe(true); });
  it("forEdition(undefined) is the registry itself and an unlensed one still sees every id", () => { expect(r.forEdition(undefined)).toBe(r); expect(r.get("spell", "hush")).toBeDefined(); expect(r.get("spell", "nova")).toBeDefined(); });
  it("a bundled entry is replaced only by one of the same source and edition", () => {
    const x = new Registry(); x.register({ type: "t", validate: raw => ({ value: raw, errors: [] }) });
    x.add("srd", "t", { name: "A" }); x.add("srd", "t", { name: "A" }, { edition: "2024" });
    expect(x.getAll("t", "a").map(e => e.edition).sort()).toEqual(["2014", "2024"]);
    x.add("srd", "t", { name: "A" });
    expect(x.getAll("t", "a")).toHaveLength(2);
  });
});
