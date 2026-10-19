// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { BuilderController } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { detailCard } from "../../src/ui/details";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

const spell = (name: string, extra: object = {}) => ({ name, level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V"], duration: "Instantaneous", classes: ["cleric"], ...extra });
const world = () => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  r.add("vault", "spell", spell("Roll Twenty Blast"), { path: "compendium/5e/Roll20/Spells/Roll Twenty Blast.md", sourceName: "Roll20" });
  r.add("vault", "spell", spell("Tome Flash"), { path: "compendium/5e/WotC/Spells/Tome Flash.md", sourceName: "WotC", library: true, book: "PHB" });
  r.add("vault", "spell", spell("Home Bolt"), { path: "compendium/5e/Homebrew/Spells/Home Bolt.md", sourceName: "Homebrew" });
  r.add("vault", "race", { name: "Roll Elf", grants: [] }, { path: "compendium/5e/Roll20/Races/Roll Elf.md", sourceName: "Roll20" });
  return r;
};
const sheet = (campaign: object | undefined, mobile: boolean) => {
  const r = world();
  const host: SheetHost = { registry: r, ...(campaign ? { campaign: campaign as never } : {}), ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3) };
  const p = parseNote(thalia); if (p.kind === "none") throw new Error("x");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  return { ctl, root, names: (q: string) => {   // the add-spell search text is module state: always set it
    const box = root.querySelector<HTMLInputElement>("[data-panel] .fe-search")!; box.value = q; box.dispatchEvent(new Event("input", { bubbles: true }));
    return [...root.querySelectorAll<HTMLElement>("[data-panel] .fe-spell-name")].map(e => e.textContent);
  } };
};
const camp = (sources: Record<string, boolean>) => ({ name: "Test", rules: {}, sources, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } });

afterEach(() => document.body.replaceChildren());

describe.each([["desktop", false], ["mobile", true]] as const)("pickers on the %s layout", (_n, mobile) => {
  it("add spell lists a source badge on every row, with the book for library notes", () => {
    const s = sheet(undefined, mobile); s.ctl.open({ kind: "add-spell" });
    const row = (n: string) => {   // the list shows 80 rows at most: search for the one wanted
      const box = s.root.querySelector<HTMLInputElement>("[data-panel] .fe-search")!; box.value = n.toLowerCase(); box.dispatchEvent(new Event("input", { bubbles: true }));
      return [...s.root.querySelectorAll<HTMLElement>("[data-panel] .fe-inv")].find(r => r.textContent?.includes(n))!;
    };
    expect(row("Roll Twenty Blast").querySelector(".fe-src")!.textContent).toBe("Roll20");
    expect(row("Tome Flash").querySelector(".fe-src")!.textContent).toBe("WotC · PHB");
    expect(row("Home Bolt").querySelector(".fe-src")!.textContent).toBe("Homebrew");
    expect(row("Cure Wounds").querySelector(".fe-src")!.textContent).toBe("WotC (SRD)");
  });

  it("add spell hides switched-off sources but a character that already has one keeps it", () => {
    const s = sheet(camp({ Roll20: false, WotC: false }), mobile); s.ctl.open({ kind: "add-spell" });
    expect(s.names("roll twenty")).toEqual([]); expect(s.names("tome flash")).toEqual([]);
    expect(s.names("home bolt")).toEqual(["Home Bolt"]); expect(s.names("cure wounds")).toContain("Cure Wounds");
    expect(s.ctl.host.registry.get("spell", "roll-twenty-blast")).toBeDefined();   // existing characters resolve it
  });

  it("the item and companion pickers carry badges and honour the switches", () => {
    const r = world();
    r.add("vault", "item", { name: "Roll Rod", kind: "wondrous" }, { path: "compendium/5e/Roll20/Items/Roll Rod.md", sourceName: "Roll20" });
    const host: SheetHost = { registry: r, campaign: camp({ Roll20: false }) as never, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3) };
    const p = parseNote(thalia); if (p.kind === "none") throw new Error("x");
    const ctl = new SheetController(host, p), root = document.createElement("div"); document.body.append(root); mountSheet(root, ctl, mobile);
    ctl.open({ kind: "compendium" });
    const search = (t: string) => { const box = root.querySelector<HTMLInputElement>("[data-panel] .fe-search")!; box.value = t; box.dispatchEvent(new Event("input", { bubbles: true })); };
    search("roll rod");
    expect(root.querySelector('[data-panel] [data-item="roll-rod"]')).toBeNull();
    search("dagger");
    expect(root.querySelector('[data-panel] [data-item="dagger"]')!.closest(".fe-inv")!.querySelector(".fe-src")!.textContent).toBe("WotC (SRD)");
  });

  it("the level-up wizard leaves out classes and subclasses from switched-off sources", () => {
    const r = world();
    r.add("vault", "class", { name: "Rollmancer", hitDie: 8, saves: ["int", "wis"], levels: { 1: [{ op: "feature", name: "Roll" }] } }, { path: "compendium/5e/Roll20/Classes/Rollmancer/Rollmancer.md", sourceName: "Roll20" });
    const mk = (campaign?: object) => {
      const host: SheetHost = { registry: r, ...(campaign ? { campaign: campaign as never } : {}), ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3) };
      const p = parseNote(thalia); if (p.kind === "none") throw new Error("x");
      const ctl = new SheetController(host, p), root = document.createElement("div"); document.body.append(root); mountSheet(root, ctl, mobile);
      ctl.startLevelUp(); return root;
    };
    const on = mk(), off = mk(camp({ Roll20: false }));
    expect(on.querySelector('[data-class="rollmancer"] .fe-src')!.textContent).toBe("Roll20");
    expect(on.querySelector('[data-class="cleric"] .fe-src')!.textContent).toBe("WotC (SRD)");
    expect(off.querySelector('[data-class="rollmancer"]')).toBeNull();
    expect(off.querySelector('[data-class="cleric"]')).not.toBeNull();
  });

  it("the builder shows source badges and applies the named campaign's switches", () => {
    const r = world();
    const mk = (campaign?: string) => {
      const ctl = new BuilderController({ registry: r, rng: seeded(4), folder: "", exists: () => false, notify: () => {}, createNote: async p => p, open: () => {}, close: () => {},
        campaignSources: name => (name === "Ekron Campaign" ? { Roll20: false } : undefined) });
      if (campaign) ctl.setCampaign(campaign);
      const root = document.createElement("div"); document.body.append(root); mountBuilder(root, ctl, mobile);
      return root;
    };
    const plain = mk(), scoped = mk("Ekron Campaign");
    expect(plain.querySelector('[data-race="roll-elf"] .fe-src')!.textContent).toBe("Roll20");
    expect(plain.querySelector('[data-race="human"] .fe-src')!.textContent).toBe("WotC (SRD)");
    expect(scoped.querySelector('[data-race="roll-elf"]')).toBeNull();
    expect(scoped.querySelector('[data-race="human"]')).not.toBeNull();
  });
});

describe("hover and detail cards", () => {
  it("show the source badge, with the book for library notes", () => {
    const s = sheet(undefined, false);
    const spellCard = detailCard("spell:tome-flash", s.ctl)!, srd = detailCard("spell:cure-wounds", s.ctl)!;
    expect(spellCard.querySelector(".fe-src")!.textContent).toBe("WotC · PHB");
    expect(srd.querySelector(".fe-src")!.textContent).toBe("WotC (SRD)");
    expect(spellCard.querySelector(".fe-name")!.textContent).toBe("Tome Flash");
  });
});
