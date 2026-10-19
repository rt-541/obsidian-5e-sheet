// @vitest-environment jsdom
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { thalia } from "../fixtures/notes";

const extras = (r: Registry) => {
  r.add("vault", "item", { id: "test-tonic", name: "Test Tonic", kind: "consumable", attunement: false }, { path: "t.md" });
  r.add("vault", "item", { id: "spark-rod", name: "Spark Rod", kind: "wondrous", attunement: false, charges: { max: 3, reset: "dawn" } }, { path: "s.md" });
};
const tonic = thalia.inventory.length, rod = tonic + 1;
const note = { ...thalia, inventory: [...thalia.inventory, { id: "test-tonic", qty: 2, equipped: false, attuned: false }, { id: "spark-rod", qty: 1, equipped: false, attuned: false }] };

function setup(mobile: boolean, extraNote: object = {}) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r); extras(r);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(5), body: "" };
  const p = parseNote({ ...note, ...extraNote }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (el: Element | null) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const res = () => q('[data-feature="resources"]');
  const openAllTraits = () => { for (const head of all(".fe-trait-group.is-collapsed .fe-trait-head")) click(head); };
  return { ctl, root, saved, notices, q, all, click, res, openAllTraits };
}

for (const mobile of [false, true]) {
  const name = mobile ? "phone" : "desktop";
  describe(`pinning to Resources and charges (${name})`, () => {
    it("every feature and trait has a Pin button; a pinned one shows under Resources and charges and is saved", () => {
      const s = setup(mobile); s.openAllTraits();
      const rows = s.all("[data-trait]");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.querySelector('[data-act="pin-feature"]')).not.toBeNull();
      const ref = rows[0].dataset.trait!;
      s.click(rows[0].querySelector('[data-act="pin-feature"]'));
      expect(s.ctl.character!.mainPins).toEqual([ref]);
      expect(s.res().hidden).toBe(false);
      expect(s.res().querySelector(`[data-pinned-feature="${ref}"]`)).not.toBeNull();
      expect((s.saved.at(-1) as Character).mainPins).toEqual([ref]);
      s.openAllTraits();
      expect(s.q(`[data-trait="${ref}"] [data-act="pin-feature"]`).textContent).toBe("Pinned");
      s.click(s.q(`[data-trait="${ref}"] [data-act="pin-feature"]`));
      expect(s.ctl.character!.mainPins).toEqual([]);
      expect(s.res().querySelector("[data-pinned-feature]")).toBeNull();
    });
    it("a pinned trait that owns uses shows its pips once, not again as a separate resource row", () => {
      const s = setup(mobile, { classes: [{ class: "fighter", level: 2 }] }); s.openAllTraits();
      const row = s.all("[data-trait]").find(r => r.querySelector(".fe-trait-uses"));
      expect(row, "a trait with uses (Channel Divinity)").toBeDefined(); if (!row) return;
      const id = (row.querySelector(".fe-trait-uses") as HTMLElement).dataset.resource!;
      s.click(row.querySelector('[data-act="pin-feature"]'));
      expect(s.res().querySelectorAll(`[data-resource="${id}"]`)).toHaveLength(1);
    });
    it("a pinned potion shows how many are left; Use one takes one off and stops at none", () => {
      const s = setup(mobile);
      s.click(s.all(".fe-inv").find(e => e.textContent!.includes("Test Tonic"))!.querySelector('[data-act="pin-item"]'));
      const row = () => s.res().querySelector('[data-pinned-item="item:test-tonic"]') as HTMLElement;
      expect(row().textContent).toContain("x2");
      s.click(row().querySelector('[data-act="use-item"]'));
      expect(s.ctl.character!.inventory[tonic].qty).toBe(1);
      expect(s.notices.at(-1)).toContain("Test Tonic");
      s.click(row().querySelector('[data-act="use-item"]'));
      expect(s.ctl.character!.inventory[tonic].qty).toBe(0);
      const btn = row().querySelector('[data-act="use-item"]') as HTMLButtonElement;
      expect(btn.textContent).toBe("None left");
      expect(btn.disabled).toBe(true);
    });
    it("a pinned item with charges lists its charges once", () => {
      const s = setup(mobile);
      expect(s.res().textContent).toContain("Spark Rod charges");
      s.click(s.all(".fe-inv").find(e => e.textContent!.includes("Spark Rod"))!.querySelector('[data-act="pin-item"]'));
      const row = s.res().querySelector('[data-pinned-item="item:spark-rod"]') as HTMLElement;
      expect(row.querySelectorAll(".fe-pip")).toHaveLength(3);
      expect(s.res().textContent).not.toContain("Spark Rod charges");
      s.click(row.querySelector(".fe-pip"));
      expect(s.ctl.character!.inventory[rod].charges?.used).toBe(1);
    });
    it("a pin whose feature or item is gone is skipped, not shown broken", () => {
      const s = setup(mobile, { mainPins: ["feature:no-such-feature", "item:no-such-item"] });
      expect(s.res().querySelector("[data-pinned-feature], [data-pinned-item]")).toBeNull();
    });
  });
}
