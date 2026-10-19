// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

const note = { ...thalia, classes: [{ class: "cleric", subclass: "life", level: 5 }], race: "dwarf", subrace: "hill-dwarf", background: "acolyte" };
function setup(layout: "desktop" | "tablet" | "mobile", n: object = note) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(n); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  return { r, ctl, root, q: (sel: string) => root.querySelector<HTMLElement>(sel)! };
}

describe.each(["desktop", "tablet", "mobile"] as const)("identity line hover and tap (%s)", layout => {
  afterEach(() => { document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });
  const open = (s: ReturnType<typeof setup>, ref: string): string => {
    const el = s.q(`[data-feature="identity"] [data-ref="${ref}"]`); expect(el, ref).not.toBeNull();
    if (layout === "desktop") {
      vi.useFakeTimers(); el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300); vi.useRealTimers();
      return document.querySelector(".fe-popover")!.textContent!;
    }
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(s.ctl.panel).toEqual({ kind: "details", ref });
    return s.q('[data-panel="details"]').textContent!;
  };

  it("keeps the old text and makes class, subclass, race, subrace and background separate targets", () => {
    const s = setup(layout), id = s.q('[data-feature="identity"]');
    expect(id.textContent).toContain("cleric 5"); expect(id.textContent).toContain("Dwarf"); expect(id.textContent).toContain("Hill Dwarf"); expect(id.textContent).toContain("Acolyte");
    expect([...id.querySelectorAll<HTMLElement>("[data-ref]")].map(e => e.dataset.ref)).toEqual(
      ["identity:class:cleric", "identity:subclass:life", "identity:race", "identity:subrace", "identity:background"]);
  });
  it("the class card shows hit die, saves, proficiencies and one line per feature so far", () => {
    const s = setup(layout), t = open(s, "identity:class:cleric");
    expect(t).toContain("Cleric 5"); expect(t).toContain("Hit die: d8"); expect(t).toContain("Saving throws: Wisdom, Charisma");
    expect(t).toContain("Armor, weapons and tools:"); expect(t).toContain("Features so far:");
    const rows = [...(layout === "desktop" ? document.querySelector(".fe-popover")! : s.q('[data-panel="details"]')).querySelectorAll(".fe-detail-line")].map(e => e.textContent!);
    expect(rows.filter(l => /^Level \d+: /.test(l)).length).toBeGreaterThan(2);
    expect(rows.every(l => l.length < 260)).toBe(true);
    expect(rows.some(l => l.startsWith("Level 6:"))).toBe(false);   // only what a level 5 cleric has
  });
  it("the subclass card lists its features so far", () => {
    const s = setup(layout), t = open(s, "identity:subclass:life");
    expect(t).toContain("Life"); expect(t).toContain("Cleric subclass"); expect(t).toMatch(/Level 1: /);
  });
  it("the race and subrace cards show the speed, the senses and a line per trait", () => {
    const s = setup(layout), race = open(s, "identity:race");
    expect(race).toContain("Dwarf"); expect(race).toContain("Speed: "); expect(race).toContain("Senses: darkvision 60 ft."); expect(race).toContain("Traits:");
    s.ctl.close(); document.querySelectorAll(".fe-popover").forEach(e => e.remove());
    const sub = open(s, "identity:subrace");
    expect(sub).toContain("Hill Dwarf"); expect(sub).toContain("Dwarf subrace"); expect(sub).toContain("Dwarven Toughness");
  });
  it("the background card lists what it gives you", () => {
    const t = open(setup(layout), "identity:background");
    expect(t).toContain("Acolyte"); expect(t).toContain("Shelter of the Faithful");
  });
});

describe("identity line details", () => {
  it("an unknown race or subclass stays plain text with no card to open", () => {
    const s = setup("desktop", { ...thalia, race: "hill-dwarf" });   // a subrace id used as a race: not a race in the compendium
    const refs = [...s.root.querySelectorAll<HTMLElement>('[data-feature="identity"] [data-ref]')].map(e => e.dataset.ref);
    expect(refs).not.toContain("identity:race"); expect(refs).toContain("identity:class:cleric");
    expect(s.q('[data-feature="identity"]').textContent).toContain("hill-dwarf");
  });
  it("a homebrew race card lists its ability increases", () => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    const bad = r.add("vault", "race", { id: "folk", name: "Folk", ability: [{ dex: 2 }, { choose: { from: ["str", "con"], count: 1, amount: 1 } }], grants: [] }, { path: "folk.md" });
    expect(bad).toBeFalsy();
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(11), body: "" };
    const p = parseNote({ ...thalia, race: "folk" }); if (p.kind !== "character") throw new Error("x");
    const ctl = new SheetController(host, p);
    expect(ctl.character!.race).toBe("folk");
    const t = (document.createElement("div"), ctlCard(ctl, "identity:race"));
    expect(t).toContain("Ability scores: +2 Dexterity, +1 to 1 of Strength, Constitution");
  });
});
import { detailCard } from "../../src/ui/details";
const ctlCard = (ctl: SheetController, ref: string) => detailCard(ref, ctl)!.textContent!;
