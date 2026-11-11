// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { EDITION_RULES } from "../../src/core/edition";
import { glossaryEntry, hitDiceRecharge } from "../../src/content/glossary";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { customizePanel } from "../../src/ui/customize-ui";
import { identityCard } from "../../src/ui/identity-cards";
import { traitGroups } from "../../src/ui/traits-ui";
import { homebrewRegistry } from "../fixtures/homebrew";
import { LAYOUTS, sheet } from "./review-helpers";

const note = (edition?: string) => ({ type: "5e-character", name: "Brann", race: "skink", subrace: "cave-skink", classes: [{ class: "skirmisher", level: 3 }], ...(edition ? { edition } : {}) });

for (const layout of LAYOUTS) {
  describe(`words that follow the edition on the ${layout} sheet`, () => {
    afterEach(() => document.body.replaceChildren());
    it("a 2024 sheet says Heroic Inspiration and Species; a 2014 sheet says Inspiration and Race", () => {
      const s24 = sheet(layout, note("2024")), s14 = sheet(layout, note("2014")), plain = sheet(layout, note());
      expect(s24.q('[data-feature="inspiration"]').textContent).toBe("Heroic Inspiration");
      expect(s14.q('[data-feature="inspiration"]').textContent).toBe("Inspiration");
      expect(plain.q('[data-feature="inspiration"]').textContent).toBe("Inspiration");
      const card = (s: typeof s24, ref: string) => identityCard(ref, s.ctl)!.textContent!;
      expect(card(s24, "race")).toContain("Species"); expect(card(s24, "race")).not.toContain("Race");
      expect(card(s24, "subrace")).toContain("Skink subrace");
      expect(card(s14, "race")).toContain("Race"); expect(card(s14, "race")).not.toContain("Species");
      expect(card(s14, "subrace")).toContain("Skink subrace");
    });
    it("the Hit Dice line says a long rest gives back all of them for 2024 and half for 2014", () => {
      const line = (s: ReturnType<typeof sheet>) => s.q('[data-feature="hit-dice"] .fe-hd-recharge').textContent!;
      expect(line(sheet(layout, note("2024")))).toBe(hitDiceRecharge(3, false, "2024"));
      expect(line(sheet(layout, note("2014")))).toBe(hitDiceRecharge(3, false, "2014"));
      expect(line(sheet(layout, note("2024")))).toContain("all");
      expect(line(sheet(layout, note()))).toContain("1 (half your total)");
    });
    it("the Traits heading says Species for a 2024 character", () => {
      const heading = (e?: string) => { const s = sheet(layout, note(e)); return traitGroups(s.ctl.character!, s.ctl.stats()!.progress.features, s.ctl.host.registry).find(g => g.id === "race")!.heading; };
      expect(heading("2024")).toBe("Species · Skink (Cave Skink)");
      expect(heading("2014")).toBe("Race · Skink (Cave Skink)");
      expect(heading()).toBe("Race · Skink (Cave Skink)");
    });
    it("the customize panel footnote says species for a 2024 sheet and race for a 2014 one", () => {
      const foot = (e?: string) => {
        const s = sheet(layout, { ...note(e), customize: { "feature:class:skirmisher:1:quick-wits": { toggle: { group: "g" } } } });
        s.ctl.setEditing(true); s.ctl.startCustomize({ kind: "feature", key: "class:skirmisher:1:quick-wits", name: "Quick Wits", pinRef: "feature:class:skirmisher:1:quick-wits" });
        return customizePanel(s.ctl, s.ctl.stats()!).querySelector(".fe-faint")!.textContent!;
      };
      expect(foot("2024")).toBe("Removes your changes. The class, species, feat or item note is never changed.");
      expect(foot("2014")).toBe("Removes your changes. The class, race, feat or item note is never changed.");
      expect(foot()).toBe(foot("2014"));
    });
  });
}

describe("edition words in text", () => {
  it("hitDiceRecharge follows the edition and 2014 keeps its text", () => {
    expect(hitDiceRecharge(6, false, "2024")).toContain("all");
    expect(hitDiceRecharge(6, false, "2014")).toContain("3 (half your total)");
    expect(hitDiceRecharge(6, false)).toBe(hitDiceRecharge(6, false, "2014"));
    expect(hitDiceRecharge(6, true, "2024")).toBe(hitDiceRecharge(6, true));
  });
  it("the Inspiration card comes from the table; the 2014 text is unchanged", () => {
    expect(glossaryEntry("inspiration", false, "2024")!.text).toBe(EDITION_RULES["2024"].inspiration.card);
    expect(glossaryEntry("inspiration", false, "2024")!.title).toBe("Heroic Inspiration");
    expect(glossaryEntry("inspiration")!.text).toBe("A reward from the GM for good roleplaying. Spend it to roll one d20 twice and keep the better result.");
    expect(glossaryEntry("inspiration")!.title).toBe("Inspiration");
    expect(glossaryEntry("hit-dice", false, "2024")!.text).toContain("gives back all of them");
    expect(glossaryEntry("hit-dice")!.text).toContain("gives back half your total (at least one)");
  });
});

describe("the builder says species for a 2024 draft", () => {
  function setup(reg: Registry) {
    const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined };
    const ctl = new BuilderController(host), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, false); ctl.go(1);   // page 0 is the edition page
    return { ctl, root, text: () => root.textContent!, titles: () => [...root.querySelectorAll(".fe-levelup *")].map(e => e.textContent) };
  }
  afterEach(() => document.body.replaceChildren());
  it("the race page hint and title", () => {
    const s = setup(homebrewRegistry());
    expect(s.text()).toContain("Pick a race."); expect(s.text()).toContain("Race");
    s.ctl.setEdition("2024");
    expect(s.text()).toContain("Pick a species."); expect(s.text()).not.toContain("Pick a race.");
    expect(s.root.querySelector(".fe-levelup")!.textContent).not.toMatch(/\bRace\b/);
  });
  it("the empty-list reason follows the word", () => {
    const s = setup(new Registry());
    expect(s.ctl.emptyReason("race")).toBe("No 2014 races were found in your compendium. docs/IMPORTING.md explains how to import them.");
    s.ctl.setEdition("2024");
    expect(s.ctl.emptyReason("race")).toBe("No 2024 species were found in your compendium. docs/IMPORTING.md explains how to import them.");
  });
});

describe("the About card on the builder race page", () => {
    const withSpark = (edition: "2014" | "2024") => { const r = homebrewRegistry(); r.add("vault", "race", { name: "Spark", grants: [{ op: "grant", speed: 30 }] }, { path: "hb/Spark.md", edition }); return r; };
  function open(edition: "2014" | "2024") {
    const host: BuilderHost = { registry: withSpark(edition), rng: seeded(4), folder: "Characters", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined };
    const ctl = new BuilderController(host), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, false); ctl.go(1);   // page 0 is the edition page
    ctl.setEdition(edition);
    root.querySelector<HTMLElement>('[data-row="race"] [aria-label="About Spark"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const row = [...root.querySelectorAll('[data-row="race"]')].find(r => r.querySelector('[aria-label="About Spark"]'))!;
    return row.textContent!;
  }
  afterEach(() => document.body.replaceChildren());
  it("says Species for a 2024 entry and Race for a 2014 one", () => {
    const t24 = open("2024"); expect(t24).toContain("Species"); expect(t24).not.toMatch(/\bRace\b/);
    document.body.replaceChildren();
    const t14 = open("2014"); expect(t14).toContain("Race"); expect(t14).not.toContain("Species");
  });
});
