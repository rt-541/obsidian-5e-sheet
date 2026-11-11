// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

function setup(note: object, mobile: boolean) {
  const r = mechanicsRegistry();
  r.add("vault", "feat", { name: "Extra Swings", grants: [{ op: "effect", effects: { attacks: 2, critDice: [{ extra: 1 }] } }] }, { path: "es.md" });
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [] };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, saved, notices, q, click };
}

for (const mobile of [false, true]) describe(`toggle buttons (${mobile ? "mobile" : "desktop"})`, () => {
  it("every switch is a big labelled Start button with its cost in words", () => {
    const s = setup({}, mobile);
    const card = s.q('[data-toggle-card="fury"]');
    expect(s.q('[data-feature="toggles"]')).toBeTruthy(); expect(s.q('[data-feature="toggles"]').hidden).toBe(false);
    expect((card.querySelector("button") as HTMLElement).textContent).toBe("Start Fury");
    expect(card.textContent).toContain("Costs 1 Fury (2 of 2 left).");
    expect(card.textContent).toContain("Ends after a long rest.");
    expect(s.q('[data-toggle-card="high-stance"]').textContent).toContain("Only one of these can be on at a time.");
  });
  it("starting spends the cost, flips the button to End and says what changes in words", () => {
    const s = setup({}, mobile);
    s.click('[data-toggle="fury"]');
    const c = s.ctl.value as Character;
    expect(c.active.fury).toBe(true); expect(c.uses.fury).toBe(1);
    expect(s.notices).toEqual(["Fury started. 1 Fury spent."]);
    const card = s.q('[data-toggle-card="fury"]');
    expect(card.classList.contains("is-on")).toBe(true);
    expect((card.querySelector("button") as HTMLElement).textContent).toBe("End Fury");
    expect(card.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(card.textContent).toContain("Fury is on: Damage +2 for melee attacks and Strength attacks · Resist bludgeoning");
  });
  it("ending is free and puts the button back", () => {
    const s = setup({ active: { fury: true }, uses: { fury: 1 } }, mobile);
    s.click('[data-toggle="fury"]');
    const c = s.ctl.value as Character;
    expect(c.active.fury).toBeUndefined(); expect(c.uses.fury).toBe(1);
    expect((s.q('[data-toggle-card="fury"] button') as HTMLElement).textContent).toBe("Start Fury");
  });
  it("with nothing left it says so in words and does not start", () => {
    const s = setup({ uses: { fury: 2 } }, mobile);
    s.click('[data-toggle="fury"]');
    expect((s.ctl.value as Character).active.fury).toBeUndefined();
    expect(s.notices).toEqual(["No Fury left, so Fury can't start. Take a rest first."]);
  });
  it("starting one stance ends the other", () => {
    const s = setup({ active: { "high-stance": true } }, mobile);
    s.click('[data-toggle="low-stance"]');
    expect((s.ctl.value as Character).active).toEqual({ "low-stance": true });
    expect(s.notices).toEqual(["Low Stance started. High Stance ended."]);
  });
  it("a value switch shows its number with Less and More", () => {
    const s = setup({ active: { focus: 2 } }, mobile);
    const row = s.q('[data-toggle-value="focus"]');
    expect(row.textContent).toContain("Focus level: 2");
    const [less, more] = [...row.querySelectorAll("button")];
    more.click(); expect((s.ctl.value as Character).active.focus).toBe(3);
    more.click(); expect((s.ctl.value as Character).active.focus).toBe(3);   // the top of the range
    s.q('[data-toggle-value="focus"] button').click();
    expect((s.ctl.value as Character).active.focus).toBe(2);
    expect(less.textContent).toBe("Less");
  });
  it("a switch that is on but blocked says why", () => {
    const s = setup({ active: { careful: true }, inventory: [{ id: "chain-mail", equipped: true }] }, mobile);
    expect(s.q('[data-toggle-card="careful"]').textContent).toContain("On, but not working right now. It works only while: not in heavy armor.");
  });
  it("the name opens the full rules text", () => {
    const s = setup({}, mobile);
    s.click('[data-toggle-card="fury"] .fe-inv-name');
    expect(s.q('[data-panel="details"]').textContent).toContain("Strike harder.");
    expect(s.q('[data-panel="details"]').textContent).toContain("+2 damage");
  });
  it("a character with no switches gets no toggles section on screen", () => {
    const s = setup({ classes: [{ class: "fighter", level: 1 }] }, mobile);
    expect(s.q('[data-feature="toggles"]').hidden).toBe(true);
  });
});

for (const mobile of [false, true]) describe(`attacks card (${mobile ? "mobile" : "desktop"})`, () => {
  it("shows attacks per action and a Crit damage button", () => {
    const s = setup({ feats: ["extra-swings"], inventory: [{ id: "longsword", equipped: true }] }, mobile);
    expect(s.q(".fe-attacks-per").textContent).toBe("Attacks per action: 2");
    const crit = s.q('button[aria-label="Longsword critical hit damage"]');
    expect(crit.textContent).toBe("Crit"); expect(crit.title).toBe("Damage on a critical hit: 3d8+3 slashing");
    crit.click();
    expect(s.ctl.host.log[0].title).toBe("Longsword critical damage");
  });
  it("a plain character with one attack hides the line rather than say 1", () => {
    expect(setup({}, mobile).root.querySelector(".fe-attacks-per")).toBeNull();
  });
  it("the built-in Unarmed Strike is there", () => {
    const names = [...setup({}, mobile).root.querySelectorAll(".fe-attack .fe-grow")].map(e => e.textContent);
    expect(names).toContain("Unarmed Strike");
  });
});

for (const mobile of [false, true]) describe(`resources card (${mobile ? "mobile" : "desktop"})`, () => {
  it("lists derived class resources with how many are left", () => {
    const s = setup({ uses: { fury: 1 } }, mobile);
    expect(s.q('[data-feature="resources"] [data-resource="fury"]').textContent).toContain("Fury: 1 of 2 left");
  });
});
