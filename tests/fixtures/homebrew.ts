import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";

/** A small homebrew class that uses every op type. Levels: 1 Plan die/count, Plans, DC, stance; 2 Focus, expertise;
 *  3 subclass + action; 4 ASI; 5 modify, spells, a third-caster spellcasting op. */
export const skirmisher = {
  type: "5e-class", name: "Skirmisher", hitDie: 8, saves: ["dex", "int"],
  proficiencies: ["light armor", "skill:stealth"], skills: { count: 2, from: ["acrobatics", "athletics", "investigation", "perception"] },
  multiclass: { requires: { any: [{ dex: 13 }, { int: 13 }] }, proficiencies: ["light armor"] },
  options: { stances: [
    { name: "Duelist", text: "Fight one on one.", effects: { modifiers: [{ target: "damage", value: 1 }] } },
    { name: "Guardian", text: "Hold the line.", effects: { modifiers: [{ target: "ac", value: 1 }] } },
    { name: "Hunter", minLevel: 5, text: "Mark prey.", action: { name: "Mark", damage: "1d6" } },
  ] },
  subclassLevel: 3,
  levels: {
    1: [
      { op: "grant", languages: ["thieves-cant"], spells: ["shield"], items: ["dagger"] },
      { op: "feature", id: "quick-wits", name: "Quick Wits", text: "Use Intelligence for armor class.", effects: { acAbility: "int" } },
      { op: "scale", name: "Plan die", values: { 1: "1d4", 5: "1d6" } },
      { op: "scale", name: "Plan count", formula: "level + 1" },
      { op: "resource", name: "Plans", max: "plan_count", reset: "long" },
      { op: "dc", name: "Analysis", abil: "int", alt: "wis" },
      { op: "choose", id: "stance", what: "option", list: "stances", count: 1 },
    ],
    2: [
      { op: "resource", name: "Focus", max: "max(1, floor(level / 2))", reset: "short", refill: { on: "short", amount: 1, oncePer: "long" } },
      { op: "effect", effects: { saveBonus: [{ abils: ["int"], value: "prof" }] } },
      { op: "choose", what: "expertise", count: 1, from: ["stealth", "athletics"] },
    ],
    3: [
      { op: "subclass" },
      { op: "feature", name: "Sudden Strike", effects: { critRange: 19, critVs: "analyzed creatures" },
        action: { name: "Sudden Strike", cost: { resource: "Focus" }, attack: "prof + int", damage: "{plan-die}+2", save: { abil: "wis", dc: "Analysis" } } },
    ],
    4: [{ op: "asi" }],
    5: [
      { op: "modify", resource: "Plans", set: "level + 3" },
      { op: "modify", scale: "Plan count", set: "level + 2" },
      { op: "spells", count: 2, cantrips: 1, from: "wizard" },
      { op: "spellcasting", abil: "int", progression: "third", list: "wizard" },
      { op: "effect", effects: { maxScore: { abil: "int", max: 22 } } },
    ],
  },
};

export const scholar = {
  type: "5e-subclass", name: "Scholar", class: "skirmisher",
  levels: {
    3: [
      { op: "feature", name: "Lore", text: "You know things." },
      { op: "spellcasting", abil: "int", progression: "table",
        table: { 3: { cantrips: 2, known: 3, slots: [2] }, 5: { cantrips: 2, known: 4, slots: [3] }, 7: { cantrips: 3, known: 5, slots: [4, 2] } } },
    ],
  },
};

export const pactMind = {
  type: "5e-subclass", name: "Pact Mind", class: "skirmisher",
  options: { boons: [{ name: "Blade", text: "A bound blade." }, { name: "Tome", text: "A bound book." }] },
  levels: {
    3: [
      { op: "spellcasting", abil: "cha", progression: "table", table: { 3: { cantrips: 1, pact: { slots: 1, level: 1 } }, 5: { pact: { slots: 2, level: 2 } } } },
      { op: "choose", id: "boon", what: "option", list: "boons", count: 1 },
    ],
  },
};

export const skink = {
  type: "5e-race", name: "Skink",
  grants: [
    { op: "grant", speed: 25, darkvision: 60, languages: ["draconic"], proficiencies: ["skill:perception"] },
    { op: "feature", name: "Scales", effects: { modifiers: [{ target: "ac", value: 1 }] } },
    { op: "choose", what: "languages", count: 1, from: ["elvish", "dwarvish"] },
  ],
};
export const caveSkink = { type: "5e-subrace", name: "Cave Skink", race: "skink", grants: [{ op: "grant", darkvision: 120 }, { op: "feature", name: "Cave Born", text: "Stone is home." }] };
export const cartographer = {
  type: "5e-background", name: "Cartographer",
  grants: [{ op: "grant", proficiencies: ["skill:survival", "tool:cartographer's tools"], languages: [] }, { op: "feature", name: "Maps", text: "You draw maps." }],
};
export const toughMind = {
  type: "5e-feat", name: "Tough Mind", prerequisite: "Intelligence 13",
  grants: [{ op: "effect", effects: { saveBonus: [{ abils: ["wis"], value: 1 }] } }, { op: "feature", name: "Tough Mind", text: "Your mind is hard to break." }],
};

const strip = ({ type: _t, ...rest }: Record<string, unknown>) => rest;
export function homebrewRegistry(extra: Record<string, unknown>[] = []): Registry {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  for (const raw of [skirmisher, scholar, pactMind, skink, caveSkink, cartographer, toughMind, ...extra]) {
    const p = r.add("vault", String(raw.type).slice(3), strip(raw), { path: `hb/${String(raw.name)}.md` });
    if (p) throw new Error(`fixture ${String(raw.name)}: ${p.errors.join("; ")}`);
  }
  return r;
}
