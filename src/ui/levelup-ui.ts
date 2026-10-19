import { sourceLabel, type Registry } from "../content/registry";
import type { FeatData } from "../content/types";
import type { Character } from "../core/character";
import { levelOptions, type LevelOption, type Step, type StepOption } from "../core/levelup";
import { ABILS, type Abil } from "../core/types";
import type { LevelUpState, LevelUpView, SheetController } from "./controller";
import { plural } from "../core/words";
import { clear, h } from "./h";
import { btn, sourceBadge, titleCase } from "./widgets";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
/** What the step pages need from their owner: the level-up wizard's SheetController, or the character builder. */
export interface PageCtl { character?: Character; host: { registry: Registry; notify(msg: string): void }; /** Registry for pick lists (campaign source switches applied). */ pickers(): Registry; pick(key: string, value: unknown): void; }
/** The answers and view state the pages read. */
export interface PageState { choices: Record<string, unknown>; view: LevelUpView; }
type Pick<K extends Step["kind"]> = Extract<Step, { kind: K }>;

/** Has this step got a complete answer? */
export function answered(s: Step, st: { choices: Record<string, unknown>; hp?: unknown }): boolean {
  const v = st.choices[s.key];
  switch (s.kind) {
    case "hp": return s.first || !!st.hp;
    case "subclass": return typeof v === "string";
    case "asi": return isObj(v) && (typeof v.feat === "string" || (isObj(v.abilities) && Object.values(v.abilities).reduce<number>((a, n) => a + (typeof n === "number" ? n : 0), 0) === 2));
    case "optional": return typeof v === "boolean";
    case "pick": return isStrs(v) && v.length === s.count && v.every(x => x.trim() !== "");
    case "spells": return isStrs(v) && v.length === s.cantrips + s.count;
  }
}

const row = (cls: string, ...kids: (Node | null)[]) => h("div", { cls }, ...kids);
export const choiceButton = (name: string, detail: string | undefined, on: boolean, disabled: string | undefined, click: () => void, data: Record<string, string>, source?: string) => {
  const b = h("button", { cls: `fe-btn fe-choice ${on ? "is-on" : ""}`.trim(), data, on: { click } },
    h("span", { cls: "fe-name", text: name }), detail ? h("span", { cls: "fe-faint", text: ` ${detail}` }) : null, disabled ? h("span", { cls: "fe-faint", text: ` (${disabled.toLowerCase()})` }) : null, source ? sourceBadge(source) : null);
  if (disabled) b.disabled = true;
  b.setAttribute("aria-pressed", String(on));
  return b;
};

function classPage(ctl: SheetController, st: LevelUpState): HTMLElement {
  const c = ctl.character!, opts = levelOptions(c, ctl.pickers());
  const rowOf = (o: LevelOption) => {
    const b = choiceButton(`${o.name} ${o.current ? `${o.level - 1} to ${o.level}` : `(new) ${o.level}`}`, undefined, st.classId === o.class, undefined, () => ctl.setLevelUp({ classId: o.class, page: st.page }), { class: o.class }, o.source);
    if (!o.allowed) b.disabled = true;
    return h("div", {}, b, ...(o.allowed ? [] : o.reasons.slice(0, 1).map(r => h("div", { cls: "fe-muted", text: r }))));
  };
  const no = opts.filter(o => !o.allowed);
  // Reasons every ineligible class shares are said once, in the summary; each row keeps only what is its own.
  const shared = no.length ? no[0].reasons.filter(r => no.every(o => o.reasons.includes(r))) : [];
  const own = (o: LevelOption): LevelOption => ({ ...o, reasons: o.reasons.filter(r => !shared.includes(r)) });
  return h("div", { cls: "fe-lu-body", data: { step: "class" } }, h("div", { cls: "fe-muted", text: c.classes.length ? "Which class takes this level?" : "Pick the first class." }),
    ...opts.filter(o => o.allowed).map(rowOf),
    no.length ? h("details", { data: { ineligible: "" }, attrs: st.classId && no.some(o => o.class === st.classId) ? { open: "" } : {} },
      h("summary", { text: ["Other classes (need higher scores)", ...shared].join(". ") }),
      ...no.map(o => rowOf(own(o)))) : null);
}

function hpPage(ctl: SheetController, s: Pick<"hp">, st: LevelUpState): HTMLElement {
  const gain = (g: number) => Math.max(1, g + s.conMod);
  if (s.first) return h("div", { cls: "fe-lu-body", data: { step: "hp" } }, h("div", { cls: "fe-name", text: "First level" }),
    h("div", { text: `Full hit die: d${s.die} (${s.die}) ${sgn(s.conMod)} Constitution = ${gain(s.die)} hit points` }));
  return h("div", { cls: "fe-lu-body", data: { step: "hp" } }, h("div", { cls: "fe-muted", text: `Hit die d${s.die}, Constitution ${sgn(s.conMod)}` }),
    h("div", { cls: "fe-filters" },
      choiceButton("Roll", `1d${s.die}`, st.hp?.method === "roll", undefined, () => ctl.rollLevelHp(s.die), { hp: "roll" }),
      choiceButton("Average", `${s.average}`, st.hp?.method === "average", undefined, () => ctl.setLevelUp({ hp: { method: "average" } }), { hp: "average" })),
    st.hp ? h("div", { cls: "fe-name", data: { result: "hp" }, text: st.hp.method === "roll" ? `Rolled ${st.hp.roll} ${sgn(s.conMod)} Constitution = ${gain(st.hp.roll ?? 1)} hit points` : `Average ${s.average} ${sgn(s.conMod)} Constitution = ${gain(s.average)} hit points` }) : null);
}

export function subclassPage(ctl: PageCtl, s: Pick<"subclass">, st: PageState): HTMLElement {
  return h("div", { cls: "fe-lu-body", data: { step: s.key } }, h("div", { cls: "fe-muted", text: s.label }),
    ...s.options.map(o => h("div", { cls: "fe-subclass" },
      choiceButton(o.name, undefined, st.choices[s.key] === o.id, o.disabled, () => ctl.pick(s.key, o.id), { opt: o.id }, o.source),
      h("span", { cls: "fe-faint fe-detail-link", text: "details", data: { ref: `subclass:${o.id}`, noclick: "" } }))));
}

export function abilityRows(ctl: PageCtl, s: Pick<"asi">, st: PageState): HTMLElement {
  const c = ctl.character!, v = st.choices[s.key];
  const pts: Record<string, number> = isObj(v) && isObj(v.abilities) ? Object.fromEntries(Object.entries(v.abilities).filter(([, n]) => typeof n === "number")) as Record<string, number> : {};
  const total = Object.values(pts).reduce((a, n) => a + n, 0);
  const set = (a: Abil, n: number) => { const next = { ...pts, [a]: n }; if (!n) delete next[a]; ctl.pick(s.key, { abilities: next }); };
  return h("div", {}, h("div", { cls: "fe-muted", text: `${2 - total} point${2 - total === 1 ? "" : "s"} left: +2 to one ability or +1 to two` }),
    ...ABILS.map(a => {
      const cur = c.abilities[a], add = pts[a] ?? 0, cap = s.maxScores[a];
      const minus = btn("-", () => set(a, add - 1), "", ); minus.disabled = add <= 0; minus.setAttribute("aria-label", `Less ${ABIL_NAME[a]}`);
      const plus = btn("+", () => set(a, add + 1), ""); plus.disabled = total >= 2 || add >= 2 || cur + add + 1 > cap; plus.setAttribute("aria-label", `More ${ABIL_NAME[a]}`);
      return h("div", { cls: "fe-kv", data: { abil: a } }, h("span", { cls: "fe-grow", text: `${ABIL_NAME[a]} ${cur}${add ? ` to ${cur + add}` : ""}${cap > 20 ? ` (max ${cap})` : ""}` }), minus, plus);
    }));
}

export function featList(ctl: PageCtl, s: Pick<"asi">, st: PageState): HTMLElement {
  const view = st.view, picked = isObj(st.choices[s.key]) ? (st.choices[s.key] as Record<string, unknown>).feat : undefined, owned = new Set(ctl.character!.feats);
  const list = h("div", {});
  const fill = () => {
    clear(list);
    const q = view.featQuery.toLowerCase();
    const feats = ctl.pickers().list<FeatData>("feat").filter(e => e.name.toLowerCase().includes(q));
    for (const e of feats.slice(0, 60)) list.append(h("div", { cls: "fe-inv" },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: e.name, data: { ref: `feat:${e.id}`, noclick: "" } }), sourceBadge(sourceLabel(e)), e.data.prerequisite ? h("div", { cls: "fe-faint", text: `Prerequisite: ${e.data.prerequisite}` }) : null),
      owned.has(e.id) ? h("span", { cls: "fe-faint", text: "taken" }) : btn(picked === e.id ? "Picked" : "Pick", () => ctl.pick(s.key, { feat: e.id }), picked === e.id ? "is-on" : "")));
    if (!feats.length) list.append(h("div", { cls: "fe-faint", text: "No feats match." }));
  };
  fill();
  return h("div", {}, h("input", { cls: "fe-search", attrs: { type: "search", placeholder: "Search feats", value: view.featQuery }, on: { input: (e: Event) => { view.featQuery = (e.target as HTMLInputElement).value; fill(); } } }), list);
}

export function asiPage(ctl: PageCtl, s: Pick<"asi">, st: PageState): HTMLElement {
  const v = st.choices[s.key], feat = (isObj(v) && typeof v.feat === "string") || st.view.featOpen.has(s.key);
  return h("div", { cls: "fe-lu-body", data: { step: s.key } }, h("div", { cls: "fe-muted", text: s.label }),
    h("div", { cls: "fe-filters" },
      choiceButton("Ability scores", undefined, !feat, undefined, () => { st.view.featOpen.delete(s.key); ctl.pick(s.key, { abilities: {} }); }, { mode: "abilities" }),
      choiceButton("Feat", undefined, feat, undefined, () => { st.view.featOpen.add(s.key); ctl.pick(s.key, { abilities: {} }); }, { mode: "feat" })),
    feat ? featList(ctl, s, st) : abilityRows(ctl, s, st));
}

/** An optional class feature: its text and a Yes / No. */
export function optionalPage(ctl: PageCtl, s: Pick<"optional">, st: PageState): HTMLElement {
  const v = st.choices[s.key];
  return h("div", { cls: "fe-lu-body", data: { step: s.key } }, h("div", { cls: "fe-muted", text: s.label }),
    s.text ? h("div", { cls: "fe-faint", text: s.text }) : null,
    h("div", { cls: "fe-filters" },
      choiceButton("Yes, take it", undefined, v === true, undefined, () => ctl.pick(s.key, true), { opt: "yes" }),
      choiceButton("No", undefined, v === false, undefined, () => ctl.pick(s.key, false), { opt: "no" })));
}

export function pickPage(ctl: PageCtl, s: Pick<"pick">, st: PageState): HTMLElement {
  const v = st.choices[s.key], cur = isStrs(v) ? v : [];
  const toggle = (id: string) => ctl.pick(s.key, cur.includes(id) ? cur.filter(x => x !== id) : cur.length >= s.count ? [...cur.slice(1), id] : [...cur, id]);
  const optionButtons = () => s.options.map(o => choiceButton(o.name, o.text, cur.includes(o.id), o.disabled, () => toggle(o.id), { opt: o.id }, o.source));
  const body = s.free && s.options.length
    ? [...optionButtons(),
        ...cur.filter(x => !s.options.some(o => o.id === x)).map(x => choiceButton(x, undefined, true, undefined, () => toggle(x), { opt: x })),
        h("input", { cls: "fe-search", data: { act: "other-language" }, attrs: { type: "text", placeholder: "Another language", "aria-label": "Another language" },
          on: { change: (e: Event) => { const el = e.target as HTMLInputElement, name = el.value.trim(); el.value = ""; if (name && !cur.some(x => x.toLowerCase() === name.toLowerCase())) toggle(name); } } })]
    : s.free
    ? Array.from({ length: s.count }, (_, i) => h("input", { cls: "fe-search", attrs: { type: "text", placeholder: `${titleCase(s.what)} ${i + 1}`, value: cur[i] ?? "", "aria-label": `${titleCase(s.what)} ${i + 1}` },
        on: { change: (e: Event) => { const next = [...cur]; next[i] = (e.target as HTMLInputElement).value.trim(); ctl.pick(s.key, next.filter(x => x !== "" || next.length > i).slice(0, s.count)); } } }))
    : optionButtons();
  return h("div", { cls: "fe-lu-body", data: { step: s.key } }, h("div", { cls: "fe-muted", text: `${s.label} (${cur.length} of ${s.count})` }), ...body);
}

/** The spell step's rows: cantrips only when no spells are owed, cantrips first, spells the character cannot cast yet left out. */
export function spellStepRows(s: Extract<Step, { kind: "spells" }>, query: string): StepOption[] {
  const q = query.toLowerCase();
  return s.options
    .filter(o => (s.count > 0 || (o.level ?? 1) === 0) && !((o.level ?? 0) > s.maxLevel && o.disabled) && o.name.toLowerCase().includes(q))
    .sort((a, b) => ((a.level ?? 0) === 0 ? 0 : 1) - ((b.level ?? 0) === 0 ? 0 : 1) || (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
}

/** "Learn 3 cantrips: 1 of 3 chosen; learn 2 spells: 0 of 2 chosen", never a "0 of 0" half. */
export function spellStepHeading(s: Extract<Step, { kind: "spells" }>, nCantrips: number, nSpells: number): string {
  const parts: string[] = [];
  if (s.cantrips > 0) parts.push(`learn ${plural(s.cantrips, "cantrips")}: ${nCantrips} of ${s.cantrips} chosen`);
  if (s.count > 0) parts.push(`learn ${plural(s.count, "spells")}: ${nSpells} of ${s.count} chosen`);
  if (!parts.length) return s.label;
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function spellsPage(ctl: PageCtl, s: Pick<"spells">, st: PageState): HTMLElement {
  const v = st.choices[s.key], cur = isStrs(v) ? v : [];
  const level = (id: string) => s.options.find(o => o.id === id)?.level ?? 1;
  const nCantrips = cur.filter(id => level(id) === 0).length, nSpells = cur.length - nCantrips;
  const toggle = (id: string) => {
    if (cur.includes(id)) { ctl.pick(s.key, cur.filter(x => x !== id)); return; }
    const cantrip = level(id) === 0;
    if (cantrip ? nCantrips >= s.cantrips : nSpells >= s.count) { ctl.host.notify(cantrip ? `Only ${s.cantrips} cantrip${s.cantrips === 1 ? "" : "s"} here` : `Only ${s.count} spell${s.count === 1 ? "" : "s"} here`); return; }
    ctl.pick(s.key, [...cur, id]);
  };
  const list = h("div", {});
  const fill = () => {
    clear(list);
    const query = st.view.spellQuery, rows = spellStepRows(s, query), shown = s.count === 0 ? rows : rows.slice(0, 80);
    for (const o of shown) list.append(h("div", { cls: "fe-inv", data: { spell: o.id } },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-spell-name", text: o.name, data: { ref: `spell:${o.id}`, noclick: "" } }), o.source ? sourceBadge(o.source) : null, h("div", { cls: "fe-faint", text: o.text ?? "" })),
      o.disabled ? h("span", { cls: "fe-faint", text: o.disabled.toLowerCase() }) : btn(cur.includes(o.id) ? "Chosen" : "Add", () => toggle(o.id), cur.includes(o.id) ? "is-on" : "", )));
    if (rows.length > shown.length) list.append(h("div", { cls: "fe-faint", text: `${rows.length - shown.length} more: narrow the search.` }));
    if (!query && !rows.some(o => !o.disabled)) list.append(h("div", { cls: "fe-warn", text: s.count === 0 ? "Every cantrip on this list is already known." : "Every spell on this list is already known." }));
    else if (!rows.length) list.append(h("div", { cls: "fe-faint", text: "No spells match." }));
  };
  fill();
  const swaps = Array.isArray(st.choices[`${s.key}:swap`]) ? st.choices[`${s.key}:swap`] as { out: string; in: string }[] : [];
  const known = ctl.character!.spells.map(x => ({ id: x.id, name: ctl.host.registry.get<{ name: string }>("spell", x.id)?.name ?? x.id }));
  const setSwap = (i: number, part: "out" | "in", value: string) => {
    const next = [...swaps]; next[i] = { out: next[i]?.out ?? "", in: next[i]?.in ?? "", [part]: value };
    ctl.pick(`${s.key}:swap`, next.filter(p => p.out || p.in));
  };
  const swapRows = Array.from({ length: s.swap }, (_, i) => h("div", { cls: "fe-kv", data: { swap: String(i) } },
    h("select", { attrs: { "aria-label": "Spell to swap out" }, on: { change: (e: Event) => setSwap(i, "out", (e.target as HTMLSelectElement).value) } },
      h("option", { text: "Swap out...", attrs: { value: "" } }), ...known.map(k => h("option", { text: k.name, attrs: { value: k.id, ...(swaps[i]?.out === k.id ? { selected: "" } : {}) } }))),
    h("select", { attrs: { "aria-label": "Spell to swap in" }, on: { change: (e: Event) => setSwap(i, "in", (e.target as HTMLSelectElement).value) } },
      h("option", { text: "Swap in...", attrs: { value: "" } }), ...s.options.filter(o => !o.disabled && o.level !== 0).map(o => h("option", { text: o.name, attrs: { value: o.id, ...(swaps[i]?.in === o.id ? { selected: "" } : {}) } })))));
  return h("div", { cls: "fe-lu-body", data: { step: s.key } },
    h("div", { cls: "fe-muted", text: spellStepHeading(s, nCantrips, nSpells) }),
    h("input", { cls: "fe-search", attrs: { type: "search", placeholder: "Search spells", value: st.view.spellQuery }, on: { input: (e: Event) => { st.view.spellQuery = (e.target as HTMLInputElement).value; fill(); } } }),
    list, s.swap ? h("div", {}, h("div", { cls: "fe-card-title", text: `Swap up to ${s.swap}` }), ...swapRows) : null);
}

/** The change groups as headings with plain sentences under them. */
export function changeList(groups: { title: string; lines: string[] }[]): HTMLElement[] {
  return groups.map(g => h("div", { cls: "fe-change", data: { change: g.title } }, h("div", { cls: "fe-card-title fe-change-title", text: g.title }), h("ul", {}, ...g.lines.map(l => h("li", { text: l })))));
}

function summaryPage(ctl: SheetController, st: LevelUpState): HTMLElement {
  const pre = ctl.levelUpPreview();
  return h("div", { cls: "fe-lu-body", data: { step: "summary" } }, h("div", { cls: "fe-muted", text: st.mode === "level" ? "This level will:" : "These choices will:" }),
    "error" in pre ? h("div", { cls: "fe-warn", text: pre.error }) : h("ul", {}, ...pre.summary.map(l => h("li", { text: l }))),
    ...(st.mode === "level" ? [h("div", { cls: "fe-card-title", text: "What changes" }), ...changeList(ctl.levelUpChanges())] : []),
    st.error ? h("div", { cls: "fe-warn", text: st.error }) : null);
}

/** "Step 3 of 7" once the page count is settled, otherwise nothing (the total moves until the class is picked). */
export function stepCounter(page: number, total: number, known: boolean): string { return known ? `Step ${page + 1} of ${total}` : ""; }

/** The step-by-step level-up (or choice-resolving) wizard: one page per screen, Back and Next at the bottom. */
export function levelUpPanel(ctl: SheetController): HTMLElement {
  const st = ctl.levelUp;
  if (!st || !ctl.character) return h("div", { cls: "fe-faint", text: "Nothing to do." });
  const { steps, plan, error } = ctl.levelUpSteps(), resolve = st.mode === "resolve", lead = resolve ? 0 : 1;
  if (resolve && !steps.length) return h("div", {}, h("div", { cls: "fe-faint", text: "Nothing is waiting for a choice." }), btn("Close", () => ctl.cancelLevelUp()));
  const pages = lead + steps.length + 1, page = Math.max(0, Math.min(st.page, pages - 1));
  const last = page === pages - 1, step = page >= lead && !last ? steps[page - lead] : undefined;
  let body: HTMLElement, ready: boolean;
  if (!resolve && page === 0) { body = classPage(ctl, st); ready = !!st.classId && levelOptions(ctl.character, ctl.pickers()).find(o => o.class === st.classId)?.allowed === true; }
  else if (last) { body = summaryPage(ctl, st); ready = !("error" in ctl.levelUpPreview()); }
  else if (step) {
    ready = answered(step, st);
    body = step.kind === "hp" ? hpPage(ctl, step, st) : step.kind === "subclass" ? subclassPage(ctl, step, st) : step.kind === "asi" ? asiPage(ctl, step, st)
      : step.kind === "pick" ? pickPage(ctl, step, st) : step.kind === "optional" ? optionalPage(ctl, step, st) : spellsPage(ctl, step, st);
  } else { body = h("div", { cls: "fe-faint", text: error ?? "Pick a class first." }); ready = false; }
  const back = btn(page === 0 ? "Cancel" : "Back", () => { if (page === 0) ctl.cancelLevelUp(); else ctl.setLevelUp({ page: page - 1 }); }, "", );
  back.dataset.act = "lu-back";
  const next = btn(last ? "Apply" : "Next", () => { if (last) ctl.applyLevelUp(); else ctl.setLevelUp({ page: page + 1 }); }, "mod-cta");
  next.dataset.act = last ? "lu-apply" : "lu-next"; next.disabled = !ready;
  const title = resolve ? "Choices" : plan ? `${plan.className} ${plan.level}${plan.first ? "" : ` (character level ${plan.total})`}` : "Level up";
  return h("div", { cls: "fe-levelup", data: { page: String(page) } },
    h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: title }), h("span", { cls: "fe-faint", text: stepCounter(page, pages, resolve || !!st.classId) })),
    body, h("div", { cls: "fe-kv fe-lu-nav" }, back, next));
}
