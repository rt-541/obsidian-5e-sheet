import { parseNote } from "../../src/core/character";
import { derive, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";

const R = mechanicsRegistry();
const K = "feature:class:tester:1:";
const addFeat = (r: ReturnType<typeof mechanicsRegistry>, id: string, grants: object[]) => {
  const bad = r.add("vault", "feat", { name: id, grants }, { path: `${id}.md` }); if (bad) throw new Error(JSON.stringify(bad));
};
addFeat(R, "iron-hide", [{ op: "feature", id: "hide", name: "Iron Hide", effects: { modifiers: [{ target: "ac", value: 1 }] } }]);
const HIDE = { "feature:feat:iron-hide:hide": { toggle: { id: "iron-hide", endsOn: "short" } } };

describe("customizations at derive", () => {
  it("a plain feature becomes a switch whose effects count only while on", () => {
    const off = derive(makeChar({ feats: ["iron-hide"], customize: HIDE }), R);
    expect(off.toggles.find(t => t.id === "iron-hide")).toMatchObject({ on: false, ref: "feature:feat:iron-hide:hide" });
    const on = derive(makeChar({ feats: ["iron-hide"], active: { "iron-hide": true }, customize: HIDE }), R);
    expect(on.ac.value).toBe(off.ac.value + 1);
  });
  it("a note switch removed with false: its effects always count", () => {
    const st = derive(makeChar({ customize: { [K + "stance-high"]: { toggle: false } } }), R);
    expect(st.toggles.some(t => t.id === "stance-high")).toBe(false);
    expect(st.ac.value).toBe(derive(makeChar(), R).ac.value + 1);
  });
  it("a feature gains a Use button and an attack option (P3 card lists it)", () => {
    const st = derive(makeChar({ customize: { [K + "fury"]: { action: { name: "Roar", heal: "1d6" }, attackOption: { onHit: { byLevel: { 1: "1d4" } }, resource: "Fury" } } } }), R);
    const f = st.progress.features.find(x => x.key === "class:tester:1:fury")!;
    expect(f.action).toEqual({ name: "Roar", heal: "1d6" }); expect(f.attackOption?.onHit).toBe("1d4"); expect(f.custom).toBe(true);
    expect(f.noteDefs?.toggle?.id).toBe("fury");
    expect(st.attackOptions.some(o => o.name === "Fury")).toBe(true);
  });
  it("grows with level: nothing until the first level", () => {
    const st = derive(makeChar({ customize: { [K + "fury"]: { attackOption: { onHit: { byLevel: { 3: "1d4" } } } } } }), R);
    expect(st.progress.features.find(x => x.key === "class:tester:1:fury")!.attackOption).toBeUndefined();
    expect(st.progress.problems).toEqual([]);
  });
  it("a bad customization keeps the note version, stays writable and is listed in words", () => {
    const p = parseNote({ ...tester, customize: { [K + "fury"]: { toggle: { endsOn: "tomorrow" } } } }) as any;
    expect(p.writable).toBe(true);
    const st = derive(p.value, R);
    expect(st.toggles.find(t => t.id === "fury")!.def.endsOn).toBe("long");
    expect(st.progress.problems).toContain("Your changes to Fury could not be used, so the note's version is shown. Open Customize to fix or reset them.");
  });
  it("a later note change shows through fields the player did not touch", () => {
    const r1 = mechanicsRegistry();
    addFeat(r1, "shock-palm", [{ op: "feature", id: "palm", name: "Shock Palm", action: { name: "Palm", damage: "1d6" } }]);
    const cz = { "feature:feat:shock-palm:palm": { action: { damageType: "lightning" } } };
    const f1 = derive(makeChar({ feats: ["shock-palm"], customize: cz }), r1).progress.features.find(x => x.key === "feat:shock-palm:palm")!;
    expect(f1.action).toEqual({ name: "Palm", damage: "1d6", damageType: "lightning" });
    const r2 = mechanicsRegistry();
    addFeat(r2, "shock-palm", [{ op: "feature", id: "palm", name: "Shock Palm", action: { name: "Palm", damage: "1d8" } }]);
    const f2 = derive(makeChar({ feats: ["shock-palm"], customize: cz }), r2).progress.features.find(x => x.key === "feat:shock-palm:palm")!;
    expect(f2.action).toEqual({ name: "Palm", damage: "1d8", damageType: "lightning" });
  });
  it("derive never mutates registry data", () => {
    const before = structuredClone(R.get("class", "tester")!.data);
    derive(makeChar({ customize: { [K + "fury"]: { toggle: { group: "g" } } } }), R);
    expect(R.get("class", "tester")!.data).toEqual(before);
  });
});
