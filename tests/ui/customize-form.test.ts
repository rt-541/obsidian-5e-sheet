// @vitest-environment jsdom
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { customizationFrom, formFrom, formProblem } from "../../src/ui/customize-form";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

describe("customize form model", () => {
  it("changing only the damage type stores only that", () => {
    const note = { action: { name: "Palm", damage: "1d6" } };
    const f = formFrom(note, undefined, false, "Shock Palm"); f.damageType = "lightning";
    expect(customizationFrom(f, note, "Shock Palm", [])).toEqual({ action: { damageType: "lightning" } });
  });
  it("an untouched form stores nothing", () => {
    const note = { toggle: { id: "fury", endsOn: "long" as const, cost: { resource: "Fury" } }, attackOption: { id: "x", onHit: "1d4", oncePerTurn: true }, action: { name: "Palm", damage: "1d6", save: { abil: "dex" as const, dc: "spell" } } };
    expect(customizationFrom(formFrom(note, undefined, false, "X"), note, "X", [])).toEqual({});
  });
  it("a new switch gets a fresh id; switching off a note switch stores false", () => {
    const f = formFrom({}, undefined, false, "Fury"); f.isSwitch = true;
    expect(customizationFrom(f, {}, "Fury", ["fury"]).toggle).toEqual({ id: "fury-2", endsOn: "long" });
    const g = formFrom({ toggle: { id: "fury", endsOn: "long" } }, undefined, false, "Fury"); g.isSwitch = false;
    expect(customizationFrom(g, { toggle: { id: "fury", endsOn: "long" } }, "Fury", [])).toEqual({ toggle: false });
  });
  it("making a note's cost free stores null for the cost", () => {
    const note = { toggle: { id: "fury", endsOn: "long" as const, cost: { resource: "Fury" } } };
    const f = formFrom(note, undefined, false, "Fury"); expect(f.switchCost).toBe("resource"); f.switchCost = "free";
    expect(customizationFrom(f, note, "Fury", [])).toEqual({ toggle: { cost: null } });
  });
  it("grows with level round-trips", () => {
    const mine = { attackOption: { onHit: { byLevel: { 3: "1d4", 7: "2d4" } } } };
    const f = formFrom({ attackOption: { id: "x", onHit: "1d4" } }, mine, false, "X");
    expect(f.onHitDice).toEqual({ mode: "levels", dice: "", scale: "", levels: [{ level: "3", dice: "1d4" }, { level: "7", dice: "2d4" }] });
    expect(customizationFrom(f, { attackOption: { id: "x", onHit: "1d4" } }, "X", [])).toEqual({ attackOption: { onHit: { byLevel: { 3: "1d4", 7: "2d4" } } } });
  });
  it("a note's own level table opens as levels and is not stored again", () => {
    const note = { attackOption: { id: "x", scale: { 1: "1d4", 5: "2d4" } } };
    const f = formFrom(note, undefined, false, "X");
    expect(f.onHit).toBe(true); expect(f.onHitDice.mode).toBe("levels");
    expect(customizationFrom(f, note, "X", [])).toEqual({});
  });
  it("a lone {scale} opens in scale mode and is written back as {scale}", () => {
    const note = { attackOption: { id: "x", onHit: "{surge}" } };
    const f = formFrom(note, undefined, false, "X");
    expect(f.onHitDice).toEqual({ mode: "scale", dice: "", scale: "surge", levels: [] });
    f.onHitDice = { ...f.onHitDice, scale: "bolt" };
    expect(customizationFrom(f, note, "X", [])).toEqual({ attackOption: { onHit: "{bolt}" } });
  });
  it("level rows that are not a level from 1 to 20 are left out", () => {
    const f = formFrom({}, undefined, false, "X"); f.isOption = true; f.onHit = true;
    f.onHitDice = { mode: "levels", dice: "", scale: "", levels: [{ level: "2", dice: "1d4" }, { level: "30", dice: "2d4" }, { level: "x", dice: "3d4" }] };
    expect(customizationFrom(f, {}, "Spark", []).attackOption).toEqual({ id: "spark", onHit: { byLevel: { 2: "1d4" } } });
  });
  it("a new Use button and a charges switch cost are stored in full", () => {
    const f = formFrom({}, undefined, false, "Gem"); f.hasUse = true; f.useName = " Flash "; f.useEffect = "heal"; f.useDice.dice = "2d4+2"; f.useCost = "charges"; f.useCharges = "2";
    f.isSwitch = true; f.switchCost = "slot"; f.switchSlot = "3";
    expect(customizationFrom(f, {}, "Gem", [])).toEqual({ toggle: { id: "gem", endsOn: "long", cost: { slot: 3 } }, action: { name: "Flash", heal: "2d4+2", cost: { charges: 2 } } });
  });
  it("plain-words problems, in order", () => {
    const f = formFrom({}, undefined, false, "X"); f.hasUse = true; f.useEffect = "damage"; f.useDice = { ...f.useDice, dice: "a lot" };
    expect(formProblem(f, [])).toBe("Dice must look like 1d4 or 2d6+1.");
    f.isSwitch = true; f.switchCost = "resource";
    expect(formProblem(f, [])).toBe("Pick the resource it spends.");
    f.isSwitch = false; f.useDice = { mode: "scale", dice: "", scale: "", levels: [] };
    expect(formProblem(f, ["bolt"])).toBe("Pick a scale.");
    f.useDice = { mode: "levels", dice: "", scale: "", levels: [{ level: "", dice: "" }] };
    expect(formProblem(f, [])).toBe("Give at least one level and its dice.");
    f.useDice = { mode: "dice", dice: "1d6", scale: "", levels: [] }; f.isOption = true;
    expect(formProblem(f, [])).toBe("Pick what the attack option does.");
    f.isOption = false; f.saveAbil = "dex"; f.dcFrom = "fixed"; f.dcFixed = "high";
    expect(formProblem(f, [])).toBe("A fixed DC must be a whole number, such as 13.");
    f.dcFixed = "13";
    expect(formProblem(f, [])).toBe("Give the Use button a name.");
    f.useName = "Zap";
    expect(formProblem(f, [])).toBeUndefined();
  });
});

function setup(note: object = {}) {
  const r = mechanicsRegistry();
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [],
    saveItem: vi.fn(), saveCreature: vi.fn(), saveSpell: vi.fn(), updateSpell: vi.fn() };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  return { ctl: new SheetController(host, p), host, saved, notices };
}
const FURY = { kind: "feature" as const, key: "class:tester:1:fury", name: "Fury", pinRef: "feature:class:tester:1:fury" };

describe("customize commands", () => {
  it("save writes only the character note, then Reset removes it", () => {
    const s = setup();
    s.ctl.setEditing(true); s.ctl.startCustomize(FURY);
    expect(s.ctl.panel).toEqual({ kind: "customize-row" });
    s.ctl.touchCustomize(f => { f.group = "rage"; f.pin = true; });
    expect(s.ctl.saveCustomize()).toBe(true);
    const c = s.saved.at(-1) as Character;
    expect(c.customize).toEqual({ "feature:class:tester:1:fury": { toggle: { group: "rage" } } });
    expect(c.mainPins).toContain("feature:class:tester:1:fury");
    expect(s.notices.at(-1)).toBe("Saved your changes to Fury.");
    expect(s.ctl.panel).toBeNull(); expect(s.ctl.customizeDraft).toBeNull();
    for (const fn of [s.host.saveItem, s.host.saveCreature, s.host.saveSpell, s.host.updateSpell]) expect(fn).not.toHaveBeenCalled();
    s.ctl.startCustomize(FURY);
    expect(s.ctl.customizeDraft!.form.group).toBe("rage");
    expect(s.ctl.resetCustomize()).toBe(true);
    expect((s.ctl.value as Character).customize).toEqual({}); expect((s.ctl.value as Character).mainPins).toContain("feature:class:tester:1:fury");
    expect(s.notices.at(-1)).toBe("Fury is back to what its note says.");
  });
  it("a problem is shown in the form and nothing is saved", () => {
    const s = setup(); s.ctl.startCustomize(FURY);
    s.ctl.touchCustomize(f => { f.hasUse = true; });
    const before = s.saved.length;
    expect(s.ctl.saveCustomize()).toBe(false);
    expect(s.ctl.customizeDraft!.error).toBe("Give the Use button a name."); expect(s.saved.length).toBe(before); expect(s.ctl.panel).toEqual({ kind: "customize-row" });
  });
  it("cancel closes the form without saving", () => {
    const s = setup(); s.ctl.startCustomize(FURY); s.ctl.touchCustomize(f => { f.group = "x"; });
    s.ctl.cancelCustomize();
    expect(s.ctl.panel).toBeNull(); expect(s.ctl.customizeDraft).toBeNull(); expect(s.saved.length).toBe(0);
  });
  it("a read-only note cannot be customized", () => {
    const s = setup({ customize: { "feature:class:tester:1:fury": { nonsense: {} } } });
    expect(s.ctl.writable).toBe(false);
    s.ctl.startCustomize(FURY);
    expect(s.ctl.panel).toBeNull(); expect(s.ctl.customizeDraft).toBeNull();
    expect(s.notices.at(-1)).toContain("read-only");
  });
  it("leaving Edit mode closes the form without saving", () => {
    const s = setup(); s.ctl.setEditing(true); s.ctl.startCustomize(FURY);
    s.ctl.setEditing(false);
    expect(s.ctl.panel).toBeNull(); expect(s.ctl.customizeDraft).toBeNull(); expect(s.saved.length).toBe(0);
  });
});
