import type { ActorStats } from "../core/derive";
import type { Abil } from "../core/types";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const refData = (ref?: string, noclick = false): { data: Record<string, string> } | Record<string, never> => (ref ? { data: { ref, ...(noclick ? { noclick: "" } : {}) } } : {});

/** "1d8+3 slashing + 1d6 fire" -> "1d8+3 + 1d6": the damage type words drop off, the full text stays in the button's label. */
export function compactDamage(damage: string): string {
  return damage.split(" + ").map(t => t.trim().replace(/\s+[A-Za-z]+$/, "")).join(" + ");
}

/** The attack rows: name, `+N Atk / dice`, Crit on one line. Notes live in the hover card (desktop) or the tap panel (tablet, phone). */
export function attacksList(ctl: SheetController, st: ActorStats, who?: number): HTMLElement {
  if (!st.attacks.length) return h("div", { cls: "fe-faint", text: "No attacks" });
  return h("div", { cls: "fe-attacks" },
    who === undefined && st.kind === "character" && st.attacksPerAction > 1 ? h("div", { cls: "fe-muted fe-attacks-per", text: `Attacks per action: ${st.attacksPerAction}` }) : null,
    ...st.attacks.map((a, ai) => {
      const noteRef = a.why ? `why:attack:${ai}` : a.note ? `attack-note:${who ?? "self"}:${ai}` : undefined;
      const hit = a.toHit !== undefined
        ? h("button", { cls: "fe-roll fe-atk", text: `${sgn(a.toHit)} Atk`, ...refData(a.why?.hit ? `why:attack:${ai}:hit` : undefined, true),
          on: { click: (e: MouseEvent) => ctl.roll(`${a.name} to hit`, a.toHit!, a.target, e, who) } })
        : a.save ? h("span", { cls: "fe-faint fe-atk-save", text: `DC ${a.save.dc} ${ABIL_NAME[a.save.abil]}` }) : null;
      const dmg = a.damage
        ? h("button", { cls: "fe-roll fe-atk-dmg", text: compactDamage(a.damage), title: `${a.name} damage: ${a.damage}`, attrs: { "aria-label": `${a.name} damage: ${a.damage}` },
          ...refData(a.why?.damage ? `why:attack:${ai}:damage` : undefined, true), on: { click: () => ctl.damage(`${a.name} damage`, a.damage!) } })
        : null;
      return h("div", { cls: "fe-attack", data: { attack: String(ai) } },
        h("span", { cls: "fe-grow", text: a.name, ...refData(noteRef) }),
        a.note ? h("span", { cls: "fe-faint fe-attack-note-mark", text: "notes", ...refData(noteRef) }) : null,
        h("span", { cls: "fe-attack-ctl" },
          hit, hit && dmg ? h("span", { cls: "fe-faint fe-attack-sep", text: "/" }) : null, dmg,
          a.critDamage ? h("button", { cls: "fe-roll fe-crit", text: "Crit", title: `Damage on a critical hit: ${a.critDamage}`, attrs: { "aria-label": `${a.name} critical hit damage` },
            on: { click: () => ctl.damage(`${a.name} critical damage`, a.critDamage!) } }) : null));
    }));
}
