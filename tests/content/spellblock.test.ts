import { parseSpellblock, SPELLBLOCK_TEMPLATE } from "../../src/content/spellblock";
import { spellType } from "../../src/content/types/spell";
import { spellDraftToNote, validateSpellDraft } from "../../src/content/spell-note";

// Invented spells only: nothing here is book text.
const SPARK = `Test Spark
1st-level evocation
Casting Time: 1 action
Range: 60 feet
Components: V, S, M (a copper pin)
Duration: Concentration, up to 1 minute
A blue spark leaps from your hand. Make a ranged spell attack against a creature in range. On a hit it takes 2d6 lightning damage.

The spark then fades.
At Higher Levels. When you cast this using a slot of 2nd level or higher, the damage grows by 1d6 for each slot level above 1st.
Classes: Wizard, Sorcerer`;

describe("parseSpellblock", () => {
  it("reads the usual layout", () => {
    const { draft: d, unread } = parseSpellblock(SPARK);
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ name: "Test Spark", level: 1, school: "Evocation", ritual: false, castingTime: "1 action", range: "60 feet", v: true, s: true, m: true, material: "a copper pin",
      concentration: true, duration: "Up to 1 minute", classes: ["wizard", "sorcerer"], attack: "ranged", dice: "2d6", dtype: "lightning" });
    expect(d.description).toBe("A blue spark leaps from your hand. Make a ranged spell attack against a creature in range. On a hit it takes 2d6 lightning damage.\n\nThe spark then fades.");
    expect(d.higherLevel).toBe("When you cast this using a slot of 2nd level or higher, the damage grows by 1d6 for each slot level above 1st.");
    expect(validateSpellDraft(d)).toEqual([]);
    expect(spellType.validate(spellDraftToNote(d).fm).errors).toEqual([]);
  });

  it("reads a cantrip with a ritual tag and no classes", () => {
    const { draft: d, unread } = parseSpellblock("Glow Ward\nAbjuration cantrip\nCasting Time: 1 minute\nRange: Self\nComponents: V\nDuration: 1 hour\nA soft light rings you.");
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ name: "Glow Ward", level: 0, school: "Abjuration", castingTime: "1 minute", v: true, s: false, m: false, concentration: false, duration: "1 hour", classes: [] });
    expect(parseSpellblock("Dusk Reading\n2nd-level divination (ritual)\nCasting Time: 10 minutes\nRange: Touch\nComponents: V, S\nDuration: Instantaneous\nYou read the dusk.").draft).toMatchObject({ level: 2, ritual: true, school: "Divination" });
  });

  it("copes with markdown bold and italics, bullets, quotes and blank lines", () => {
    const md = `> ## **Test Spark**\n> *1st-level evocation*\n>\n> - **Casting Time:** 1 action\n> - **Range:** 60 feet\n> - **Components:** V, S\n> - **Duration:** Instantaneous\n>\n> A spark. A creature must make a **Dexterity saving throw**, taking 3d4 fire damage on a failed save, or half as much damage on a success.\n>\n> ***At Higher Levels.*** More dice.\n> **Spell Lists.** Wizard`;
    const { draft: d, unread } = parseSpellblock(md);
    expect(unread).toEqual([]);
    expect(d).toMatchObject({ name: "Test Spark", level: 1, castingTime: "1 action", save: "dex", onSuccess: "half", dice: "3d4", dtype: "fire", higherLevel: "More dice.", classes: ["wizard"] });
  });

  it("accepts the same text inside a fenced 5e-spell block, and the template reads without surprises", () => {
    expect(parseSpellblock("```5e-spell\n" + SPARK + "\n```").draft.name).toBe("Test Spark");
    const t = parseSpellblock(SPELLBLOCK_TEMPLATE);
    expect(t.unread).toEqual([]);
    expect(t.draft).toMatchObject({ name: "Spell Name", level: 1, school: "Evocation", classes: ["wizard", "sorcerer"], dice: "2d6", dtype: "fire", save: "dex" });
  });

  it("detects healing with the spellcasting modifier, and leaves unclear things blank", () => {
    const { draft: d } = parseSpellblock("Mend Spark\n1st-level evocation\nCasting Time: 1 action\nRange: Touch\nComponents: V, S\nDuration: Instantaneous\nA creature you touch regains hit points equal to 1d8 + your spellcasting ability modifier.");
    expect(d).toMatchObject({ heal: "1d8", healMod: true, dice: "", save: "", attack: "" });
    expect(parseSpellblock("Vague Boon\n1st-level abjuration\nCasting Time: 1 action\nRange: Self\nComponents: V\nDuration: 1 hour\nYou feel braver.").draft).toMatchObject({ dice: "", heal: "", save: "", attack: "" });
  });

  it("lists lines it could not read instead of guessing", () => {
    const r = parseSpellblock("Odd Spell\nSource: Nowhere\n1st-level evocation\nCasting Time: 1 action\nRange: Self\nComponents: nothing at all\nDuration: Instantaneous\nSomething happens.");
    expect(r.unread).toEqual(["Source: Nowhere", "Components: nothing at all"]);
    expect(parseSpellblock("just some words").unread.join(" ")).toContain("no level and school");
    expect(parseSpellblock("").unread.length).toBeGreaterThan(0);
  });
});
