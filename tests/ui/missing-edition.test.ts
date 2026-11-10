// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { editionRegistry } from "../fixtures/editions";
import { LAYOUTS, sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");
afterEach(() => document.body.replaceChildren());

const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const note = (edition: "2014" | "2024", o: Record<string, unknown> = {}) => ({ type: "5e-character", schema: 1, name: "Pip", edition, abilities: SCORES, hp: { max: 12, current: 12, temp: 0 }, classes: [], ...o });
async function mount(layout: (typeof LAYOUTS)[number], n: Record<string, unknown>) {
  const { r } = await editionRegistry();
  return { r, ...sheet(layout, n, [], { registry: r }) };
}
const lines = (el: ParentNode) => [...el.querySelectorAll<HTMLElement>(".fe-missing-line")];
const bring = (el: ParentNode) => [...el.querySelectorAll<HTMLElement>("button.fe-bring-in")];

for (const layout of LAYOUTS) {
  describe(`a missing reference, ${layout} sheet`, () => {
    it("a hand-edited reference only the other books have shows the marker, the plain line and the button", async () => {
      // a 2024 sheet naming a 2014-only race, spell, and an item only the 2014 third-party press has
      const s = await mount(layout, note("2024", { race: "fenling", spells: [{ id: "hush", prepared: false }], inventory: [{ id: "pewter-blade", qty: 1, equipped: false, attuned: false }], concentration: "hush" }));
      s.ctl.setTab?.("spells");
      const id = s.q(".fe-identity-label .fe-id-part.is-missing");
      expect(id.textContent).toBe("fenling (missing from compendium)");
      expect(id.nextElementSibling!.classList.contains("fe-missing-line")).toBe(true);
      expect(id.nextElementSibling!.textContent).toContain("This is in the 2014 books");
      const row = s.q('[data-spell="hush"]'), name = row.querySelector(".fe-spell-name.is-missing")!;
      expect(name.textContent).toBe("hush (missing from compendium)");
      expect(row.querySelector(".fe-missing-line")!.textContent).toContain("This is in the 2014 books");
      const b = row.querySelector<HTMLElement>("button.fe-bring-in")!;
      expect(b.getAttribute("type")).toBe("button"); expect(b.textContent).toBe("Bring in from the 2014 books");
      expect(css).toMatch(/\.fe-sheet button\.fe-bring-in/);
      const inv = s.q('[data-item="0"].is-missing');
      expect(inv.querySelector(".fe-missing-line")!.textContent).toContain("This is in the 2014 books");
      expect(inv.querySelector("button.fe-bring-in")).not.toBeNull();
    });

    it("pressing the button re-points just that reference and the sheet resolves it", async () => {
      const s = await mount(layout, note("2024", { spells: [{ id: "glint", prepared: true }, { id: "hush", prepared: false }], race: "fenling", subrace: "marsh-fenling",
        inventory: [{ id: "pewter-blade", qty: 1, equipped: false, attuned: false }], companions: [] }));
      s.ctl.setTab?.("spells");
      const before = bring(s.root).length;
      s.click(s.q('[data-spell="hush"] button.fe-bring-in'));
      expect(s.saved.at(-1)).toMatchObject({ spells: [{ id: "glint" }, { id: "hush@2014" }], race: "fenling", subrace: "marsh-fenling" });
      expect((s.saved.at(-1) as { inventory: { id: string }[] }).inventory[0].id).toBe("pewter-blade");
      expect(s.root.querySelector('[data-spell="hush@2014"]')?.querySelector(".fe-missing-line")).toBeNull();
      expect(s.q('[data-spell="hush@2014"] .fe-spell-name').textContent).toBe("Hush");
      expect(s.root.querySelector(".fe-panel")).toBeNull(); // no picker opened
      expect(bring(s.root).length).toBeLessThan(before);
      s.click(s.q(".fe-identity-label .fe-id-part.is-missing + .fe-missing-line button.fe-bring-in"));
      expect(s.saved.at(-1)).toMatchObject({ race: "fenling@2014", subrace: "marsh-fenling" });
      expect((s.saved.at(-1) as { spells: unknown[] }).spells).toHaveLength(2);
    });

    it("an id no edition has shows the marker only and does not throw (Review Focus 1)", async () => {
      const s = await mount(layout, note("2024", { race: "ghostrace", background: "ghostbg", spells: [{ id: "ghost", prepared: false }], concentration: "ghost",
        inventory: [{ id: "ghost-item", qty: 1, equipped: false, attuned: false }], companions: [{ creature: "ghost-beast", name: "Wisp", kind: "familiar", hp: { temp: 0 }, conditions: {} }], mastery: ["ghost-blade"], classes: [{ class: "ghost-class", level: 1 }] }));
      s.ctl.setTab?.("spells");
      expect(s.all(".is-missing").length).toBeGreaterThan(3);
      expect(lines(s.root)).toHaveLength(0); expect(bring(s.root)).toHaveLength(0);
      s.ctl.setEditing?.(true);
      expect(lines(s.root)).toHaveLength(0);
    });

    it("a 2014 sheet whose note names a 2024-only thing says 'This is in the 2024 books'", async () => {
      const s = await mount(layout, note("2014", { spells: [{ id: "nova", prepared: false }] }));
      s.ctl.setTab?.("spells");
      const row = s.q('[data-spell="nova"]');
      expect(row.querySelector(".fe-missing-line")!.textContent).toContain("This is in the 2024 books");
      expect(row.querySelector("button.fe-bring-in")!.textContent).toBe("Bring in from the 2024 books");
      s.click(row.querySelector("button.fe-bring-in"));
      expect(s.saved.at(-1)).toMatchObject({ spells: [{ id: "nova@2024" }] });
    });
  });
}

describe("the repoint action", () => {
  it("re-points one field at a time to id@<year> and says so when there is nothing to point", async () => {
    const s = await mount("desktop", note("2024", { classes: [{ class: "lantern-keeper", subclass: "lantern", level: 1 }], feats: ["keen"], concentration: "hush", mastery: ["pewter-blade"],
      companions: [{ creature: "ghost", name: "Wisp", kind: "familiar", hp: { temp: 0 }, conditions: {} }], background: "bg" }));
    for (const a of [{ field: "class", index: 0 }, { field: "subclass", index: 0 }, { field: "mastery", index: 0 }, { field: "companion", index: 0 }, { field: "concentration" }] as const) s.ctl.dispatch({ type: "repoint", ...a, to: "2014" } as never);
    expect(s.ctl.errors).toEqual([]);
    expect(s.saved.at(-1)).toMatchObject({ classes: [{ class: "lantern-keeper@2014", subclass: "lantern@2014" }], mastery: ["pewter-blade@2014"], companions: [{ creature: "ghost@2014" }], concentration: "hush@2014", feats: ["keen"] });
    expect(s.ctl.dispatch({ type: "repoint", field: "subrace", to: "2014" }).ok).toBe(false);
    expect(s.ctl.dispatch({ type: "repoint", field: "spell", index: 5, to: "2014" }).ok).toBe(false);
  });
});

for (const layout of LAYOUTS) {
  describe(`a missing feat and class, ${layout} sheet`, () => {
    it("a feat with no entry gets a marked row and a button, even with nothing else to list", async () => {
      const s = await mount(layout, note("2024", { feats: ["keen", "hum"] }));
      const row = s.q('[data-missing-feat="1"]');
      expect(row.querySelector(".is-missing")!.textContent).toBe("hum (missing from compendium)");
      expect(row.querySelector(".fe-missing-line")!.textContent).toContain("This is in the 2014 books");
      expect(s.root.textContent).not.toContain("No features yet");
      const only = await mount(layout, note("2024", { feats: ["ghostfeat"] })); // no edition has it: marker only
      expect(only.root.querySelectorAll('[data-missing-feat]').length).toBe(1);
    });

    it("a missing class in the identity line is marked like a missing race", async () => {
      const s = await mount(layout, note("2024", { classes: [{ class: "ghost-class", level: 3 }] }));
      const m = s.q(".fe-identity-label .fe-id-part.is-missing");
      expect(m.textContent).toBe("ghost-class (missing from compendium)");
      expect(s.q(".fe-identity-label").textContent).toContain("ghost-class (missing from compendium) 3");
    });
  });
}
