// @vitest-environment jsdom
import { Registry, type Entry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { addToSheet, BROWSER_ROWS, CompendiumController, mountCompendium, type CompendiumHost } from "../../src/ui/compendium";
import { thalia } from "../fixtures/notes";

const spell = (name: string, extra: object = {}) => ({ name, level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V"], duration: "Instantaneous", classes: ["wizard"], ...extra });
const creature = { name: "Dune Wyrmling", size: "Large", ctype: "dragon", ac: 14, hp: { average: 30, formula: "4d10+8" }, speed: { walk: 30 }, abilities: { str: 14, dex: 10, con: 14, int: 8, wis: 10, cha: 8 }, cr: "1" };
const BODIES: Record<string, string> = {
  "compendium/5e/WotC/Spells/Tome Flash.md": "# Tome Flash\n\n*1st-level evocation*\n\n**Casting Time:** 1 action\n**Range:** 30 feet\n**Components:** V\n**Duration:** Instantaneous\n\nA bright bolt. The target takes 3d8 fire damage.",
  "compendium/5e/WotC/Creatures/Dune Wyrmling.md": "# Dune Wyrmling\n\n*Large dragon*\n\nA scaly thing <img src=x onerror=alert(1)> with **bold** text.\n\n## Actions\n\n***Bite.*** *Melee Weapon Attack:* +4 to hit. *Hit:* 7 (1d8 + 3) piercing damage.",
  "compendium/5e/WotC/Items/Odd Thing.md": "# Odd Thing\n\nAn oddly shaped thing from a book.",
};

function world() {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const reads: string[] = [];
  r.setBodyReader(async p => { reads.push(p); return BODIES[p] ?? ""; });
  r.add("vault", "spell", spell("Tome Flash"), { path: "compendium/5e/WotC/Spells/Tome Flash.md", sourceName: "WotC", library: true, book: "PHB" });
  r.add("vault", "creature", creature, { path: "compendium/5e/WotC/Creatures/Dune Wyrmling.md", sourceName: "WotC", library: true, book: "MM", needsReview: ["ac differs from the printed page"] });
  r.add("vault", "item", { name: "Odd Thing", kind: "not-a-kind" }, { path: "compendium/5e/WotC/Items/Odd Thing.md", sourceName: "WotC", library: true, book: "DMG" });
  r.add("vault", "spell", spell("Roll Blast"), { path: "compendium/5e/Roll20/Spells/Roll Blast.md", sourceName: "Roll20", body: "Roll twenty." });
  r.add("vault", "spell", spell("Home Bolt"), { path: "compendium/5e/Homebrew/Spells/Home Bolt.md", sourceName: "Homebrew", body: "A homebrew bolt." });
  r.add("vault", "class", { name: "Rollmancer", hitDie: 8, saves: ["int", "wis"], levels: { 1: [{ op: "feature", name: "Roll", text: "Roll it." }] } }, { path: "compendium/5e/Roll20/Classes/Rollmancer/Rollmancer.md", sourceName: "Roll20" });
  return { r, reads };
}

function setup(mobile: boolean, opts: { target?: string; switches?: Record<string, boolean>; registry?: Registry } = {}) {
  const w = world(), r = opts.registry ?? w.r;
  const opened: string[] = [], added: string[] = [];
  const host: CompendiumHost = { registry: r, switches: () => opts.switches, target: () => opts.target, targetEdition: () => undefined,
    add: (e: Entry, o) => { added.push(`${e.type}:${e.id}:${e.sourceName}:${o.companionKind}`); return `Added ${e.name}`; }, openNote: p => { opened.push(p); } };
  const ctl = new CompendiumController(host), root = document.createElement("div");
  document.body.append(root); const mounted = mountCompendium(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const rows = () => qa(".fe-comp-list [data-id]").map(b => `${b.dataset.type}:${b.dataset.id}`);
  const type = (v: string) => { const el = q('[data-field="search"]') as HTMLInputElement; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { ...w, r, ctl, root, q, qa, click, rows, type, opened, added, mounted, flush };
}
afterEach(() => document.body.replaceChildren());

describe.each([["desktop", false], ["mobile", true]] as const)("compendium browser on the %s layout", (_n, mobile) => {
  it("has source tabs (All, WotC (SRD), WotC, user sources) and the nine type tabs with counts", () => {
    const s = setup(mobile);
    expect(s.qa("[data-source]").filter(b => b.classList.contains("fe-tab")).map(b => b.dataset.source)).toEqual(["all", "WotC (SRD)", "WotC", "Homebrew", "Roll20"]);
    expect(s.qa("[data-type].fe-tab").map(b => b.dataset.type)).toEqual(["class", "subclass", "race", "background", "feat", "spell", "item", "creature", "condition"]);
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="Roll20"]');
    expect(s.rows()).toEqual(["spell:roll-blast"]);
    expect(s.q('.fe-tab[data-type="spell"]').textContent).toBe("Spells (1)");
    s.click('.fe-tab[data-source="all"]');   // every source at once; narrow by name, the list shows one page
    s.type("home"); expect(s.rows()).toEqual(["spell:home-bolt"]);
    s.type("tome"); expect(s.rows()).toEqual(["spell:tome-flash"]);
    s.type("cure wounds"); expect(s.rows()).toContain("spell:cure-wounds");
  });

  it("search filters by name and the search box keeps focus state across redraws", () => {
    const s = setup(mobile);
    s.click('.fe-tab[data-type="spell"]'); s.type("home");
    expect(s.rows()).toEqual(["spell:home-bolt"]);
    expect(s.q('[data-field="search"]')).toBe(s.root.querySelector('[data-field="search"]'));
    expect((s.q('[data-field="search"]') as HTMLInputElement).value).toBe("home");
    s.type("zzzz"); expect(s.q('[data-note="count"]').textContent).toBe("0 entries"); expect(s.root.textContent).toContain("No entries match.");
  });

  it("badges: source with the book sub-label, needs review, reference only (with the count)", () => {
    const s = setup(mobile);
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="WotC"]');
    expect(s.q('[data-id="tome-flash"] .fe-src').textContent).toBe("WotC · PHB");
    s.click('.fe-tab[data-type="creature"]');
    const wyr = s.q('[data-id="dune-wyrmling"]');
    expect(wyr.querySelector('[data-badge="review"]')!.textContent).toBe("needs review");
    expect((wyr.querySelector('[data-badge="review"]') as HTMLElement).title).toContain("printed page");
    s.click('.fe-tab[data-type="item"]');
    expect(s.q('[data-id="odd-thing"] [data-badge="reference"]').textContent).toBe("reference only");
    expect(s.q('[data-note="reference-count"]').textContent).toContain("1 library note not usable");
    expect(s.r.problems()).toEqual([]);
  });

  it("opens a detail card with the source badge, reads a library body only when the entry is opened, and fills in the damage", async () => {
    const s = setup(mobile);
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="WotC"]');
    expect(s.reads).toEqual([]);
    s.click('[data-id="tome-flash"]'); await s.flush();
    expect(s.reads).toEqual(["compendium/5e/WotC/Spells/Tome Flash.md"]);
    const card = s.q('[data-pane="detail"] .fe-detail');
    expect(card.querySelector(".fe-name")!.textContent).toBe("Tome Flash");
    expect(card.querySelector(".fe-src")!.textContent).toBe("WotC · PHB");
    expect(card.textContent).toContain("Damage: 3d8 fire");
  });

  it("renders note text as text, never as HTML", async () => {
    const s = setup(mobile);
    s.click('.fe-tab[data-type="creature"]'); s.click('[data-id="dune-wyrmling"]'); await s.flush();
    expect(s.q('[data-pane="detail"] .fe-rules').textContent).toContain("<img src=x onerror=alert(1)>");
    expect(s.root.querySelector("img")).toBeNull();
  });

  it("reference-only entries show their text and cannot be added", async () => {
    const s = setup(mobile, { target: "Thalia" });
    s.click('.fe-tab[data-type="item"]'); s.click('[data-id="odd-thing"]'); await s.flush();
    expect(s.q('[data-pane="detail"]').textContent).toContain("An oddly shaped thing from a book.");
    expect(s.q('[data-pane="detail"]').textContent).toContain("reference only");
    expect(s.root.querySelector('[data-act="add-to-character"]')).toBeNull();
  });

  it("Open note is offered for vault entries only", () => {
    const s = setup(mobile);
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="Roll20"]'); s.click('[data-id="roll-blast"]');
    s.click('[data-act="open-note"]');
    expect(s.opened).toEqual(["compendium/5e/Roll20/Spells/Roll Blast.md"]);
    s.click('.fe-tab[data-source="WotC (SRD)"]'); s.type("cure wounds");
    // the source switch hid the Roll20 pick, so the stale card is gone and the phone is already on the list (no back button)
    s.click('[data-id="cure-wounds"]');
    expect(s.root.querySelector('[data-act="open-note"]')).toBeNull();   // bundled SRD content has no note
  });

  it("Add to character goes to the target sheet; without one the button is disabled with the reason", () => {
    const none = setup(mobile);
    none.click('.fe-tab[data-type="spell"]'); none.click('.fe-tab[data-source="Homebrew"]'); none.click('[data-id="home-bolt"]');
    const btn = none.q('[data-act="add-to-character"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true); expect(none.q('[data-note="add-blocked"]').textContent).toBe("Open a character sheet first");
    const s = setup(mobile, { target: "Thalia" });
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="Homebrew"]'); s.click('[data-id="home-bolt"]');
    s.click('[data-act="add-to-character"]');
    expect(s.added).toEqual(["spell:home-bolt:Homebrew:familiar"]);
    expect(s.q('[data-note="status"]').textContent).toBe("Added Home Bolt");
  });

  it("creatures are added as companions of the chosen kind", async () => {
    const s = setup(mobile, { target: "Thalia" });
    s.click('.fe-tab[data-type="creature"]'); s.click('[data-id="dune-wyrmling"]'); await s.flush();
    const sel = s.q('[data-field="companion-kind"]') as HTMLSelectElement; sel.value = "steed"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    s.click('[data-act="add-to-character"]');
    expect(s.added).toEqual(["creature:dune-wyrmling:WotC:steed"]);
  });

  it("sources switched off in the target's campaign are dimmed with a note and cannot be added, but stay visible", () => {
    const s = setup(mobile, { target: "Thalia", switches: { Roll20: false } });
    s.click('.fe-tab[data-type="spell"]'); s.type("blast");
    const row = s.q('[data-id="roll-blast"]');
    expect(row.classList.contains("is-off")).toBe(true);
    expect(row.querySelector('[data-badge="off"]')!.textContent).toContain("off in this campaign");
    s.type("home"); expect(s.q('[data-id="home-bolt"]').classList.contains("is-off")).toBe(false);
    s.type("blast"); s.click('[data-id="roll-blast"]');
    expect((s.q('[data-act="add-to-character"]') as HTMLButtonElement).disabled).toBe(true);
    expect(s.q('[data-note="add-blocked"]').textContent).toBe("Off in this campaign");
  });

  it("follows registry changes (moving a note between sources updates the list live)", () => {
    const s = setup(mobile);
    s.r.onChange(() => s.ctl.emit());
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="Roll20"]');
    expect(s.rows()).toEqual(["spell:roll-blast"]);
    s.r.add("vault", "spell", spell("Roll Blast"), { path: "compendium/5e/Homebrew/Spells/Roll Blast.md", sourceName: "Homebrew", body: "Moved." });
    s.r.removePath("compendium/5e/Roll20/Spells/Roll Blast.md");
    expect(s.rows()).toEqual([]);
    s.click('.fe-tab[data-source="Homebrew"]');
    expect(s.rows()).toEqual(["spell:home-bolt", "spell:roll-blast"]);
  });
});

describe("layout parity", () => {
  it("both layouts offer the same tabs, rows and actions; mobile shows the detail as its own screen with a way back", async () => {
    const run = async (mobile: boolean) => {
      const s = setup(mobile, { target: "Thalia" });
      const out: unknown[] = [s.qa(".fe-tab").map(b => b.textContent)];
      s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="WotC"]'); out.push(s.rows());
      s.click('[data-id="tome-flash"]'); await s.flush();
      out.push(s.qa("[data-act]").map(b => b.dataset.act).filter(a => a !== "comp-back"), s.q('[data-pane="detail"]').textContent!.replace("Back to list", ""));
      if (mobile) { expect(s.root.querySelector('[data-pane="list"]')).toBeNull(); s.click('[data-act="comp-back"]'); expect(s.root.querySelector('[data-pane="list"]')).not.toBeNull(); }
      else expect(s.root.querySelector('[data-pane="list"]')).not.toBeNull();
      return out;
    };
    expect(await run(true)).toEqual(await run(false));
  });

  it("is marked fe-mobile or fe-desktop like the sheet", () => {
    expect(setup(true).root.className).toContain("fe-mobile"); expect(setup(false).root.className).toContain("fe-desktop");
  });
});

describe("large libraries", () => {
  it("lists 3,500 synthetic notes without reading a body, drawing at most one page of rows", () => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    let reads = 0; r.setBodyReader(async () => { reads++; return ""; });
    for (let i = 0; i < 3500; i++) r.add("vault", "spell", spell(`Library Spell ${String(i).padStart(4, "0")}`), { path: `compendium/5e/WotC/Spells/S${i}.md`, sourceName: "WotC", library: true, book: "PHB" });
    const s = setup(false, { registry: r });
    const t0 = performance.now();
    s.click('.fe-tab[data-type="spell"]');
    expect(s.rows().length).toBe(BROWSER_ROWS);
    expect(s.q('[data-note="count"]').textContent).toMatch(/^3\d{3} entries$/);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(reads).toBe(0);
  });
});

describe("add to character", () => {
  const sheet = (r: Registry, note: object = thalia) => {
    const saved: unknown[] = [];
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(2) };
    const p = parseNote(note); if (p.kind === "none") throw new Error("x");
    return { ctl: new SheetController(host, p), saved };
  };
  const entry = (r: Registry, type: string, id: string, source: string) => r.getAll(type, id).find(e => e.sourceName === source)!;

  it("puts a spell in the spell list, an item in the inventory and a creature in the companions of the chosen kind", () => {
    const { r } = world(); r.add("vault", "item", { name: "Roll Rod", kind: "wondrous" }, { path: "compendium/5e/Roll20/Items/Roll Rod.md", sourceName: "Roll20" });
    const { ctl } = sheet(r);
    expect(addToSheet(ctl, entry(r, "spell", "home-bolt", "Homebrew"), "familiar", "Thalia")).toBe("Added Home Bolt to Thalia.");
    expect(ctl.character!.spells.map(x => x.id)).toContain("home-bolt");
    expect(addToSheet(ctl, entry(r, "item", "roll-rod", "Roll20"), "familiar", "Thalia")).toContain("Added Roll Rod");
    expect(ctl.character!.inventory.map(x => x.id)).toContain("roll-rod");
    expect(addToSheet(ctl, entry(r, "creature", "dune-wyrmling", "WotC"), "steed", "Thalia")).toContain("Added Dune Wyrmling");
    expect(ctl.character!.companions.at(-1)).toMatchObject({ creature: "dune-wyrmling", name: "Dune Wyrmling", kind: "steed" });
  });

  it("says which version the sheet uses when another source outranks the one browsed", () => {
    const { r } = world();
    r.add("vault", "spell", spell("Cure Wounds"), { path: "compendium/5e/Homebrew/Spells/Cure Wounds.md", sourceName: "Homebrew", body: "Mine." });
    const { ctl } = sheet(r);
    expect(addToSheet(ctl, entry(r, "spell", "cure-wounds", "WotC (SRD)"), "familiar", "Thalia")).toContain("The sheet uses the Homebrew version");
  });

  it("refuses a read-only sheet and types that cannot be added", () => {
    const { r } = world();
    const { ctl } = sheet(r, { ...thalia, hp: "not a hp" });
    expect(ctl.writable).toBe(false);
    expect(addToSheet(ctl, entry(r, "spell", "home-bolt", "Homebrew"), "familiar", "Thalia")).toBe("Could not add Home Bolt to Thalia.");
    const ok = sheet(r).ctl;
    expect(addToSheet(ok, entry(r, "class", "rollmancer", "Roll20"), "familiar", "Thalia")).toBe("Only items, spells and creatures can be added");
  });
});
