import type { ItemData } from "../content/types/item";
import { itemFacts, itemTypeLine } from "../content/item-view";
import { h } from "./h";

/** An item in the stat-block layout: name, type line, one labelled line per fact, then the effects, the rules text and the player's own notes. */
export function itemStatCard(name: string, d: ItemData, o: { lines?: string[]; notes?: string } = {}): HTMLElement {
  return h("div", { cls: "fe-sb fe-itemcard", data: { itemcard: name } },
    h("div", { cls: "fe-sb-name", text: name }),
    h("div", { cls: "fe-faint", text: itemTypeLine(d) }),
    ...itemFacts(d).map(f => h("div", { cls: "fe-detail-line", data: { fact: f.label } }, h("b", { text: `${f.label}: ` }), f.value)),
    ...(o.lines ?? []).filter(Boolean).map(l => h("div", { cls: "fe-detail-line", text: l })),
    ...(d.rules ? d.rules.split(/\n{2,}/).map(p => h("div", { cls: "fe-rules", text: p })) : []),
    o.notes ? h("div", { cls: "fe-card-title", text: "Your notes" }) : null,
    o.notes ? h("div", { cls: "fe-rules", text: o.notes }) : null);
}
