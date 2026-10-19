// @vitest-environment jsdom
import type { Registry } from "../../src/content/registry";
import { parseNote, type Character } from "../../src/core/character";
import { setup, LAYOUTS } from "./spells-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());

const withSpark = { ...thalia, spells: [{ id: "test-spark", prepared: false }, { id: "cure-wounds", prepared: true }] };
const glowWand = (r: Registry) => r.add("vault", "item", { id: "glow-wand", name: "Glow Wand", kind: "wondrous", attunement: true, charges: { max: 3, reset: "dawn" },
  grants: { spells: [{ id: "glow-ward", charges: 1 }] } }, { path: "gw.md" });

describe.each(LAYOUTS)("manage a known spell on the %s layout", layout => {
  const open = (s: ReturnType<typeof setup>, id: string) => { s.click('[data-tab="spells"]'); s.click(`[data-spell="${id}"] [data-act="spell-menu"]`); };

  it("the ... menu works in Play mode and its Prepared switch matches the dot", () => {
    const s = setup(withSpark, layout);
    expect(s.ctl.editing).toBe(false);
    open(s, "test-spark");
    const prep = s.q('[data-menu="test-spark"] [data-act="menu-prepare"]');
    expect(prep.getAttribute("aria-checked")).toBe("false");
    prep.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(s.ctl.character!.spells[0].prepared).toBe(true);
    expect(s.q('[data-menu="test-spark"] [data-act="menu-prepare"]').getAttribute("aria-checked")).toBe("true");
    expect(s.q('[data-spell="test-spark"] [data-act="prepare"]').classList.contains("is-prof")).toBe(true);
    expect((s.saved.at(-1) as Character).spells.find(x => x.id === "test-spark")).toMatchObject({ prepared: true });
  });

  it("Always prepared persists, counts as prepared and cannot be switched off with Prepared", () => {
    const s = setup(withSpark, layout);
    open(s, "test-spark");
    s.click('[data-menu="test-spark"] [data-act="menu-always"]');
    expect(s.ctl.character!.spells[0]).toMatchObject({ id: "test-spark", prepared: true, always: true });
    expect((s.saved.at(-1) as Character).spells[0].always).toBe(true);
    expect(s.q('[data-spell="test-spark"] [data-act="prepare"]').classList.contains("is-prof")).toBe(true);
    expect((s.q('[data-menu="test-spark"] [data-act="menu-prepare"]') as HTMLButtonElement).disabled).toBe(true);
    s.click('[data-spell="test-spark"] [data-act="prepare"]');   // the dot does nothing either
    expect(s.ctl.character!.spells[0].prepared).toBe(true);
    s.click('[data-menu="test-spark"] [data-act="menu-always"]');
    expect(s.ctl.character!.spells[0].always).toBeUndefined();
  });

  it("the note round-trips always: true through the parser", () => {
    const p = parseNote({ ...thalia, spells: [{ id: "test-spark", prepared: true, always: true }] });
    expect(p.kind === "character" && p.value.spells[0].always).toBe(true);
    const bad = parseNote({ ...thalia, spells: [{ id: "test-spark", prepared: true, always: "yes" }] });
    expect(bad.kind !== "none" && bad.errors.some(e => e.includes("always"))).toBe(true);
  });

  it("Remove asks first: No keeps the spell, Yes removes it and its pin", () => {
    const s = setup({ ...withSpark, mainSpells: ["test-spark"] }, layout);
    open(s, "test-spark");
    s.click('[data-menu="test-spark"] [data-act="menu-remove"]');
    expect(s.q('[data-menu="test-spark"] [data-confirm]').textContent).toContain("Remove Test Spark?");
    s.click('[data-act="remove-no"]');
    expect(s.ctl.character!.spells.map(x => x.id)).toContain("test-spark");
    s.click('[data-menu="test-spark"] [data-act="menu-remove"]'); s.click('[data-act="remove-yes"]');
    expect(s.ctl.character!.spells.map(x => x.id)).not.toContain("test-spark");
    expect(s.ctl.character!.mainSpells).toEqual([]);
    expect(s.q('[data-menu="test-spark"]')).toBeNull();
  });

  it("a spell granted by an attuned item cannot be removed or edited, and the menu says so", () => {
    const s = setup({ ...thalia, inventory: [{ id: "glow-wand", equipped: true, attuned: true }] }, layout, {}, glowWand);
    s.click('[data-tab="spells"]');
    s.click('[data-feature="spells"] [data-from-items] [data-spell="glow-ward"] [data-act="spell-menu"]');
    const m = s.q('[data-menu="glow-ward"]');
    expect(m.textContent).toContain("comes from Glow Wand");
    expect(m.textContent).toContain("cannot be removed or edited");
    expect(m.querySelector('[data-act="menu-remove"]')).toBeNull();
    expect(m.querySelector("button")).toBeNull();
  });
});
