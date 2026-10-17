import type { Effects } from "../core/types";
import { h, sgn } from "./h";

export const card = (title: string, ...kids: (Node | null | false)[]) => h("div", { cls: "fe-card" }, title ? h("div", { cls: "fe-card-title", text: title }) : null, ...kids);
export const btn = (text: string, onClick: (e: MouseEvent) => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text, on: { click: onClick } });
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

/** Pips: click pip i to set used = i+1, or i if it was the last used one. */
export function pips(max: number, used: number, set: (n: number) => void, cls = "") {
  return h("span", { cls: "fe-pips" }, ...Array.from({ length: max }, (_, i) =>
    h("button", { cls: `fe-pip ${cls} ${i < used ? "is-used" : ""}`, attrs: { "aria-label": `${i + 1} of ${max}` }, on: { click: () => set(used === i + 1 ? i : i + 1) } })));
}

