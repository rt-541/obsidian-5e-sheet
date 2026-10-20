// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

const LAYOUTS = ["desktop", "tablet", "mobile"] as const;

function setup(note: object, layout: (typeof LAYOUTS)[number]) {
  const r = mechanicsRegistry();
  const bad = r.add("vault", "item", { name: "Tingle Wand", kind: "wondrous", charges: { max: 3, reset: "dawn" } }, { path: "tw.md" });
  if (bad) throw new Error(JSON.stringify(bad));
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(5) };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (sel: string, v: string) => { const el = q(sel) as HTMLInputElement; if (!el) throw new Error("missing " + sel); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const pick = (sel: string, v: string) => { const el = q(sel) as HTMLSelectElement; if (!el) throw new Error("missing " + sel); el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
  return { ctl, root, saved, notices, q, click, type, pick };
}

const wand = { id: "tingle-wand", qty: 1, equipped: true, customize: { action: { name: "Tingle", damage: "1d6", damageType: "lightning", cost: { charges: 1 } } } };
const FURY = '[data-trait="feature:class:tester:1:fury"]';

for (const layout of LAYOUTS) describe(`customize form (${layout})`, () => {
  const gear = layout === "desktop" ? "inventory" : "gear";

  it("Customize appears only in Edit mode on trait, feature and item rows", () => {
    const s = setup({ inventory: [{ id: "tingle-wand", qty: 1, equipped: true }] }, layout);
    expect(s.root.querySelectorAll('[data-act="customize"]').length).toBe(0);
    s.ctl.setEditing(true);
    expect(s.q(`${FURY} [data-act="customize"]`)).toBeTruthy();
    expect(s.q('[data-key="class:tester:1:fury"] [data-act="customize"]')).toBeTruthy();
    s.ctl.tab = gear; s.ctl.toggleItemMenu(0);
    expect(s.q('[data-menu="0"] [data-act="customize"]')).toBeTruthy();
  });

  it("making Fury cost-free in a group from the form updates its switch card", () => {
    const s = setup({}, layout);
    s.ctl.setEditing(true); s.click(`${FURY} [data-act="customize"]`);
    expect(s.q('[data-panel="customize-row"] .fe-panel-head').textContent).toContain("Customize");
    s.click('[data-cz="switchCost"] [data-value="free"]'); s.click('[data-act="cz-save"]');
    expect(s.q('[data-toggle-card="fury"]').textContent).toContain("Free to start.");
    expect(s.q('[data-panel="customize-row"]')).toBeNull();
  });

  it("a bad dice entry is refused in words and nothing is saved", () => {
    const s = setup({}, layout);
    s.ctl.setEditing(true); s.click(`${FURY} [data-act="customize"]`);
    s.click('[data-cz="hasUse"]');
    s.click('[data-cz="useEffect"] [data-value="damage"]');
    s.type('[data-cz="useDice.dice"]', "lots");
    s.type('[data-cz="useName"]', "Smash");
    s.click('[data-act="cz-save"]');
    expect(s.q('[data-panel="customize-row"] .fe-warn').textContent).toBe("Dice must look like 1d4 or 2d6+1.");
    expect(s.saved).toHaveLength(0);
  });

  it("an item Use button appears on the row and on its pinned copy", () => {
    const s = setup({ inventory: [wand], mainPins: ["item:tingle-wand"] }, layout);
    expect(s.q('[data-item="0"] [data-act="use-item-action"]').textContent).toBe("Use Tingle");
    expect(s.q('[data-pinned-item="item:tingle-wand"] [data-act="use-item-action"]')).toBeTruthy();
    s.click('[data-item="0"] [data-act="use-item-action"]');
    expect((s.ctl.value as Character).inventory[0].charges).toEqual({ used: 1 });
  });

  it("a Use button with no charges left is greyed out", () => {
    const s = setup({ inventory: [{ ...wand, charges: { used: 3 } }] }, layout);
    const b = s.q('[data-item="0"] [data-act="use-item-action"]') as HTMLButtonElement;
    expect(b.disabled).toBe(true); expect(b.title).toBe("No charges left");
  });

  it("no machine ids are shown: scale and DC choices are worded", () => {
    const s = setup({}, layout);
    s.ctl.setEditing(true); s.click(`${FURY} [data-act="customize"]`);
    s.click('[data-cz="isOption"]'); s.click('[data-cz="onHit"]'); s.click('[data-cz="hasUse"]');
    expect(s.q('[data-panel="customize-row"]').textContent).not.toMatch(/[a-z]+-[a-z]+-[a-z]+/);
  });

  it("a custom item shows only the Use button and Pin", () => {
    const s = setup({ inventory: [{ name: "Odd Charm", qty: 1 }] }, layout);
    s.ctl.setEditing(true); s.ctl.tab = gear; s.ctl.toggleItemMenu(0); s.click('[data-menu="0"] [data-act="customize"]');
    expect(s.q('[data-cz="hasUse"]')).toBeTruthy(); expect(s.q('[data-cz="pin"]')).toBeTruthy();
    expect(s.q('[data-cz="isSwitch"]')).toBeNull(); expect(s.q('[data-cz="isOption"]')).toBeNull();
  });

  it("a hand-made item can be given a Use button that is saved on its row", () => {
    const s = setup({ inventory: [{ name: "Odd Charm", qty: 1 }] }, layout);
    s.ctl.setEditing(true); s.ctl.tab = gear; s.ctl.toggleItemMenu(0); s.click('[data-menu="0"] [data-act="customize"]');
    s.click('[data-cz="hasUse"]'); s.type('[data-cz="useName"]', "Zap"); s.click('[data-cz="useEffect"] [data-value="heal"]'); s.type('[data-cz="useDice.dice"]', "1d4");
    s.click('[data-act="cz-save"]');
    expect((s.ctl.value as Character).inventory[0].customize).toEqual({ action: { name: "Zap", heal: "1d4" } });
  });

  it("Close leaves no draft behind", () => {
    const s = setup({}, layout);
    s.ctl.setEditing(true); s.click(`${FURY} [data-act="customize"]`);
    expect(s.ctl.customizeDraft).not.toBeNull();
    s.click('[data-panel="customize-row"] .fe-panel-head button');
    expect(s.ctl.customizeDraft).toBeNull(); expect(s.q('[data-panel="customize-row"]')).toBeNull();
  });
});
