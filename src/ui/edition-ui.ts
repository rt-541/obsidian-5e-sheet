import { generalChanges } from "../content/edition-changes";
import { EDITIONS, characterEdition, editionRules, isNewer, otherEdition, type Edition } from "../core/edition";
import type { SheetController } from "./controller";
import { h } from "./h";

const editionOf = (ctl: SheetController): Edition => characterEdition(ctl.character ?? {});

/** The button that opens the what-changed panel (card and Settings row use the same one). */
export function editionOpenButton(ctl: SheetController): HTMLElement {
  return h("button", { cls: "fe-btn fe-edition-open", text: "What changed", data: { act: "edition-open" }, attrs: { type: "button" }, on: { click: () => ctl.open({ kind: "edition-changes" }) } });
}

/** The chip in the identity line: the character's own edition, a hover/tap target for the card below. */
export function editionChip(ctl: SheetController): HTMLElement {
  const e = editionOf(ctl);
  return h("span", { cls: "fe-chip fe-edition-chip", text: editionRules(e).label, data: { ref: `edition:${e}` } });
}

/** `edition:<id>` card: one sentence on what the edition means, and the button to the panel. */
export function editionCard(id: string, ctl: SheetController): HTMLElement | null {
  const e = EDITIONS.find(x => x === id); if (!e) return null;
  const r = editionRules(e);
  return h("div", { cls: "fe-detail" },
    h("div", { cls: "fe-name", text: r.label }),
    h("div", { cls: "fe-detail-line", text: `This character plays by the ${r.label}, so its ${r.raceWord.toLowerCase()}, classes, feats and spells are read from the ${e} books.` }),
    editionOpenButton(ctl));
}

/** The panel title: it looks forward from an older edition and back from a newer one. */
export function editionPanelTitle(ctl: SheetController): string {
  const own = editionOf(ctl), other = otherEdition(own);
  return isNewer(other, own) ? `What would change under ${other}` : `What changed from ${other}`;
}

/** The general changes, each side labelled by its year and the `own` edition marked: the panel's part one, and the builder's inline answer. */
export function generalChangeList(own: Edition): HTMLElement {
  return h("div", { cls: "fe-edition-changes" },
    ...generalChanges().map(n => h("div", { cls: "fe-change", data: { change: n.id } },
      h("div", { cls: "fe-name", text: n.title }),
      ...EDITIONS.map(e => h("div", { cls: `fe-detail-line ${e === own ? "is-yours" : ""}`.trim(), text: `${e === own ? `${e} (yours)` : e}: ${n[e]}` })))));
}

/** Part one of the panel: every general change. */
export function editionChangesPanel(ctl: SheetController): HTMLElement { return generalChangeList(editionOf(ctl)); }

/** The Settings row: the edition in use and the button to the panel. */
export function editionRow(ctl: SheetController): HTMLElement {
  return h("div", { cls: "fe-kv fe-setting-edition", data: { setting: "edition" } },
    h("span", { cls: "fe-grow", text: "Rules edition" }),
    h("span", { cls: "fe-muted", text: editionRules(editionOf(ctl)).label }), editionOpenButton(ctl));
}
