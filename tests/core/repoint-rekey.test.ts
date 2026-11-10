import { editionRegistry } from "../fixtures/editions";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter, deriveCompanion } from "../../src/core/derive";
import { apply, type Action } from "../../src/core/actions";
import { undoLevel } from "../../src/core/levelup";

const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const mk = (o: Record<string, unknown>): Character => {
  const p = parseNote({ type: "5e-character", schema: 1, name: "Pip", edition: "2024", abilities: SCORES, hp: { max: 12, current: 12, temp: 0 }, classes: [], ...o });
  if (p.kind !== "character") throw new Error(JSON.stringify(p));
  return p.value;
};
async function run(c: Character, ...as: Action[]) {
  const { r } = await editionRegistry(), ctx = { registry: r };
  return as.reduce((v, a) => apply(v, a, { self: deriveCharacter(v, ctx), companions: v.companions.map(x => deriveCompanion(x, ctx)), chargesMax: () => 3 }).value, c);
}
const log = (cls: string, level: number, choices: Record<string, unknown>) => ({ class: cls, level, hp: { method: "recorded", gained: 6 }, choices });

describe("a re-point keeps the saved picks", () => {
  it("re-keys race and class picks, customizations and pins with the id", async () => {
    const c = mk({ race: "fenling", choices: { "race:fenling:pick": ["str", "dex"], "dc.x.alt": true }, customize: { "feature:class:lantern-keeper:1:lantern-keeper-guard": { toggle: false } },
      mainPins: ["feature:class:lantern-keeper:1:lantern-keeper-guard", "item:tin-blade"],
      classes: [{ class: "lantern-keeper", level: 2 }], levelLog: [log("lantern-keeper", 2, { "class:lantern-keeper:2:tool": "tin" })] });
    const v = await run(c, { type: "repoint", field: "race", to: "2014" }, { type: "repoint", field: "class", index: 0, to: "2014" });
    expect(v.race).toBe("fenling@2014");
    expect(v.choices).toEqual({ "race:fenling@2014:pick": ["str", "dex"], "dc.x.alt": true });
    expect(v.levelLog[0]).toMatchObject({ class: "lantern-keeper@2014", choices: { "class:lantern-keeper@2014:2:tool": "tin" } });
    expect(Object.keys(v.customize)).toEqual(["feature:class:lantern-keeper@2014:1:lantern-keeper-guard"]);
    expect(v.mainPins).toEqual(["feature:class:lantern-keeper@2014:1:lantern-keeper-guard", "item:tin-blade"]);
  });

  it("undo after a spell and a feat re-point removes exactly the right rows", async () => {
    const { r } = await editionRegistry();
    const c = mk({ classes: [{ class: "warden", level: 2 }], spells: [{ id: "glint", prepared: false }, { id: "hush", prepared: false }], feats: ["keen", "other"],
      levelLog: [log("warden", 2, { "+spells": ["hush"], "+feats": ["keen"], k: { feat: "keen" } })] });
    const v = await run(c, { type: "repoint", field: "spell", index: 1, to: "2014" }, { type: "repoint", field: "feat", index: 0, to: "2014" });
    expect(v.levelLog[0].choices).toMatchObject({ "+spells": ["hush@2014"], "+feats": ["keen@2014"], k: { feat: "keen@2014" } });
    const u = undoLevel(v, r);
    if ("error" in u) throw new Error(u.error);
    expect(u.value.spells.map(s => s.id)).toEqual(["glint"]);
    expect(u.value.feats).toEqual(["other"]);
  });

  it("an item re-point moves the item-spell pins", async () => {
    const c = mk({ inventory: [{ id: "tin-blade", qty: 1, equipped: false, attuned: false }], mainSpells: ["tin-blade/glint", "glint"] });
    const v = await run(c, { type: "repoint", field: "item", index: 0, to: "2014" });
    expect(v.mainSpells).toEqual(["tin-blade@2014/glint", "glint"]);
  });
});
