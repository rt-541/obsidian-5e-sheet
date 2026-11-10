// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { VaultLoader } from "../../src/content/vault-loader";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { CompendiumController, mountCompendium } from "../../src/ui/compendium";
import { entryCard, priceText } from "../../src/ui/details";
import { renderPanel } from "../../src/ui/panels";
import { fakeVault } from "../fixtures/library";
import { thalia } from "../fixtures/notes";

const W = "compendium/5e/WotC";
const notes = {
  [`${W}/Conditions/Cackle Fever.md`]: { fm: { type: "5e-condition", schema: 1, id: "cackle-fever", name: "Cackle Fever", source: "DMG", condition_kind: "disease" }, body: "# Cackle Fever\n\nAn invented fever." },
  [`${W}/Conditions/Dazed.md`]: { fm: { type: "5e-condition", schema: 1, id: "dazed", name: "Dazed", source: "XGE" }, body: "# Dazed\n\nAn invented daze." },
  [`${W}/Creatures/Marsh Lurker.md`]: { fm: { type: "5e-creature", schema: 1, id: "marsh-lurker", name: "Marsh Lurker", source: "MM", size: "Medium", creature_type: "monstrosity",
    ac: 12, hp: 20, speed: "30 ft.", abilities: { str: 10, dex: 12, con: 10, int: 4, wis: 10, cha: 4 }, cr: "1/2", environment: ["swamp", "forest"], copied_from: "Bog Thing" }, body: "# Marsh Lurker" },
  [`${W}/Items/Rope.md`]: { fm: { type: "5e-item", schema: 1, id: "rope", name: "Rope", source: "PHB", item_type: "Adventuring Gear", rarity: "mundane", weight: 10, value: 150 }, body: "# Rope\n\nAn invented rope." },
};
async function world() {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  await new VaultLoader(r, fakeVault(notes), "compendium/5e").indexAll();
  return r;
}
const text = (el: HTMLElement) => el.textContent ?? "";
const get = (r: Registry, type: string, id: string) => r.getAll(type, id).find(e => e.library)!;

describe("library extras: data", () => {
  it("diseases keep their kind, creatures their environment and copied_from, items weight, value and mundane rarity", async () => {
    const r = await world();
    expect(get(r, "condition", "cackle-fever").data).toMatchObject({ kind: "disease" });
    expect((get(r, "condition", "dazed").data as any).kind).toBeUndefined();
    expect(get(r, "creature", "marsh-lurker").data).toMatchObject({ environment: ["swamp", "forest"], copiedFrom: "Bog Thing" });
    expect(get(r, "item", "rope").data).toMatchObject({ weight: 10, value: 150, rarity: "mundane" });
    expect(r.problems()).toEqual([]);
  });
  it("prices read as gp, sp and cp", () => {
    expect(priceText(150)).toBe("1 gp 5 sp"); expect(priceText(7)).toBe("7 cp"); expect(priceText(2500)).toBe("25 gp"); expect(priceText(0)).toBe("0 cp");
  });
});

describe("library extras: cards, browser and sheet", () => {
  it("cards show weight, value, environment and copied from; a disease card says disease", async () => {
    const r = await world();
    expect(text(entryCard(r, get(r, "item", "rope")))).toMatch(/Weight: 10 lb.*Value: 1 gp 5 sp/s);
    expect(text(entryCard(r, get(r, "item", "rope")))).toMatch(/mundane/i);
    const c = text(entryCard(r, get(r, "creature", "marsh-lurker")));
    expect(c).toContain("Environment: swamp, forest"); expect(c).toContain("Copied from: Bog Thing");
    expect(text(entryCard(r, get(r, "condition", "cackle-fever")))).toContain("Disease");
  });
  it("the browser lists a disease with a disease badge and a plain condition without one", async () => {
    const r = await world();
    const ctl = new CompendiumController({ registry: r, switches: () => undefined, target: () => undefined, targetEdition: () => undefined, add: () => "", openNote: () => {} });
    const root = document.createElement("div"); document.body.append(root); mountCompendium(root, ctl, false);
    ctl.setType("condition"); ctl.setSource("WotC");
    const row = (id: string) => root.querySelector(`.fe-comp-list [data-id="${id}"]`) as HTMLElement;
    expect(row("cackle-fever").querySelector('[data-badge="disease"]')).not.toBeNull();
    expect(row("dazed")).not.toBeNull(); expect(row("dazed").querySelector('[data-badge="disease"]')).toBeNull();
    root.remove();
  });
  it("the conditions panel lists diseases in their own group, apart from the ordinary conditions", async () => {
    const r = await world();
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(2) };
    const p = parseNote(thalia); if (p.kind === "none") throw new Error("x");
    const ctl = new SheetController(host, p);
    const panel = renderPanel(ctl, { kind: "conditions" }, []);
    const ids = (group: string) => [...panel.querySelectorAll<HTMLElement>(`[data-group="${group}"] [data-cond]`)].map(x => x.dataset.cond);
    expect(ids("conditions")).toContain("dazed"); expect(ids("conditions")).not.toContain("cackle-fever");
    expect(ids("diseases")).toContain("cackle-fever"); expect(ids("diseases")).not.toContain("dazed");
  });
});
