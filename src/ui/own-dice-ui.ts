import type { SheetController } from "./controller";
import { h } from "./h";

/** The "roll your own dice" box: says what to roll in plain words; the player may type the total back. */
export function ownRollBox(ctl: SheetController): HTMLElement | null {
  const o = ctl.ownRoll; if (!o) return null;
  const title = o.kind === "total" ? o.title : o.entry.title, say = o.kind === "total" ? o.say : o.entry.detail;
  const act = (text: string, name: string, fn: () => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text, data: { act: name }, on: { click: fn } });
  let input: HTMLInputElement | null = null;
  const rows: HTMLElement[] = [];
  if (o.kind === "say" || o.kind === "attack") {
    input = h("input", { cls: "fe-search", data: { keep: "own-total" }, attrs: { type: "number", inputmode: "numeric", placeholder: "Total (optional)", "aria-label": "The total you rolled (optional)" } });
    rows.push(h("div", { cls: "fe-kv" }, input, act("Add to log", "own-log", () => ctl.logOwnTotal(input!.value))));
  }
  if (o.kind === "attack") rows.push(h("div", { cls: "fe-kv fe-own-hit" },
    act("Hit", "own-hit", () => ctl.answerHit("hit"), "mod-cta"), act("Miss", "own-miss", () => ctl.answerHit("miss")), act("Crit", "own-crit", () => ctl.answerHit("crit"), "mod-cta")));
  rows.push(h("div", { cls: "fe-kv" }, act("Close", "own-close", () => ctl.closeOwnRoll())));
  return h("div", { cls: "fe-own-roll", attrs: { role: "dialog", "aria-label": title } },
    h("div", { cls: "fe-muted", text: title }), h("div", { cls: "fe-own-say", text: say }),
    ...rows, o.error ? h("div", { cls: "fe-own-error", text: o.error, attrs: { role: "alert" } }) : null);
}
