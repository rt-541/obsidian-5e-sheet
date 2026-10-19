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
  return { ctl, root, q, click };
}

function builderSetup() {
  const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => {}, createNote: async p => p, open: () => {}, close: () => {} };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, false);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, q, click };
}

const classIdx = (ctl: BuilderController) => ctl.pages().findIndex(p => p.id === "class");
const counter = (q: (s: string) => HTMLElement) => q(".fe-levelup .fe-kv .fe-faint").textContent ?? "";

const counterParts = (q: (s: string) => HTMLElement) => {
  const m = /^Step (\d+) of (\d+)$/.exec(counter(q));
  if (!m) throw new Error("no counter: " + JSON.stringify(counter(q)));
  return { page: +m[1], total: +m[2] };
};

/** Answer the step on the current page the way a player would: first enabled option, filled counts. */
function answerPage(q: (s: string) => HTMLElement) {
  const fire = (el: Element, type = "click") => el.dispatchEvent(type === "click" ? new MouseEvent("click", { bubbles: true }) : new Event(type, { bubbles: true }));
  const body = () => q(".fe-lu-body");
  const need = /\((\d+) of (\d+)\)/.exec(body().querySelector(".fe-muted")?.textContent ?? "");
  const inputs = [...body().querySelectorAll<HTMLInputElement>("input.fe-search[placeholder]")];
  if (need && inputs.length) { inputs.forEach((inp, i) => { inp.value = "Invented " + (i + 1); fire(inp, "change"); }); return; }
  const wanted = need ? +need[2] : 1;
  for (let i = 0; i < wanted; i++) {
    const opt = [...body().querySelectorAll<HTMLButtonElement>("button[data-opt], button[data-mode='abilities']")].find(b => !b.disabled && !b.classList.contains("is-on"));
    if (opt) fire(opt);
  }
  for (let i = 0; i < 2; i++) {
    const plus = [...body().querySelectorAll<HTMLButtonElement>("button[aria-label^='More ']")].find(b => !b.disabled);
    if (plus) fire(plus);
  }
  for (let i = 0; i < 12; i++) {
    const add = [...body().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Add" && !b.disabled);
    if (!add) break;
    fire(add);
  }
}

/** Walk every page by clicking Next after answering it; returns the counter seen on each page. */
function walk(root: HTMLElement, q: (s: string) => HTMLElement, nextAct: string) {
  const seen: { page: number; total: number }[] = [];
  for (let guard = 0; guard < 30; guard++) {
    answerPage(q);
    seen.push(counterParts(q));
    const next = root.querySelector<HTMLButtonElement>(`[data-act="${nextAct}"]`);
    if (!next || next.hidden || next.disabled) break;
    next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  return seen;
}

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
    s.ctl.go(classIdx(s.ctl)); s.click('[data-class="skirmisher"]');
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
    s.click('[data-race="skink"]'); s.ctl.go(classIdx(s.ctl)); s.click('[data-class="skirmisher"]');
    const total = s.ctl.pages().length, totals = new Set<string>();
    for (let i = classIdx(s.ctl); i < total; i++) { s.ctl.go(i); totals.add(counter(s.q).split(" of ")[1]); }
    expect([...totals]).toEqual([String(total)]);
  });

  it("answering every level-up step never changes the step total", () => {
    const s = levelUpSetup();
    s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]');
    const seen = walk(s.root, s.q, "lu-next");
    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen.map(x => x.total)).size).toBe(1);
    expect(seen.map(x => x.page)).toEqual(seen.map((_, i) => i + 1));
    expect(seen[seen.length - 1].page).toBe(seen[0].total);
  });

  it("answering every builder step never changes the step total", () => {
    const s = builderSetup();
    s.click('[data-race="skink"]'); s.ctl.go(classIdx(s.ctl)); s.click('[data-class="skirmisher"]');
    s.ctl.go(0);
    const seen = walk(s.root, s.q, "bd-next");
    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen.map(x => x.total)).size).toBe(1);
    expect(seen[seen.length - 1].page).toBe(seen[0].total);
  });

  it("the sticky footer paints over the panel's bottom padding", () => {
    expect(css).toMatch(/\.fe-lu-nav \{[^}]*position: sticky; bottom: 0;[^}]*z-index: 2;[^}]*box-shadow: 0 18px 0 var\(--fe-surface\)/);
    expect(css).toMatch(/\.fe-builder \{[^}]*--fe-surface: var\(--modal-background, var\(--background-primary\)\)/);
    expect(css.indexOf(".fe-builder { --fe-surface")).toBeGreaterThan(css.indexOf(".fe-sheet { --fe-surface"));
  });
});
