import { afterEach, describe, expect, it } from "vitest";
import { itemType, type ItemData } from "../../src/content/types/item";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { findOverlay, overlayKeys, overlayProblems, useOverlayData } from "../../src/content/overlay";

const ac = (n: number) => ({ effects: { modifiers: [{ target: "ac", value: n }] } });

describe("overlay entries limited to an edition", () => {
  afterEach(() => useOverlayData(undefined));

  it("an edition-limited entry outranks a general one", () => {
    useOverlayData({ entries: { "feat::tooth": ac(1), "feat::tooth@2024": ac(2) } });
    expect(findOverlay("feat", [], "Tooth", undefined, "2024")!.effects.modifiers![0].value).toBe(2);
    expect(findOverlay("feat", [], "Tooth", undefined, "2014")!.effects.modifiers![0].value).toBe(1);
    expect(findOverlay("feat", [], "Tooth")!.effects.modifiers![0].value).toBe(1);
  });

  it("an entry limited to 2014 is invisible to 2024 and to no edition", () => {
    useOverlayData({ entries: { "feat::claw@2014": ac(1) } });
    expect(findOverlay("feat", [], "Claw", undefined, "2014")).toBeDefined();
    expect(findOverlay("feat", [], "Claw", undefined, "2024")).toBeUndefined();
    expect(findOverlay("feat", [], "Claw")).toBeUndefined();
  });

  it("an edition-limited entry for any candidate beats a general entry for a more exact one", () => {
    useOverlayData({ entries: { "class:warden:ward": ac(1), "class:*:ward@2024": ac(5) } });
    expect(findOverlay("class", ["warden"], "Ward", undefined, "2024")!.effects.modifiers![0].value).toBe(5);
    expect(findOverlay("class", ["warden"], "Ward", undefined, "2014")!.effects.modifiers![0].value).toBe(1);
  });

  it("rejects an unknown edition suffix", () => {
    useOverlayData({ entries: { "feat::x@2030": { effects: { note: "n" } } } });
    expect(overlayProblems()).toEqual(["feat::x@2030: the edition must be 2014 or 2024"]);
    expect(overlayKeys()).toEqual([]);
  });

  it("the bundled data is sound and every key still resolves for an edition-less caller unless limited", () => {
    expect(overlayProblems()).toEqual([]);
    const keys = overlayKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys.filter(k => !k.includes("@"))) {
      const [kind, owner, feature] = k.split(":");
      expect(findOverlay(kind as never, [owner], feature)).toBeDefined();
    }
  });

  it("an item takes the overlay of its own edition, from the note or from the registry stamp", () => {
    useOverlayData({ entries: { "item::tin-blade@2014": ac(1), "item::tin-blade@2024": ac(2) } });
    const mod = (v: ItemData | undefined) => v?.effects?.modifiers?.[0]?.value;
    expect(mod(itemType.validate({ name: "Tin Blade", edition: "2024" }).value)).toBe(2);
    expect(mod(itemType.validate({ name: "Tin Blade", edition: "2014" }).value)).toBe(1);
    expect(mod(itemType.validate({ name: "Tin Blade" }).value)).toBeUndefined();
    const r = new Registry(); registerBuiltinTypes(r);
    r.add("vault", "item", { name: "Tin Blade" }, { edition: "2024", path: "x/tin-blade.md" });
    expect(mod(r.get<ItemData>("item", "tin-blade")!.data)).toBe(2);
  });

  it("validators see the entry's own edition: bundled and library items get the 2014 overlay, hand-made ones do not", () => {
    useOverlayData({ entries: { "item::tin-blade@2014": ac(1), "item::glint-blade@2014": ac(1), "item::hush-blade@2014": ac(1) } });
    const r = new Registry(); registerBuiltinTypes(r);
    r.add("srd", "item", { name: "Tin Blade" });
    r.add("vault", "item", { name: "Glint Blade" }, { library: true, sourceName: "Invented Book", path: "lib/glint-blade.md" });
    r.add("vault", "item", { name: "Hush Blade" }, { path: "mine/hush-blade.md" });
    const mod = (id: string) => r.get<ItemData>("item", id)!.data.effects?.modifiers?.[0]?.value;
    expect(mod("tin-blade")).toBe(1);
    expect(mod("glint-blade")).toBe(1);
    expect(mod("hush-blade")).toBeUndefined();
  });

  it("hydrating an unstamped library item keeps its 2014 overlay", async () => {
    useOverlayData({ entries: { "item::glint-blade@2014": ac(1) } });
    const r = new Registry(); registerBuiltinTypes(r);
    r.setBodyReader(async () => "A plain blade.");
    r.add("vault", "item", { name: "Glint Blade" }, { library: true, sourceName: "Invented Book", path: "lib/glint-blade.md" });
    const e = r.get<ItemData>("item", "glint-blade")!;
    const h = (await r.hydrate(e)) as typeof e;
    expect(h.data.builtIn).toBeDefined();
    expect(h.data.effects?.modifiers?.[0]?.value).toBe(1);
  });
});
