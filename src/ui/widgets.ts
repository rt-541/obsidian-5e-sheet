import type { Effects } from "../core/types";
import { h, sgn } from "./h";

export const card = (title: string, ...kids: (Node | null | false)[]) => h("div", { cls: "fe-card" }, title ? h("div", { cls: "fe-card-title", text: title }) : null, ...kids);
export const btn = (text: string, onClick: (e: MouseEvent) => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text, on: { click: onClick } });
/** A source badge (`WotC · PHB`, `Roll20`, `Homebrew`, `WotC (SRD)`): user sources are accented, WotC content is neutral. */
export const sourceBadge = (label: string, extra = "") => h("span", { cls: `fe-src ${label.startsWith("WotC") ? "" : "is-hb"} ${extra}`.replace(/\s+/g, " ").trim(), text: label, data: { source: label } });
export const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export function describeEffects(e: Effects): string {
  const out: string[] = [];
  if (e.adv?.length) out.push("Adv: " + e.adv.join(", "));
  if (e.dis?.length) out.push("Disadv: " + e.dis.join(", "));
  if (e.autofail?.length) out.push("Auto-fail: " + e.autofail.join(", "));
  for (const m of e.modifiers ?? []) out.push(`${m.target} ${typeof m.value === "number" ? sgn(m.value) : m.value}`);
  if (e.resist?.length) out.push("Resist " + e.resist.join(", "));
  if (e.acAbility) out.push(`AC uses ${e.acAbility.toUpperCase()}`);
  for (const b of e.saveBonus ?? []) out.push(`${b.abils.map(a => a.toUpperCase()).join("/")} saves ${typeof b.value === "number" ? sgn(b.value) : `+ ${b.value}`}`);
  if (e.critRange !== undefined) out.push(`Crit on ${e.critRange}-20${e.critVs ? ` vs ${e.critVs}` : ""}`);
  if (e.maxScore) out.push(`${e.maxScore.abil.toUpperCase()} max ${e.maxScore.max}`);
  if (e.note) out.push(e.note);
  return out.join(" · ");
}

/** Uses of a derived resource: pips, or the word for an unlimited one. */
export function usesPips(r: { max: number; used: number; unlimited?: string }, set: (n: number) => void) {
  return r.unlimited ? h("span", { cls: "fe-muted", text: r.unlimited }) : pips(r.max, r.used, set);
}

/** Above this many points a resource is a bar with a number box instead of a row of pips. */
export const PIP_LIMIT = 12;

/**
 * A bar for big pools and progress trackers. `mode: "pool"` shows what is left (max - used) and spends;
 * `mode: "progress"` fills as `used` grows (downtime, training) and adds. The number box takes an amount.
 */
export function bar(max: number, used: number, set: (n: number) => void, mode: "pool" | "progress", label = "") {
  const value = mode === "progress" ? used : max - used, pct = max ? Math.round(100 * value / max) : 0;
  const clamp = (n: number) => Math.max(0, Math.min(max, n));
  const amount = h("input", { cls: "fe-bar-amt", attrs: { type: "number", min: "1", value: "1", "aria-label": mode === "progress" ? "Amount to add" : "Amount to spend" } });
  const n = () => Math.max(1, Math.floor(+amount.value || 1));
  const step = (sign: 1 | -1) => () => set(clamp(used + sign * n()));
  return h("span", { cls: `fe-barbox is-${mode}` },
    h("span", { cls: "fe-bar fe-bar-wide", title: `${value} / ${max}${label ? " " + label : ""}` }, h("span", { cls: "fe-bar-fill", attrs: { style: `width:${pct}%` } })),
    h("span", { cls: "fe-bar-num", text: `${value} / ${max}${mode === "progress" ? ` (${pct}%)` : ""}${label ? " " + label : ""}` }),
    mode === "progress"
      ? h("span", { cls: "fe-bar-ctl" }, h("button", { cls: "fe-btn", text: "−", attrs: { "aria-label": "Undo progress" }, on: { click: step(-1) } }), amount, h("button", { cls: "fe-btn mod-cta", text: "Add", on: { click: step(1) } }))
      : h("span", { cls: "fe-bar-ctl" }, amount, h("button", { cls: "fe-btn", text: "Spend", on: { click: step(1) } }), h("button", { cls: "fe-btn", text: "Restore", on: { click: step(-1) } })));
}

/** Pips: click pip i to set used = i+1, or i if it was the last used one. Big pools become a bar. */
export function pips(max: number, used: number, set: (n: number) => void, cls = "") {
  if (max > PIP_LIMIT) return bar(max, used, set, "pool");
  return h("span", { cls: "fe-pips" }, ...Array.from({ length: max }, (_, i) =>
    h("button", { cls: `fe-pip ${cls} ${i < used ? "is-used" : ""}`, attrs: { "aria-label": `${i + 1} of ${max}` }, on: { click: () => set(used === i + 1 ? i : i + 1) } })));
}

