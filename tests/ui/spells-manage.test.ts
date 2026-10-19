// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import type { LayoutName } from "../../src/ui/layouts";
import { thalia } from "../fixtures/notes";

const spell = (name: string, extra: object = {}) => ({ name, level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V"], duration: "Instantaneous", classes: ["cleric"], ...extra });
export function setup(note: object, layout: LayoutName, hostExtra: Partial<SheetHost> = {}, extra?: (r: Registry) => void) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  r.add("vault", "spell", spell("Test Spark"), { path: "compendium/5e/Homebrew/Spells/Test Spark.md", sourceName: "Homebrew" });
  r.add("vault", "spell", spell("Glow Ward", { level: 0, classes: ["wizard"] }), { path: "compendium/5e/Homebrew/Spells/Glow Ward.md", sourceName: "Homebrew" });
  extra?.(r);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(11), body: "", ...hostExtra };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (sel: string, v: string) => { const el = q(sel) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const tick = () => new Promise<void>(res => setTimeout(res, 0));
  return { r, ctl, root, saved, notices, q, qa, click, type, tick };
}
afterEach(() => document.body.replaceChildren());
export const LAYOUTS: LayoutName[] = ["desktop", "tablet", "mobile"];
const noSpells = { ...thalia, spells: [] };

describe.each(LAYOUTS)("add spell on the %s layout", layout => {
  it("shows + Add spell in Play mode, also when the character has no spells", () => {
    const s = setup(noSpells, layout);
    s.click('[data-tab="spells"]');
    expect(s.ctl.editing).toBe(false);
    expect(s.q('[data-act="add-spell"]').textContent).toBe("+ Add spell");
    expect(s.q('[data-act="add-spell"]').classList.contains("mod-cta")).toBe(true);
    expect(s.q('[data-feature="spells"] [data-empty]').textContent).toContain("No spells yet. Add your first spell");
  });

  it("adds from search, tells the player, keeps the panel open and the search focused", async () => {
    const s = setup(noSpells, layout);
    s.click('[data-tab="spells"]'); s.click('[data-act="add-spell"]');
    const box = s.q('[data-panel="add-spell"] .fe-search') as HTMLInputElement;
    box.focus(); s.type('[data-panel="add-spell"] .fe-search', "test sp");
    expect(s.qa('[data-panel="add-spell"] [data-pick]').map(e => e.dataset.pick)).toEqual(["test-spark"]);
    s.click('[data-panel="add-spell"] [data-add="test-spark"]');
    expect(s.ctl.character!.spells.map(x => x.id)).toContain("test-spark");
    expect(s.notices).toContain("Added Test Spark");
    expect(s.q('[data-panel="add-spell"]')).not.toBeNull();
    await s.tick();
    expect(document.activeElement).toBe(s.q('[data-panel="add-spell"] .fe-search'));
    expect((s.q('[data-panel="add-spell"] .fe-search') as HTMLInputElement).value).toBe("test sp");
    const known = s.q('[data-panel="add-spell"] [data-known="test-spark"]') as HTMLButtonElement;
    expect(known.textContent).toBe("Known"); expect(known.disabled).toBe(true);
    expect(s.q('[data-panel="add-spell"] [data-add="test-spark"]')).toBeNull();
  });

  it("filters by the character's class lists until Show all spells is switched on, with level, school and class badges", () => {
    const s = setup(noSpells, layout);
    s.ctl.open({ kind: "add-spell" });
    s.type(".fe-search", "glow");
    expect(s.qa("[data-pick]")).toHaveLength(0);   // Glow Ward is a wizard spell; Thalia is a cleric
    s.click('[data-act="show-all"]');
    expect(s.qa("[data-pick]").map(e => e.dataset.pick)).toEqual(["glow-ward"]);
    const row = s.q('[data-pick="glow-ward"]');
    expect(row.querySelector('[data-badge="level"]')!.textContent).toBe("Cantrip");
    expect(row.querySelector('[data-badge="school"]')!.textContent).toBe("Evocation");
    expect(row.querySelector('[data-badge="class"]')!.textContent).toBe("Wizard");
  });

  it("caps long results with 'N more: keep typing'", () => {
    const s = setup(noSpells, layout, {}, r => { for (let i = 0; i < 100; i++) r.add("vault", "spell", spell(`Zed Mote ${String(i).padStart(3, "0")}`), { path: `z${i}.md`, sourceName: "Homebrew" }); });
    s.ctl.open({ kind: "add-spell" });
    s.type(".fe-search", "zed mote");
    expect(s.qa("[data-pick]")).toHaveLength(80);
    expect(s.q("[data-more]").textContent).toBe("20 more: keep typing.");
  });
});
