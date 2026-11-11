// @vitest-environment jsdom
import { validateAction } from "../../src/content/types/ops";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { actionDc } from "../../src/core/derive";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { derive, makeChar, mechanicsRegistry, tester } from "../fixtures/mechanics";

const R = mechanicsRegistry();

describe("action fields", () => {
  it("validates the new fields", () => {
    const e: string[] = [];
    expect(validateAction({ name: "Zap", damage: "2d10", damageType: "lightning", save: { abil: "dex", dc: 15 }, cost: { charges: 1 } }, "a", e))
      .toEqual({ name: "Zap", damage: "2d10", damageType: "lightning", save: { abil: "dex", dc: "15" }, cost: { charges: 1 } });
    expect(e).toEqual([]);
    validateAction({ name: "X", damageType: 4, cost: { charges: 0 } }, "a", e);
    expect(e).toEqual(["a.damageType: must be text", "a.cost.charges: must be a whole number from 1"]);
  });
  it("actionDc reads a fixed number, the spell DC and class DCs", () => {
    const st = derive(makeChar(), R);
    expect(actionDc(st, "13")).toEqual({ dc: 13, label: "DC 13" });
    expect(actionDc(st, "spell")).toBeUndefined(); // the tester class casts no spells
    expect(actionDc(st, "nonsense")).toBeUndefined();
  });
});

function setup(mobile: boolean) {
  const r = mechanicsRegistry();
  r.add("vault", "feat", { name: "Static Burst", grants: [{ op: "feature", id: "burst", name: "Burst",
    action: { name: "Burst", damage: "2d10", damageType: "lightning", save: { abil: "dex", dc: "12" }, cost: { resource: "Charge Jar" } } }] }, { path: "sb.md" });
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [] };
  const p = parseNote({ ...tester, feats: ["static-burst"], resources: [{ name: "Charge Jar", max: 2, used: 0, reset: "long" }] });
  if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const burstRow = ctl.stats()!.progress.features.find(f => f.name === "Burst")!;
  return { ctl, root, q, burstRow, notices };
}

for (const mobile of [false, true]) describe(`using an action (${mobile ? "mobile" : "desktop"})`, () => {
  it("Use spends a manual resource, names the DC and the damage type", () => {
    const s = setup(mobile);
    s.ctl.useAction(s.burstRow);
    expect((s.ctl.value as Character).resources[0].used).toBe(1);
    expect(s.ctl.host.log.map(r => r.title)).toEqual(["Burst damage (lightning)", "Burst used"]); // newest first
    expect(s.ctl.host.log[1].detail).toBe("Charge Jar -1 · DEX save DC 12");
  });
  it("refuses a charges cost on something that is not an item", () => {
    const s = setup(mobile);
    s.ctl.useAction({ action: { name: "Zap", cost: { charges: 1 } } });
    expect(s.notices).toEqual(["This only works on an item."]);
  });
  it("the Actions row says the damage type", () => expect(setup(mobile).q('[data-action$="burst"]').textContent).toContain("2d10 lightning"));
});
