// @vitest-environment jsdom
import { spell, setup, LAYOUTS } from "./spells-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());
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
