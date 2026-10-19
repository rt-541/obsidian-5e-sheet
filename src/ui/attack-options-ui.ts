import type { ActorStats } from "../core/derive";
import type { AttackOptionRow } from "../core/attack-options";
import type { SheetController } from "./controller";
import { h } from "./h";
import { card, tagWords } from "./widgets";

/** One option in plain words: "+1d4 to each attack roll, 3 of 3 Focus Dice left". */
export function optionWords(row: AttackOptionRow): string {
  const parts: string[] = [];
  if (row.kind === "extra") {
    parts.push(`+${row.adds ?? ""} damage on ${tagWords(row.tag)}`);
    if (row.perTurn) parts.push("once per turn");
    parts.push("added by itself while on");
    return parts.join(", ");
  }
  if (row.toHit) parts.push(`+${row.toHit} to each attack roll`);
  if (row.onHit) parts.push(`+${row.onHit} damage when you hit`);
  if (row.reroll) parts.push("weapon damage rolled twice, higher kept");
  if (row.oncePerTurn) parts.push("once per turn");
  const r = row.resource;
  if (r) parts.push(r.unlimited ? `${r.name} unlimited` : `${r.left} of ${r.max} ${r.name} left`);
  return parts.join(", ");
}

/** The Attack options card: a switch per option (focus dice, on-hit dice, rerolls, extra damage). Hidden when the character has none. */
export function attackOptionsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const rows = st.attackOptions;
  const el = card("Attack options", ...rows.map(row => {
    const blocked = !!row.problem;
    const sw = h("button", { cls: `fe-opt-switch${row.on ? " is-on" : ""}`, data: { act: "attack-option" },
      attrs: { "aria-pressed": String(row.on), "aria-label": `Switch ${row.name} ${row.on ? "off" : "on"}`, ...(blocked ? { disabled: "" } : {}) },
      on: { click: () => { ctl.setAttackOption(row.id, !row.on); } } });
    const name = h("span", { cls: "fe-opt-name", text: row.name, ...(row.ref ? { data: { ref: row.ref } } : {}) });
    const words = h("span", { cls: `fe-opt-words ${blocked ? "fe-step-problem" : "fe-muted"}`, text: `: ${blocked ? row.problem : optionWords(row)}` });
    return h("div", { cls: `fe-opt${row.on ? " is-on" : ""}`, data: { attackOption: row.id } }, sw, h("span", { cls: "fe-grow" }, name, words));
  }));
  if (!rows.length) el.hidden = true;
  return el;
}
