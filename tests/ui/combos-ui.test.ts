// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

const LAYOUTS = ["desktop", "tablet", "mobile"] as const;

const stun = { name: "Stun Lock", when: "A dangerous single target", notes: "Stop once it is stunned.", steps: [
  { action: "Action", text: "Hit it with the dagger.", use: { attack: "Dagger" } },
  { action: "Bonus", text: "Fury up.", use: { resource: "Fury", cost: 1 } },
  { action: "Reaction", text: "Fury again.", use: { resource: "Fury", cost: 1 } },
] };
const base = { inventory: [{ id: "dagger", equipped: true }] };

function setup(note: object, layout: (typeof LAYOUTS)[number]) {
  const r = mechanicsRegistry();
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(5) };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (sel: string, v: string) => { const el = q(sel) as HTMLInputElement; if (!el) throw new Error("missing " + sel); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const pick = (sel: string, v: string) => { const el = q(sel) as HTMLSelectElement; if (!el) throw new Error("missing " + sel); el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
  return { ctl, root, saved, notices, q, all, click, type, pick, host };
}

for (const layout of LAYOUTS) describe(`combos (${layout})`, () => {
  it("with none yet, the tab invites the player to add the first one, in Play mode too", () => {
    const s = setup(base, layout);
    s.click('[data-tab="combos"]');
    const add = s.q('[data-pane="combos"] [data-act="add-combo"]');
    expect(add.textContent).toBe("+ Add combo");
    expect(s.ctl.editing).toBe(false);
    add.click();
    expect(s.q('[data-panel="combo-edit"]')).toBeTruthy();
    expect(s.q('[data-feature="pinned-combos"]').hidden).toBe(true);
  });

  it("a combo is built in the form with plain words and pickers, then saved to the note", () => {
    const s = setup(base, layout);
    s.click('[data-tab="combos"]'); s.click('[data-act="add-combo"]');
    expect(s.q('[data-act="combo-delete"]')).toBeNull();
    s.click('[data-act="combo-save"]');
    expect(s.q('[data-act="combo-error"]').textContent).toBe("Give the combo a name.");
    s.type('[data-act="combo-name"]', "Opener"); s.type('[data-act="combo-when"]', "Start of a fight");
    s.click('[data-act="combo-save"]');
    expect(s.q('[data-act="combo-error"]').textContent).toContain("Step 1 is empty");
    s.pick('[data-act="step-action"]', "Bonus action"); s.type('[data-act="step-text"]', "Stab first.");
    s.pick('[data-act="step-thing"]', "attack|Dagger");
    s.pick('[data-act="step-resource"]', "Fury");
    s.type('[data-act="step-cost"]', "1");
    s.click('[data-act="add-step"]'); expect(s.all(".fe-form-step")).toHaveLength(2);
    s.type('[data-step="1"] [data-act="step-text"]', "Second hit."); s.click('[data-step="1"] [data-act="step-up"]');
    s.click('[data-act="combo-save"]');
    expect(s.q('[data-panel="combo-edit"]')).toBeNull();
    const c = (s.ctl.value as Character).combos;
    expect(c).toEqual([{ name: "Opener", when: "Start of a fight", steps: [{ action: "Action", text: "Second hit." }, { action: "Bonus action", text: "Stab first.", use: { attack: "Dagger", resource: "Fury", cost: 1 } }] }]);
    expect(s.saved.at(-1)).toMatchObject({ combos: c });
    expect(s.q('[data-pane="combos"] [data-combo="0"] .fe-name').textContent).toBe("Opener");
  });

  it("each card shows a ready line, an action badge and live buttons, and red when something runs out", () => {
    const s = setup({ ...base, combos: [stun] }, layout);
    const card = s.q('[data-pane="combos"] [data-combo="0"]');
    expect(card.querySelector(".fe-ready")!.textContent).toBe("Ready");
    expect([...card.querySelectorAll(".fe-badge")].map(b => b.textContent)).toEqual(["Action", "Bonus action", "Reaction"]);
    expect(card.textContent).toContain("When to use it: A dangerous single target");
    expect(card.textContent).toContain("Stop once it is stunned.");
    const step0 = card.querySelector('[data-step="0"]')!;
    expect([...step0.querySelectorAll("button")].map(b => b.title)).toEqual(["Dagger: roll to hit", "Dagger: roll damage"]);
    (step0.querySelector("button") as HTMLElement).click();
    expect(s.host.log[0].title).toBe("Dagger to hit");
    (step0.querySelectorAll("button")[1] as HTMLElement).click();
    expect(s.host.log[0].title).toBe("Dagger damage");
    // spend Fury: 2 left, the two steps cost 1 each
    (card.querySelector('[data-step="1"] [data-act="step-spend"]') as HTMLElement).click();
    expect((s.ctl.value as Character).uses.fury).toBe(1);
    const after = s.q('[data-pane="combos"] [data-combo="0"]');
    expect(after.querySelector('[data-pool="fury"]')!.getAttribute("data-left")).toBe("1");
    (after.querySelector('[data-step="2"] [data-act="step-spend"]') as HTMLElement).click();
    const empty = s.q('[data-pane="combos"] [data-combo="0"]');
    expect((s.ctl.value as Character).uses.fury).toBe(2);
    expect(empty.querySelector(".fe-ready")!.textContent).toBe("Partly: needs 2 fury (0 left)");
    expect(empty.querySelector('[data-step="1"]')!.classList.contains("is-out")).toBe(true);
    (empty.querySelector('[data-step="1"] [data-act="step-spend"]') as HTMLElement).click();
    expect(s.notices.at(-1)).toBe("No Fury left. Take a rest first.");
    expect((s.ctl.value as Character).uses.fury).toBe(2);
  });

  it("a step names what is missing in words instead of failing", () => {
    const s = setup({ combos: [{ name: "Broken", when: "", steps: [{ action: "Action", text: "Hit.", use: { attack: "Sword of Nothing" } }] }] }, layout);
    const step = s.q('[data-combo="0"] [data-step="0"]');
    expect(step.classList.contains("is-out")).toBe(true);
    expect(step.textContent).toContain("Can't do this yet: Sword of Nothing is not one of the attacks on this sheet.");
  });

  it("a feature step starts the switch and tapping its text opens the feature's detail card", () => {
    const s = setup({ combos: [{ name: "Rage plan", when: "", steps: [{ action: "Bonus action", text: "Go fury.", use: { feature: "class:tester:1:fury" } }] }] }, layout);
    s.click('[data-step="0"] [data-act="step-toggle"]');
    expect((s.ctl.value as Character).active.fury).toBe(true);
    expect(s.q('[data-step="0"] [data-act="step-toggle"]').textContent).toBe("End Fury");
    s.click('[data-step="0"] .fe-step-text');
    expect(s.q('[data-panel="details"]').textContent).toContain("Fury");
  });

  it("Edit opens the same form, which can reorder and delete with a second tap", () => {
    const s = setup({ ...base, combos: [stun, { name: "Second", when: "", steps: [{ action: "Action", text: "x" }] }] }, layout);
    s.click('[data-combo="0"] [data-act="edit-combo"]');
    expect((s.q('[data-act="combo-name"]') as HTMLInputElement).value).toBe("Stun Lock");
    expect(s.all(".fe-form-step")).toHaveLength(3);
    s.click('[data-act="combo-later"]');
    expect((s.ctl.value as Character).combos.map(k => k.name)).toEqual(["Second", "Stun Lock"]);
    expect(s.q('[data-act="combo-later"]')).toBeNull(); expect(s.q('[data-act="combo-earlier"]')).toBeTruthy();
    s.click('[data-act="combo-delete"]');
    expect((s.ctl.value as Character).combos).toHaveLength(2);
    expect(s.q('[data-act="combo-delete"]').textContent).toBe("Tap again to delete this combo");
    s.click('[data-act="combo-delete"]');
    expect((s.ctl.value as Character).combos.map(k => k.name)).toEqual(["Second"]);
    expect(s.q('[data-panel="combo-edit"]')).toBeNull();
  });

  it("Cancel leaves the note alone", () => {
    const s = setup({ combos: [stun] }, layout);
    s.click('[data-act="edit-combo"]'); s.type('[data-act="combo-name"]', "Renamed"); s.click('[data-act="combo-cancel"]');
    expect((s.ctl.value as Character).combos[0].name).toBe("Stun Lock"); expect(s.saved).toEqual([]);
  });

  it("a pinned combo shows on the main page with its live buttons", () => {
    const s = setup({ ...base, combos: [stun, { ...stun, name: "Other" }] }, layout);
    expect(s.q('[data-feature="pinned-combos"]').textContent).toContain("Pin a combo on the Combos tab");
    s.click('[data-pane="combos"] [data-combo="1"] [data-act="pin-combo"]');
    expect((s.ctl.value as Character).combos.map(k => !!k.pinned)).toEqual([false, true]);
    const main = s.q('[data-feature="pinned-combos"]');
    expect(main.hidden).toBe(false);
    expect([...main.querySelectorAll(".fe-combo .fe-name")].map(n => n.textContent)).toEqual(["Other"]);
    expect(main.querySelector('[data-act="pin-combo"]')!.textContent).toBe("Pinned to main page");
    expect(main.querySelector(".fe-note")).toBeNull();
  });

  it("tapping the combo's name opens its full detail card", () => {
    const s = setup({ combos: [stun] }, layout);
    s.click('[data-pane="combos"] [data-combo="0"] .fe-name');
    const d = s.q('[data-panel="details"]').textContent!;
    expect(d).toContain("1. Action: Hit it with the dagger."); expect(d).toContain("2. Bonus action: Fury up."); expect(d).toContain("Stop once it is stunned.");
  });
});

describe("combos give identical results on every layout", () => {
  it("the same session ends in the same note and the same words", () => {
    const run = (layout: (typeof LAYOUTS)[number]) => {
      const s = setup({ ...base, combos: [stun] }, layout);
      s.click('[data-pane="combos"] [data-combo="0"] [data-act="pin-combo"]');
      s.click('[data-pane="combos"] [data-step="1"] [data-act="step-spend"]');
      s.click('[data-pane="combos"] [data-step="0"] button');
      s.click('[data-pane="combos"] [data-act="add-combo"]'); s.type('[data-act="combo-name"]', "Two"); s.type('[data-act="step-text"]', "Wait."); s.click('[data-act="combo-save"]');
      return [JSON.stringify((s.ctl.value as Character).combos), JSON.stringify((s.ctl.value as Character).uses), s.q('[data-feature="pinned-combos"]').textContent!, s.q('[data-feature="combos"]').textContent!, s.host.log.map(l => l.title).join("|")];
    };
    const [d, t, m] = [run("desktop"), run("tablet"), run("mobile")];
    expect(t).toEqual(d); expect(m).toEqual(d);
  });
});
