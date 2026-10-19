import { findRations } from "../rules/hexploration";
import type { SheetController } from "./controller";
import { h } from "./h";
import { qtyStepper } from "./inventory-ui";
import { btn, card } from "./widgets";

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** The Hexploration card: rations in the pack (an ordinary inventory entry) and the two ways to forage. Shown only while the rule is on. */
export function rationsFeature(ctl: SheetController): HTMLElement {
  const c = ctl.character!, i = findRations(c, ctl.host.registry), e = i >= 0 ? c.inventory[i] : undefined, foraged = c.rest.foraged ?? 0;
  const mark = <T extends HTMLElement>(b: T, act: string) => { b.dataset.act = act; return b; };
  const stock = e
    ? h("div", { cls: `fe-kv ${e.qty <= 0 ? "is-used-up" : ""}`.trim(), data: { rations: String(e.qty) } },
      h("span", { text: `${e.qty} ration${e.qty === 1 ? "" : "s"} (${days(e.qty)})`, data: { note: "rations-count" } }), qtyStepper(ctl, i, e.name ?? "rations"))
    : h("div", { cls: "fe-kv", data: { rations: "none" } }, h("span", { text: "Rations: none in your pack" }), mark(btn("+ Add rations", () => ctl.addRations(1)), "add-rations"));
  return card("Rations and foraging", stock,
    foraged ? h("div", { cls: "fe-faint", text: "You found food for tonight's meal.", data: { note: "foraged" } }) : null,
    h("div", { cls: "fe-stack" },
      mark(btn("Forage (4 hours)", e => ctl.forage(false, e)), "forage"),
      mark(btn("Quick forage (2 hours, with disadvantage)", e => ctl.forage(true, e)), "forage-quick")));
}
