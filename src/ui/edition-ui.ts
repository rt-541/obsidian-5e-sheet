import { generalChanges } from "../content/edition-changes";
import { EDITIONS, characterEdition, editionRules, isNewer, otherEdition, type Edition } from "../core/edition";
import type { CompareGroup } from "../core/edition-compare";
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

/** The two notes' text side by side (the text of each note through the host's markdown renderer, plain text without one). */
function readBoth(ctl: SheetController, sides: { edition?: string; name: string; text: string }[]): HTMLElement {
  return h("div", { cls: "fe-read-both-pane", data: { part: "read-both" } },
    ...sides.map(x => {
      const body = h("div", { cls: "fe-read-body" });
      if (!x.text) body.textContent = "This note has no text.";
      else if (ctl.host.renderMarkdown) ctl.host.renderMarkdown(x.text, body);
      else { body.textContent = x.text; body.style.whiteSpace = "pre-wrap"; }
      return h("div", { cls: "fe-read-col", data: { edition: x.edition ?? "" } }, h("div", { cls: "fe-name", text: x.edition ? `${x.name} (${x.edition} books)` : x.name }), body);
    }));
}

/** Part two of the panel: what differs for this character, from the two libraries in the vault. */
export function characterChangeList(ctl: SheetController): HTMLElement {
  const own = editionOf(ctl), to = otherEdition(own), s = ctl.editionCompare;
  const root = h("div", { cls: "fe-edition-character", data: { part: "character" } }, h("div", { cls: "fe-card-title", text: "For this character" }));
  if (!s || s.loading) { root.append(h("div", { cls: "fe-faint fe-edition-loading", text: "Working out what differs for this character..." })); return root; }
  if (s.result?.missingLibrary) {
    root.append(h("div", { cls: "fe-detail-line fe-edition-missing", text: `The ${to} books are not in the compendium yet, so there is nothing to compare this character with. docs/IMPORTING.md explains how to import them.` }));
    return root;
  }
  const groups: CompareGroup[] = s.result?.groups ?? [];
  if (ctl.character?.classes.length) root.append(h("button", { cls: `fe-btn fe-all-levels ${s.allLevels ? "is-on" : ""}`.trim(), text: s.allLevels ? "Show only my levels" : "Show all levels", data: { act: "edition-all-levels" }, attrs: { type: "button", "aria-pressed": String(s.allLevels) }, on: { click: () => ctl.setEditionAllLevels(!s.allLevels) } }));
  if (!groups.length) root.append(h("div", { cls: "fe-faint", text: "Nothing on this character has a different version in the other books." }));
  for (const g of groups) {
    const reading = g.key !== undefined && s.read?.key === g.key;
    root.append(h("div", { cls: "fe-change fe-char-change", data: { group: g.key ?? g.title } },
      h("div", { cls: "fe-name", text: g.title }),
      ...g.lines.map(l => h("div", { cls: "fe-detail-line", text: l })),
      g.pair ? h("button", { cls: `fe-btn fe-read-both ${reading ? "is-on" : ""}`.trim(), text: reading ? "Hide both" : "Read both", data: { act: "edition-read-both" }, attrs: { type: "button", "aria-pressed": String(reading) }, on: { click: () => { void ctl.readBoth(g); } } }) : null,
      reading ? (s.read!.loading || !s.read!.sides ? h("div", { cls: "fe-faint", text: "Reading both notes..." }) : readBoth(ctl, s.read!.sides)) : null));
  }
  return root;
}

/** The panel: part one (every general change), then part two (this character). */
export function editionChangesPanel(ctl: SheetController): HTMLElement {
  return h("div", { cls: "fe-edition-panel" }, generalChangeList(editionOf(ctl)), ctl.character ? characterChangeList(ctl) : null);
}

/** The Settings row: the edition in use and the button to the panel. */
export function editionRow(ctl: SheetController): HTMLElement {
  return h("div", { cls: "fe-kv fe-setting-edition", data: { setting: "edition" } },
    h("span", { cls: "fe-grow", text: "Rules edition" }),
    h("span", { cls: "fe-muted", text: editionRules(editionOf(ctl)).label }), editionOpenButton(ctl));
}
