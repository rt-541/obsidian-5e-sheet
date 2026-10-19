import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import type { LayoutName } from "../../src/ui/layouts";

export const spell = (name: string, extra: object = {}) => ({ name, level: 1, school: "Evocation", castingTime: "1 action", range: "30 feet", components: ["V"], duration: "Instantaneous", classes: ["cleric"], ...extra });
export function setup(note: object, layout: LayoutName, hostExtra: Partial<SheetHost> | ((r: Registry) => Partial<SheetHost>) = {}, extra?: (r: Registry) => void) {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  r.add("vault", "spell", spell("Test Spark"), { path: "compendium/5e/Homebrew/Spells/Test Spark.md", sourceName: "Homebrew" });
  r.add("vault", "spell", spell("Glow Ward", { level: 0, classes: ["wizard"] }), { path: "compendium/5e/Homebrew/Spells/Glow Ward.md", sourceName: "Homebrew" });
  extra?.(r);
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: r, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(11), body: "", ...(typeof hostExtra === "function" ? hostExtra(r) : hostExtra) };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const type = (sel: string, v: string) => { const el = q(sel) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const tick = () => new Promise<void>(res => setTimeout(res, 0));
  return { r, ctl, root, saved, notices, q, qa, click, type, tick };
}
export const LAYOUTS: LayoutName[] = ["desktop", "tablet", "mobile"];
