// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { pc } from "../fixtures/overlay";

function setup(layout: "desktop" | "mobile" | "tablet") {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3), body: "" };
  const c = pc("monk", 5, { dex: 18, wis: 16 }, { inventory: [{ id: "shortsword", qty: 1, equipped: true, attuned: false }] });
  const p = parseNote(c); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  return { ctl, root, q: (sel: string) => root.querySelector(sel) as HTMLElement };
}
const over = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 4, clientY: 4 }));

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`why this number (${layout})`, () => {
  it("every headline number points at its breakdown", () => {
    const { root } = setup(layout);
    const refs = [...root.querySelectorAll<HTMLElement>("[data-ref^='why:']")].map(e => e.dataset.ref);
    for (const k of ["ac", "speed", "initiative", "passive:perception", "save:dex", "skill:stealth", "check:str", "attack:0:hit", "attack:0:damage", "hp"]) expect(refs, k).toContain(`why:${k}`);
  });
  it("tapping the AC opens the sentence in words", () => {
    const { ctl, q } = setup(layout);
    q("[data-ref='why:ac']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ctl.panel).toEqual({ kind: "details", ref: "why:ac" });
    const text = q("[data-panel='details']").textContent!;
    expect(text).toContain("AC 17 = 10 + Dex 4 + Wis 3 (Unarmored Defense)");
  });
  it("rolling a number does not open the card, hovering it shows it", () => {
    vi.useFakeTimers();
    const { ctl, q } = setup(layout);
    const hit = q("[data-ref='why:attack:0:hit']");
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ctl.panel).toBeNull(); expect(ctl.host.log.length).toBe(1);
    if (layout === "desktop") {
      over(q("[data-ref='why:attack:0:hit']")); vi.advanceTimersByTime(300);
      expect(document.querySelector(".fe-popover")!.textContent).toContain("To hit +");
    }
    vi.useRealTimers();
  });
  it("the attack name opens both lines", () => {
    const { q } = setup(layout);
    q("[data-ref='why:attack:0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const text = q("[data-panel='details']").textContent!;
    expect(text).toContain("To hit"); expect(text).toContain("Damage");
  });
});
