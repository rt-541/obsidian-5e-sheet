// @vitest-environment jsdom
import { newCharacter, parseNote, writeInto, type Character } from "../../src/core/character";
import { applyLevel, planLevel } from "../../src/core/levelup";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { pickPage } from "../../src/ui/levelup-ui";
import { classPitch, originPitch } from "../../src/ui/builder-pitch";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const reg = homebrewRegistry([
  { type: "5e-feat", name: "Free Tongue", grants: [{ op: "choose", what: "languages", count: 1 }] },
  { type: "5e-race", name: "Marsh Heron", grants: [{ op: "grant", languages: ["Deep Speech"] }] },
  { type: "5e-race", name: "Hill Wren", grants: [{ op: "grant", speed: 30, darkvision: 60 }], ability: { con: 2 } },
]);
const abil = { str: 10, dex: 10, con: 14, int: 10, wis: 12, cha: 8 };

function levelled(): Character {
  let c: Character = { ...newCharacter("Newbie"), abilities: abil };
  const r = applyLevel(c, { class: "skirmisher" }, { hp: { method: "average" }, choices: { "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] } }, reg);
  if ("error" in r) throw new Error(r.error);
  c = r.value; return c;
}

function sheetSetup(c: Character) {
  const fm: Record<string, unknown> = { type: "5e-character", name: c.name }; writeInto(fm, c);
  const saved: Character[] = [];
  const host: SheetHost = { registry: reg, ruleDefaults: {}, save: v => saved.push(structuredClone(v) as Character), notify: () => {}, log: [], rng: seeded(3), body: "" };
  const p = parseNote(fm); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, false);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, q, click };
}

function builderSetup() {
  const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "C", exists: () => false, notify: () => {}, createNote: async p => p, open: () => {}, close: () => {} };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, false); ctl.go(1);   // page 0 is the edition page
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, q, click };
}

describe("wizard choices a new player can read", () => {
  it("ineligible classes are collapsed with the shared reason once", () => {
    const s = sheetSetup({ ...levelled(), abilities: { ...abil, dex: 10, int: 10 } });
    s.click('[data-act="level-up"]');
    const det = s.q('[data-panel="level-up"] details[data-ineligible]');
    expect(det.querySelector("summary")!.textContent).toContain("Other classes (need higher scores)");
    expect(det.querySelector("summary")!.textContent).toContain("Leaving Skirmisher needs DEX 13 or INT 13");
    expect(det.contains(s.q('[data-class="wizard"]'))).toBe(true);
    expect((s.q('[data-class="wizard"]') as HTMLButtonElement).disabled).toBe(true);
    expect(s.q('[data-panel="level-up"] .fe-warn')).toBeNull();
    expect(s.q('[data-panel="level-up"]').contains(s.q('[data-class="skirmisher"]'))).toBe(true);
  });

  it("race and class choices carry a one-line pitch", () => {
    expect(originPitch(reg.get("race", "skink")!, reg)).toBe("Speed 25 ft · Darkvision 60 ft");
    expect(originPitch(reg.get("race", "hill-wren")!, reg)).toBe("Speed 30 ft · Darkvision 60 ft · +2 Constitution");
    expect(classPitch(reg.get("class", "skirmisher")!)).toBe("Hit die d8 · Saves DEX, INT · 2 skills");
  });

  it("the builder shows the pitch and an About toggle per row", () => {
    const b = builderSetup();
    expect(b.q('[data-race="skink"]').textContent).toContain("Speed 25 ft · Darkvision 60 ft");
    expect(b.q('[data-about="skink"]')).not.toBeNull();
    b.click('[data-about="skink"]'); expect(b.ctl.view.about).toBe("skink");
    expect(b.q('[data-row="race"] .fe-detail')).not.toBeNull();
    b.click('[data-about="skink"]'); expect(b.ctl.view.about).toBeUndefined();
  });

  it("a free language choice is a pick list with an other box", () => {
    let c: Character = { ...newCharacter("Newbie"), abilities: abil };
    for (const choices of [{ "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] }, { "class:skirmisher:2:choose-2": ["stealth"] }, { "class:skirmisher:3:subclass-0": "scholar" }]) {
      const r = applyLevel(c, { class: "skirmisher" }, { hp: { method: "average" }, choices }, reg); if ("error" in r) throw new Error(r.error); c = r.value;
    }
    const plan = planLevel(c, "skirmisher", reg, { "class:skirmisher:4:asi-0": { feat: "free-tongue" } });
    if ("error" in plan) throw new Error(plan.error);
    const step = plan.steps.find(x => x.kind === "pick" && x.what === "languages");
    if (!step || step.kind !== "pick") throw new Error("no language step");
    expect(step.options.map(o => o.id)).toContain("dwarvish");
    expect(step.options.some(o => o.id === "deep-speech" && o.name === "Deep Speech")).toBe(true);
    const choices: Record<string, unknown> = {}, root = document.createElement("div"); document.body.append(root);
    const ctl = { character: c, host: { registry: reg, notify: () => {} }, pickers: () => reg, pick: (k: string, v: unknown) => { choices[k] = v; draw(); } };
    const draw = () => { root.replaceChildren(pickPage(ctl, step, { choices, view: { featOpen: new Set(), spellQuery: "", featQuery: "" } })); };
    draw();
    expect(root.querySelector('[data-opt="dwarvish"]')).not.toBeNull();
    (root.querySelector('[data-opt="dwarvish"]') as HTMLElement).click();
    expect(choices[step.key]).toEqual(["dwarvish"]);
    const other = root.querySelector('input[type=text][data-act=other-language]') as HTMLInputElement;
    other.value = "Thieves Cant"; other.dispatchEvent(new Event("change", { bubbles: true }));
    expect(choices[step.key]).toEqual(["Thieves Cant"]);
  });

  it("languages already known, however written, are disabled in a language pick", () => {
    let c: Character = { ...newCharacter("Newbie"), abilities: abil, race: "marsh-heron", languages: ["ELVISH", "Thieves Cant"] };
    for (const choices of [{ "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] }, { "class:skirmisher:2:choose-2": ["stealth"] }, { "class:skirmisher:3:subclass-0": "scholar" }]) {
      const r = applyLevel(c, { class: "skirmisher" }, { hp: { method: "average" }, choices }, reg); if ("error" in r) throw new Error(r.error); c = r.value;
    }
    const plan = planLevel(c, "skirmisher", reg, { "class:skirmisher:4:asi-0": { feat: "free-tongue" } });
    if ("error" in plan) throw new Error(plan.error);
    const step = plan.steps.find(x => x.kind === "pick" && x.what === "languages");
    if (!step || step.kind !== "pick") throw new Error("no language step");
    const dis = (id: string) => step.options.find(o => o.id === id)?.disabled;
    expect(dis("deep-speech")).toBe("Already have");
    expect(dis("elvish")).toBe("Already have");
    expect(dis("dwarvish")).toBeUndefined();
  });
});
