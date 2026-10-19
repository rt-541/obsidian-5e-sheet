// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import type { NoteIO } from "../../src/obsidian/create-note";
import { saveCreature } from "../../src/obsidian/save-creature";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { matchCreatures } from "../../src/ui/companion-ui";
import { mountSheet } from "../../src/ui/sheet";
import { renderStatblock } from "../../src/ui/statblock-card";
import { STATBLOCK_TEMPLATE } from "../../src/content/statblock";
import { thalia } from "../fixtures/notes";

const LAYOUTS = ["desktop", "tablet", "mobile"] as const;
const BLOCK = `Test Crawler
Small beast, unaligned
Armor Class 14 (natural armor)
Hit Points 13 (3d6 + 3)
Speed 25 ft., climb 25 ft.
STR DEX CON INT WIS CHA
8 (-1) 15 (+2) 12 (+1) 3 (-4) 11 (+0) 5 (-3)
Challenge 1/8 (25 XP)
Wall Crawl. Walks on walls.
Actions
Nip. Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) piercing damage.`;

function setup(layout: (typeof LAYOUTS)[number], withSave = true) {
  const registry = new Registry(); registerBuiltinTypes(registry); loadSrd(registry);
  for (const n of ["Test Crawler", "Test Spider", "Glass Beetle", "Spiderling Swarm", "Crab", "Giant Test Spider"])
    registry.add("vault", "creature", { name: n, size: "Small", ctype: "beast", ac: 11, hp: { average: 5, formula: "1d8" }, speed: { walk: 20 }, cr: "1/8", abilities: { str: 5, dex: 5, con: 5, int: 1, wis: 5, cha: 1 } }, { path: `h/${n}.md`, sourceName: "Homebrew" });
  const files = new Map<string, string>();
  const io: NoteIO = { exists: p => files.has(p), ensureFolder: async () => undefined, create: async (p, t) => { files.set(p, t); } };
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(3),
    ...(withSave ? { saveCreature: async d => (await saveCreature({ registry, io, compendiumFolder: "compendium/5e", stringify: o => JSON.stringify(o) }, d)).id } : {}) };
  const p = parseNote(thalia); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  ctl.open({ kind: "add-companion" });
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (el: HTMLElement, v: string) => { (el as HTMLInputElement).value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const pick = (el: HTMLElement, v: string) => { (el as HTMLSelectElement).value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
  const search = () => q('[aria-label="Search creatures"]');
  const names = () => all(".fe-companion-panel .fe-inv .fe-inv-name").map(e => e.textContent);
  const flush = () => new Promise<void>(r => setTimeout(r, 0));
  return { ctl, host, registry, files, notices, root, q, all, click, type, pick, search, names, flush };
}

describe("matchCreatures", () => {
  it("puts names starting with the query first, then other matches, case-insensitively", () => {
    const l = ["Giant Spider", "Spider", "Spiderling", "Wolf Spider", "Wolf"].map(name => ({ name }));
    expect(matchCreatures(l, "SPI").map(x => x.name)).toEqual(["Spider", "Spiderling", "Giant Spider", "Wolf Spider"]);
    expect(matchCreatures(l, "zzz")).toEqual([]);
  });
});

describe.each(LAYOUTS)("companion picker (%s)", layout => {
  it("searches creatures, keeps focus while typing, and adds the one picked", () => {
    const s = setup(layout);
    const input = s.search(); expect(input).not.toBeNull();
    s.type(input, "spider");
    expect(s.names()[0]).toMatch(/^Spider/);
    expect(s.names()).toContain("Giant Test Spider");
    expect(s.names()).not.toContain("Glass Beetle");
    expect(s.search()).toBe(input);   // the box was not rebuilt, so focus is not lost
    const row = s.all(".fe-companion-panel .fe-inv").find(r => r.textContent!.startsWith("Test Spider"))!;
    expect(row.querySelector(".fe-faint")!.textContent).toBe("Small beast · CR 1/8 · AC 11 · HP 5");
    s.type(s.q('[aria-label="Nickname (optional)"]'), "Webby");
    s.pick(s.q('[aria-label="Kind of companion"]'), "steed");
    s.click('[data-creature="test-spider"]');
    expect(s.ctl.character!.companions.at(-1)).toMatchObject({ creature: "test-spider", name: "Webby", kind: "steed" });
  });

  it("labels the kinds in plain words with the same stored values", () => {
    const s = setup(layout);
    const opts = [...(s.q('[aria-label="Kind of companion"]') as HTMLSelectElement).options].map(o => [o.value, o.text]);
    expect(opts).toEqual([["familiar", "Familiar"], ["companion", "Animal companion"], ["steed", "Steed"], ["summon", "Summon"], ["sidekick", "Sidekick"]]);
  });

  it("caps the list at 80 and says how many more", () => {
    const s = setup(layout);
    for (let i = 0; i < 90; i++) s.registry.add("vault", "creature", { name: `Zed ${String(i).padStart(2, "0")}`, ac: 10, hp: { average: 1, formula: "" }, abilities: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, { path: `z/${i}.md` });
    s.ctl.emit();
    s.type(s.search(), "zed");
    expect(s.names()).toHaveLength(80);
    expect(s.q(".fe-companion-panel").textContent).toContain("10 more: narrow the search.");
  });

  it("says so when nothing matches and offers custom and import", () => {
    const s = setup(layout);
    s.type(s.search(), "dragonfly");
    expect(s.q("[data-empty]").textContent).toBe("No creature called 'dragonfly'.");
    expect(s.q('[data-act="custom-creature"]')).not.toBeNull(); expect(s.q('[data-act="import-statblock"]')).not.toBeNull();
  });

  it("adds a custom creature through the form, saves the note and adds the companion", async () => {
    const s = setup(layout);
    s.type(s.search(), "dragonfly"); s.click('[data-act="custom-creature"]');
    const form = s.q('[data-form="creature"]');
    expect((form.querySelector('[aria-label="Creature name"]') as HTMLInputElement).value).toBe("Dragonfly");   // the search words prefill the name
    s.click('[data-act="save-creature"]');
    expect(s.q(".fe-cf-problems").textContent).toContain("Armor Class must be a whole number");
    expect(s.files.size).toBe(0);
    s.type(form.querySelector('[aria-label="Armor Class"]') as HTMLElement, "12");
    s.type(form.querySelector('[aria-label="Hit Points (average)"]') as HTMLElement, "7");
    s.click('[data-act="add-attack"]');
    s.type(form.querySelector('[aria-label="Attack 1 name"]') as HTMLElement, "Nip");
    s.type(form.querySelector('[aria-label="Attack 1 to-hit bonus"]') as HTMLElement, "+4");
    s.type(form.querySelector('[aria-label="Attack 1 damage dice"]') as HTMLElement, "1d4 + 2");
    s.pick(form.querySelector('[aria-label="Attack 1 damage type"]') as HTMLElement, "piercing");
    s.click('[data-act="add-trait"]');
    s.type(form.querySelector('[aria-label="Trait 1 name"]') as HTMLElement, "Hover");
    s.type(form.querySelector('[aria-label="Trait 1 text"]') as HTMLElement, "Stays in the air.");
    s.type(s.q('[aria-label="Nickname (optional)"]'), "Zip");
    s.click('[data-act="save-creature"]'); await s.flush(); await s.flush();
    const [path, text] = [...s.files.entries()][0];
    expect(path).toBe("compendium/5e/Homebrew/Creatures/Dragonfly.md");
    expect(text).toContain("Hover");
    expect(s.ctl.character!.companions.at(-1)).toMatchObject({ creature: "dragonfly", name: "Zip", kind: "familiar" });
    expect(s.registry.get<any>("creature", "dragonfly")!.data.attacks[0]).toMatchObject({ name: "Nip", toHit: 4, damage: "1d4+2 piercing" });
    expect(s.notices.at(-1)).toBe("Saved Dragonfly to your Homebrew creatures.");
    expect(s.ctl.panel).toBeFalsy();
  });

  it("removes an attack row and works out Hit Points from the dice when the average is empty", async () => {
    const s = setup(layout);
    s.click('[data-act="custom-creature"]');
    const form = s.q('[data-form="creature"]');
    s.click('[data-act="add-attack"]'); s.click('[data-act="add-attack"]');
    expect(s.all("[data-attack]")).toHaveLength(2);
    s.click('[data-attack="0"] [data-act="remove-attack"]');
    expect(s.all("[data-attack]")).toHaveLength(1);
    s.type(form.querySelector('[aria-label="Creature name"]') as HTMLElement, "Quick Bug");
    s.type(form.querySelector('[aria-label="Armor Class"]') as HTMLElement, "10");
    s.type(form.querySelector('[aria-label="Hit point dice"]') as HTMLElement, "2d8 + 2");
    s.type(form.querySelector('[aria-label="Attack 1 damage dice"]') as HTMLElement, "1d4");
    s.click('[data-act="save-creature"]');
    expect(s.q(".fe-cf-problems").textContent).toContain("Attack 1 needs a name.");
    s.click('[data-attack="0"] [data-act="remove-attack"]');
    s.click('[data-act="save-creature"]'); await s.flush(); await s.flush();
    expect(s.registry.get<any>("creature", "quick-bug")!.data.hp).toEqual({ average: 11, formula: "2d8+2" });
  });

  it("imports a pasted stat block into the prefilled form, listing what it could not read", async () => {
    const s = setup(layout);
    s.click('[data-act="import-statblock"]');
    s.click('[data-act="read-statblock"]');
    expect(s.q('[role="alert"]').textContent).toBe("Paste a stat block first.");
    s.type(s.q('[aria-label="Stat block text"]'), BLOCK.replace("Challenge", "this line is nonsense\nChallenge"));
    s.click('[data-act="read-statblock"]');
    const form = s.q('[data-form="creature"]');
    expect((form.querySelector('[aria-label="Creature name"]') as HTMLInputElement).value).toBe("Test Crawler");
    expect((form.querySelector('[aria-label="Armor Class"]') as HTMLInputElement).value).toBe("14");
    expect((form.querySelector('[aria-label="Attack 1 damage dice"]') as HTMLInputElement).value).toBe("1d6+2");
    expect(s.q("[data-unread]").textContent).toContain("this line is nonsense");
    s.click('[data-act="save-creature"]'); await s.flush(); await s.flush();
    // "Test Crawler" is already in the registry: the new note is renamed, never overwritten
    expect([...s.files.keys()]).toEqual(["compendium/5e/Homebrew/Creatures/Test Crawler (2).md"]);
    expect(s.ctl.character!.companions.at(-1)).toMatchObject({ creature: "test-crawler-2", name: "Test Crawler (2)" });
  });

  it("Copy template copies the fenced template, or shows it to select by hand", async () => {
    const s = setup(layout);
    s.click('[data-act="import-statblock"]');
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { copied = t; } } });
    s.click('[data-act="copy-template"]'); await s.flush();
    expect(copied).toBe(STATBLOCK_TEMPLATE); expect(copied.startsWith("```5e-statblock")).toBe(true);
    expect(s.notices.at(-1)).toContain("Template copied");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    s.click('[data-act="copy-template"]'); await s.flush();
    expect((s.q('[aria-label="Stat block template"]') as HTMLTextAreaElement).value).toBe(STATBLOCK_TEMPLATE);
  });

  it("hides the custom and import buttons when the host cannot save creatures", () => {
    const s = setup(layout, false);
    s.type(s.search(), "dragonfly");
    expect(s.q('[data-act="custom-creature"]')).toBeNull();
  });
});

describe("5e-statblock card", () => {
  it("renders the creature and adds it to the compendium, saying where it went", async () => {
    const el = document.createElement("div"); let got = "";
    renderStatblock(el, "```5e-statblock\n" + BLOCK + "\n```", async d => { got = d.name; return { name: d.name, path: "compendium/5e/Homebrew/Creatures/Test Crawler.md" }; });
    expect(el.textContent).toContain("Armor Class 14 (natural armor)");
    expect(el.textContent).toContain("Wall Crawl.");
    expect(el.textContent).toContain("Nip. +4 to hit.");
    (el.querySelector('[data-act="add-to-compendium"]') as HTMLElement).click(); await new Promise(r => setTimeout(r, 0));
    expect(got).toBe("Test Crawler");
    expect(el.querySelector(".fe-sb-status")!.textContent).toContain("Saved Test Crawler to compendium/5e/Homebrew/Creatures/Test Crawler.md");
  });

  it("lists problems in plain words and will not add an unfinished block", () => {
    const el = document.createElement("div");
    renderStatblock(el, "Half Done\nwhat is this line", async () => { throw new Error("should not be called"); });
    expect(el.querySelector("[data-unread]")!.textContent).toContain("what is this line");
    expect(el.querySelector("[data-problems]")!.textContent).toContain("Armor Class must be a whole number");
    expect((el.querySelector('[data-act="add-to-compendium"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
