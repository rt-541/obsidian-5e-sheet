import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import type { ConditionData } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { findOverlay, overlayKeys, overlayProblems } from "../../src/content/overlay";
import { VaultLoader } from "../../src/content/vault-loader";
import { editionNotes } from "../fixtures/editions";
import { LIBRARY_MARKER } from "../../src/content/sources";
import { fakeVault } from "../fixtures/library";
import audit from "./overlay-audit.json";

const ROOT = "compendium/5e";

const bundled = () => { const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); return r; };
const strings = (x: unknown, out: string[] = []): string[] => { if (typeof x === "string") out.push(x); else if (Array.isArray(x)) x.forEach(i => strings(i, out)); else if (x && typeof x === "object") Object.values(x).forEach(i => strings(i, out)); return out; };

describe("2024 conditions and the overlay audit", () => {
  it("the 2024 conditions are the same 15 names and exhaustion follows the 2024 numbers", () => {
    const r = bundled();
    const ex = r.forEdition("2024").get<ConditionData>("condition", "exhaustion")!.data;
    expect(r.forEdition("2024").list("condition")).toHaveLength(15);
    expect(r.forEdition("2014").list("condition")).toHaveLength(15);
    expect(r.forEdition("2024").list("condition").map(e => e.name)).toEqual(r.forEdition("2014").list("condition").map(e => e.name));
    expect(ex.levelEffects![3].modifiers).toEqual([{ target: "check", value: -6 }, { target: "attack", value: -6 }, { target: "save", value: -6 }, { target: "speed", value: -15 }]);
    expect(ex.levelEffects![6]).toEqual({ note: "Death." });
    expect(JSON.stringify(ex.levelEffects)).not.toContain("hpMax");
    expect(r.forEdition("2014").get<ConditionData>("condition", "exhaustion")!.data.levelEffects![4].modifiers).toContainEqual({ target: "hpMax", value: "half" });
  });
  it("the 2024 conditions differ from 2014 where the 2024 rules differ", () => {
    const r = bundled(), c = (e: "2014" | "2024", id: string) => r.forEdition(e).get<ConditionData>("condition", id)!.data.effects;
    expect(c("2014", "stunned").modifiers).toEqual([{ target: "speed", value: "zero" }]); expect(c("2024", "stunned").modifiers).toBeUndefined();
    expect(c("2014", "grappled").dis).toBeUndefined(); expect(c("2024", "grappled").dis).toBeUndefined();
    expect(c("2024", "grappled").modifiers).toEqual([{ target: "speed", value: "zero" }]);
  });
  it("an unlensed registry still reads the 2014 conditions", () => {
    expect(bundled().get<ConditionData>("condition", "exhaustion")!.data.levelEffects![4].modifiers).toContainEqual({ target: "hpMax", value: "half" });
  });
  it("an unlensed registry's library condition falls back to the SRD entry of its own edition", async () => {
    const note = (ed: string) => ({ fm: { type: "5e-condition", name: "Exhaustion", edition: ed }, body: "An invented sentence." });
    const load = async (ed: string, folder: string) => {
      const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
      await new VaultLoader(r, fakeVault({ ...editionNotes(), [`${ROOT}/${folder}/Conditions/Exhaustion.md`]: note(ed) }, { markers: [`${ROOT}/${folder}/${LIBRARY_MARKER}`] }), ROOT).indexAll();
      return JSON.stringify(r.get<ConditionData>("condition", "exhaustion")!.data.levelEffects);
    };
    expect(await load("2024", "WotC 2024")).not.toContain("hpMax");
    expect(await load("2014", "Test Press")).toContain("hpMax");
  });
  it("srdEntry names the edition and defaults to 2014", () => {
    const r = bundled();
    expect(r.srdEntry("condition", "exhaustion")!.edition).toBe("2014");
    expect(r.srdEntry("condition", "exhaustion", "2024")!.edition).toBe("2024");
    expect(r.srdEntry("spell", "fire-bolt", "2024")).toBeUndefined();
  });
  it("a 2024 library condition takes its effects from the 2024 bundled one", async () => {
    const note = (ed: string) => ({ fm: { type: "5e-condition", name: "Exhaustion", edition: ed }, body: "An invented sentence." });
    const notes = { ...editionNotes(), [`${ROOT}/WotC 2024/Conditions/Exhaustion.md`]: note("2024"), [`${ROOT}/Test Press/Conditions/Exhaustion.md`]: note("2014") };
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    await new VaultLoader(r, fakeVault(notes, { markers: ["WotC 2024", "Test Press"].map(f => `${ROOT}/${f}/${LIBRARY_MARKER}`) }), ROOT).indexAll();
    const lv = (e: "2014" | "2024") => r.forEdition(e).get<ConditionData>("condition", "exhaustion")!.data.levelEffects;
    expect(JSON.stringify(lv("2024"))).not.toContain("hpMax"); expect(JSON.stringify(lv("2014"))).toContain("hpMax");
  });
  it("every bundled overlay entry has an audit verdict and no verdict is stale", () => {
    expect(overlayProblems()).toEqual([]);
    const verdicts = audit as Record<string, string>, keys = overlayKeys().map(k => k.replace(/@20\d\d$/, ""));
    for (const k of keys) expect(["both", "2014", "twin"], k).toContain(verdicts[k]);
    expect(Object.keys(verdicts).filter(k => !keys.includes(k))).toEqual([]);
  });
  it("every entry judged 2014 is limited to 2014 and every twin has its @2024 entry", () => {
    const keys = overlayKeys(), verdicts = audit as Record<string, string>;
    for (const [k, v] of Object.entries(verdicts)) {
      if (v === "2014") { expect(keys, k).toContain(`${k}@2014`); expect(keys, k).not.toContain(k); }
      if (v === "twin") expect(keys, k).toContain(`${k}@2024`);
      if (v === "both") { expect(keys, k).toContain(k); expect(keys.some(x => x.startsWith(k + "@")), k).toBe(false); }
    }
  });
  it("no bundled data file holds rules wording", () => {
    const raw = JSON.parse(readFileSync("src/content/srd/conditions-2024.json", "utf8")) as Record<string, unknown>[];
    expect(raw).toHaveLength(15);
    for (const c of raw) expect("rules" in c, String(c.name)).toBe(false);
    for (const s of strings(raw)) expect(s.length).toBeLessThanOrEqual(120);
  });
  it("every string in a @2024 overlay entry is short and in our own words", () => {
    const raw = JSON.parse(readFileSync("src/content/overlay/mechanics.json", "utf8")) as { entries: Record<string, unknown> };
    const keys = Object.keys(raw.entries).filter(k => k.endsWith("@2024"));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) for (const s of strings(raw.entries[k])) expect(s.length, k).toBeLessThanOrEqual(120);
  });
  it("entries resolve by edition: 2014-only ones vanish for 2024 and twins carry the 2024 numbers", () => {
    expect(findOverlay("feat", [], "Sharpshooter", undefined, "2014")).toBeDefined(); expect(findOverlay("feat", [], "Sharpshooter", undefined, "2024")).toBeUndefined();
    expect(findOverlay("feat", [], "Tough", undefined, "2024")).toBeDefined();
    const mod = (e: "2014" | "2024") => findOverlay("feat", [], "Alert", undefined, e)!.effects.modifiers![0].value;
    expect(mod("2014")).toBe(5); expect(mod("2024")).toBe("prof");
    expect(findOverlay("class", ["fighter"], "Two Extra Attacks", undefined, "2024")!.effects.attacks).toBe(3);
    expect(findOverlay("class", ["fighter"], "Two Extra Attacks", undefined, "2014")).toBeUndefined();
  });
});
