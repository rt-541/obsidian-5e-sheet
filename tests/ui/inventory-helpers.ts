import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import type { Registry } from "../../src/content/registry";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import type { LayoutName } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { mechanicsRegistry, tester } from "../fixtures/mechanics";

export const LAYOUTS: LayoutName[] = ["desktop", "tablet", "mobile"];

/** Invented items: none of these mirror a published item or stat block. */
export function addInvented(r: Registry) {
  r.add("vault", "item", { id: "ember-tonic", name: "Ember Tonic", kind: "consumable", attunement: false, weight: 0.5, heal: "1d4+3" }, { path: "ember-tonic.md" });
  r.add("vault", "item", { id: "moss-salve", name: "Moss Salve", kind: "consumable", attunement: false, weight: 0.25, rarity: "uncommon" }, { path: "moss-salve.md" });
  r.add("vault", "item", { id: "tin-whistle", name: "Tin Whistle", kind: "gear", attunement: false, weight: 0.5 }, { path: "tin-whistle.md" });
  r.add("vault", "item", { id: "glow-lamp", name: "Glow Lamp", kind: "wondrous", attunement: false, weight: 2, rarity: "rare" }, { path: "glow-lamp.md" });
  r.add("vault", "item", { id: "spark-rod", name: "Spark Rod", kind: "wondrous", attunement: false, charges: { max: 3, reset: "dawn" }, weight: 1 }, { path: "spark-rod.md" });
  r.add("vault", "item", { id: "reed-vest", name: "Reed Vest", kind: "armor", attunement: false, weight: 8, armor: { base: 12, dex: "full" } }, { path: "reed-vest.md" });
  r.add("vault", "item", { id: "bark-plate", name: "Bark Plate", kind: "armor", attunement: false, weight: 30, armor: { base: 15, dex: "none" } }, { path: "bark-plate.md" });
  r.add("vault", "item", { id: "oak-buckler", name: "Oak Buckler", kind: "shield", attunement: false, weight: 5, effects: { modifiers: [{ target: "ac", value: 2 }] } }, { path: "oak-buckler.md" });
  r.add("vault", "item", { id: "elm-buckler", name: "Elm Buckler", kind: "shield", attunement: false, weight: 5, effects: { modifiers: [{ target: "ac", value: 2 }] } }, { path: "elm-buckler.md" });
}

export function setup(layout: LayoutName, note: object = {}, extra?: (r: Registry) => void, campaign?: object, hostExtra?: (r: Registry) => Partial<SheetHost>) {
  const r = mechanicsRegistry(); addInvented(r); extra?.(r);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ...(campaign ? { campaign: campaign as never } : {}), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(4), body: "", ...(hostExtra?.(r) ?? {}) };
  const p = parseNote({ ...tester, ...note }); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (el: Element | null | undefined) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (el: HTMLElement, value: string, ev = "input") => { (el as HTMLInputElement).value = value; el.dispatchEvent(new Event(ev, { bubbles: true })); };
  const row = (name: string) => all(".fe-inv").find(e => e.querySelector(".fe-inv-name")?.textContent === name)!;
  const char = () => ctl.character!;
  return { r, ctl, root, saved, notices, q, all, click, type, row, char, host };
}
