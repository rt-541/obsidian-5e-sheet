// @vitest-environment jsdom
import type { Registry } from "../../src/content/registry";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { deriveCharacter } from "../../src/core/derive";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { summaryOf, traitGroups } from "../../src/ui/traits-ui";
import { homebrewRegistry } from "../fixtures/homebrew";
import { thalia } from "../fixtures/notes";

const vex = {
  type: "5e-character", schema: 1, name: "Vex", race: "skink", subrace: "cave-skink", background: "cartographer", feats: ["tough-mind"],
  classes: [{ class: "skirmisher", subclass: "scholar", level: 5 }],
  abilities: { str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 8 }, hp: { max: 30, current: 30, temp: 0 },
  choices: { "race:skink:choose-2": ["elvish"] },
};

function setup(note: object, mobile: boolean, reg: Registry = homebrewRegistry(), collapsed: string[] = []) {
  const saved: string[][] = [];
  const host: SheetHost = { registry: reg, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3), collapsedGroups: () => collapsed, setCollapsedGroups: ids => saved.push(ids) };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div"); document.body.append(root); mountSheet(root, ctl, mobile);
  return { ctl, root, saved, q: (s: string) => root.querySelector(s) as HTMLElement, all: (s: string) => [...root.querySelectorAll<HTMLElement>(s)] };
}
const groups = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-feature="traits"] [data-group]')].map(g => g.dataset.group);
const uses = (s: { ctl: SheetController }) => (s.ctl.value as { uses: Record<string, number> }).uses;

describe("features and traits card", () => {
  it("groups by source in order: race, class, subclass, background, feats", () => {
    for (const mobile of [false, true]) {
      const s = setup(vex, mobile);
      expect(groups(s.root)).toEqual(["race", "class:skirmisher", "subclass:scholar", "background", "feats"]);
      const heads = s.all('[data-feature="traits"] .fe-trait-head').map(e => e.textContent);
      expect(heads[0]).toContain("Race · Skink (Cave Skink)");
      expect(heads[1]).toContain("Class · Skirmisher 5");
      expect(heads[2]).toContain("Subclass · Scholar");
      expect(heads[3]).toContain("Background · Cartographer");
      expect(heads[4]).toContain("Feats");
    }
  });
  it("class rows are in level order with Lv N and carry the detail ref", () => {
    const s = setup(vex, false), rows = s.all('[data-group="class:skirmisher"] .fe-trait');
    expect(rows.map(r => r.querySelector(".fe-inv-name")!.textContent)).toEqual(["Quick Wits", "Sudden Strike"]);
    expect(rows[0].textContent).toContain("Lv 1"); expect(rows[1].textContent).toContain("Lv 3");
    expect(rows[0].textContent).toContain("Use Intelligence for armor class.");
    expect((rows[0].querySelector("[data-ref]") as HTMLElement).dataset.ref).toMatch(/^feature:class:skirmisher:1:/);
  });
  it("a feat is one row; a feature with an action has a Use button that spends its resource", () => {
    const s = setup(vex, false);
    expect(s.all('[data-group="feats"] .fe-trait')).toHaveLength(1);
    expect(s.q('[data-group="feats"] .fe-inv-name').dataset.ref).toBe("feat:tough-mind");
    const row = s.all('[data-group="class:skirmisher"] .fe-trait')[1];
    expect(row.querySelectorAll(".fe-pip").length).toBeGreaterThan(0);        // Focus pips
    const before = uses(s).focus ?? 0;
    [...row.querySelectorAll("button")].find(b => b.textContent === "Use")!.click();
    expect(uses(s).focus).toBe(before + 1);
  });
  it("pips on the card spend the same resource as the Features tab", () => {
    const s = setup(vex, false);
    (s.q('[data-group="class:skirmisher"] [data-resource="focus"] .fe-pip') as HTMLElement).click();
    expect(uses(s).focus).toBe(1);
    expect(s.q('[data-feature="features"] [data-resource="focus"] .fe-pip.is-used')).not.toBeNull();
  });
  it("collapsing a group hides its rows, is remembered through the host, and defaults to expanded", () => {
    const s = setup(vex, true);
    expect(s.all('[data-group="race"] .fe-trait').length).toBeGreaterThan(0);
    s.q('[data-group="race"] .fe-trait-head').click();
    expect(s.all('[data-group="race"] .fe-trait')).toHaveLength(0); expect(s.saved.at(-1)).toEqual(["race"]);
    s.q('[data-group="race"] .fe-trait-head').click();
    expect(s.all('[data-group="race"] .fe-trait').length).toBeGreaterThan(0); expect(s.saved.at(-1)).toEqual([]);
    const again = setup(vex, false, homebrewRegistry(), ["feats"]);
    expect(again.all('[data-group="feats"] .fe-trait')).toHaveLength(0); expect(again.all('[data-group="race"] .fe-trait').length).toBeGreaterThan(0);
  });
  it("works for a legacy note (Thalia) on both layouts and the Features tab keeps its detail view", () => {
    for (const mobile of [false, true]) {
      const s = setup(thalia, mobile);
      expect(groups(s.root)).toContain("class:cleric");
      expect(s.q('[data-feature="features"]')).not.toBeNull();
    }
  });
  it("names render as text, never HTML", () => {
    const evil = homebrewRegistry([{ type: "5e-feat", name: "<img src=x onerror=1>", grants: [{ op: "feature", name: "<b>x</b>", text: "<script>1</script> Hi." }] }]);
    const id = evil.list("feat").find(e => e.name.startsWith("<img"))!.id;
    const s = setup({ ...vex, feats: [id] }, false, evil);
    expect(s.q('[data-feature="traits"]').textContent).toContain("<img src=x onerror=1>");
    expect(s.root.querySelector('[data-feature="traits"] img, [data-feature="traits"] script, [data-feature="traits"] b')).toBeNull();
  });
  it("summary is the first sentence, else the effects", () => {
    const row = (text: string | undefined, effects = {}) => ({ key: "k", source: "s", sourceKind: "class" as const, level: 1, name: "n", effects, ...(text ? { text } : {}) });
    expect(summaryOf(row("You rage. It lasts a minute.\n\nMore."))).toBe("You rage.");
    expect(summaryOf(row(undefined, { critRange: 19 }))).toContain("Crit on 19-20");
    expect(summaryOf(row("x".repeat(400))).length).toBeLessThanOrEqual(160);
  });
  it("traitGroups skips sources with no features", () => {
    const c = parseNote({ type: "5e-character", name: "Plain", classes: [], abilities: vex.abilities, hp: vex.hp });
    if (c.kind === "none" || c.value.type !== "5e-character") throw new Error("not a character");
    const reg = homebrewRegistry();
    expect(traitGroups(c.value, deriveCharacter(c.value, { registry: reg })!.progress.features, reg)).toEqual([]);
  });
});
