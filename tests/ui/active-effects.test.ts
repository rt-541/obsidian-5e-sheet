// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { CHARACTER_FEATURES, DESKTOP, MOBILE, TABLET, placed } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

function setup(layout: "desktop" | "tablet" | "mobile", stored: string[] = []) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  r.add("vault", "item", { id: "charm", name: "Warding Charm", kind: "wondrous", rarity: "rare", effects: { modifiers: [{ target: "ac", value: 1 }], resist: ["fire"] } }, { path: "charm.md" });
  const saved: string[][] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3), body: "", collapsedGroups: () => stored, setCollapsedGroups: ids => saved.push(ids) };
  const p = parseNote({ ...thalia, inventory: [{ id: "charm", equipped: true }], conditions: { poisoned: 1 } }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, q, click, saved };
}

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`collapsible active effects (${layout})`, () => {
  it("each source is one compact row with a short tag and its facts hidden", () => {
    const s = setup(layout);
    const row = s.q('[data-effect="Warding Charm"]');
    expect(row.querySelector(".fe-effect-head")!.textContent).toContain("Warding Charm");
    expect(row.querySelector(".fe-effect-tag")!.textContent).toBe("+1 AC (and 1 more)");
    expect(row.querySelector(".fe-effect-body")).toBeNull();
    expect(s.q('[data-effect="Poisoned"] .fe-effect-tag')!.textContent).toMatch(/^Disadvantage on /);
  });
  it("tapping a row opens its facts, tapping again closes them, and the choice is remembered", () => {
    const s = setup(layout);
    s.click('[data-effect="Warding Charm"] [data-act="effect-row"]');
    const body = s.q('[data-effect="Warding Charm"] .fe-effect-body');
    expect(body.textContent).toContain("AC +1"); expect(body.textContent).toContain("Resist fire");
    expect(s.saved.at(-1)).toEqual(["open:effect:Warding Charm"]);
    s.click('[data-effect="Warding Charm"] [data-act="effect-row"]');
    expect(s.q('[data-effect="Warding Charm"] .fe-effect-body')).toBeNull();
    expect(s.saved.at(-1)).toEqual([]);
  });
  it("opens rows that were left open last time", () => {
    const s = setup(layout, ["open:effect:Warding Charm"]);
    expect(s.q('[data-effect="Warding Charm"] .fe-effect-body')).not.toBeNull();
    expect(s.q('[data-effect="Poisoned"] .fe-effect-body')).toBeNull();
  });
  it("the whole card folds up and down", () => {
    const s = setup(layout);
    s.click('[data-act="effects-card"]');
    expect(s.q('[data-effect="Warding Charm"]')).toBeNull();
    expect(s.q('[data-act="effects-card"]').textContent).toContain("Active effects");
    expect(s.saved.at(-1)).toEqual(["effects"]);
    s.click('[data-act="effects-card"]');
    expect(s.q('[data-effect="Warding Charm"]')).not.toBeNull();
  });
  it("is on the sheet exactly once in every layout", () => {
    expect(CHARACTER_FEATURES).toContain("active-effects");
    for (const l of [DESKTOP, TABLET, MOBILE]) expect(placed(l).filter(f => f === "active-effects")).toHaveLength(1);
  });
});
