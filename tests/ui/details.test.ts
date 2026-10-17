// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { detailCard } from "../../src/ui/details";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

function setup(note: object, mobile: boolean, extra?: (r: Registry) => void) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); extra?.(r);
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  return { r, ctl, root, q };
}
const charm = (r: Registry) => r.add("vault", "item", { id: "charm", name: "Warding Charm", kind: "wondrous", rarity: "rare", effects: { modifiers: [{ target: "ac", value: 1 }] } },
  { path: "Compendium/charm.md", body: "A small charm that turns blows aside." });
const withCharm = { ...thalia, inventory: [{ id: "charm", equipped: true }] };
const over = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
const out = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

describe("detail cards", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("hovering an item name shows a popover with rules and +1 AC, and mouseout hides it", () => {
    const s = setup(withCharm, false, charm);
    const name = s.q('[data-ref="item:charm"]');
    over(name);
    expect(s.q(".fe-popover")).toBeNull();
    vi.advanceTimersByTime(260);
    const pop = s.q(".fe-popover");
    expect(pop.textContent).toContain("A small charm that turns blows aside.");
    expect(pop.textContent).toContain("+1 AC");
    expect(pop.textContent).toContain("Source note: Compendium/charm.md");
    out(name);
    expect(s.q(".fe-popover")).toBeNull();
  });
  it("a hover that ends before the delay never shows", () => {
    const s = setup(withCharm, false, charm);
    const name = s.q('[data-ref="item:charm"]');
    over(name); out(name);
    vi.advanceTimersByTime(500); expect(s.q(".fe-popover")).toBeNull();
  });
  it("note text is shown literally, never as HTML", () => {
    const s = setup({ ...thalia, inventory: [{ id: "evil", equipped: true }] }, false, r =>
      r.add("vault", "item", { id: "evil", name: "<b>x</b>", kind: "wondrous" }, { path: "e.md", body: "<i>hi</i>" }));
    over(s.q('[data-ref="item:evil"]')); vi.advanceTimersByTime(300);
    const pop = s.q(".fe-popover");
    expect(pop.textContent).toContain("<b>x</b>"); expect(pop.textContent).toContain("<i>hi</i>");
    expect(pop.querySelector("b")).toBeNull(); expect(pop.querySelector("i")).toBeNull();
  });
  it("scroll closes the popover", () => {
    const s = setup(withCharm, false, charm);
    over(s.q('[data-ref="item:charm"]')); vi.advanceTimersByTime(300);
    expect(s.q(".fe-popover")).not.toBeNull();
    window.dispatchEvent(new Event("scroll")); expect(s.q(".fe-popover")).toBeNull();
  });
  it("on mobile hover does nothing and tapping the name opens the details panel", () => {
    const s = setup(withCharm, true, charm);
    const name = s.q('[data-ref="item:charm"]');
    over(name); vi.advanceTimersByTime(300);
    expect(s.q(".fe-popover")).toBeNull();
    name.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(s.q('[data-panel="details"]').textContent).toContain("A small charm that turns blows aside.");
  });
  it("on desktop a click also opens the panel", () => {
    const s = setup(withCharm, false, charm);
    s.q('[data-ref="item:charm"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(s.ctl.panel).toEqual({ kind: "details", ref: "item:charm" });
  });
  it("spell card for Burning Hands shows the save and damage", () => {
    const s = setup(thalia, false);
    const t = detailCard("spell:burning-hands", s.ctl)!.textContent!;
    expect(t).toContain("Dex save"); expect(t).toContain("3d6 fire"); expect(t).toContain("Evocation");
  });
  it("condition, trait, effect and unknown refs", () => {
    const s = setup({ ...thalia, companions: [{ creature: "owl", name: "Hoot", kind: "familiar" }] }, false);
    expect(detailCard("condition:poisoned", s.ctl)!.textContent).toContain("Poisoned");
    expect(detailCard("trait:owl:0", s.ctl)!.textContent).toContain("Flyby");
    expect(detailCard("effect:Poisoned", s.ctl)!.textContent).toContain("Poisoned");
    expect(detailCard("item:nope", s.ctl)).toBeNull(); expect(detailCard("garbage", s.ctl)).toBeNull();
  });
});
