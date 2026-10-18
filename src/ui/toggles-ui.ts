import type { ActorStats, ToggleRow } from "../core/derive";
import type { SheetController } from "./controller";
import { slug } from "../content/registry";
import { h } from "./h";
import { btn, describeEffects, gateWords } from "./widgets";

const REST_WORDS = { short: "a short rest", long: "a long rest" } as const;

/** What starting it costs, in words. */
export function costWords(t: ToggleRow, left?: string): string {
  const c = t.def.cost;
  if (!c) return "Free to start.";
  if ("resource" in c) { const n = c.amount === undefined ? 1 : c.amount; return `Costs ${typeof n === "number" ? n : "some"} ${c.resource}${left ? ` (${left})` : ""}.`; }
  if ("slot" in c) return `Uses a spell slot (level ${c.slot} or higher).`;
  return `Uses ${c.charges} charge${c.charges === 1 ? "" : "s"} of the item.`;
}

/** What it does while on, in words: "Fury is on: Damage +2 for melee attacks and Strength attacks, Resist bludgeoning". */
export function whatItDoes(t: ToggleRow): string {
  const fx = describeEffects(t.effects);
  return fx || t.text || "";
}

function valueRow(ctl: SheetController, t: ToggleRow): HTMLElement | null {
  const v = t.def.value;
  if (!v || !t.on) return null;
  const set = (n: number) => ctl.toggle(t.id, true, Math.max(v.min, Math.min(v.max, n)));
  return h("div", { cls: "fe-toggle-value", data: { toggleValue: t.id } },
    h("span", { text: `${v.label}: ` }), h("b", { text: String(t.value) }),
    btn("Less", () => set(t.value - 1)), btn("More", () => set(t.value + 1)));
}

function toggleCard(ctl: SheetController, t: ToggleRow, st: ActorStats): HTMLElement {
  const c = t.def.cost, id = c && "resource" in c ? slug(c.resource) : "", r = id ? st.resources.find(x => x.id === id || (!x.derived && slug(x.name) === id)) : undefined;
  const left = r && !r.unlimited ? `${Math.max(0, r.max - r.used)} of ${r.max} left` : undefined;
  const lines = [t.on ? `${t.name} is on${whatItDoes(t) ? `: ${whatItDoes(t)}` : "."}` : costWords(t, left),
    ...(t.on && t.suppressed ? [`On, but not working right now. It works only while: ${t.def.while!.map(gateWords).join(" and ")}.`] : []),
    ...(!t.on && t.def.group ? ["Only one of these can be on at a time."] : []),
    ...(!t.on && t.def.endsOn !== "never" ? [`Ends after ${REST_WORDS[t.def.endsOn]}.`] : [])];
  const button = h("button", { cls: `fe-btn fe-toggle-btn ${t.on ? "is-on" : ""}`.trim(), text: `${t.on ? "End" : "Start"} ${t.name}`,
    attrs: { "aria-pressed": String(t.on) }, data: { act: "toggle", toggle: t.id }, on: { click: () => ctl.toggle(t.id, !t.on) } });
  return h("div", { cls: `fe-toggle ${t.on ? "is-on" : ""} ${t.suppressed ? "is-suppressed" : ""}`.replace(/\s+/g, " ").trim(), data: { toggleCard: t.id } },
    h("span", { cls: "fe-inv-name", text: t.name, data: { ref: t.ref } }), button,
    ...lines.map(l => h("div", { cls: t.on ? "fe-muted" : "fe-faint", text: l })), valueRow(ctl, t));
}

/** Big Start / End buttons for every switch the character has (Rage, stances, auras); empty and hidden when there are none. */
export function togglesFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const el = h("div", { cls: "fe-toggles" }, ...(ctl.character ? st.toggles.map(t => toggleCard(ctl, t, st)) : []));
  if (!el.childElementCount) el.hidden = true;
  return el;
}
