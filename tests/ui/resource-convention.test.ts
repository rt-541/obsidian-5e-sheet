// @vitest-environment jsdom
import { thalia } from "../fixtures/notes";
import { LAYOUTS, sheet } from "./review-helpers";

/** An invented class with a resource named like its feature (with a use count), and a Focus pool for combos. */
const tinker = {
  type: "5e-class", name: "Tinker", hitDie: 8, saves: ["int", "dex"], proficiencies: [], skills: { count: 1, from: ["arcana"] },
  levels: { 1: [
    { op: "resource", name: "Burst", max: 1, reset: "short" },
    { op: "feature", id: "burst-use", name: "Burst (1 use)", text: "A loud flash." },
    { op: "resource", name: "Focus", max: 3, reset: "long" },
  ] },
};
const sparkRod = { type: "5e-item", name: "Spark Rod", kind: "wondrous", attunement: false, charges: { max: 3, reset: "dawn" } };
const tinkerNote = (extra: object = {}) => ({ ...thalia, classes: [{ class: "tinker", level: 1 }], spells: [], spellSlots: {}, resources: [], inventory: [], companions: [], ...extra });

for (const layout of LAYOUTS) describe(`resources (${layout})`, () => {
  afterEach(() => document.body.replaceChildren());
  it("spell slots say how many are left", () => {
    const s = sheet(layout, thalia);
    expect(s.all('[data-feature="spell-slots"] [data-slot]').map(r => r.querySelector(".fe-grow")!.textContent))
      .toEqual(["Level 1 slots: 3 of 4 left", "Level 2 slots: 3 of 3 left", "Level 3 slots: 1 of 2 left"]);
  });
  it("a hand-tracked resource with a derived twin shows once, and the note keeps its entry", () => {
    const note = tinkerNote({ resources: [{ name: "Focus", max: 3, used: 1, reset: "long" }, { name: "Torch Oil", max: 2, used: 0, reset: "long" }] });
    const s = sheet(layout, note, [tinker]);
    const rows = s.all('[data-feature="resources"] .fe-res-row').map(r => r.textContent!);
    expect(rows.filter(t => t.startsWith("Focus"))).toHaveLength(1);
    expect(rows.some(t => t.startsWith("Torch Oil: 2 of 2 left"))).toBe(true);
    expect(s.ctl.character!.resources).toEqual(note.resources);
  });
  it("charged items count their charges", () => {
    const s = sheet(layout, tinkerNote({ inventory: [{ id: "spark-rod", qty: 1, equipped: false, attuned: false, charges: { used: 1 } }] }), [tinker, sparkRod]);
    expect(s.q('[data-feature="resources"]').textContent).toContain("Spark Rod charges: 2 of 3 left");
  });
  it("a feature named with a use count finds its resource", () => {
    const s = sheet(layout, tinkerNote(), [tinker]);
    expect(s.root.querySelector('[data-trait] [data-resource="burst"]')).toBeTruthy();
  });
  it("a combo shows a resource's pool once, not on every step", () => {
    const combos = [{ name: "Double", when: "", steps: [
      { action: "Action", text: "One.", use: { resource: "Focus", cost: 1 } },
      { action: "Bonus", text: "Two.", use: { resource: "Focus", cost: 1 } }] }];
    const s = sheet(layout, tinkerNote({ combos }), [tinker]);
    const card = s.q('[data-combo="0"]');
    const pools = card.querySelectorAll('[data-pool="focus"]');
    expect(pools).toHaveLength(1);
    expect(pools[0].textContent).toContain("Focus: 3 of 3 left");
    expect(card.querySelectorAll("[data-step] [data-left]")).toHaveLength(0);
    expect(card.querySelectorAll("[data-step] .fe-pips")).toHaveLength(0);
  });
});

for (const layout of LAYOUTS) describe(`no repeated slots or spell DC (${layout})`, () => {
  afterEach(() => document.body.replaceChildren());
  it("in every pane, each slot row and the spell DC appear at most once", () => {
    const s = sheet(layout, thalia);
    const panes = s.all("[data-pane]");
    expect(panes.length).toBeGreaterThan(0);
    for (const p of panes) {
      const slots = Array.from(p.querySelectorAll("[data-slot]")).map(e => e.getAttribute("data-slot"));
      expect(new Set(slots).size).toBe(slots.length);
      expect((p.textContent!.match(/Spell (save )?DC/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });
});
