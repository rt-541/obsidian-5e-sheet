// @vitest-environment jsdom
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

const brawler = { type: "5e-class", name: "Brawler", hitDie: 10, saves: ["str", "con"], levels: { 1: [] } };
const tester = {
  type: "5e-character", schema: 1, name: "Tester", race: "hill-dwarf", background: "acolyte",
  classes: [{ class: "brawler", level: 1 }],
  abilities: { str: 14, dex: 10, con: 14, int: 8, wis: 10, cha: 10 },
  proficiencies: { saves: ["str", "con"], skills: [], expertise: [] },
  hp: { max: 12, current: 12, temp: 0 }, hitDice: {}, deathSaves: { successes: 0, failures: 0 },
  spellSlots: {}, spells: [], inventory: [], coins: {}, resources: [], conditions: {},
};

afterEach(() => document.body.replaceChildren());

for (const layout of LAYOUTS) describe(`rest words (${layout})`, () => {
  it("the Settings card and Customize use the same wording for the two-way rest control", () => {
    const s = sheet(layout, thalia);
    const opts = s.all('[data-feature="settings"] [data-rest-mode]');
    expect(opts.map(o => o.textContent)).toEqual(["Normal (short and long)", "Hexploration (night's rest)"]);
    expect(s.root.querySelector('[data-feature="rests"] [data-rest-mode]')).toBeNull();
    s.ctl.setEditing(true); s.ctl.open({ kind: "customize" });
    const panel = s.q('[data-panel="customize"]');
    expect(panel.querySelectorAll("[data-rest-mode]")).toHaveLength(2);
    expect(panel.querySelector("[data-rest-hint]")!.textContent).toBe("Short and long rests.");
    expect(panel.querySelector('[data-rule="rest-standard"]')).toBeNull();   // no second, independent switch
    expect(panel.textContent).not.toMatch(/Excursion|Standard rests/);
  });
  it("the night's rest panel uses label-left switch rows for both options", () => {
    const s = sheet(layout, thalia); s.ctl.setRule("rest-excursion", true); s.ctl.open({ kind: "rest", id: "night" });
    const rows = s.all('[data-panel="rest"] .fe-rest-opt');
    expect(rows.map(r => r.firstElementChild!.textContent)).toEqual(["Same place as last night", "Resting in a safe haven (GM decides)"]);
    expect(rows.every(r => r.lastElementChild!.matches("button.fe-switch[role=switch]"))).toBe(true);
    expect(s.q('[data-panel="rest"] input[type="checkbox"]')).toBeNull();
  });
});
it("a long rest preview lists spell slots only for a character who has slots", () => {
  const s = sheet("desktop", tester, [brawler]);
  expect(s.ctl.restPreview("long")).not.toContain("All spell slots");
  expect(sheet("desktop", thalia).ctl.restPreview("long")).toContain("All spell slots");
});
