// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

function setup(layout: "desktop" | "tablet" | "mobile", note: object = thalia) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const buttons = () => [...root.querySelectorAll('[data-feature="rests"] .fe-rests .fe-btn')].map(b => b.textContent);
  return { ctl, root, saved, q, click, buttons };
}

describe.each(["desktop", "tablet", "mobile"] as const)("rest rules switch (%s)", layout => {
  afterEach(() => document.body.replaceChildren());

  it("offers both options next to the rest buttons, with standard rests on by default", () => {
    const s = setup(layout);
    const opts = [...s.root.querySelectorAll('[data-feature="rests"] [data-rest-mode]')];
    expect(opts.map(o => o.textContent)).toEqual(["Normal", "Hexploration"]);
    expect(opts.map(o => o.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(s.buttons()).toEqual(["Short rest", "Long rest"]);
  });
  it("flips between Short/Long and Night's rest, and saves the choice to the note", () => {
    const s = setup(layout);
    s.click('[data-rest-mode="excursion"]');
    expect(s.buttons()).toEqual(["Night's rest"]); expect(s.saved.at(-1)!.rules).toEqual({ "rest-excursion": true });
    expect(s.q('[data-rest-mode="excursion"]').getAttribute("aria-pressed")).toBe("true");
    s.click('[data-rest-mode="standard"]');
    expect(s.buttons()).toEqual(["Short rest", "Long rest"]); expect(s.saved.at(-1)!.rules).toEqual({ "rest-excursion": false });
  });
  it("matches Customize: it is the same rule, so each shows the other's change", () => {
    const s = setup(layout);
    s.ctl.setRule("rest-excursion", true);
    expect(s.q('[data-rest-mode="excursion"]').classList.contains("is-on")).toBe(true);
  });
  it("a campaign that sets Hexploration is overridden by choosing Normal rests on the character", () => {
    const s = setup(layout);
    s.ctl.host.campaign = { name: "C", rules: { "rest-excursion": true }, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } }; s.ctl.emit();
    expect(s.buttons()).toEqual(["Night's rest"]);
    s.click('[data-rest-mode="standard"]');
    expect(s.buttons()).toEqual(["Short rest", "Long rest"]);
  });
  it("the Night's rest panel has a safe haven switch that makes the preview a Good Rest, and counts nights", () => {
    const s = setup(layout, { ...thalia, rules: { "rest-excursion": true }, rest: { nightsInPlace: 1 } });
    s.click('[data-feature="rests"] .fe-rests .fe-btn');
    const panel = () => s.q('[data-panel="rest"]');
    expect(panel().textContent).toContain("Resting in a safe haven (GM decides)");
    expect(panel().textContent).toContain("A safe haven turns tonight into a Good Rest: full recovery.");
    expect(panel().textContent).toContain("Night 2 in this place (3 nights = Good Rest)");
    expect(panel().querySelector("li")!.textContent).toBe("Night 2 in this place");
    s.click('[data-opt="safe-haven"]');
    expect(s.ctl.restOpts.safeHaven).toBe(true);
    expect(panel().querySelector("li")!.textContent).toBe("Good Rest (safe haven)");
    expect(panel().querySelector('[data-opt="safe-haven"]')!.getAttribute("aria-checked")).toBe("true");
  });
  it("three nights in one place is a Good Rest without the switch", () => {
    const s = setup(layout, { ...thalia, rules: { "rest-excursion": true }, rest: { nightsInPlace: 2 } });
    s.click('[data-feature="rests"] .fe-rests .fe-btn');
    expect(s.q('[data-panel="rest"]').textContent).toContain("Night 3 in this place (3 nights = Good Rest)");
    expect(s.q('[data-panel="rest"] li').textContent).toBe("Good Rest (3 nights in place)");
  });
  it("the standard rest panel has no safe haven switch", () => {
    const s = setup(layout);
    s.click('[data-feature="rests"] .fe-rests .fe-btn');
    expect(s.q('[data-panel="rest"]').querySelector('[data-opt="safe-haven"]')).toBeNull();
  });
});
