// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { describeEffects } from "../../src/ui/widgets";
import { pc } from "../fixtures/overlay";

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`plain words on the sheet (${layout})`, () => {
  it("labels are spelled out, not abbreviated", () => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(1), body: "" };
    const p = parseNote(pc("wizard", 3, { int: 16 })); if (p.kind === "none") throw new Error("not a sheet");
    const ctl = new SheetController(host, p), root = document.createElement("div");
    document.body.append(root); mountSheet(root, ctl, layout);
    const text = root.textContent!;
    for (const word of ["Initiative", "Passive Perception", "Advantage", "Disadvantage", "Temp HP", "Spell save DC"]) expect(text, word).toContain(word);
    for (const jargon of ["Init ", "Pass. Perc", "Disadv.", "Adv."]) expect(text, jargon).not.toContain(jargon);
  });
  it("effects read as sentences", () => {
    expect(describeEffects({ adv: ["check:str", "save:str"], dis: ["attack"], autofail: ["save:dex"] }))
      .toBe("Advantage on Strength checks, Strength saves · Disadvantage on attacks · Automatically fail Dexterity saves");
  });
});
