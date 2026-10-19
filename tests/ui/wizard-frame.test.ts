// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { newCharacter, parseNote, writeInto, type Character } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { stepCounter } from "../../src/ui/levelup-ui";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const css = readFileSync("styles.css", "utf8");
const reg = homebrewRegistry([]);
const abil = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 };
const fresh = (): Character => ({ ...newCharacter("Newbie"), abilities: abil });

function levelUpSetup() {
  const fm: Record<string, unknown> = { type: "5e-character", name: "Newbie" }; writeInto(fm, fresh());
  const host: SheetHost = { registry: reg, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(fm); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, false);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, q, click };
}

function builderSetup() {
  const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => {}, createNote: async p => p, open: () => {}, close: () => {} };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, false);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, q, click };
}

const counter = (q: (s: string) => HTMLElement) => q(".fe-levelup .fe-kv .fe-faint").textContent ?? "";

describe("wizard frame", () => {
  it("stepCounter shows nothing until the total is known", () => {
    expect(stepCounter(2, 7, true)).toBe("Step 3 of 7");
    expect(stepCounter(0, 2, false)).toBe("");
  });

  it("the level-up counter appears after the class pick and never changes total while paging", () => {
    const s = levelUpSetup();
    s.click('[data-act="level-up"]');
    expect(counter(s.q)).toBe("");
    s.click('[data-class="skirmisher"]');
    const first = counter(s.q);
    expect(first).toMatch(/^Step 1 of \d+$/);
    const totals = [first.split(" of ")[1]];
    for (let i = 1; i < 12; i++) {
      s.ctl.setLevelUp({ page: i });
      const m = /^Step (\d+) of (\d+)$/.exec(counter(s.q));
      if (!m) throw new Error("no counter: " + counter(s.q));
      totals.push(m[2]);
      if (+m[1] === +m[2]) break;
    }
    expect(totals.length).toBeGreaterThan(2);
    expect(new Set(totals).size).toBe(1);
  });

  it("the builder keeps Create on the footer after Back", () => {
    const s = builderSetup();
    s.click('[data-race="skink"]');
    s.ctl.go(3); s.click('[data-class="skirmisher"]');
    const lastPage = s.ctl.pages().length - 1;
    s.ctl.go(lastPage); s.click('[data-act="bd-back"]'); s.ctl.go(lastPage);
    const nav = s.q(".fe-lu-nav");
    expect([...nav.querySelectorAll("button")].map(b => b.dataset.act)).toEqual(["bd-back", "bd-create"]);
    expect(s.root.querySelectorAll('[data-act="bd-create"]')).toHaveLength(1);
    expect(s.q(".fe-lu-body").querySelector('[data-act="bd-create"]')).toBeNull();
  });

  it("the builder counter appears once a class is picked and holds its total", () => {
    const s = builderSetup();
    expect(counter(s.q)).toBe("");
    s.click('[data-race="skink"]'); s.ctl.go(3); s.click('[data-class="skirmisher"]');
    const total = s.ctl.pages().length, totals = new Set<string>();
    for (let i = 3; i < total; i++) { s.ctl.go(i); totals.add(counter(s.q).split(" of ")[1]); }
    expect([...totals]).toEqual([String(total)]);
  });

  it("the sticky footer paints over the panel's bottom padding", () => {
    expect(css).toMatch(/\.fe-lu-nav \{[^}]*position: sticky; bottom: 0;[^}]*z-index: 2;[^}]*box-shadow: 0 18px 0 var\(--fe-surface\)/);
    expect(css).toMatch(/\.fe-builder \{[^}]*--fe-surface: var\(--modal-background, var\(--background-primary\)\)/);
    expect(css.indexOf(".fe-builder { --fe-surface")).toBeGreaterThan(css.indexOf(".fe-sheet { --fe-surface"));
  });
});
