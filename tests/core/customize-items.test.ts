// @vitest-environment jsdom
import { parseNote, type Character } from "../../src/core/character";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { derive, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";

const R = mechanicsRegistry();
const add = (type: string, data: Record<string, unknown>, path: string) => { const bad = R.add("vault", type, data, { path }); if (bad) throw new Error(JSON.stringify(bad)); };
add("item", { name: "Humming Stone", kind: "wondrous", effects: { modifiers: [{ target: "speed", value: 5 }] } }, "hs.md");
add("item", { name: "Tingle Wand", kind: "wondrous", charges: { max: 3, reset: "dawn" } }, "tw.md");

const TINGLE = { name: "Tingle", damage: "1d6", damageType: "lightning", cost: { charges: 1 } };
const wand = (o: object = {}) => ({ id: "tingle-wand", qty: 1, equipped: true, customize: { action: TINGLE }, ...o });

function ctlFor(inventory: object[]) {
  const host: SheetHost = { registry: R, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [] };
  const p = parseNote({ ...tester, inventory });
  if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p);
  return { ctl, st: ctl.stats()! };
}

describe("item customizations", () => {
  it("one row made a switch; the other copy is untouched", () => {
    const inv = [{ id: "humming-stone", qty: 1, equipped: true }, { id: "humming-stone", qty: 1, equipped: true, customize: { toggle: { id: "humming-stone-2" } } }];
    const st = derive(makeChar({ inventory: inv }), R);
    expect(st.toggles.filter(t => t.ref.startsWith("item:")).map(t => [t.id, t.itemIndex])).toEqual([["humming-stone-2", 1]]);
    expect(st.speed.value).toBe(derive(makeChar(), R).speed.value + 5); // row 0 still counts, row 1 is off
  });
  it("turning the switch on lets the row count", () => {
    const inv = [{ id: "humming-stone", qty: 1, equipped: true, customize: { toggle: { id: "humming-stone-2" } } }];
    const off = derive(makeChar({ inventory: inv }), R), on = derive(makeChar({ inventory: inv, active: { "humming-stone-2": true } }), R);
    expect(on.speed.value).toBe(off.speed.value + 5);
  });
  it("an item Use action spends its own charges", () => {
    const { ctl, st } = ctlFor([wand()]);
    expect(st.itemActions).toEqual([{ index: 0, name: "Tingle Wand", action: TINGLE }]);
    ctl.useAction(st.itemActions[0], 0);
    expect((ctl.value as Character).inventory[0].charges).toEqual({ used: 1 });
  });
  it("a custom item can get a Use action", () => {
    const st = derive(makeChar({ inventory: [{ name: "Odd Charm", qty: 1, customize: { action: { name: "Zap", heal: "1d4" } } }] }), R);
    expect(st.itemActions.map(a => a.action.name)).toEqual(["Zap"]);
  });
  it("an unequipped item offers no Use action", () => {
    expect(derive(makeChar({ inventory: [wand({ equipped: false })] }), R).itemActions).toEqual([]);
  });
  it("registry item data is never changed", () => {
    const reg = (id: string) => JSON.stringify(R.get("item", id)?.data);
    const before = [reg("humming-stone"), reg("tingle-wand")];
    derive(makeChar({ inventory: [wand(), { id: "humming-stone", qty: 1, equipped: true, customize: { toggle: { id: "x" }, attackOption: { id: "x", onHit: "1d4" } } }], active: { x: true } }), R);
    expect([reg("humming-stone"), reg("tingle-wand")]).toEqual(before);
  });
});
