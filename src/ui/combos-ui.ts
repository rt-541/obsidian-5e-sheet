import { slug } from "../content/registry";
import { COMBO_ACTIONS, type Combo } from "../core/character";
import { comboChoices, comboViews, dcChoices, encodeThing, resourceChoices, withField, withThing, type ComboView, type StepView } from "../core/combos";
import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";
import { castButton, rolls } from "./spells-ui";
import { pips } from "./widgets";

const ABIL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" } as const;
const btn = (text: string, onClick: () => void, cls = "", data?: Record<string, string>) =>
  h("button", { cls: `fe-btn ${cls}`.trim(), text, ...(data ? { data } : {}), on: { click: onClick } });
const roll = (text: string, title: string, on: (e: MouseEvent) => void) => h("button", { cls: "fe-roll", text, title, on: { click: on } });

/** The live buttons for one step: what to roll, cast, spend or start, so the player never has to look anything up. */
function stepButtons(ctl: SheetController, st: ActorStats, v: StepView, combo: Combo): (Node | null)[] {
  const out: (Node | null)[] = [];
  if (v.attack) {
    const a = v.attack;
    if (a.toHit !== undefined) out.push(roll(sgn(a.toHit), `${a.name}: roll to hit`, e => ctl.roll(`${a.name} to hit`, a.toHit!, a.target, e, a.who)));
    if (a.save) out.push(h("span", { cls: "fe-src", text: `DC ${a.save.dc} ${ABIL[a.save.abil]}` }));
    if (a.damage) out.push(roll(a.damage, `${a.name}: roll damage`, () => ctl.damage(`${a.name} damage`, a.damage!)));
  }
  if (v.spell) {
    out.push(...rolls(ctl, v.spell));
    const cast = castButton(ctl, v.spell); if (cast) { if (v.spellCastable === false) cast.classList.add("is-out"); out.push(cast); }
  }
  if (v.toggle) {
    const t = v.toggle;
    out.push(h("button", { cls: `fe-btn ${t.on ? "is-on" : ""}`.trim(), text: `${t.on ? "End" : "Start"} ${t.name}`, attrs: { "aria-pressed": String(t.on) }, data: { act: "step-toggle" }, on: { click: () => ctl.toggle(t.id, !t.on) } }));
  }
  const a = v.feature?.action, paysItself = !!a?.cost && "resource" in a.cost && !!v.step.use?.resource && slug(a.cost.resource) === slug(v.step.use.resource);
  if (v.feature && a) out.push(btn(`Use ${a.name}`, () => ctl.useAction(v.feature!), "", { act: "step-use" }));
  if (v.dc) out.push(h("span", { cls: "fe-src", text: `DC ${v.dc.dc}`, title: `${v.dc.name} save DC` }));
  if (v.dice) out.push(roll(v.dice, `Roll ${v.dice}`, () => ctl.damage(`${combo.name}: ${v.step.action}`, v.dice!)));
  if (v.item?.charges) out.push(h("span", { cls: "fe-src", text: `${v.item.charges.left} of ${v.item.charges.max} charges left` }));
  if (v.resource) {
    const r = v.resource, row = r.row;
    if (row.unlimited) out.push(h("span", { cls: "fe-src", text: `${row.name}: ${row.unlimited.toLowerCase()}` }));
    else {
      if (r.cost > 0 && !paysItself) out.push(h("button", { cls: `fe-btn ${r.out ? "is-out" : ""}`.trim(), text: `Spend ${r.cost} ${row.name}`, data: { act: "step-spend" }, on: { click: () => ctl.spendResource(row.name, r.cost) } }));
      out.push(h("span", { cls: "fe-src", text: `${r.left} of ${row.max} left`, data: { left: String(r.left) } }));
      if (row.max <= 10 && !paysItself) out.push(pips(row.max, row.used, n => setUsed(ctl, st, row.name, n)));
    }
  }
  return out;
}

/** Pips set the used count directly, like the resources card does. */
function setUsed(ctl: SheetController, st: ActorStats, name: string, used: number) {
  const r = st.resources.find(x => slug(x.name) === slug(name)); if (!r) return;
  if (r.derived) ctl.dispatch({ type: "uses", id: r.id, used }); else ctl.dispatch({ type: "resource", index: Number(r.id.split(":")[1]), used });
}

function stepEl(ctl: SheetController, st: ActorStats, v: StepView, combo: Combo): HTMLElement {
  const text = h("span", { cls: "fe-step-text", text: v.step.text, ...(v.ref ? { data: { ref: v.ref } } : {}) });
  return h("li", { cls: `fe-step ${v.out ? "is-out" : ""}`.trim(), data: { step: String(v.index) } },
    h("span", { cls: `fe-badge is-${slug(v.step.action)}`, text: v.step.action, data: { badge: slug(v.step.action) } }),
    h("div", { cls: "fe-grow" }, v.who ? h("b", { text: `${v.who}: ` }) : null, text,
      ...v.problems.map(p => h("div", { cls: "fe-step-problem", text: `Can't do this yet: ${p}.` }))),
    h("div", { cls: "fe-step-ctl" }, ...stepButtons(ctl, st, v, combo)));
}

function comboCard(ctl: SheetController, st: ActorStats, v: ComboView, compact: boolean): HTMLElement {
  const c = v.combo;
  return h("div", { cls: `fe-card fe-combo ${v.ready ? "" : "is-short"}`.trim(), data: { combo: String(v.index) } },
    h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: c.name, data: { ref: `combo:${v.index}` } }),
      h("span", { cls: `fe-ready ${v.ready ? "" : "is-short"}`.trim(), text: v.readyText, data: { ready: v.ready ? "yes" : "no" } })),
    c.when ? h("div", { cls: "fe-muted fe-combo-when", text: `When to use it: ${c.when}` }) : null,
    h("ol", { cls: "fe-steps" }, ...v.steps.map(s => stepEl(ctl, st, s, c))),
    !compact && c.notes ? h("div", { cls: "fe-note", text: c.notes }) : null,
    h("div", { cls: "fe-kv fe-combo-ctl" },
      btn(c.pinned ? "Pinned to main page" : "Pin to main page", () => ctl.pinCombo(v.index, !c.pinned), c.pinned ? "is-on" : "", { act: "pin-combo" }),
      compact ? null : btn("Edit", () => ctl.startComboEdit(v.index), "", { act: "edit-combo" })));
}

/** The Combos tab: an Add button that is always there, then every combo as a card with live buttons. */
export function combosFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const views = comboViews(ctl.character!, st, ctl.companionStats(), ctl.ctx());
  const add = views.length
    ? btn("+ Add combo", () => ctl.startComboEdit(null), "mod-cta", { act: "add-combo" })
    : h("button", { cls: "fe-btn mod-cta fe-combo-empty", text: "No combos yet. Add your first combo", data: { act: "add-combo" }, on: { click: () => ctl.startComboEdit(null) } });
  return h("div", { cls: "fe-combos" }, add, ...views.map(v => comboCard(ctl, st, v, false)));
}

/** The combos pinned to the main page; hidden while the character has none. */
export function pinnedCombosFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const views = comboViews(ctl.character!, st, ctl.companionStats(), ctl.ctx()), pinned = views.filter(v => v.combo.pinned);
  const el = h("div", { cls: "fe-combos fe-combos-pinned" }, h("div", { cls: "fe-card-title", text: "Combos" }),
    ...(pinned.length ? pinned.map(v => comboCard(ctl, st, v, true)) : [h("div", { cls: "fe-faint", text: "Pin a combo on the Combos tab to show it here." })]));
  if (!views.length) el.hidden = true;
  return el;
}

// ---- the form (opens from "+ Add combo" and each card's Edit button)

const field = (label: string, ...kids: (Node | null)[]) => h("label", { cls: "fe-field" }, h("span", { cls: "fe-muted", text: label }), ...kids);
function select(options: { value: string; label: string }[], value: string, on: (v: string) => void, data: Record<string, string>, groups?: { label: string; options: { value: string; label: string }[] }[]) {
  const opt = (o: { value: string; label: string }) => h("option", { text: o.label, attrs: { value: o.value, ...(o.value === value ? { selected: "" } : {}) } });
  const el = h("select", { data, on: { change: (e: Event) => on((e.target as HTMLSelectElement).value) } },
    ...options.map(opt), ...(groups ?? []).map(g => h("optgroup", { attrs: { label: g.label } }, ...g.options.map(opt))));
  el.value = value;
  return el;
}

export function comboForm(ctl: SheetController): HTMLElement {
  const d = ctl.comboDraft, st = ctl.stats(), c = ctl.character;
  if (!d || !st || !c) return h("div", { cls: "fe-faint", text: "Nothing to edit." });
  const combo = d.combo, comps = c.companions, picks = comboChoices(c, st, ctl.companionStats(), ctl.ctx()), count = c.combos.length;
  const text = (v: string, set: (s: string) => void, data: string, placeholder = "") =>
    h("input", { cls: "fe-search", data: { act: data }, attrs: { value: v, placeholder }, on: { input: (e: Event) => set((e.target as HTMLInputElement).value) } });
  const area = (v: string, set: (s: string) => void, data: string, placeholder = "") => {
    const el = h("textarea", { cls: "fe-search", data: { act: data }, attrs: { rows: "2", placeholder }, on: { input: (e: Event) => set((e.target as HTMLTextAreaElement).value) } }); el.value = v; return el;
  };
  const stepEdit = (s: Combo["steps"][number], i: number) => {
    const u = s.use ?? {};
    return h("div", { cls: "fe-form-step", data: { step: String(i) } },
      h("div", { cls: "fe-kv" }, h("b", { text: `Step ${i + 1}` }),
        h("span", {}, i > 0 ? btn("Earlier", () => ctl.touchComboDraft(x => { [x.steps[i - 1], x.steps[i]] = [x.steps[i], x.steps[i - 1]]; }), "", { act: "step-up" }) : null,
          i < combo.steps.length - 1 ? btn("Later", () => ctl.touchComboDraft(x => { [x.steps[i + 1], x.steps[i]] = [x.steps[i], x.steps[i + 1]]; }), "", { act: "step-down" }) : null,
          btn("Remove step", () => ctl.touchComboDraft(x => { x.steps.splice(i, 1); }), "", { act: "step-remove" }))),
      field("What kind of action is it?", select(COMBO_ACTIONS.map(a => ({ value: a, label: a })), s.action, v => { s.action = v; }, { act: "step-action" })),
      comps.length ? field("Who does it?", select([{ value: "", label: "You" }, ...comps.map(k => ({ value: k.name, label: k.name }))], s.who ?? "", v => { if (v) s.who = v; else delete s.who; }, { act: "step-who" })) : null,
      field("What happens?", area(s.text, v => { s.text = v; }, "step-text", "Example: Attack twice with your staff.")),
      field("Use something from your sheet (optional)", select([{ value: "", label: "Nothing, just a reminder" }], encodeThing(u), v => { s.use = withThing(s.use, v); if (!s.use) delete s.use; }, { act: "step-thing" }, picks)),
      field("Spends a resource (optional)", select([{ value: "", label: "Nothing" }, ...resourceChoices(st)], u.resource ?? "", v => { s.use = withField(s.use, "resource", v); if (v && !s.use?.cost) s.use = withField(s.use, "cost", 1); if (!s.use) delete s.use; ctl.touchComboDraft(() => undefined); }, { act: "step-resource" })),
      u.resource ? field("How many does it spend?", h("input", { cls: "fe-amt", data: { act: "step-cost" }, attrs: { type: "number", min: "1", value: String(u.cost ?? 1) },
        on: { input: (e: Event) => { s.use = withField(s.use, "cost", Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value)) || 1)); } } })) : null,
      dcChoices(st).length ? field("Show a saving throw DC (optional)", select([{ value: "", label: "None" }, ...dcChoices(st)], u.dc ?? "", v => { s.use = withField(s.use, "dc", v); if (!s.use) delete s.use; }, { act: "step-dc" })) : null,
      field("Dice to roll (optional, like 1d8+3)", text(u.dice ?? "", v => { s.use = withField(s.use, "dice", v.trim()); if (!s.use) delete s.use; }, "step-dice")));
  };
  return h("div", { cls: "fe-combo-form" },
    field("Name of the combo", text(combo.name, v => { combo.name = v; }, "combo-name", "Example: Stun Lock")),
    field("When should you use it?", text(combo.when, v => { combo.when = v; }, "combo-when", "Example: a dangerous enemy within reach")),
    h("div", { cls: "fe-card-title", text: "Steps, in order" }),
    ...combo.steps.map(stepEdit),
    btn("+ Add a step", () => ctl.touchComboDraft(x => { x.steps.push({ action: "Action", text: "" }); }), "", { act: "add-step" }),
    field("Notes (optional)", area(combo.notes ?? "", v => { if (v) combo.notes = v; else delete combo.notes; }, "combo-notes", "Anything worth remembering")),
    d.error ? h("div", { cls: "fe-warn", text: d.error, data: { act: "combo-error" } }) : null,
    d.index !== null ? h("div", { cls: "fe-kv" }, h("span", { cls: "fe-muted", text: "Position in the list" }),
      h("span", {}, d.index > 0 ? btn("Move earlier", () => ctl.moveComboDraft(-1), "", { act: "combo-earlier" }) : null,
        d.index < count - 1 ? btn("Move later", () => ctl.moveComboDraft(1), "", { act: "combo-later" }) : null)) : null,
    h("div", { cls: "fe-kv" },
      d.index !== null ? btn(d.confirmDelete ? "Tap again to delete this combo" : "Delete combo", () => ctl.deleteComboDraft(), d.confirmDelete ? "is-out" : "", { act: "combo-delete" }) : h("span"),
      h("span", {}, btn("Cancel", () => ctl.cancelComboEdit(), "", { act: "combo-cancel" }), btn("Save combo", () => ctl.saveComboDraft(), "mod-cta", { act: "combo-save" }))));
}

