import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import type { LayoutName } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

export const LAYOUTS: LayoutName[] = ["desktop", "tablet", "mobile"];

/** A mounted sheet on the invented homebrew registry, for the review-fix DOM tests. */
export function sheet(layout: LayoutName, note: object, extra: Record<string, unknown>[] = [], host?: Partial<SheetHost>) {
  const r = homebrewRegistry(extra);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const h: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(5), body: "", ...host };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(h, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (el: Element | null | undefined) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (el: HTMLElement, value: string, ev = "input") => { (el as HTMLInputElement).value = value; el.dispatchEvent(new Event(ev, { bubbles: true })); };
  return { ctl, root, q, all, click, type, saved, notices, host: h };
}
