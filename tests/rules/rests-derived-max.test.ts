import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { activeRests } from "../../src/rules";
import { thalia } from "../fixtures/notes";
import { homebrewRegistry } from "../fixtures/homebrew";

// invented feat: +1 max HP per level
const stout = { type: "5e-feat", name: "Stout Heart", grants: [{ op: "effect", effects: { modifiers: [{ target: "hpMax", value: "total" }] } }] };
const r = homebrewRegistry([stout]);
const c = (o: object) => { const p = parseNote({ ...thalia, feats: ["stout-heart"], ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
const ctx = (ch: Character, rules: Record<string, boolean>) => ({ c: ch, stats: deriveCharacter(ch, { registry: r }), registry: r, rules });

describe("rests heal to the derived maximum", () => {
  it("long rest heals to the derived maximum", () => {
    const ch = c({ hp: { max: 43, current: 10, temp: 0 } }), L = activeRests({ "rest-standard": true }).find(x => x.id === "long")!;
    expect(ctx(ch, { "rest-standard": true }).stats.hpFull).toBe(48);
    expect(L.preview(ctx(ch, { "rest-standard": true }))).toContain("HP to 48");
    const v = L.apply(ctx(ch, { "rest-standard": true })).value;
    expect(v.hp).toEqual({ max: 43, current: 48, temp: 0 });   // the stored max is untouched
  });
  it("a Good Rest heals to the derived maximum", () => {
    const ex = { "rest-excursion": true }, n = activeRests(ex).find(x => x.id === "night")!;
    expect(n.apply(ctx(c({ rest: { nightsInPlace: 2 }, hp: { max: 43, current: 5, temp: 0 } }), ex), { samePlace: true }).value.hp.current).toBe(48);
  });
  it("exhaustion that stays at 4 or more halves the derived maximum", () => {
    const ch = c({ conditions: { exhaustion: 5 }, hp: { max: 43, current: 5, temp: 0 } });
    expect(activeRests({ "rest-standard": true }).find(x => x.id === "long")!.apply(ctx(ch, { "rest-standard": true })).value.hp.current).toBe(24);
  });
});
