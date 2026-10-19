// @vitest-environment jsdom
import { buildCharacter, gearList } from "../../src/core/builder";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { homebrewRegistry } from "../fixtures/homebrew";

const squire = { type: "5e-class", name: "Squire", hitDie: 10, saves: ["str", "con"], equipment: [["dagger", "pebble", "pebble", "pebble"]], levels: { 1: [] } };
const r = homebrewRegistry([squire]);

describe("gearList", () => {
  it("groups repeated gear and uses item names", () => {
    expect(gearList(["dagger", "bolt-x", "bolt-x", "bolt-x", "smiths-tools-x"], r)).toBe("Dagger, Bolt X x3, Smiths Tools X");
  });
  it("the builder's option buttons and summary use the grouped list", () => {
    const host: BuilderHost = { registry: r, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => {},
      createNote: async p => p, open: () => {}, close: () => {} };
    const ctl = new BuilderController(host), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, false);
    ctl.setRace("skink"); ctl.pick("race:skink:choose-2", ["elvish"]); ctl.setClass("squire");
    ctl.go(ctl.pages().findIndex(p => p.id === "equipment"));
    expect((root.querySelector('[data-equip="0"]') as HTMLElement).textContent).toContain("Pebble x3");
    ctl.setEquipment({ kind: "option", index: 0 }); ctl.setName("Tam");
    const out = buildCharacter(ctl.draft, r, seeded(4));
    if ("error" in out) throw new Error(out.error);
    expect(out.summary).toContain("Equipment: Dagger, Pebble x3");
    expect(out.value.inventory.find(x => x.name === "Pebble")?.qty).toBe(3);
  });
});
