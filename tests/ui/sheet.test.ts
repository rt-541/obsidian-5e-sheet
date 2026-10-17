// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { CHARACTER_FEATURES, NPC_FEATURES, DESKTOP, MOBILE, NPC_DESKTOP, NPC_MOBILE, placed } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { thalia, maren } from "../fixtures/notes";

function setup(note: object, mobile: boolean, extra?: (r: Registry) => void) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); extra?.(r);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(11), body: "Backstory" };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string, init: MouseEventInit = {}) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })); };
  return { r, ctl, root, saved, notices, q, click, host };
}
const features = (root: HTMLElement) => new Set([...root.querySelectorAll<HTMLElement>("[data-feature]")].map(e => e.dataset.feature!));

describe("layout parity", () => {
  it("every layout places each feature exactly once", () => {
    for (const [l, list] of [[DESKTOP, CHARACTER_FEATURES], [MOBILE, CHARACTER_FEATURES], [NPC_DESKTOP, NPC_FEATURES], [NPC_MOBILE, NPC_FEATURES]] as const) {
      const p = placed(l); expect([...p].sort()).toEqual([...list].sort()); expect(new Set(p).size).toBe(p.length);
    }
  });
  it("desktop and mobile render the same feature set", () => {
    const d = setup(thalia, false), m = setup(thalia, true);
    expect(features(d.root)).toEqual(features(m.root));
    for (const f of CHARACTER_FEATURES) expect(features(d.root).has(f), f).toBe(true);
  });
  it("the same session gives identical results on both layouts", () => {
    const run = (mobile: boolean) => {
      const s = setup(thalia, mobile), out: string[] = [];
      s.click('[data-feature="skills"] .fe-roll'); out.push(s.q(".fe-toast").textContent!);                         // Acrobatics, poisoned -> dis
      s.click('[data-feature="roll-mode"] .fe-btn:last-child'); s.click('[data-feature="saves"] .fe-roll'); out.push(s.q(".fe-toast").textContent!);
      s.click('[data-feature="hp-controls"] .fe-btn');                                                               // Damage 5
      out.push(s.q('[data-feature="hp"]').textContent!);
      s.click('[data-feature="conditions"] .fe-chip-add'); s.click('[data-cond="paralyzed"] .fe-switch'); s.click('[data-panel] .fe-panel-head .fe-btn');
      s.click('[data-feature="saves"] .fe-row:nth-child(2) .fe-roll'); out.push(s.q(".fe-toast").textContent!);    // DEX save auto-fail
      s.click('[data-feature="rests"] .fe-btn:last-child'); s.click('[data-act="rest-apply"]');                       // long rest
      out.push(s.q('[data-feature="hp"]').textContent!, JSON.stringify(s.ctl.value.conditions));
      return out;
    };
    const d = run(false), m = run(true);
    expect(d).toEqual(m);
    expect(d[0]).toContain("dis: Poisoned"); expect(d[3]).toContain("Automatic failure (Paralyzed)"); expect(d[4]).toContain("43 / 43");
  });
});

describe("safety and robustness", () => {
  it("homebrew HTML in a name renders as text", () => {
    const s = setup({ ...thalia, inventory: [{ id: "evil", equipped: true }] }, false, r =>
      r.add("vault", "item", { id: "evil", name: '<img src=x onerror="window.pwned=1">', kind: "wondrous" }, { path: "e.md" }));
    s.click('[data-tab="inventory"]');
    expect(s.root.querySelector("img")).toBeNull();
    expect(s.q(".fe-inv-name").textContent).toBe('<img src=x onerror="window.pwned=1">');
  });
  it("unknown ids show as missing and nothing crashes", () => {
    const s = setup({ ...thalia, inventory: [{ id: "vorpal-spoon", equipped: true }], conditions: { hexed: 1 }, companions: [{ creature: "dragon-turtle-pup", name: "Shelly" }] }, false);
    expect(s.q('[data-feature="active-effects"]').textContent).toContain("Missing from compendium: condition:hexed, item:vorpal-spoon");
    expect(s.q(".fe-inv.is-missing").textContent).toContain("vorpal-spoon (missing from compendium)");
    expect(s.q(".fe-comp.is-missing").textContent).toContain("Shelly: dragon-turtle-pup (missing from compendium)");
    expect(s.q(".fe-chip.is-missing").textContent).toBe("hexed (missing from compendium)");
  });
  it("a note with errors is read-only and never saved", () => {
    const s = setup({ ...thalia, hp: "lots" }, false);
    expect(s.q('[data-feature="problems"]').textContent).toContain("hp: must be a mapping");
    s.click('[data-feature="hp-controls"] .fe-btn');
    expect(s.saved).toEqual([]); expect(s.notices[0]).toContain("read-only");
    s.click('[data-feature="saves"] .fe-roll'); expect(s.host.log).toHaveLength(1);   // rolling still works
  });
  it("the roll log keeps the last 50", () => {
    const s = setup(thalia, false);
    for (let i = 0; i < 60; i++) s.click('[data-feature="saves"] .fe-roll');
    expect(s.host.log).toHaveLength(50);
  });
});

describe("toggles and companions", () => {
  it("customize hides a section and switches rest rules, saved to the note", () => {
    const s = setup(thalia, false);
    s.click('[data-feature="play-edit"] .fe-seg .fe-btn:last-child'); s.click('[data-feature="play-edit"] > .fe-btn');
    s.click('[data-section="death-saves"]'); s.click('[data-rule="rest-excursion"]');
    expect(s.q('[data-feature="death-saves"]')).toBeNull();
    expect(s.ctl.value.sheet.hide).toEqual(["death-saves"]); expect(s.ctl.value.rules).toEqual({ "rest-excursion": true });
    expect([...s.root.querySelectorAll('[data-feature="rests"] .fe-btn')].map(b => b.textContent)).toEqual(["Night's rest"]);
    expect(s.saved.at(-1)!.sheet.hide).toEqual(["death-saves"]);
  });
  it("campaign rules apply unless the character overrides them", () => {
    const s = setup(thalia, false); s.host.campaign = { name: "C", rules: { "rest-excursion": true }, sections: { hide: ["xp"], show: [] }, calendar: { holyDay: "Sunday" } }; s.ctl.emit();
    expect(s.q('[data-feature="xp"]')).toBeNull();
    expect(s.q('[data-feature="rests"]').textContent).toBe("Night's rest");
  });
  it("add a wolf companion, damage it, roll its bite", () => {
    const s = setup(thalia, true);
    s.click('[data-tab="pets"]'); s.click('[data-feature="companions"] > .fe-btn'); s.click('[data-creature="wolf"]');
    expect(s.ctl.character!.companions.map(c => c.name)).toEqual(["Hoot", "Wolf"]);
    s.click('[data-companion="1"] .fe-hpctl .fe-btn');
    expect(s.ctl.character!.companions[1].hp.current).toBe(6); expect(s.ctl.character!.hp.current).toBe(31);
    s.click('[data-companion="1"] .fe-attack .fe-roll');
    expect(s.q(".fe-toast").textContent).toContain("Bite to hit");
  });
  it("NPC notes open with the stat block layout", () => {
    const s = setup(maren, false);
    expect(s.q('[data-feature="identity"]').textContent).toContain("Sister Maren");
    for (const f of NPC_FEATURES) expect(features(s.root).has(f), f).toBe(true);
    s.click('[data-feature="hp-controls"] .fe-btn');
    expect((s.saved.at(-1) as Npc).hp.current).toBe(7);
  });
});
