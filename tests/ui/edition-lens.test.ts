// @vitest-environment jsdom
import { baseCharacter, characterFrontmatter, newDraft } from "../../src/core/builder";
import type { Edition } from "../../src/core/edition";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { editionRegistry } from "../fixtures/editions";
import { LAYOUTS, sheet } from "./review-helpers";
import { blankItemDraft } from "../../src/content/itemblock";
import { saveItem } from "../../src/obsidian/save-item";

const notSrd = (es: { source: string; id: string }[]) => es.filter(e => e.source !== "srd");
const note = (edition?: Edition) => ({ type: "5e-character", name: "Brann", ...(edition ? { edition } : {}) });
const npc = { type: "5e-npc", name: "Guard", creature: "guard" };

function builderHost(r: Awaited<ReturnType<typeof editionRegistry>>["r"], extra: Partial<BuilderHost> = {}): BuilderHost {
  return { registry: r, folder: "", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined, ...extra };
}

for (const layout of LAYOUTS) {
  describe(`edition lens on the ${layout} sheet`, () => {
    it("a 2024 sheet reads 2024 entries and a 2014 sheet the 2014 ones", async () => {
      const { r } = await editionRegistry();
      const ctl24 = sheet(layout, note("2024"), [], { registry: r }).ctl, ctl14 = sheet(layout, note("2014"), [], { registry: r }).ctl;
      expect(ctl24.host.registry.get("spell", "nova")).toBeDefined();
      expect(ctl24.host.registry.get("spell", "hush")).toBeUndefined();
      expect(ctl14.host.registry.get("spell", "hush")).toBeDefined();
      expect(ctl14.host.registry.get("spell", "nova")).toBeUndefined();
      expect(ctl24.baseRegistry).toBe(r);
    });
    it("a note without edition behaves as 2014 and an NPC sheet is unlensed", async () => {
      const { r } = await editionRegistry();
      const plain = sheet(layout, note(), [], { registry: r }).ctl, n = sheet(layout, npc, [], { registry: r }).ctl;
      expect(plain.host.registry.get("spell", "nova")).toBeUndefined();
      expect(plain.host.registry.get("spell", "hush")).toBeDefined();
      expect(n.host.registry.get("spell", "nova")).toBeDefined();
      expect(n.host.registry.get("spell", "hush")).toBeDefined();
    });
  });
}

describe("edition in the builder", () => {
  it("builder pickers list only the draft's edition plus homebrew", async () => {
    const { r } = await editionRegistry();
    const ctl = new BuilderController(builderHost(r));
    expect(notSrd(ctl.pickers().list("class")).map(e => e.id).sort()).toEqual(["lantern-keeper", "warden"]);
    ctl.setEdition("2024");
    expect(notSrd(ctl.pickers().list("class")).map(e => e.id)).toEqual(["warden"]);
    expect(ctl.pickers().get("spell", "nova")).toBeDefined();
    expect(ctl.pickers().get("spell", "hush")).toBeUndefined();
    expect(ctl.ready({ id: "race" })).toBe(false);
    ctl.setRace("nothing"); expect(ctl.ready({ id: "race" })).toBe(false);
  });
  it("the default edition is the campaign's, else the setting, else 2014", async () => {
    const { r } = await editionRegistry();
    const bare = new BuilderController(builderHost(r, { defaultEdition: () => "2014" }));
    const setting = new BuilderController(builderHost(r, { defaultEdition: () => "2024" }));
    const camp = new BuilderController(builderHost(r, { defaultEdition: () => "2014", campaignEdition: c => c === "Dusk" ? "2024" : undefined }));
    expect(bare.edition()).toBe("2014"); expect(setting.edition()).toBe("2024");
    camp.setCampaign("Dusk"); expect(camp.edition()).toBe("2024"); expect(camp.defaultEdition()).toBe("2024");
    camp.setCampaign("Other"); expect(camp.edition()).toBe("2014");
    expect(new BuilderController(builderHost(r)).edition()).toBe("2014");
  });
  it("choosing the edition after the campaign keeps the player's pick, and changing it drops picks", async () => {
    const { r } = await editionRegistry();
    const ctl = new BuilderController(builderHost(r, { defaultEdition: () => "2014", campaignEdition: () => "2024" }));
    ctl.setEdition("2014"); ctl.setCampaign("Dusk");
    expect(ctl.edition()).toBe("2014");
    ctl.setRace("skink"); ctl.setClass("warden"); ctl.pick("race:skink:x", 1);
    ctl.setEdition("2024");
    expect(ctl.draft.race).toBeUndefined(); expect(ctl.draft.classId).toBeUndefined();
    expect(ctl.draft.choices).toEqual({}); expect(ctl.edition()).toBe("2024");
  });
  it("a new character's frontmatter always carries edition", async () => {
    const { r } = await editionRegistry();
    expect(characterFrontmatter(baseCharacter(newDraft(), r)).edition).toBe("2014");
    expect(characterFrontmatter(baseCharacter({ ...newDraft(), edition: "2024" }, r)).edition).toBe("2024");
  });
  it("with no 2024 classes the class list is empty and says why (Review Focus 1)", async () => {
    const { r } = await editionRegistry({ only: ["WotC", "Test Press"] });
    const ctl = new BuilderController(builderHost(r));
    ctl.setEdition("2024");
    expect(ctl.emptyReason("class")).toBe("No 2024 classes were found in your compendium. docs/IMPORTING.md explains how to import them.");
    ctl.setEdition("2014");
    expect(ctl.emptyReason("class")).toBeUndefined();
  });
});

describe("late campaign and the builder lens", () => {
  it("a campaign entered after picks does not switch the edition under them", async () => {
    const { r } = await editionRegistry();
    const ctl = new BuilderController(builderHost(r, { defaultEdition: () => "2014", campaignEdition: c => c === "Dusk" ? "2024" : undefined }));
    ctl.setRace("skink"); ctl.setClass("warden");
    ctl.setCampaign("Dusk");
    expect(ctl.edition()).toBe("2014");
    expect(ctl.draft.race).toBe("skink"); expect(ctl.draft.classId).toBe("warden");
  });
  it("a campaign set before any pick makes the default", async () => {
    const { r } = await editionRegistry();
    const ctl = new BuilderController(builderHost(r, { defaultEdition: () => "2014", campaignEdition: c => c === "Dusk" ? "2024" : undefined }));
    ctl.setCampaign("Dusk");
    expect(ctl.edition()).toBe("2024");
  });
  it("the builder's host.registry is the draft's lens and baseRegistry stays raw", async () => {
    const { r } = await editionRegistry();
    const ctl = new BuilderController(builderHost(r));
    expect(ctl.baseRegistry).toBe(r);
    expect(ctl.host.registry.get("spell", "hush")).toBeDefined();
    expect(ctl.host.registry.get("spell", "nova")).toBeUndefined();
    ctl.setEdition("2024");
    expect(ctl.host.registry.get("spell", "nova")).toBeDefined();
    expect(ctl.host.registry.get("spell", "hush")).toBeUndefined();
  });
  for (const [ed, dmg] of [["2024", "1d8"], ["2014", "1d6"]] as const) {
    it(`a ${ed} sheet's custom item copies that edition's base`, async () => {
      const { r } = await editionRegistry();
      const files = new Map<string, string>();
      const io = { exists: (p: string) => files.has(p), ensureFolder: async () => undefined, create: async (p: string, t: string) => { files.set(p, t); } };
      const { ctl } = sheet("desktop", note(ed), [], { registry: r, saveItem: (d, find) => saveItem({ registry: r, io, compendiumFolder: "c", stringify: o => JSON.stringify(o) }, d, find).then(x => x.id) });
      Object.assign(ctl.customItem, { name: "Edge", qty: "1" });
      const d = { ...blankItemDraft(), name: "Edge", kind: "weapon" as const, base: "tin-blade" };
      ctl.itemDraftFromForm = () => d;
      expect(await ctl.saveItemToCompendium()).toBe(true);
      const text = [...files.values()][0];
      expect(text).toContain(`"dmg":"${dmg}"`);
    });
  }
});
