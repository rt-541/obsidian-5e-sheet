// @vitest-environment jsdom
import { EDITIONS } from "../../src/core/edition";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import type { Entry } from "../../src/content/registry";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { addToSheet, CompendiumController, mountCompendium, type CompendiumHost } from "../../src/ui/compendium";
import { editionRegistry } from "../fixtures/editions";

afterEach(() => document.body.replaceChildren());
const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const note = (edition: string) => ({ type: "5e-character", schema: 1, name: "Pip", edition, abilities: SCORES, hp: { max: 12, current: 12, temp: 0 }, classes: [] });

async function setup(mobile = false, target?: "2014" | "2024") {
  const { r } = await editionRegistry();
  const added: string[] = [];
  let sheetCtl: SheetController | undefined;
  if (target) {
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3) };
    const p = parseNote(note(target)); if (p.kind === "none") throw new Error("x");
    sheetCtl = new SheetController(host, p);
  }
  const chost: CompendiumHost = {
    registry: r, switches: () => undefined, target: () => (sheetCtl ? "Pip" : undefined), targetEdition: () => target,
    add: (e: Entry, o) => { const m = addToSheet(sheetCtl!, e, o.companionKind, "Pip"); added.push(m); return m; }, openNote: () => {},
  };
  const ctl = new CompendiumController(chost), root = document.createElement("div");
  document.body.append(root); mountCompendium(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { r, ctl, root, q, qa, click, sheetCtl, added };
}

describe("compendium browser edition filter", () => {
  it("shows everything by default and filters by edition", async () => {
    const s = await setup();
    const all = s.r.listAll().filter(e => ["class"].includes(e.type)).length;
    expect(s.ctl.edition).toBe("all");
    expect(s.ctl.matches().length).toBe(all);
    expect(s.qa("button[data-edition]").map(b => b.dataset.edition)).toEqual(["all", ...EDITIONS]);
    expect(s.qa("button[data-edition]").every(b => b.getAttribute("type") === "button")).toBe(true);
    for (const ed of EDITIONS) {
      s.click(`button[data-edition="${ed}"]`);
      expect(s.ctl.edition).toBe(ed);
      expect(s.ctl.matches().length).toBeGreaterThan(0);
      expect(s.ctl.matches().every(e => e.edition === ed)).toBe(true);
      expect(s.q(`button[data-edition="${ed}"]`).getAttribute("aria-pressed")).toBe("true");
    }
    s.click('button[data-edition="all"]');
    expect(s.ctl.matches().length).toBe(all);
  });

  it("each row with an edition has a chip and homebrew has none", async () => {
    const s = await setup();
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="WotC 2024"]');
    const row = s.q('[data-id="nova"]');
    expect(row.querySelector(".fe-chip.fe-edition")!.textContent).toBe("2024");
    s.click('.fe-tab[data-source="WotC"]');
    expect(s.q('[data-id="hush"] .fe-chip.fe-edition')!.textContent).toBe("2014");
    s.click('.fe-tab[data-source="Homebrew"]');
    expect(s.q('[data-id="spark"]')).not.toBeNull();
    expect(s.qa(".fe-comp-list .fe-chip.fe-edition")).toEqual([]);
  });

  it("counts follow the filter", async () => {
    const s = await setup();
    s.click('.fe-tab[data-source="all"]');
    const spells = () => s.q('.fe-tab[data-type="spell"]').textContent;
    const every = s.ctl.counts().spell;
    s.click('button[data-edition="2024"]');
    const n2024 = s.r.listAll().filter(e => e.type === "spell" && e.edition === "2024").length;
    expect(spells()).toBe(`Spells (${n2024})`);
    expect(s.ctl.counts().spell).toBe(n2024);
    expect(n2024).toBeLessThan(every);
  });

  it("adding a 2014 spell to a 2024 sheet stores a qualified id and says so", async () => {
    const s = await setup(false, "2024");
    s.click('.fe-tab[data-type="spell"]'); s.click('.fe-tab[data-source="WotC"]');
    s.click('[data-id="hush"]'); s.click('[data-act="add-to-character"]');
    expect(s.sheetCtl!.character!.spells.map(x => x.id)).toContain("hush@2014");
    expect(s.ctl.status).toMatch(/2014 books/);
    // a 2024 entry on a 2024 sheet stays plain and says nothing about the other edition
    s.click('.fe-tab[data-source="WotC 2024"]'); s.click('[data-id="nova"]'); s.click('[data-act="add-to-character"]');
    expect(s.sheetCtl!.character!.spells.map(x => x.id)).toContain("nova");
    expect(s.ctl.status).not.toMatch(/books/);
  });

  it("filter buttons are 44 px targets on touch with a plugin-specific rule", async () => {
    const css = (await import("node:fs")).readFileSync("styles.css", "utf8");
    expect(css).toMatch(/button\.fe-ed-btn[^{]*\{[^}]*min-height: 44px/);
  });
});
