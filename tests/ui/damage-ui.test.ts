// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

const landing = (n: number) => () => (n - 1) / 20 + 0.001;
function setup(note: object, mobile: boolean, rng: () => number = landing(10)) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  r.add("vault", "item", { name: "Fire ward", kind: "wondrous", effects: { resist: ["fire"] } }, { path: "a.md" });
  r.add("vault", "item", { name: "Steady heart", kind: "wondrous", effects: { conditionImmune: ["poisoned"] } }, { path: "e.md" });
  r.add("vault", "condition", { name: "Wasting fever", kind: "disease", effects: { modifiers: [{ target: "speed", value: -10 }] } }, { path: "d.md" });
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const choose = (sel: string, value: string) => { const el = q(sel) as HTMLSelectElement; el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); };
  return { r, ctl, root, saved, notices, q, click, choose };
}
const fresh = { ...thalia, conditions: {} };

for (const mobile of [false, true]) describe(`damage controls (${mobile ? "mobile" : "desktop"})`, () => {
  it("offer an optional damage type in plain words", () => {
    const s = setup(fresh, mobile);
    const sel = s.q('[data-feature="hp-controls"] select') as HTMLSelectElement;
    expect(sel.getAttribute("aria-label")).toBe("Damage type (optional)");
    expect([...sel.options].map(o => o.textContent).slice(0, 3)).toEqual(["Any type", "Acid", "Bludgeoning"]);
  });
  it("a typed hit is adjusted for resistance and the player is told why", () => {
    const s = setup({ ...fresh, inventory: [{ id: "fire-ward", equipped: true }] }, mobile);
    s.choose('[data-feature="hp-controls"] select', "fire");
    s.click('[data-feature="hp-controls"] .fe-btn');                                                                // Damage, amount 5
    expect((s.ctl.value as Character).hp.current).toBe(29);
    expect(s.notices).toEqual(["Fire damage: 5 is halved to 2 (resistance from Fire ward)."]);
  });
  it("damage with no type is untouched", () => {
    const s = setup({ ...fresh, inventory: [{ id: "fire-ward", equipped: true }] }, mobile);
    s.click('[data-feature="hp-controls"] .fe-btn');
    expect((s.ctl.value as Character).hp.current).toBe(26); expect(s.notices).toEqual([]);
  });
});

describe("keeping concentration", () => {
  const conc = { ...fresh, concentration: "bless" };
  it("damage while concentrating shows the save to make, with a roll button", () => {
    const s = setup(conc, false);
    s.click('[data-feature="hp-controls"] .fe-btn');
    const box = s.q('[data-feature="concentration"]');
    expect(box.textContent).toContain("Make a Constitution save to keep concentrating (DC 10)");
    expect(box.querySelector('[data-act="concentration-roll"]')).not.toBeNull();
  });
  it("a passing roll keeps the spell and clears the prompt", () => {
    const s = setup(conc, false, landing(15));
    s.click('[data-feature="hp-controls"] .fe-btn'); s.click('[data-act="concentration-roll"]');
    expect((s.ctl.value as Character).concentration).toBe("bless");
    expect(s.q('[data-feature="concentration"]').textContent).not.toContain("Make a Constitution save");
    expect(s.notices.at(-1)).toBe("Concentration kept: Bless continues.");
    expect(s.ctl.lastRoll!.title).toBe("Concentration save (DC 10)");
  });
  it("a failing roll ends the spell and says so", () => {
    const s = setup(conc, true, landing(2));
    s.click('[data-feature="hp-controls"] .fe-btn'); s.click('[data-act="concentration-roll"]');
    expect((s.ctl.value as Character).concentration).toBeUndefined();
    expect(s.notices.at(-1)).toBe("Concentration lost: Bless ends.");
  });
  it("the prompt goes away when the spell ends another way", () => {
    const s = setup(conc, false);
    s.click('[data-feature="hp-controls"] .fe-btn'); s.click('[data-act="end-concentration"]');
    expect(s.q('[data-feature="concentration"]').textContent).not.toContain("Make a Constitution save");
  });
  it("dropping to 0 shows the Unconscious condition and ends concentration without a prompt", () => {
    const s = setup({ ...conc, hp: { max: 43, current: 3, temp: 0 } }, false);
    s.click('[data-feature="hp-controls"] .fe-btn');
    expect((s.ctl.value as Character).conditions.unconscious).toBe(1);
    expect(s.q('[data-feature="concentration"]').textContent).not.toContain("DC 10");
    expect((s.ctl.value as Character).concentration).toBeUndefined();
  });
});

describe("conditions panel: diseases and immunities", () => {
  const open = (s: ReturnType<typeof setup>) => s.click('[data-feature="conditions"] .fe-chip-add');
  it("diseases are listed in their own group and can be applied and removed", () => {
    const s = setup(fresh, false); open(s);
    expect(s.q('[data-panel="conditions"] [data-group="diseases"]').textContent).toContain("Wasting fever");
    expect(s.q('[data-panel="conditions"] [data-group="conditions"]').textContent).not.toContain("Wasting fever");
    s.click('[data-cond="wasting-fever"] .fe-switch');
    expect((s.ctl.value as Character).conditions["wasting-fever"]).toBe(1);
    s.click('[data-cond="wasting-fever"] .fe-switch');
    expect((s.ctl.value as Character).conditions["wasting-fever"]).toBeUndefined();
  });
  it("an immunity stops the condition from being added and says so in words", () => {
    const s = setup({ ...fresh, inventory: [{ id: "steady-heart", equipped: true }] }, false); open(s);
    s.click('[data-cond="poisoned"] .fe-switch');
    expect((s.ctl.value as Character).conditions.poisoned).toBeUndefined();
    expect(s.notices.at(-1)).toBe("Can't be poisoned: Steady heart protects against it.");
  });
});
