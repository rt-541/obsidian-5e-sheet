import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { h } from "./h";
import { card, effectParts, effectTag, gateWords } from "./widgets";

const CARD_ID = "effects";
const rowId = (source: string) => `open:effect:${source}`;

/**
 * The Active effects card: one compact row per source (name and a short tag such as "+1 AC"); the full facts open on a tap.
 * The card itself folds up too. Which rows are open, and whether the card is folded, is remembered per character
 * (the same plugin data as the traits card; rows are closed and the card is open until the player changes them).
 */
export function activeEffectsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const folded = ctl.isCollapsed(CARD_ID), n = st.effects.length;
  const head = h("button", { cls: "fe-card-title fe-effects-head", attrs: { "aria-expanded": String(!folded) }, data: { act: "effects-card" }, on: { click: () => ctl.toggleCollapsed(CARD_ID) } },
    h("span", { cls: "fe-trait-caret", text: folded ? ">" : "v" }), h("span", { text: `Active effects${n ? ` (${n})` : ""}` }));
  const rows = folded ? [] : n ? st.effects.map(e => {
    const open = ctl.isCollapsed(rowId(e.source)), tag = effectTag(e.effects), facts = effectParts(e.effects);
    return h("div", { cls: `fe-effect ${open ? "is-open" : ""}`.trim(), data: { effect: e.source } },
      h("button", { cls: "fe-effect-head", attrs: { "aria-expanded": String(open) }, data: { act: "effect-row" }, on: { click: () => ctl.toggleCollapsed(rowId(e.source)) } },
        h("span", { cls: "fe-trait-caret", text: open ? "v" : ">" }),
        h("span", { cls: "fe-grow fe-name", text: e.source, data: { ref: `effect:${e.source}`, noclick: "" } }),
        tag ? h("span", { cls: "fe-muted fe-effect-tag", text: tag }) : null),
      open ? h("div", { cls: "fe-effect-body" },
        ...facts.map(f => h("div", { cls: "fe-detail-line", text: f })),
        e.effects.while?.length ? h("div", { cls: "fe-faint", text: `Only while ${e.effects.while.map(gateWords).join(" and ")}.` }) : null,
        !facts.length ? h("div", { cls: "fe-faint", text: "No numbers change." }) : null) : null);
  }) : [h("div", { cls: "fe-faint", text: "None" })];
  const el = card("", head, ...rows, folded ? null : st.missing.length ? h("div", { cls: "fe-warn", text: `Missing from compendium: ${st.missing.join(", ")}` }) : null);
  return el;
}
