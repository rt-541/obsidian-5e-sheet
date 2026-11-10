import { characterEdition, editionRules } from "../core/edition";
import type { Registry } from "../content/registry";
import { slug } from "../content/registry";
import type { Character } from "../core/character";
import type { ActorStats } from "../core/derive";
import type { FeatureRow } from "../core/progression";
import type { SheetController } from "./controller";
import { customizeButton } from "./customize-ui";
import { h } from "./h";
import { chipFor } from "./bring-in";
import { refLabel, splitRef } from "../content/edition";
import { btn, card, describeEffects, usesPips, wordsCtx, type WordsCtx } from "./widgets";

/** One row of the traits card: a feature (or a whole feat) with the source it came from. */
export interface TraitRow { ref: string; name: string; level: number; summary: string; rows: FeatureRow[]; }
export interface TraitGroup { id: string; heading: string; rows: TraitRow[]; }

const SENTENCE_MAX = 160;
/** The first sentence of a feature's text, else a description of its effects. */
export function summaryOf(f: FeatureRow, ctx?: WordsCtx): string {
  const t = (f.text ?? "").trim();
  if (t) {
    const line = t.split(/\n/)[0].trim();
    const m = /^.*?[.!?](?=\s|$)/.exec(line);
    const s = (m ? m[0] : line).trim();
    return s.length > SENTENCE_MAX ? `${s.slice(0, SENTENCE_MAX - 3).trimEnd()}...` : s;
  }
  return describeEffects(f.effects, ctx);
}

/** Group the derived features by where they came from: race, each class, each subclass, background, feats. */
export function traitGroups(c: Character, features: FeatureRow[], reg: Registry, ctx?: WordsCtx): TraitGroup[] {
  const name = <T extends { name: string }>(type: string, id: string | undefined) => (id ? reg.get<T>(type, id)?.name ?? id : undefined);
  /** The heading name: a brought-in entry shows its edition after it. */
  const named = (type: string, id: string | undefined) => (id ? (splitRef(id).edition ? refLabel(reg, type, id) : name(type, id)) : undefined);
  const one = (f: FeatureRow): TraitRow => ({ ref: `feature:${f.key}`, name: f.name, level: f.level, summary: summaryOf(f, ctx), rows: [f] });
  const byPrefix = (prefix: string) => features.filter(f => f.key.startsWith(prefix));
  const groups: TraitGroup[] = [];

  const race = features.filter(f => f.sourceKind === "race" || f.sourceKind === "subrace");
  if (race.length) {
    const r = named("race", c.race), s = named("subrace", c.subrace);
    const word = editionRules(characterEdition(c)).raceWord;
    groups.push({ id: "race", heading: `${word} · ${r ?? word}${s ? ` (${s})` : ""}`, rows: race.map(one) });
  }
  for (const k of c.classes) {
    const rows = byPrefix(`class:${k.class}:`).sort((a, b) => a.level - b.level);
    if (rows.length) groups.push({ id: `class:${k.class}`, heading: `Class · ${named("class", k.class)} ${k.level}`, rows: rows.map(one) });
  }
  for (const k of c.classes) {
    if (!k.subclass) continue;
    const rows = byPrefix(`subclass:${k.subclass}:`).sort((a, b) => a.level - b.level);
    if (rows.length) groups.push({ id: `subclass:${k.subclass}`, heading: `Subclass · ${named("subclass", k.subclass)}`, rows: rows.map(one) });
  }
  const bg = features.filter(f => f.sourceKind === "background");
  if (bg.length) groups.push({ id: "background", heading: `Background · ${named("background", c.background) ?? "Background"}`, rows: bg.map(one) });

  const feats: TraitRow[] = [];
  for (const id of c.feats) {
    const rows = byPrefix(`feat:${id}:`);
    if (!rows.length) continue;
    feats.push({ ref: `feat:${id}`, name: name("feat", id)!, level: 0, summary: summaryOf(rows[0], ctx), rows });
  }
  if (feats.length) groups.push({ id: "feats", heading: "Feats", rows: feats });
  return groups;
}

type DerivedResource = ActorStats["resources"][number];
/** The uses (derived resources) and actions a trait row owns, so the traits card and a pinned copy show the same controls. */
function traitParts(st: ActorStats, t: TraitRow): { uses: DerivedResource[]; acts: FeatureRow[] } {
  const res = st.resources.filter(r => r.derived), acts: FeatureRow[] = [];
  const shown = new Map<string, DerivedResource>();
  for (const f of t.rows) {
    const cost = f.action?.cost && "resource" in f.action.cost ? slug(f.action.cost.resource) : undefined;
    const r = res.find(x => x.id === slug(f.name)) ?? res.find(x => x.id === slug(f.name.replace(/\s*\([^)]*\)\s*$/, ""))) ?? (cost ? res.find(x => x.id === cost) : undefined);
    if (r) shown.set(r.id, r);
    if (f.action) acts.push(f);
  }
  return { uses: [...shown.values()], acts };
}
const usesAndActs = (ctl: SheetController, parts: ReturnType<typeof traitParts>) => [
  ...parts.uses.map(r => h("span", { cls: "fe-trait-uses", data: { resource: r.id } }, usesPips(r, n => ctl.dispatch({ type: "uses", id: r.id, used: n })))),
  ...parts.acts.map(f => btn(parts.acts.length > 1 ? `Use ${f.action!.name}` : "Use", () => ctl.useAction(f)))];

function pinButton(ctl: SheetController, ref: string): HTMLElement {
  const on = ctl.character!.mainPins.includes(ref);
  const el = btn(on ? "Pinned" : "Pin", () => ctl.dispatch({ type: "pin", ref, on: !on }), `fe-pin ${on ? "is-on" : ""}`.trim()); el.dataset.act = "pin-feature";
  el.title = on ? "Shown under Resources and charges (click to unpin)" : "Show under Resources and charges";
  return el;
}

function traitRow(ctl: SheetController, st: ActorStats, t: TraitRow, withLevel: boolean): HTMLElement {
  return h("div", { cls: "fe-trait", data: { trait: t.ref } },
    h("div", { cls: "fe-grow" },
      h("span", { cls: "fe-inv-name", text: t.name, data: { ref: t.ref } }),
      t.ref.startsWith("feat:") ? chipFor(t.ref.slice(5), ctl.character) : null,
      withLevel && t.level ? h("span", { cls: "fe-faint", text: ` Lv ${t.level}` }) : null,
      t.summary ? h("div", { cls: "fe-faint", text: t.summary }) : null),
    ...usesAndActs(ctl, traitParts(st, t)),
    t.rows.some(r => r.custom) ? h("span", { cls: "fe-chip", text: "changed" }) : null,
    t.rows.length ? customizeButton(ctl, { kind: "feature", key: t.rows[0].key, name: t.name, pinRef: t.ref }) : null,
    ctl.character ? pinButton(ctl, t.ref) : null);
}

/**
 * Pinned features for the Resources and charges card, in pin order, with the ids of the resources they already show
 * (the card skips those rows so a pinned Ki feature does not also list "Ki" again). Pins whose feature is gone are skipped.
 */
export function pinnedTraits(ctl: SheetController, st: ActorStats): { rows: HTMLElement[]; covered: Set<string> } {
  const c = ctl.character, covered = new Set<string>();
  if (!c?.mainPins.length) return { rows: [], covered };
  const all = traitGroups(c, st.progress.features, ctl.host.registry, wordsCtx(c, st)).flatMap(g => g.rows);
  const rows = c.mainPins.map(ref => all.find(t => t.ref === ref)).filter((t): t is TraitRow => !!t).map(t => {
    const parts = traitParts(st, t);
    for (const r of parts.uses) covered.add(r.id);
    return h("div", { cls: "fe-kv fe-pinned-trait", data: { pinnedFeature: t.ref } },
      h("span", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: t.name, data: { ref: t.ref } }),
        !parts.uses.length && !parts.acts.length && t.summary ? h("div", { cls: "fe-faint", text: t.summary }) : null),
      ...usesAndActs(ctl, parts));
  });
  return { rows, covered };
}

/** The Features & Traits card for the main page: collapsible sections by source, one line per feature. */
export function traitsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character;
  const groups = c ? traitGroups(c, st.progress.features, ctl.host.registry, wordsCtx(c, st)) : [];
  if (!groups.length) return card("Features & traits", h("div", { cls: "fe-faint", text: "No features yet." }));
  return card("Features & traits", ...groups.map(g => {
    const open = !ctl.isCollapsed(g.id);
    return h("div", { cls: `fe-trait-group ${open ? "" : "is-collapsed"}`.trim(), data: { group: g.id } },
      h("button", { cls: "fe-trait-head", attrs: { "aria-expanded": String(open) }, on: { click: () => ctl.toggleCollapsed(g.id) } },
        h("span", { cls: "fe-trait-caret", text: open ? "v" : ">" }), h("span", { cls: "fe-grow", text: g.heading }), h("span", { cls: "fe-faint", text: String(g.rows.length) })),
      open ? h("div", { cls: "fe-trait-body" }, ...g.rows.map(t => traitRow(ctl, st, t, g.id.startsWith("class:") || g.id.startsWith("subclass:")))) : null);
  }));
}
