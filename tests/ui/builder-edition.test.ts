// @vitest-environment jsdom
import type { Edition } from "../../src/core/edition";
import { generalChanges } from "../../src/content/edition-changes";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { editionRegistry } from "../fixtures/editions";
import { LAYOUTS } from "./review-helpers";

type Reg = Awaited<ReturnType<typeof editionRegistry>>["r"];
const NONE = "docs/IMPORTING.md explains how to import them.";

function setup(r: Reg, mobile: boolean, extra: Partial<BuilderHost> = {}) {
  const created: { path: string; fm: Record<string, unknown> }[] = [];
  const host: BuilderHost = { registry: r, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => undefined,
    createNote: async (path, fm) => { created.push({ path, fm }); return path; }, open: () => undefined, close: () => undefined, ...extra };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, q, qa, click, created, at: () => q("[data-builder]").dataset.builder };
}
const withSpark = (r: Reg) => { r.add("vault", "race", { name: "Spark", grants: [] }, { path: "hb/Spark.md", edition: "2024" }); return r; };

afterEach(() => document.body.replaceChildren());

describe.each([["desktop", false], ["mobile", true]] as const)("the builder's edition page on the %s layout", (_n, mobile) => {
  it("the first page asks for the rules and starts on the default", async () => {
    const { r } = await editionRegistry();
    const s = setup(r, mobile, { defaultEdition: () => "2024" });
    expect(s.ctl.pages()[0]).toEqual({ id: "edition" });
    expect(s.at()).toBe("edition");
    expect(s.root.textContent).toContain("Which rules does your table use?");
    expect(s.qa("[data-edition]").map(b => [b.dataset.edition, b.textContent!.startsWith(`${b.dataset.edition} rules`)])).toEqual([["2014", true], ["2024", true]]);
    expect(s.q('[data-edition="2024"]').getAttribute("aria-pressed")).toBe("true");
    expect(s.q('[data-edition="2014"]').getAttribute("aria-pressed")).toBe("false");
    expect((s.q('[data-act="bd-next"]') as HTMLButtonElement).disabled).toBe(false);
    // accepting the default records it, so a campaign typed later cannot switch it
    s.click('[data-act="bd-next"]');
    expect(s.ctl.draft.edition).toBe("2024"); expect(s.at()).toBe("race");
  });

  it("a campaign's edition is the default, and the player's own choice wins", async () => {
    const { r } = await editionRegistry();
    const s = setup(r, mobile, { defaultEdition: () => "2014" });
    s.ctl.setCampaign("Dusk");
    expect(s.ctl.edition()).toBe("2014");
    expect(s.q('[data-edition="2014"]').getAttribute("aria-pressed")).toBe("true");
    const t = setup(r, mobile, { defaultEdition: () => "2014", campaignEdition: () => "2024" });
    t.ctl.setCampaign("Dusk");
    expect(t.q('[data-edition="2024"]').getAttribute("aria-pressed")).toBe("true");
    t.click('[data-edition="2014"]');
    expect(t.q('[data-edition="2014"]').getAttribute("aria-pressed")).toBe("true");
    t.ctl.setCampaign("Other"); expect(t.ctl.edition()).toBe("2014");
  });

  it("What is the difference? shows the general changes inline", async () => {
    const { r } = await editionRegistry();
    const s = setup(r, mobile);
    expect(s.q("[data-change]")).toBeNull();
    s.click('[data-act="about"][data-about="edition"]');
    expect(s.ctl.view.about).toBe("edition");
    const notes = s.qa("[data-change]");
    expect(notes.map(n => n.dataset.change)).toEqual(generalChanges().map(n => n.id));
    expect(notes[0].textContent).toContain("2014 (yours):"); expect(notes[0].textContent).toContain("2024:");
    expect(s.q('[data-act="about"][data-about="edition"]').getAttribute("aria-expanded")).toBe("true");
    s.click('[data-act="about"][data-about="edition"]');
    expect(s.q("[data-change]")).toBeNull();
  });

  it("choosing the other edition empties the picks and the next page lists that edition's races (Review Focus 1)", async () => {
    const { r } = await editionRegistry();
    const s = setup(withSpark(r), mobile);
    s.ctl.setRace("fenling"); s.ctl.setClass("warden");
    s.click('[data-edition="2024"]'); s.click('[data-edition="2024"]');
    expect(s.ctl.draft.race).toBeUndefined(); expect(s.ctl.draft.classId).toBeUndefined();
    s.click('[data-act="bd-next"]');
    expect(s.at()).toBe("race");
    expect(s.qa('[data-row="race"] [data-race]').map(b => b.dataset.race)).toEqual(["spark"]);
    expect(s.root.textContent).toContain("Pick a species.");
    s.ctl.go(0); s.click('[data-edition="2014"]'); s.click('[data-act="bd-next"]');
    expect(s.qa('[data-row="race"] [data-race]').map(b => b.dataset.race)).toContain("fenling");
    expect(s.qa('[data-row="race"] [data-race]').map(b => b.dataset.race)).not.toContain("spark");
  });

  it("with picks, the first tap on the other edition asks and keeps them; the second switches", async () => {
    const { r } = await editionRegistry();
    const s = setup(withSpark(r), mobile);
    s.ctl.setRace("fenling"); s.ctl.setClass("warden");
    s.click('[data-edition="2024"]');
    expect(s.ctl.draft.race).toBe("fenling"); expect(s.ctl.draft.classId).toBe("warden"); expect(s.ctl.edition()).toBe("2014");
    expect(s.q('[data-confirm="edition"]').textContent).toBe("Switching to the 2024 rules clears your species and class picks.");
    expect(s.q('[data-edition="2024"]').textContent).toContain("Tap again to switch");
    s.click('[data-edition="2024"]');
    expect(s.ctl.draft.race).toBeUndefined(); expect(s.ctl.draft.classId).toBeUndefined(); expect(s.ctl.edition()).toBe("2024");
    expect(s.q('[data-confirm="edition"]')).toBeNull();
  });

  it("tapping the current edition or leaving the page cancels the pending switch", async () => {
    const { r } = await editionRegistry();
    const s = setup(withSpark(r), mobile);
    s.ctl.setRace("fenling");
    s.click('[data-edition="2024"]'); s.click('[data-edition="2014"]');
    expect(s.q('[data-confirm="edition"]')).toBeNull(); expect(s.ctl.draft.race).toBe("fenling");
    s.click('[data-edition="2024"]'); s.click('[data-act="bd-next"]'); s.ctl.go(0);
    expect(s.q('[data-confirm="edition"]')).toBeNull();
    s.click('[data-edition="2024"]');
    expect(s.ctl.draft.race).toBe("fenling"); expect(s.ctl.edition()).toBe("2014");
  });

  it("with no picks one tap switches", async () => {
    const { r } = await editionRegistry();
    const s = setup(withSpark(r), mobile);
    s.click('[data-edition="2024"]');
    expect(s.ctl.edition()).toBe("2024"); expect(s.q('[data-confirm="edition"]')).toBeNull();
  });

  it("with no 2024 library the race, class and background pages say nothing was found and point at docs/IMPORTING.md", async () => {
    const { r } = await editionRegistry({ only: ["WotC", "Test Press"] });
    const s = setup(r, mobile);
    s.click('[data-edition="2024"]');
    const page = (id: string) => { s.ctl.go(s.ctl.pages().findIndex(p => p.id === id)); return s.root.textContent!; };
    expect(page("class")).toContain(`No 2024 classes were found in your compendium. ${NONE}`);
    expect(page("race")).toContain(`No 2024 species were found in your compendium. ${NONE}`);
    expect(page("background")).toContain(`No 2024 backgrounds were found in your compendium. ${NONE}`);
    s.ctl.go(0); s.click('[data-edition="2014"]');
    expect(page("class")).not.toContain("were found in your compendium");
  });

  it("the finished note carries edition and the Race / Species word follows", async () => {
    const { r } = await editionRegistry();
    const s = setup(withSpark(r), mobile);
    expect(s.root.textContent).not.toContain("Species");
    s.click('[data-edition="2024"]'); s.click('[data-act="bd-next"]');
    expect(s.q(".fe-levelup .fe-name").textContent).toBe("New character: Species");
    s.ctl.setRace("spark"); s.ctl.setClass("warden"); s.ctl.setName("Tamsin");
    expect(await s.ctl.create()).toBe(true);
    expect(s.created).toHaveLength(1);
    expect(s.created[0].fm.edition).toBe("2024");
  });
});

for (const layout of LAYOUTS) {
  describe(`level-up on the ${layout} sheet with no classes of the character's edition`, () => {
    it("says no classes were found and points at docs/IMPORTING.md", async () => {
      const { r } = await editionRegistry({ only: ["WotC", "Test Press"] });
      const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => undefined, notify: () => undefined, log: [], rng: seeded(5), body: "" };
      const edition: Edition = "2024";
      const p = parseNote({ type: "5e-character", name: "Brann", edition, classes: [], levelLog: [] }); if (p.kind === "none") throw new Error("not a sheet");
      const ctl = new SheetController(host, p), root = document.createElement("div");
      document.body.append(root); mountSheet(root, ctl, layout);
      ctl.startLevelUp();
      expect(root.querySelector('[data-step="class"]')!.textContent).toContain(`No 2024 classes were found in your compendium. ${NONE}`);
    });
    it("a character whose edition has classes sees no such line", async () => {
      const { r } = await editionRegistry();
      const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => undefined, notify: () => undefined, log: [], rng: seeded(5), body: "" };
      const p = parseNote({ type: "5e-character", name: "Brann", classes: [], levelLog: [] }); if (p.kind === "none") throw new Error("not a sheet");
      const ctl = new SheetController(host, p), root = document.createElement("div");
      document.body.append(root); mountSheet(root, ctl, layout);
      ctl.startLevelUp();
      expect(root.querySelector('[data-step="class"]')!.textContent).not.toContain("were found in your compendium");
    });
  });
}
