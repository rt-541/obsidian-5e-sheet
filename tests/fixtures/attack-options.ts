import type { Registry } from "../../src/content/registry";
import type { Character } from "../../src/core/character";
import type { Rng } from "../../src/core/types";
import { parseNote } from "../../src/core/character";
import type { ResourceRow } from "../../src/core/derive";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import type { LayoutName } from "../../src/ui/layouts";
import { mountSheet } from "../../src/ui/sheet";
import { makeChar, mechanicsRegistry, tester } from "./mechanics";

/** mechanicsRegistry() plus invented feats and items that declare attack options, extra damage and a self-damage action. */
export function optionsRegistry(): Registry {
  const r = mechanicsRegistry();
  const bad = (p: unknown) => { if (p) throw new Error(JSON.stringify(p)); };
  const feat = (id: string, grants: object[]) => bad(r.add("vault", "feat", { name: id.replace(/(^|-)(\w)/g, (_m, s: string, ch: string) => `${s ? " " : ""}${ch.toUpperCase()}`), grants }, { path: `${id}.md` }));
  const res = (name: string, max: number) => ({ op: "resource", name, max, reset: "long" });
  const feature = (name: string, extra: object) => ({ op: "feature", name, text: `${name} (invented text).`, ...extra });
  feat("test-focus", [res("Focus Dice", 3), feature("Test Focus", { attackOption: { toHit: "1d4", resource: "Focus Dice" } })]);
  feat("test-steady", [feature("Test Steady", { attackOption: { toHit: "1", resource: "Focus Dice" } })]);
  feat("test-analysis", [res("Insight Dice", 2), feature("Test Analysis", { attackOption: { scale: { 1: "1d4", 5: "2d4" }, resource: "Insight Dice", on: "attack:weapon" } })]);
  feat("test-savage", [feature("Test Savage", { attackOption: { reroll: true, oncePerTurn: true, on: "attack:weapon" } })]);
  feat("test-lost", [feature("Test Lost", { attackOption: { toHit: "1d4", resource: "Missing Dice" } })]);
  feat("test-ember", [feature("Test Ember", { effects: { extraDamage: [{ dice: "1d6", type: "fire", on: "attack:weapon" }] } })]);
  feat("test-blood-price", [feature("Test Blood Price", { action: { name: "Blood Price", cost: { selfDamage: "1d6" }, damage: "2d6" } })]);
  bad(r.add("vault", "item", { id: "test-hunting-blade", name: "Test Hunting Blade", kind: "weapon", attunement: false, weight: 3,
    weapon: { dmg: "1d6", type: "slashing", ab: "str", range: "melee", category: "martial" }, attackOption: { onHit: "1d6", oncePerTurn: true } }, { path: "test-hunting-blade.md" }));
  bad(r.add("vault", "item", { id: "test-tonic", name: "Test Tonic", kind: "consumable", attunement: false, weight: 0.5, heal: "2d4+2" }, { path: "test-tonic.md" }));
  return r;
}

/** makeChar with the longsword equipped, merged with `o`. */
export const optChar = (o: object = {}): Character => makeChar({ inventory: [{ id: "longsword", equipped: true }], ...o });

/** A rng that returns the given values in turn, then starts over. */
export const seq = (...xs: number[]): Rng => { let i = 0; return () => xs[i++ % xs.length]; };

/** A mounted sheet for an invented character with the longsword equipped (plus `note`), on the options registry. */
export function sheetWith(layout: LayoutName, note: object = {}, rng?: Rng) {
  const notices: string[] = [], saved: unknown[] = [];
  const host: SheetHost = { registry: optionsRegistry(), ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], body: "", ...(rng ? { rng } : {}) };
  const p = parseNote({ ...tester, inventory: [{ id: "longsword", equipped: true }], ...note });
  if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (el: Element | null | undefined) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  /** The attack row whose text names `name`. */
  const row = (name: string): HTMLElement => {
    const el = [...root.querySelectorAll<HTMLElement>("[data-attack]")].find(e => (e.textContent ?? "").includes(name));
    if (!el) throw new Error(`no attack row for ${name}`); return el;
  };
  /** The resource row with this id, as the sheet derives it now. */
  const left = (id: string): ResourceRow => {
    const r = ctl.stats()!.resources.find(x => x.id === id);
    if (!r) throw new Error(`no resource ${id}`); return r;
  };
  return { ctl, root, host, notices, saved, q, click, row, left };
}
