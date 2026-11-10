import { provenanceLine, splitRef } from "../content/edition";
import type { Entry } from "../content/registry";
import { characterEdition, type Edition } from "../core/edition";
import type { Character } from "../core/character";
import type { Action } from "../core/actions";
import { h } from "./h";
import type { SheetController } from "./controller";

/** The button that ends a picker list: pressing it lists the other edition's entries (nothing from there is ever offered before). */
export function bringInButton(from: Edition, click: () => void): HTMLElement {
  return h("button", { cls: "fe-btn fe-bring-in", text: `Bring in from the ${from} books`, data: { act: "bring-in" }, attrs: { type: "button" }, on: { click } });
}
/** "Back to the 2024 list": leaves the brought-in view. */
export function bringBackButton(own: Edition, click: () => void): HTMLElement {
  return h("button", { cls: "fe-btn fe-bring-back", text: `Back to the ${own} list`, data: { act: "bring-back" }, attrs: { type: "button" }, on: { click } });
}
/** The small edition label on a brought-in row: the qualifier of `ref` when it names the other edition, else null. */
export function editionChip(ref: string, own: Edition): HTMLElement | null {
  const q = splitRef(ref).edition;
  return q && q !== own ? h("span", { cls: "fe-chip fe-edition", text: q }) : null;
}
/** A name with its chip after it, for rows that show a reference. */
export const chipFor = (ref: string | undefined, c: Character | undefined): HTMLElement | null => (ref && c ? editionChip(ref, characterEdition(c)) : null);

/** Puts the source, book and edition line (`provenanceLine`) under the name of an entry's card. */
export function withProvenance(el: HTMLElement, e: Entry | undefined): HTMLElement {
  if (!e || el.querySelector(".fe-detail-prov")) return el;
  const line = h("div", { cls: "fe-faint fe-detail-prov", text: provenanceLine(e) }), anchor = el.querySelector(".fe-detail-src") ?? el.firstElementChild;
  if (anchor) anchor.after(line); else el.append(line);
  return el;
}

type Repoint = Extract<Action, { type: "repoint" }>;
/** Which stored reference a missing-line re-points: a single field, or a field and the row it sits in. */
export type RepointAt = DistributiveOmit<Repoint, "type" | "to">;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * For a stored reference the character's edition lacks but the other edition has: one plain line and a button that re-points just that
 * reference to the other edition's version (no picker). Null when no edition has it, or for a reference that is not missing.
 */
export function missingLine(ctl: SheetController, type: string, id: string, at: RepointAt): HTMLElement | null {
  const reg = ctl.host.registry, to = reg.otherEditionHas(type, splitRef(id).id);
  if (!to) return null;
  return h("div", { cls: "fe-missing-line fe-faint", data: { missing: type } },
    h("span", { text: `This is in the ${to} books` }),
    bringInButton(to, () => { ctl.dispatch({ type: "repoint", ...at, to } as Action); }));
}
