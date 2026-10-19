// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

/** An invented race whose breath is built the same way as a homebrew Breath Weapon: a DC, a damage scale, uses, and a save action. */
function setup(mobile: boolean, note: object = {}) {
  const r = mechanicsRegistry();
  const bad = (p: unknown) => { if (p) throw new Error(JSON.stringify(p)); };
  bad(r.add("vault", "race", { name: "Test Drake", speed: 30, grants: [
    { op: "dc", id: "spark-dc", name: "Spark Breath", abil: "con" },
    { op: "scale", id: "scale-spark-breath-damage", name: "Spark Breath Damage", values: { 1: "1d6", 5: "2d6" } },
    { op: "resource", id: "res-spark-breath", name: "Spark Breath", max: 2, reset: "long" },
    { op: "feature", id: "spark-breath", name: "Spark Breath", text: "A crackling cone.",
      action: { name: "Spark Breath", cost: { resource: "Spark Breath" }, save: { abil: "dex", dc: "Spark Breath" }, damage: "{spark-breath-damage}", text: "15-foot cone, half on a success." } },
    { op: "resource", id: "res-grit", name: "Grit", max: 3, reset: "short" },
    { op: "feature", id: "grit-jab", name: "Grit Jab", action: { name: "Grit Jab", cost: { resource: "Grit" }, damage: "1d4" } },
    { op: "feature", id: "grit-guard", name: "Grit Guard", action: { name: "Grit Guard", cost: { resource: "Grit" } } },
  ] }, { path: "drake.md" }));
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(4) };
  const p = parseNote({ ...tester, race: "test-drake", ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (el: Element | null) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, notices, q, click, host };
}
const res = (id: string) => `[data-feature="resources"] [data-resource="${id}"]`;

for (const mobile of [false, true]) describe(`Use next to a resource (${mobile ? "phone" : "desktop"})`, () => {
  it("a breath weapon's uses line has a Use button, and it is not listed in Attacks", () => {
    const s = setup(mobile);
    const row = s.q(res("spark-breath"));
    expect(row.textContent).toContain("2 of 2 left");
    expect(row.querySelector('[data-act="use-resource"]')!.textContent).toBe("Use");
    expect(s.q('[data-feature="attacks"]').textContent).not.toContain("Spark Breath");
  });
  it("Use spends a use, notes the save DC and rolls the damage for this level", () => {
    const s = setup(mobile);
    s.click(s.q(`${res("spark-breath")} [data-act="use-resource"]`));
    expect(s.q(res("spark-breath")).textContent).toContain("1 of 2 left");
    expect(s.host.log.some(e => e.title === "Spark Breath used" && e.detail.includes("DEX save DC 12"))).toBe(true);
    expect(s.host.log.some(e => e.title === "Spark Breath damage" && /^1d6/.test(e.detail))).toBe(true);
  });
  it("with nothing left the button is greyed out", () => {
    const s = setup(mobile, { uses: { "spark-breath": 2 } });
    expect((s.q(`${res("spark-breath")} [data-act="use-resource"]`) as HTMLButtonElement).disabled).toBe(true);
  });
  it("the name sits on the left and the pips and Use button stay together on the right", () => {
    const s = setup(mobile);
    const row = s.q(res("spark-breath")), ctlBox = row.querySelector(".fe-res-ctl")!;
    expect(row.children[0].classList.contains("fe-grow")).toBe(true);
    expect(ctlBox.querySelector('[data-act="use-resource"]')).not.toBeNull();
    expect(ctlBox.querySelector(".fe-pip, .fe-pips, .fe-barbox, .fe-muted")).not.toBeNull();
  });
  it("Rest is a card on the main page, not in the header", () => {
    const s = setup(mobile);
    expect(s.q('.fe-pinned [data-feature="rests"]')).toBeNull();
    const pane = s.q(`[data-pane="${mobile ? "combat" : "main"}"]`);
    expect(pane.querySelector('[data-feature="rests"] .fe-card-title')!.textContent).toBe("Rest");
  });
  it("a resource several actions spend gets one button per action, named after it", () => {
    const s = setup(mobile);
    expect([...s.q(res("grit")).querySelectorAll('[data-act="use-resource"]')].map(b => b.textContent)).toEqual(["Grit Jab", "Grit Guard"]);
  });
});
