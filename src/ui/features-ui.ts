import type { ActorStats } from "../core/derive";
import { planResolve } from "../core/levelup";
import type { FeatureRow } from "../core/progression";
import type { Abil } from "../core/types";
import type { SheetController } from "./controller";
import { h } from "./h";
import { btn, card, describeEffects, pips } from "./widgets";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const sentence = (id: string) => { const t = id.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const RESET_NAME = { short: "short rest", long: "long rest", dawn: "dawn", none: "never" } as const;

/** XP total (editable in Edit mode) and, in XP campaigns, a bar toward the next level. */
export function xpFeature(ctl: SheetController): HTMLElement {
  const i = ctl.xpInfo();
  const label = h("span", { cls: "fe-kv" }, h("span", { cls: "fe-muted", text: "XP " }), String(i.xp),
    i.mode === "xp" && i.next !== undefined ? h("span", { cls: "fe-muted", text: ` / ${i.next}` }) : null);
  const edit = ctl.editing && ctl.character
    ? h("input", { cls: "fe-amt", attrs: { type: "number", min: "0", value: String(i.xp), "aria-label": "XP" },
        on: { change: (e: Event) => ctl.dispatch({ type: "xp", value: +(e.target as HTMLInputElement).value }) } }) : null;
  if (i.mode !== "xp") return h("span", { cls: "fe-xp" }, label, edit);
  return h("span", { cls: `fe-xp ${i.ready ? "is-ready" : ""}`, ...(i.next !== undefined ? { title: `${i.next - i.xp} XP to level ${i.level + 1}` } : {}) }, label, edit,
    i.maxed ? null : h("div", { cls: "fe-bar", data: { xpbar: "" } }, h("div", { cls: "fe-bar-fill", attrs: { style: `width:${i.pct}%` } })),
    i.ready ? h("span", { cls: "fe-chip", text: "Level up ready" }) : null);
}

/** The Level up button (highlighted when the XP total allows it) and, in Edit mode, Undo last level (asks twice). */
export function levelUpFeature(ctl: SheetController): HTMLElement {
  const c = ctl.character!, i = ctl.xpInfo(), hl = i.mode === "xp" && i.ready;
  const hint = i.maxed ? "Level 20 is the maximum" : i.mode === "xp" ? (i.ready ? "Enough XP for the next level" : `${(i.next ?? 0) - i.xp} XP to level ${i.level + 1}`) : "";
  const up = h("button", { cls: `fe-btn ${hl ? "mod-cta" : ""}`.trim(), text: "Level up", data: { act: "level-up" }, ...(hint ? { title: hint } : {}), on: { click: () => ctl.startLevelUp() } });
  if (i.maxed) up.disabled = true;
  const undo = ctl.editing && c.levelLog.length
    ? [btn(ctl.confirmUndo ? "Confirm undo" : "Undo last level", () => { ctl.undoLastLevel(); }, ctl.confirmUndo ? "is-on" : ""),
       ctl.confirmUndo ? btn("Keep", () => ctl.cancelUndo()) : null] : [];
  undo[0]?.setAttribute("data-act", "undo-level");
  return h("div", { cls: "fe-kv fe-levelup" }, up, ...undo);
}

function actionRow(ctl: SheetController, st: ActorStats, f: FeatureRow): HTMLElement {
  const a = f.action!;
  const cost = a.cost && "resource" in a.cost ? `costs ${a.cost.amount ?? 1} ${a.cost.resource}` : a.cost && "selfDamage" in a.cost ? `costs ${a.cost.selfDamage} damage to you` : "";
  const dc = a.save ? st.progress.dcs.find(x => x.name.toLowerCase() === a.save!.dc.toLowerCase() || x.id === a.save!.dc.toLowerCase().replace(/[^a-z0-9]+/g, "-")) : undefined;
  const bits = [cost, a.attack !== undefined ? "attack" : "", a.damage ?? "", a.heal ? `heals ${a.heal}` : "", a.save ? `${ABIL_NAME[a.save.abil]} save${dc ? ` DC ${dc.dc}` : ""}` : ""].filter(Boolean);
  return h("div", { cls: "fe-inv", data: { action: f.key } },
    h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: a.name, data: { ref: `feature:${f.key}` } }), h("div", { cls: "fe-faint", text: [f.source, ...bits].join(" · ") })),
    btn("Use", () => ctl.useAction(f), "", ));
}

/** Features by source, class DCs, scales, derived resources, actions and the choices a note still owes. */
export function featuresFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const p = st.progress, c = ctl.character;
  const cards: (HTMLElement | null)[] = [];
  if (p.pending.length && c) {
    const steps = planResolve(c, ctl.host.registry);
    cards.push(card("Choices waiting", ...p.pending.map(q => {
      const idx = steps.findIndex(s => s.key === q.key);
      return h("div", { cls: "fe-kv", data: { pending: q.key } },
        h("span", { text: `${q.source}: ${q.label}` }),
        idx >= 0 ? btn("Choose", () => { ctl.startResolve(); ctl.setLevelUp({ page: idx }); }, "", ) : h("span", { cls: "fe-faint", text: "Choose in Edit mode" }));
    })));
  }
  if (p.dcs.length) cards.push(card("Class DCs", ...p.dcs.map(d => h("div", { cls: "fe-kv", data: { dc: d.id } },
    h("span", { text: `${d.name}: DC ${d.dc} · attack +${d.attack} · ${ABIL_NAME[d.abil]}`.replace("+-", "-") }),
    d.alt && ctl.editing ? btn(`Use ${ABIL_NAME[d.abil === d.base ? d.alt : d.base]}`, () => ctl.dispatch({ type: "dcAlt", id: d.id, on: d.abil === d.base })) : null))));
  const scales = Object.entries(p.scales);
  if (scales.length) cards.push(card("Scales", ...scales.map(([id, v]) => h("div", { cls: "fe-kv", data: { scale: id } }, h("span", { text: sentence(id) }), h("b", { text: String(v) })))));
  const res = st.resources.filter(r => r.derived);
  if (res.length) cards.push(card("Class resources", ...res.map(r => h("div", { cls: "fe-kv", data: { resource: r.id } },
    h("span", {}, `${r.name} `, h("span", { cls: "fe-faint", text: `(${RESET_NAME[r.reset]}${r.refill ? `, short rest regains ${r.refill.amount}${r.refill.oncePer ? " once per long rest" : ""}` : ""})` })),
    pips(r.max, r.used, n => ctl.dispatch({ type: "uses", id: r.id, used: n }))))));
  const acts = p.features.filter(f => f.action);
  if (acts.length) cards.push(card("Actions", ...acts.map(f => actionRow(ctl, st, f))));
  const groups = new Map<string, FeatureRow[]>();
  for (const f of p.features) { const g = groups.get(f.source); if (g) g.push(f); else groups.set(f.source, [f]); }
  const featureRow = (f: FeatureRow) => h("div", { cls: "fe-kv", data: { key: f.key } },
    h("span", { cls: "fe-inv-name", text: f.name, data: { ref: `feature:${f.key}` } }), h("span", { cls: "fe-muted", text: describeEffects(f.effects) }));
  const group = ([source, list]: [string, FeatureRow[]]) => h("div", { cls: "fe-feature-group", data: { source } }, h("div", { cls: "fe-faint", text: source }), ...list.map(featureRow));
  cards.push(card("Features", ...(groups.size ? [...groups].map(group) : [h("div", { cls: "fe-faint", text: "No class features yet." })])));
  if (p.problems.length || p.unknown.length) cards.push(card("Problems",
    ...p.problems.map(m => h("div", { cls: "fe-warn", text: m })), ...p.unknown.map(m => h("div", { cls: "fe-warn", text: `${m} is not in the compendium` }))));
  return h("div", { cls: "fe-features" }, ...cards);
}
