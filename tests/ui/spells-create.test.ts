// @vitest-environment jsdom
import type { Registry } from "../../src/content/registry";
import type { SpellData } from "../../src/content/types/spell";
import { spellType } from "../../src/content/types/spell";
import type { SheetHost } from "../../src/ui/controller";
import { saveSpell, updateSpell, type SpellIO } from "../../src/obsidian/save-spell";
import { setup, spell, LAYOUTS } from "./spells-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());

/** A vault in memory behind the same host methods the plugin provides. */
function vaultHost(r: Registry): Partial<SheetHost> & { files: Map<string, string>; fms: Map<string, Record<string, unknown>>; opened: string[] } {
  const files = new Map<string, string>(), fms = new Map<string, Record<string, unknown>>(), opened: string[] = [];
  const io: SpellIO = { exists: p => files.has(p), ensureFolder: async () => undefined,
    create: async (p, t) => { files.set(p, t); fms.set(p, JSON.parse(/^---\n([\s\S]*?)\n---/.exec(t)![1])); },
    processFrontMatter: async (p, fn) => { const fm = fms.get(p); if (!fm) return false; fn(fm); return true; }, replaceBody: async (p, b) => { files.set(p + "#body", b); } };
  const stringify = (o: Record<string, unknown>) => JSON.stringify(o);
  return { files, fms, opened, saveSpell: d => saveSpell({ registry: r, io, compendiumFolder: "compendium/5e", stringify }, d),
    updateSpell: (t, d) => updateSpell({ registry: r, io }, t, d), openNote: p => { opened.push(p); } };
}
const fill = (s: ReturnType<typeof setup>, label: string, v: string) => { const el = s.q(`[data-form="spell"] [aria-label="${label}"]`) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
const noSpells = { ...thalia, spells: [] };

describe.each(LAYOUTS)("create a spell on the %s layout", layout => {
  const withVault = (note: object = noSpells, extra?: (r: Registry) => void) => {
    let vh!: ReturnType<typeof vaultHost>;
    const s = setup(note, layout, r => (vh = vaultHost(r)), extra);
    return { ...s, vh };
  };

  it("fills in the form in plain words, saves a valid homebrew note and adds the spell to the character", async () => {
    const s = withVault();
    s.ctl.open({ kind: "add-spell" });
    s.click('[data-act="create-spell"]');
    expect(s.q('[data-form="spell"]')).not.toBeNull();
    fill(s, "Spell name", "Frost Needle");
    fill(s, "Spell level", "2"); fill(s, "School of magic", "Evocation");
    fill(s, "Casting time", "1 action"); fill(s, "Range", "60 feet"); fill(s, "Duration", "1 minute");
    s.click('[data-act="toggle-m"]'); fill(s, "Material", "a sliver of ice");
    s.click('[data-act="toggle-concentration"]'); s.click('[data-act="toggle-ritual"]');
    s.click('[data-form="spell"] [data-class="cleric"]');
    fill(s, "Short description", "A needle of ice flies at a creature you can see.");
    fill(s, "Damage dice", "2d6"); fill(s, "Damage type", "cold");
    s.click('[data-act="toggle-save"]'); fill(s, "Saving throw ability", "con"); fill(s, "On a successful save", "half");
    s.click('[data-act="save-spell"]');
    await s.tick(); await s.tick();
    const path = "compendium/5e/Homebrew/Spells/Frost Needle.md";
    const fm = s.vh.fms.get(path)!;
    expect(fm).toMatchObject({ type: "5e-spell", id: "frost-needle", level: 2, components: ["V", "S", "M"], material: "a sliver of ice", concentration: true, ritual: true, classes: ["cleric"],
      damage: { type: "cold", bySlot: { "2": "2d6" } }, save: { abil: "con", onSuccess: "half" } });
    expect(spellType.validate({ ...fm, rules: "x" }).errors).toEqual([]);
    expect(s.vh.files.get(path)).toContain("A needle of ice flies at a creature you can see.");
    expect(s.r.get<SpellData>("spell", "frost-needle")!.sourceName).toBe("Homebrew");
    expect(s.ctl.character!.spells.map(x => x.id)).toContain("frost-needle");
    expect(s.notices).toContain("Added Frost Needle");
    expect(s.q('[data-panel="add-spell"] .fe-search')).not.toBeNull();   // back on the list, panel still open
  });

  it("names every problem in plain words and saves nothing", async () => {
    const s = withVault();
    s.ctl.open({ kind: "add-spell" }); s.click('[data-act="create-spell"]');
    s.click('[data-act="save-spell"]');
    await s.tick();
    const msg = s.q(".fe-cf-problems").textContent!;
    expect(msg).toContain("Give the spell a name.");
    expect(msg).toContain("Describe what the spell does.");
    expect(s.vh.files.size).toBe(0);
    expect(s.ctl.character!.spells).toEqual([]);
  });

  it("an empty search offers to create the searched name", async () => {
    const s = withVault();
    s.ctl.open({ kind: "add-spell" });
    s.type(".fe-search", "moon pebble");
    expect(s.q('[data-panel="add-spell"] [data-empty]').textContent).toBe("No spell called 'moon pebble'.");
    expect(s.q('[data-act="create-from-query"]').textContent).toBe("Create 'moon pebble' as a new spell");
    s.click('[data-act="create-from-query"]');
    expect((s.q('[data-form="spell"] [aria-label="Spell name"]') as HTMLInputElement).value).toBe("Moon Pebble");
  });

  it("a taken name gets (2) and the character gets the new spell, not the old one", async () => {
    const s = withVault(noSpells);
    s.ctl.open({ kind: "add-spell" }); s.click('[data-act="create-spell"]');
    fill(s, "Spell name", "Test Spark"); fill(s, "Short description", "Another spark.");
    s.click('[data-act="save-spell"]'); await s.tick(); await s.tick();
    expect(s.ctl.character!.spells.map(x => x.id)).toEqual(["test-spark-2"]);
    expect(s.vh.files.has("compendium/5e/Homebrew/Spells/Test Spark (2).md")).toBe(true);
  });
});

describe.each(LAYOUTS)("import a spell on the %s layout", layout => {
  const text = "Dusk Lamp\nSource: Nowhere\nAbjuration cantrip\nCasting Time: 1 action\nRange: Self\nComponents: V, S\nDuration: 1 hour\nA soft light rings you.";
  it("reads pasted text into the form, lists lines it could not read, and saves", async () => {
    let vh!: ReturnType<typeof vaultHost>;
    const s = setup(noSpells, layout, r => (vh = vaultHost(r)));
    s.ctl.open({ kind: "add-spell" }); s.click('[data-act="import-spell"]');
    s.click('[data-act="read-spell"]');
    expect(s.q('[role="alert"]').textContent).toBe("Paste a spell first.");
    const area = s.q('[aria-label="Spell text"]') as HTMLTextAreaElement; area.value = text; area.dispatchEvent(new Event("input", { bubbles: true }));
    s.click('[data-act="read-spell"]');
    expect((s.q('[aria-label="Spell name"]') as HTMLInputElement).value).toBe("Dusk Lamp");
    expect((s.q('[aria-label="Spell level"]') as HTMLSelectElement).value).toBe("0");
    expect(s.q("[data-unread]").textContent).toContain("Source: Nowhere");
    s.click('[data-act="save-spell"]'); await s.tick(); await s.tick();
    expect(vh.fms.get("compendium/5e/Homebrew/Spells/Dusk Lamp.md")).toMatchObject({ id: "dusk-lamp", level: 0, school: "Abjuration" });
    expect(s.ctl.character!.spells.map(x => x.id)).toContain("dusk-lamp");
  });

  it("Copy template puts a blank 5e-spell block on the clipboard, or shows it to copy by hand", async () => {
    const s = setup(noSpells, layout, r => vaultHost(r));
    s.ctl.open({ kind: "add-spell" }); s.click('[data-act="import-spell"]');
    s.click('[data-act="copy-spell-template"]'); await s.tick();
    expect((s.q('[aria-label="Spell template"]') as HTMLTextAreaElement).value).toContain("```5e-spell");   // jsdom has no clipboard: shown for hand copying
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { copied = t; } } });
    s.click('[data-act="copy-spell-template"]'); await s.tick(); await s.tick();
    expect(copied.startsWith("```5e-spell\n")).toBe(true);
    expect(s.notices.at(-1)).toContain("Template copied");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
});

describe.each(LAYOUTS)("edit spells you made on the %s layout", layout => {
  const mine = (r: Registry) => {
    const fm = { type: "5e-spell", id: "wisp-lamp", ...spell("Wisp Lamp", { classes: ["cleric"], damage: { type: "fire", bySlot: { "1": "1d4" } } }) };
    r.add("vault", "spell", fm, { path: "compendium/5e/Homebrew/Spells/Wisp Lamp.md", body: "A tiny light.", sourceName: "Homebrew" });
  };
  const note = { ...thalia, spells: [{ id: "wisp-lamp", prepared: false }, { id: "acid-arrow", prepared: false }] };
  const openMenu = (s: ReturnType<typeof setup>, id: string) => { s.click('[data-tab="spells"]'); s.click(`[data-spell="${id}"] [data-act="spell-menu"]`); };

  it("Edit spell opens the form prefilled, saves into the same note and keeps the id", async () => {
    let vh!: ReturnType<typeof vaultHost>;
    const s = setup(note, layout, r => (vh = vaultHost(r)), mine);
    vh.fms.set("compendium/5e/Homebrew/Spells/Wisp Lamp.md", { type: "5e-spell", id: "wisp-lamp", tags: ["keep"], ...spell("Wisp Lamp", { classes: ["cleric"], damage: { type: "fire", bySlot: { "1": "1d4" } } }) });
    openMenu(s, "wisp-lamp");
    s.click('[data-menu="wisp-lamp"] [data-act="menu-edit"]');
    expect(s.q('[data-panel="add-spell"] .fe-panel-head').textContent).toContain("Edit spell");
    expect((s.q('[aria-label="Spell name"]') as HTMLInputElement).value).toBe("Wisp Lamp");
    expect((s.q('[aria-label="Damage dice"]') as HTMLInputElement).value).toBe("1d4");
    expect((s.q('[aria-label="Short description"]') as HTMLTextAreaElement).value).toBe("A tiny light.");
    fill(s, "Damage dice", "2d4"); fill(s, "Range", "Self");
    s.click('[data-act="save-spell"]'); await s.tick(); await s.tick();
    const fm = vh.fms.get("compendium/5e/Homebrew/Spells/Wisp Lamp.md")!;
    expect(fm).toMatchObject({ id: "wisp-lamp", tags: ["keep"], range: "Self", damage: { type: "fire", bySlot: { "1": "2d4" } } });
    expect(vh.files.size).toBe(0);   // body untouched
    expect(s.r.get<SpellData>("spell", "wisp-lamp")!.data.damage!.bySlot).toEqual({ "1": "2d4" });
    expect(s.notices).toContain("Saved changes to Wisp Lamp");
    expect(s.ctl.panel).toBeFalsy();
    expect(s.ctl.character!.spells.map(x => x.id)).toEqual(["wisp-lamp", "acid-arrow"]);
  });

  it("a library or SRD spell offers Make my own copy, with mechanics but not the rules text, saved as a new homebrew note", async () => {
    let vh!: ReturnType<typeof vaultHost>;
    const s = setup(note, layout, r => (vh = vaultHost(r)), mine);
    openMenu(s, "acid-arrow");
    const m = s.q('[data-menu="acid-arrow"]');
    expect(m.querySelector('[data-act="menu-edit"]')).toBeNull();
    expect(m.textContent).toContain("from a book");
    s.click('[data-menu="acid-arrow"] [data-act="menu-copy"]');
    expect(s.q('[data-panel="add-spell"] .fe-panel-head').textContent).toContain("Make my own copy");
    expect((s.q('[aria-label="Spell name"]') as HTMLInputElement).value).toBe("Acid Arrow (my version)");
    expect((s.q('[aria-label="Damage dice"]') as HTMLInputElement).value).toBe("4d4");
    expect((s.q('[data-form="spell"] [aria-label="Damage type"]') as HTMLSelectElement).value).toBe("acid");
    expect((s.q('[aria-label="Short description"]') as HTMLTextAreaElement).value).toBe("");
    fill(s, "Short description", "My own green arrow of goo.");
    s.click('[data-act="save-spell"]'); await s.tick(); await s.tick();
    const fm = vh.fms.get("compendium/5e/Homebrew/Spells/Acid Arrow (my version).md")!;
    expect(fm).toMatchObject({ id: "acid-arrow-my-version", source: "Homebrew", damage: { type: "acid", bySlot: { "2": "4d4" } } });
    expect(s.r.get<SpellData>("spell", "acid-arrow")!.sourceName).not.toBe("Homebrew");   // the original is untouched
    expect(s.ctl.character!.spells.map(x => x.id)).toContain("acid-arrow-my-version");
  });

  it("Open note opens a vault spell's note, and the menu has none for bundled spells", () => {
    let vh!: ReturnType<typeof vaultHost>;
    const s = setup(note, layout, r => (vh = vaultHost(r)), mine);
    openMenu(s, "wisp-lamp");
    s.click('[data-menu="wisp-lamp"] [data-act="menu-open-note"]');
    expect(vh.opened).toEqual(["compendium/5e/Homebrew/Spells/Wisp Lamp.md"]);
    s.click('[data-spell="acid-arrow"] [data-act="spell-menu"]');
    expect(s.q('[data-menu="acid-arrow"] [data-act="menu-open-note"]')).toBeNull();
  });
});
