import type { Registry } from "../content/registry";
import { slug } from "../content/registry";
import type { ClassData, GrantsData, SubclassData } from "../content/types";
import type { Character } from "../core/character";
import type { ActorStats } from "../core/derive";
import type { FeatureRow } from "../core/progression";
import type { SheetController } from "./controller";
import { h } from "./h";
import { btn, card, describeEffects, pips } from "./widgets";

/** One row of the traits card: a feature (or a whole feat) with the source it came from. */
export interface TraitRow { ref: string; name: string; level: number; summary: string; rows: FeatureRow[]; }
export interface TraitGroup { id: string; heading: string; rows: TraitRow[]; }

const SENTENCE_MAX = 160;
/** The first sentence of a feature's text, else a description of its effects. */
export function summaryOf(f: FeatureRow): string {
  const t = (f.text ?? "").trim();
  if (t) {
    const line = t.split(/\n/)[0].trim();
    const m = /^.*?[.!?](?=\s|$)/.exec(line);
    const s = (m ? m[0] : line).trim();
    return s.length > SENTENCE_MAX ? `${s.slice(0, SENTENCE_MAX - 3).trimEnd()}...` : s;
  }
  return describeEffects(f.effects);
}

/** Group the derived features by where they came from: race, each class, each subclass, background, feats. */
export function traitGroups(c: Character, features: FeatureRow[], reg: Registry): TraitGroup[] {
  const name = <T extends { name: string }>(type: string, id: string | undefined) => (id ? reg.get<T>(type, id)?.name ?? id : undefined);
  const one = (f: FeatureRow): TraitRow => ({ ref: `feature:${f.key}`, name: f.name, level: f.level, summary: summaryOf(f), rows: [f] });
  const byPrefix = (prefix: string) => features.filter(f => f.key.startsWith(prefix));
  const groups: TraitGroup[] = [];

  const race = features.filter(f => f.sourceKind === "race" || f.sourceKind === "subrace");
  if (race.length) {
    const r = name("race", c.race), s = name("subrace", c.subrace);
    groups.push({ id: "race", heading: `Race · ${r ?? "Race"}${s ? ` (${s})` : ""}`, rows: race.map(one) });
  }
  for (const k of c.classes) {
    const rows = byPrefix(`class:${k.class}:`).sort((a, b) => a.level - b.level);
    if (rows.length) groups.push({ id: `class:${k.class}`, heading: `Class · ${name<ClassData>("class", k.class)} ${k.level}`, rows: rows.map(one) });
  }
  for (const k of c.classes) {
    if (!k.subclass) continue;
    const rows = byPrefix(`subclass:${k.subclass}:`).sort((a, b) => a.level - b.level);
    if (rows.length) groups.push({ id: `subclass:${k.subclass}`, heading: `Subclass · ${name<SubclassData>("subclass", k.subclass)}`, rows: rows.map(one) });
  }
  const bg = features.filter(f => f.sourceKind === "background");
  if (bg.length) groups.push({ id: "background", heading: `Background · ${name<GrantsData>("background", c.background) ?? "Background"}`, rows: bg.map(one) });

  const feats: TraitRow[] = [];
  for (const id of c.feats) {
    const rows = byPrefix(`feat:${id}:`);
    if (!rows.length) continue;
    feats.push({ ref: `feat:${id}`, name: name("feat", id)!, level: 0, summary: summaryOf(rows[0]), rows });
  }
  if (feats.length) groups.push({ id: "feats", heading: "Feats", rows: feats });
  return groups;
}

function traitRow(ctl: SheetController, st: ActorStats, t: TraitRow, withLevel: boolean): HTMLElement {
  const res = st.resources.filter(r => r.derived), acts: FeatureRow[] = [];
  const shown = new Map<string, (typeof res)[number]>();
  for (const f of t.rows) {
    const cost = f.action?.cost && "resource" in f.action.cost ? slug(f.action.cost.resource) : undefined;
    const r = res.find(x => x.id === slug(f.name)) ?? (cost ? res.find(x => x.id === cost) : undefined);
    if (r) shown.set(r.id, r);
    if (f.action) acts.push(f);
  }
  return h("div", { cls: "fe-trait", data: { trait: t.ref } },
    h("div", { cls: "fe-grow" },
      h("span", { cls: "fe-inv-name", text: t.name, data: { ref: t.ref } }),
      withLevel && t.level ? h("span", { cls: "fe-faint", text: ` Lv ${t.level}` }) : null,
      t.summary ? h("div", { cls: "fe-faint", text: t.summary }) : null),
    ...[...shown.values()].map(r => h("span", { cls: "fe-trait-uses", data: { resource: r.id } }, pips(r.max, r.used, n => ctl.dispatch({ type: "uses", id: r.id, used: n })))),
    ...acts.map(f => btn(acts.length > 1 ? `Use ${f.action!.name}` : "Use", () => ctl.useAction(f))));
}

/** The Features & Traits card for the main page: collapsible sections by source, one line per feature. */
export function traitsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character;
  const groups = c ? traitGroups(c, st.progress.features, ctl.host.registry) : [];
  if (!groups.length) return card("Features & traits", h("div", { cls: "fe-faint", text: "No features yet." }));
  return card("Features & traits", ...groups.map(g => {
    const open = !ctl.isCollapsed(g.id);
    return h("div", { cls: `fe-trait-group ${open ? "" : "is-collapsed"}`.trim(), data: { group: g.id } },
      h("button", { cls: "fe-trait-head", attrs: { "aria-expanded": String(open) }, on: { click: () => ctl.toggleCollapsed(g.id) } },
        h("span", { cls: "fe-trait-caret", text: open ? "v" : ">" }), h("span", { cls: "fe-grow", text: g.heading }), h("span", { cls: "fe-faint", text: String(g.rows.length) })),
      open ? h("div", { cls: "fe-trait-body" }, ...g.rows.map(t => traitRow(ctl, st, t, g.id.startsWith("class:") || g.id.startsWith("subclass:")))) : null);
  }));
}
