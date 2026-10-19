// @vitest-environment jsdom
import { GLOSSARY_KEYS, glossaryEntry, hitDiceRecharge } from "../../src/content/glossary";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { ABILS, SKILLS } from "../../src/core/types";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { detailCard } from "../../src/ui/details";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

type Layout = "desktop" | "tablet" | "mobile";
function setup(layout: Layout, note: object = thalia) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  return { ctl, root, q: (sel: string) => root.querySelector<HTMLElement>(sel)!, all: (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)] };
}
const over = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
const click = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

describe("glossary text", () => {
  it("covers every ability, save, skill and hit dice, short and never empty", () => {
    const want = [...ABILS.map(a => `ability:${a}`), ...ABILS.map(a => `save:${a}`), ...Object.keys(SKILLS).map(k => `skill:${k}`), "hit-dice", "ability-modifier", "saving-throw",
      "proficiency-bonus", "passive-perception", "initiative", "armor-class", "hit-points", "temp-hp", "death-saves", "inspiration", "concentration", "speed"];
    for (const k of want) expect(GLOSSARY_KEYS, k).toContain(k);
    for (const k of GLOSSARY_KEYS) for (const ex of [false, true]) {
      const e = glossaryEntry(k, ex)!;
      expect(e, k).toBeDefined(); expect(e.text.trim().length, k).toBeGreaterThan(10); expect(e.text.length, k).toBeLessThan(300);
    }
    expect(glossaryEntry("nonsense")).toBeUndefined(); expect(glossaryEntry("skill:nonsense")).toBeUndefined();
  });
  it("hit dice recharge: half your total (at least one) on a long rest, or everything on a Good Rest", () => {
    expect(hitDiceRecharge(5, false)).toBe("Spend on a short rest to heal. A long rest gives back 2 (half your total).");
    expect(hitDiceRecharge(1, false)).toContain("gives back 1 ");
    expect(hitDiceRecharge(5, true)).toContain("Good Rest");
    expect(hitDiceRecharge(5, true)).not.toContain("short rest");
  });
});

describe.each(["desktop", "tablet", "mobile"] as const)("glossary cards on %s", layout => {
  const open = (s: ReturnType<typeof setup>, el: HTMLElement) => {
    if (layout === "desktop") { vi.useFakeTimers(); over(el); vi.advanceTimersByTime(300); vi.useRealTimers(); return document.querySelector(".fe-popover"); }
    click(el); return s.q('[data-panel="details"]');
  };
  afterEach(() => { document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });

  it("every ability, save and skill label and the hit dice title open a glossary card", () => {
    const s = setup(layout);
    const refs = new Set(s.all("[data-ref^='glossary:']").map(e => e.dataset.ref));
    for (const a of ABILS) { expect(refs.has(`glossary:ability:${a}`)).toBe(true); expect(refs.has(`glossary:save:${a}`)).toBe(true); }
    for (const k of Object.keys(SKILLS)) expect(refs.has(`glossary:skill:${k}`), k).toBe(true);
    for (const k of ["hit-dice", "proficiency-bonus", "armor-class", "initiative", "speed", "passive-perception", "death-saves"]) expect(refs.has(`glossary:${k}`), k).toBe(true);
    for (const ref of refs) expect(detailCard(ref!, s.ctl), ref).not.toBeNull();
  });
  it("a skill label opens its card with your total and the breakdown, while the number keeps its why card", () => {
    const s = setup(layout);
    const label = s.q("[data-ref='glossary:skill:athletics']");
    const card = open(s, label)!;
    expect(card.textContent).toContain("Athletics"); expect(card.textContent).toContain("Your bonus: ");
    expect(card.textContent).toMatch(/climbing/);
    expect(s.q("[data-ref='why:skill:athletics']").classList.contains("fe-roll")).toBe(true);
  });
  it("the AC label opens the plain card; the AC number tile still opens where the number comes from", () => {
    const s = setup(layout);
    expect(s.q("[data-feature='ac'] .fe-stat-l").dataset.ref).toBe("glossary:armor-class");
    expect(s.q("[data-feature='ac']").dataset.ref).toBe("why:ac");
  });
  it("the hit dice title card says how many are left", () => {
    const s = setup(layout);
    const card = open(s, s.q("[data-feature='hit-dice'] .fe-card-title"))!;
    expect(card.textContent).toContain("Hit dice"); expect(card.textContent).toContain("Left: ");
  });
});

describe("hit dice recharge line on the sheet", () => {
  it.each(["desktop", "tablet", "mobile"] as const)("shows the long rest rule under standard rests (%s)", layout => {
    const s = setup(layout);
    const total = s.ctl.stats()!.hitDice.reduce((n, d) => n + d.max, 0);
    expect(s.q("[data-feature='hit-dice'] .fe-hd-recharge").textContent).toBe(`Spend on a short rest to heal. A long rest gives back ${Math.max(1, Math.floor(total / 2))} (half your total).`);
  });
  it.each(["desktop", "tablet", "mobile"] as const)("shows the Good Rest rule under excursion resting (%s)", layout => {
    const s = setup(layout, { ...thalia, rules: { "rest-excursion": true } });
    const t = s.q("[data-feature='hit-dice'] .fe-hd-recharge").textContent!;
    expect(t).toContain("night's rest"); expect(t).toContain("Good Rest"); expect(t).not.toContain("long rest");
  });
});
