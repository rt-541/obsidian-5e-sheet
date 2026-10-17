import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character } from "../../src/core/character";
import { applyResolve, planLevel, planResolve } from "../../src/core/levelup";
import { thalia } from "../fixtures/notes";

const reg = new Registry(); registerBuiltinTypes(reg); loadSrd(reg);
const thaliaC = (): Character => { const p = parseNote(thalia); if (p.kind !== "character") throw new Error(); return p.value; };

describe("resolving a legacy note records choices without inventing data", () => {
  it("an ASI pick is recorded but does not change scores or HP", () => {
    const c = thaliaC(), key = "class:cleric:4:asi";
    const steps = planResolve(c, reg);
    const k = steps.find(s => s.kind === "asi")?.key ?? key;
    const r = applyResolve(c, { choices: { [k]: { abilities: { wis: 2 } } } }, reg);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.abilities).toEqual(c.abilities); expect(r.value.hp).toEqual(c.hp);
    expect(r.value.choices[k]).toEqual({ abilities: { wis: 2 } });
  });
  it("skills the character already has are valid picks and add nothing", () => {
    const c = thaliaC(), step = planResolve(c, reg).find(s => s.kind === "pick" && s.what === "skills");
    if (!step || step.kind !== "pick") throw new Error("no skills step");
    expect(step.options.filter(o => o.disabled)).toEqual([]);
    const before = [...c.proficiencies.skills];
    const r = applyResolve(c, { choices: { [step.key]: step.options.slice(0, step.count).map(o => o.id) } }, reg);
    if ("error" in r) throw new Error(r.error);
    expect(r.value.proficiencies.skills).toEqual(before);
  });
});

describe("spell level cap is per class", () => {
  it("cleric 4 / wizard 1 taking wizard 2 can learn only 1st-level wizard spells", () => {
    const c = thaliaC(); c.classes = [{ class: "cleric", level: 4 }, { class: "wizard", level: 1 }];
    const p = planLevel(c, "wizard", reg);
    if ("error" in p) throw new Error(p.error);
    const sp = p.steps.find(s => s.kind === "spells");
    if (!sp || sp.kind !== "spells") throw new Error("no spells step");
    expect(sp.maxLevel).toBe(1);
    expect(sp.options.find(o => o.id === "fireball")?.disabled).toBeTruthy();
  });
});
