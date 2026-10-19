// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

/** An invented race whose breath is built the same way as a homebrew Breath Weapon: a DC, a damage scale, uses, and a save action. */
function setup(mobile: boolean) {
  const r = mechanicsRegistry();
  const bad = (p: unknown) => { if (p) throw new Error(JSON.stringify(p)); };
  bad(r.add("vault", "race", { name: "Test Drake", speed: 30, grants: [
    { op: "dc", id: "spark-dc", name: "Spark Breath", abil: "con" },
    { op: "scale", id: "scale-spark-breath-damage", name: "Spark Breath Damage", values: { 1: "1d6", 5: "2d6" } },
    { op: "resource", id: "res-spark-breath", name: "Spark Breath", max: 2, reset: "long" },
    { op: "feature", id: "spark-breath", name: "Spark Breath", text: "A crackling cone.",
      action: { name: "Spark Breath", cost: { resource: "Spark Breath" }, save: { abil: "dex", dc: "Spark Breath" }, damage: "{spark-breath-damage}", text: "15-foot cone, half on a success." } },
    { op: "feature", id: "calm-mind", name: "Calm Mind", text: "Steady yourself.", action: { name: "Calm Mind" } },
  ] }, { path: "drake.md" }));
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(4) };
  const p = parseNote({ ...tester, race: "test-drake" }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  return { ctl, root, notices, q, host };
}

for (const mobile of [false, true]) describe(`feature attacks in the Attacks card (${mobile ? "phone" : "desktop"})`, () => {
  it("a breath weapon shows with its save DC, damage dice, uses left and a Use button", () => {
    const s = setup(mobile);
    const row = s.q('[data-feature="attacks"] [data-feature-attack="race:test-drake:spark-breath"]') ?? s.q('[data-feature="attacks"] [data-feature-attack]');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("Spark Breath");
    expect(row.textContent).toContain("DC 12 DEX");          // 8 + Con 2 + prof 2
    expect(row.textContent).toContain("1d6");
    expect(row.textContent).toContain("2 of 2 left");
    expect(row.textContent).toContain("15-foot cone");
  });
  it("Use spends a use and rolls the damage", () => {
    const s = setup(mobile);
    const row = () => s.q('[data-feature="attacks"] [data-feature-attack]');
    (row().querySelector('[data-act="use-feature-attack"]') as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(row().textContent).toContain("1 of 2 left");
    expect(s.host.log.some(e => e.title === "Spark Breath damage")).toBe(true);
  });
  it("a feature with an action but no attack or damage stays out of Attacks", () => {
    const s = setup(mobile);
    expect(s.q('[data-feature="attacks"]').textContent).not.toContain("Calm Mind");
  });
});
