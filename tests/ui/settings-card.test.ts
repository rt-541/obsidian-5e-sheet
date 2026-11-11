// @vitest-environment jsdom
import { CHARACTER_FEATURES, DESKTOP, MOBILE, NPC_DESKTOP, NPC_MOBILE, TABLET, placed } from "../../src/ui/layouts";
import { maren } from "../fixtures/notes";
import { LAYOUTS, setup } from "./inventory-helpers";
import { sheet } from "./review-helpers";

type S = ReturnType<typeof setup>;
afterEach(() => document.body.replaceChildren());

describe.each(LAYOUTS)("settings card (%s)", layout => {
  const opts = (s: S) => s.all('[data-feature="settings"] .fe-setting').map(r => [r.dataset.setting, ...[...r.querySelectorAll(".fe-mode-opt")].map(b => `${b.textContent}${b.getAttribute("aria-pressed") === "true" ? "*" : ""}`)]);
  it("shows three switches with their current option", () => {
    const s = setup(layout);
    expect(s.q('[data-feature="settings"] .fe-card-title').textContent).toBe("Settings");
    expect(opts(s)).toEqual([["rest-mode", "Normal (short and long)*", "Hexploration (night's rest)"], ["hex", "Hex (rations and foraging)", "Trad (no rations)*"], ["own-dice", "Off*", "On"]]);
    expect(s.saved).toHaveLength(0);   // an old note without these fields is not rewritten
  });
  it("sits under Skills (desktop, tablet) or after the Rest card (phone)", () => {
    const s = setup(layout), set = s.q('[data-feature="settings"]');
    const before = (set.previousElementSibling as HTMLElement).dataset.feature;
    expect(before).toBe(layout === "mobile" ? "rests" : "skills");
    expect(set.closest("[data-pane]")).toBe(s.q('[data-feature="rests"]').closest("[data-pane]"));
  });
  it("the Rest card keeps only its rest buttons", () => {
    const s = setup(layout);
    expect(s.q('[data-feature="rests"] [data-rest-mode]')).toBeNull();
    expect(s.all('[data-feature="rests"] .fe-rests .fe-btn').map(b => b.textContent)).toEqual(["Short rest", "Long rest"]);
  });
  it("Hex / Trad switches the hexploration rule and the rations card", () => {
    const s = setup(layout);
    s.click(s.q('[data-setting="hex"] [data-opt="on"]'));
    expect(s.saved.at(-1)!.rules).toEqual({ hexploration: true }); expect(s.q('[data-feature="rations"]')).toBeTruthy();
    s.click(s.q('[data-setting="hex"] [data-opt="off"]'));
    expect(s.saved.at(-1)!.rules).toEqual({ hexploration: false }); expect(s.q('[data-feature="rations"]')).toBeNull();
  });
  it("I roll my own dice is saved on the character and wins over the campaign", () => {
    const s = setup(layout, {}, undefined, { name: "C", rules: { "own-dice": true }, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } });
    expect(s.ctl.ownDice()).toBe(true); expect(s.q('[data-setting="own-dice"] [data-opt="on"]').getAttribute("aria-pressed")).toBe("true");
    s.click(s.q('[data-setting="own-dice"] [data-opt="off"]'));
    expect(s.ctl.ownDice()).toBe(false); expect(s.saved.at(-1)!.rules).toEqual({ "own-dice": false });
  });
  it("a note with own-dice on shows On pressed", () => {
    const s = setup(layout, { rules: { "own-dice": true } });
    expect(s.q('[data-setting="own-dice"] [data-opt="on"]').getAttribute("aria-pressed")).toBe("true");
    expect(s.q('[data-setting="own-dice"] [data-opt="off"]').getAttribute("aria-pressed")).toBe("false");
  });
  it("clicking the option that is already on saves nothing", () => {
    const s = setup(layout);
    s.click(s.q('[data-setting="own-dice"] [data-opt="off"]')); s.click(s.q('[data-setting="hex"] [data-opt="off"]')); s.click(s.q('[data-setting="rest-mode"] [data-rest-mode="standard"]'));
    expect(s.saved).toHaveLength(0);
  });
  it("an NPC sheet has no Settings card", () => {
    const s = sheet(layout, maren);
    expect(s.root.querySelector('[data-feature="settings"]')).toBeNull();
  });
});

describe("settings placement", () => {
  it("every character layout places settings once and the NPC layouts never", () => {
    expect(CHARACTER_FEATURES).toContain("settings");
    for (const l of [DESKTOP, TABLET, MOBILE]) expect(placed(l).filter(f => f === "settings")).toHaveLength(1);
    for (const l of [NPC_DESKTOP, NPC_MOBILE]) expect(placed(l)).not.toContain("settings");
  });
});
