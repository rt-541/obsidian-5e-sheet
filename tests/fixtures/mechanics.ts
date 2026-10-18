import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { apply, type Action } from "../../src/core/actions";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter, type ActorStats } from "../../src/core/derive";
import { activeRests } from "../../src/rules";

/** SRD content plus small invented homebrew, so each effect keyword can be tested on its own. */
export function mechanicsRegistry(): Registry {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const bad = (p: unknown) => { if (p) throw new Error(JSON.stringify(p)); };
  // A class with a few simple features at level 1. Tests give a feature to the character as a feat instead of editing this.
  bad(r.add("vault", "class", { name: "Tester", hitDie: 8, saves: ["str", "con"], levels: { 1: [
    { op: "resource", name: "Fury", max: 2, reset: "long" },
    { op: "feature", id: "fury", name: "Fury", text: "Strike harder.", toggle: { cost: { resource: "Fury" } },
      effects: { modifiers: [{ target: "damage", value: 2, on: "attack:melee+str" }], resist: ["bludgeoning"] } },
    { op: "feature", id: "stance-high", name: "High Stance", toggle: { group: "stance", endsOn: "short" }, effects: { modifiers: [{ target: "ac", value: 1 }] } },
    { op: "feature", id: "stance-low", name: "Low Stance", toggle: { group: "stance", endsOn: "short" }, effects: { modifiers: [{ target: "speed", value: 10 }] } },
    { op: "feature", id: "focus", name: "Focus", toggle: { value: { min: 1, max: 3, label: "Focus level" } }, effects: { modifiers: [{ target: "attack", value: "toggle_focus" }] } },
    { op: "feature", id: "careful", name: "Careful", toggle: { while: ["!armor:heavy"] }, effects: { modifiers: [{ target: "ac", value: 2 }] } },
    { op: "feature", id: "spark", name: "Spark", toggle: { cost: { slot: 1 } }, effects: { modifiers: [{ target: "initiative", value: 5 }] } },
  ] } }, { path: "tester.md" }));
  return r;
}

export const tester = {
  type: "5e-character", schema: 1, name: "Test Subject", race: "human", classes: [{ class: "tester", level: 1 }],
  abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, hp: { max: 20, current: 20, temp: 0 },
  proficiencies: { saves: ["str", "con"], skills: [], expertise: [] },
};

export const makeChar = (o: object = {}): Character => {
  const p = parseNote({ ...tester, ...o });
  if (p.kind !== "character") throw new Error(JSON.stringify(p));
  return p.value;
};
export const derive = (c: Character, r: Registry): ActorStats => deriveCharacter(c, { registry: r });
export const act = (c: Character, a: Action, r: Registry) => {
  const ctx = { registry: r };
  return apply(c, a, { self: deriveCharacter(c, ctx), companions: [], chargesMax: () => 3, ctx, derive: v => deriveCharacter(v, ctx) });
};

const rest = (id: string, c: Character, r: Registry) => activeRests({ "rest-standard": true }).find(x => x.id === id)!.apply({ c, stats: derive(c, r), registry: r, rules: { "rest-standard": true } });
export const restShort = (c: Character, r: Registry) => rest("short", c, r);
export const restLong = (c: Character, r: Registry) => rest("long", c, r);

/** A function that gives the test character a feat carrying one effects block (and optionally extra ops) and derives it. */
export function carrier(r: Registry) {
  let n = 0;
  return (effects: object, o: object = {}, ops: object[] = []) => {
    const id = `carrier-${++n}`;
    r.add("vault", "feat", { name: id, grants: [...ops, { op: "effect", effects }] }, { path: `${id}.md` });
    return derive(makeChar({ ...o, feats: [id, ...((o as { feats?: string[] }).feats ?? [])] }), r);
  };
}
