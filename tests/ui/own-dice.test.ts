// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";
import { sheetWith } from "../fixtures/attack-options";

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`own dice (${layout})`, () => {
  it("every roll says what to roll, still spends, and asks Hit / Miss / Crit for attacks", () => {
    const s = sheetWith(layout, { feats: ["test-focus", "test-analysis"], optionsOn: ["test-focus", "test-analysis"], rules: { "own-dice": true } });
    const rngSpy = vi.fn(() => 0.5); s.host.rng = rngSpy;
    const a = s.ctl.stats()!.attacks.find(x => x.name === "Longsword")!;
    s.click(s.row("Longsword").querySelector('[data-act="to-hit"]'));
    expect(rngSpy).not.toHaveBeenCalled();
    expect(s.q(".fe-own-roll").textContent).toContain(`Roll 1d20 ${a.toHit! < 0 ? "-" : "+"} ${Math.abs(a.toHit!)}, plus 1d4 for Test Focus (1 Focus Dice spent, 2 of 3 left)`);
    expect(s.left("focus-dice").used).toBe(1);
    expect(s.q(".fe-toast").hidden).toBe(true);
    s.click(s.q('[data-act="own-miss"]'));
    expect(s.left("insight-dice").used).toBe(0); expect(s.q(".fe-own-roll")).toBeNull();
    s.click(s.row("Longsword").querySelector('[data-act="to-hit"]')); s.click(s.q('[data-act="own-crit"]'));
    expect(s.q(".fe-own-roll").textContent).toContain("+ 2d4 for Test Analysis (1 Insight Dice spent, 1 of 2 left)");
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 2d8 + 3 slashing");
    expect(rngSpy).not.toHaveBeenCalled();
    // a total is optional; a bad one keeps the box open with a message
    (s.q('[data-keep="own-total"]') as HTMLInputElement).value = "17.5"; s.click(s.q('[data-act="own-log"]'));
    expect(s.q(".fe-own-error").textContent).toBe("Type the total you rolled, a whole number.");
    (s.q('[data-keep="own-total"]') as HTMLInputElement).value = "17"; s.click(s.q('[data-act="own-log"]'));
    expect(s.host.log[0].own).toEqual({ total: 17 }); expect(s.q(".fe-own-roll")).toBeNull();
    // checks and saves: instruction only, and the mode switch snaps back
    s.ctl.setMode("adv"); s.click(s.q('[data-feature="saves"] .fe-roll'));
    expect(s.q(".fe-own-roll").textContent).toContain("Roll 2d20, keep the higher,"); expect(s.ctl.mode).toBe("normal");
    expect(s.q('[data-act="own-hit"]')).toBeNull();
    s.click(s.q('[data-act="own-close"]')); expect(s.q(".fe-own-roll")).toBeNull();
    // the log shows no 0 for an entry without a total
    s.ctl.open({ kind: "log" }); expect(s.q(".fe-log b").textContent).toBe("");
  });

  it("using an action says every part in one entry, spends its cost and the to-hit options, and rolls nothing", () => {
    const s = sheetWith(layout, { feats: ["test-flurry", "test-focus"], optionsOn: ["test-focus"], rules: { "own-dice": true } });
    const rngSpy = vi.fn(() => 0.5); s.host.rng = rngSpy;
    const f = s.ctl.stats()!.progress.features.find(x => x.action?.name === "Flurry Strike")!;
    s.ctl.useAction(f);
    expect(rngSpy).not.toHaveBeenCalled();
    expect(s.left("flurry-dice").used).toBe(1);
    expect(s.left("focus-dice").used).toBe(1);
    expect(s.host.log.length).toBe(1);
    const text = s.host.log[0].detail;
    const parts = text.split("; ");
    expect(parts[0]).toMatch(/^Flurry Dice -1$/);
    expect(parts[1]).toMatch(/^Roll 1d20 \+ 5, plus 1d4 for Test Focus/);
    expect(parts[2]).toMatch(/^They roll a DEX save against DC \d+$/);
    expect(parts[3]).toBe("you roll 2d6 + 1");
    expect(parts[4]).toBe("Roll 1d4 healing");
    expect(parts.length).toBe(5);
    expect(s.q(".fe-own-roll").textContent).toContain(text);
  });

  it("Hit says the plain damage and spends the on-hit options like sheet mode", () => {
    const s = sheetWith(layout, { feats: ["test-focus", "test-analysis"], optionsOn: ["test-focus", "test-analysis"], rules: { "own-dice": true } });
    const rngSpy = vi.fn(() => 0.5); s.host.rng = rngSpy;
    s.click(s.row("Longsword").querySelector('[data-act="to-hit"]'));
    expect(s.left("insight-dice").used).toBe(0);
    s.click(s.q('[data-act="own-hit"]'));
    const t = s.q(".fe-own-roll").textContent!;
    expect(t).toContain("Roll 1d8 + 3 slashing"); expect(t).not.toContain("2d8");
    expect(t).toContain("+ 1d4 for Test Analysis"); expect(t).not.toContain("2d4");
    expect(s.left("insight-dice").used).toBe(1);
    expect(rngSpy).not.toHaveBeenCalled();
  });

  it("the settings switch turns it on, stores it on the character and closes an open box", () => {
    const t = sheetWith(layout);
    t.click(t.q('[data-setting="own-dice"] [data-opt="on"]'));
    expect(t.ctl.ownDice()).toBe(true); expect(t.ctl.character!.rules["own-dice"]).toBe(true);
    expect(t.q('[data-setting="own-dice"] [data-opt="on"]').getAttribute("aria-pressed")).toBe("true");
    t.click(t.q('[data-feature="saves"] .fe-roll')); expect(t.q(".fe-own-roll")).not.toBeNull();
    t.click(t.q('[data-setting="own-dice"] [data-opt="off"]')); expect(t.q(".fe-own-roll")).toBeNull();
  });

  it("a spell with a save says half on a save", () => {
    const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
    const host: SheetHost = { registry: r, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], rng: seeded(3), body: "" };
    const p = parseNote({ ...thalia, spells: [{ id: "burning-hands", prepared: true }], rules: { "own-dice": true } }); if (p.kind === "none") throw new Error("not a sheet");
    const ctl = new SheetController(host, p), root = document.createElement("div"); document.body.append(root); mountSheet(root, ctl, layout);
    ctl.setTab("spells");
    root.querySelector<HTMLElement>('[data-spell="burning-hands"] button[title="Damage"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.querySelector(".fe-own-roll")!.textContent).toMatch(/They roll a DEX save against DC \d+; you roll .*, half on a save/);
  });
});

describe("own dice off", () => {
  it("campaign default is respected and the character overrides it", () => {
    const on = sheetWith("desktop", {}); on.host.campaign = { rules: { "own-dice": true } } as never; expect(on.ctl.ownDice()).toBe(true);
    const off = sheetWith("desktop", { rules: { "own-dice": false } }); off.host.campaign = { rules: { "own-dice": true } } as never; expect(off.ctl.ownDice()).toBe(false);
  });
  it("rolls as before: no box, a number in the log", () => {
    const s = sheetWith("desktop"); s.click(s.q('[data-feature="saves"] .fe-roll'));
    expect(s.q(".fe-own-roll")).toBeNull(); expect(s.host.log[0].own).toBeUndefined();
  });
});
