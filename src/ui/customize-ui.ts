import { DAMAGE_TYPES } from "../content/creature-note";
import { dcChoices, resourceChoices } from "../core/combos";
import type { ActorStats } from "../core/derive";
import type { Abil } from "../core/types";
import type { CustomizeTarget, SheetController } from "./controller";
import type { CustomizeForm, DiceField } from "./customize-form";
import { h } from "./h";

const ABIL_NAME: Record<Abil, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const sentence = (id: string) => { const t = id.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
type Choice = { value: string; label: string };

/** The Customize button on a feature, trait or item row. Only in Edit mode on a character note that can be written. */
export function customizeButton(ctl: SheetController, t: CustomizeTarget): HTMLElement | null {
  if (!(ctl.editing && ctl.character && ctl.writable)) return null;
  const name = t.kind === "feature" ? t.name : ctl.character.inventory[t.index]?.name ?? ctl.stats()?.itemActions.find(a => a.index === t.index)?.name ?? "this item";
  return h("button", { cls: "fe-btn", text: "Customize", data: { act: "customize" }, attrs: { type: "button", "aria-label": `Customize ${name}` }, on: { click: () => ctl.startCustomize(t) } });
}

// ---- small controls; every one carries data-cz="<form field>"

/** Choices as segmented buttons; each carries data-value. */
function seg(field: string, options: Choice[], value: string, pick: (v: string) => void): HTMLElement {
  return h("div", { cls: "fe-cz-segs", data: { cz: field }, attrs: { role: "group" } }, ...options.map(o =>
    h("button", { cls: `fe-btn fe-cz-seg ${o.value === value ? "is-on" : ""}`.trim(), text: o.label, data: { value: o.value }, attrs: { type: "button", "aria-pressed": String(o.value === value) }, on: { click: () => pick(o.value) } })));
}
/** A text or number box. Typing changes the draft without redrawing, so the caret stays. */
function text(field: string, value: string, label: string, set: (v: string) => void, o: { type?: "text" | "number"; placeholder?: string } = {}): HTMLElement {
  return h("input", { cls: "fe-input fe-cz-input", data: { cz: field, keep: `cz-${field}` }, attrs: { type: o.type ?? "text", ...(o.type === "number" ? { inputmode: "numeric", min: "0", step: "1" } : {}), value, "aria-label": label, ...(o.placeholder ? { placeholder: o.placeholder } : {}) },
    on: { input: (e: Event) => set((e.target as HTMLInputElement).value) } });
}
function pick(field: string, options: Choice[], value: string, label: string, set: (v: string) => void): HTMLElement {
  return h("select", { cls: "fe-cz-select", data: { cz: field }, attrs: { "aria-label": label }, on: { change: (e: Event) => set((e.target as HTMLSelectElement).value) } },
    ...options.map(o => h("option", { text: o.label, attrs: { value: o.value, ...(o.value === value ? { selected: "" } : {}) } })));
}
function check(field: string, label: string, on: boolean, set: (v: boolean) => void): HTMLElement {
  return h("label", { cls: "fe-kv fe-cz-check" }, h("span", { text: label }),
    h("button", { cls: `fe-switch ${on ? "is-on" : ""}`.trim(), data: { cz: field }, attrs: { type: "button", role: "switch", "aria-checked": String(on), "aria-label": label }, on: { click: () => set(!on) } }));
}
const row = (label: string, ...kids: (Node | null)[]) => h("div", { cls: "fe-cz-row" }, h("div", { cls: "fe-muted", text: label }), ...kids);

/** A dice value: typed dice, one of the character's scales, or a table of levels. */
function diceControl(ctl: SheetController, st: ActorStats, field: string, label: string, d: DiceField): HTMLElement {
  const scales = Object.keys(st.progress.scales);
  const modes: Choice[] = [{ value: "dice", label: "Dice" }, ...(scales.length || d.mode === "scale" ? [{ value: "scale", label: "From one of my scales" }] : []), { value: "levels", label: "Grows with level" }];
  const body: (Node | null)[] = [];
  if (d.mode === "dice") body.push(text(`${field}.dice`, d.dice, label, v => { d.dice = v; }, { placeholder: "1d6" }));
  else if (d.mode === "scale") body.push(pick(`${field}.scale`, [{ value: "", label: "Pick a scale" }, ...scales.map(s => ({ value: s, label: sentence(s) }))], d.scale, `${label}: scale`, v => ctl.touchCustomize(() => { d.scale = v; })));
  else {
    d.levels.forEach((r, i) => body.push(h("div", { cls: "fe-cz-level", data: { level: String(i) } },
      text(`${field}.level${i}`, r.level, "From level", v => { r.level = v; }, { type: "number", placeholder: "Level" }),
      text(`${field}.levelDice${i}`, r.dice, "Dice", v => { r.dice = v; }, { placeholder: "1d6" }),
      h("button", { cls: "fe-btn", text: "Remove", attrs: { type: "button", "aria-label": `Remove level row ${i + 1}` }, on: { click: () => ctl.touchCustomize(() => { d.levels.splice(i, 1); }) } }))));
    body.push(h("button", { cls: "fe-btn", text: "+ Add a level", data: { cz: `${field}.add` }, attrs: { type: "button" }, on: { click: () => ctl.touchCustomize(() => { d.levels.push({ level: "", dice: "" }); }) } }));
  }
  return h("div", { cls: "fe-cz-dice" }, row(label, seg(`${field}.mode`, modes, d.mode, v => ctl.touchCustomize(() => { d.mode = v as DiceField["mode"]; if (d.mode === "levels" && !d.levels.length) d.levels.push({ level: "", dice: "" }); }))), ...body);
}

/** The Customize form for one row, in plain words. */
export function customizePanel(ctl: SheetController, st: ActorStats): HTMLElement {
  const d = ctl.customizeDraft, c = ctl.character;
  if (!d || !c) return h("div", { cls: "fe-faint", text: "Nothing to customize." });
  const f: CustomizeForm = d.form, t = d.target;
  const entry = t.kind === "item" ? c.inventory[t.index] : undefined, hasCharges = t.kind === "item" && ctl.limits().chargesMax(t.index) > 0;
  const nameOnly = !!entry && !entry.id;
  const resources = resourceChoices(st);
  const resourceList = (field: string, value: string, label: string, onPick: (v: string) => void, first: string) =>
    pick(field, [{ value: "", label: first }, ...resources, ...(value && !resources.some(r => r.value === value) ? [{ value, label: value }] : [])], value, label, onPick);
  const sections: (Node | null)[] = [];

  if (!nameOnly) {
    // ---- switch
    const costs: Choice[] = [{ value: "free", label: "Nothing" }, { value: "resource", label: "One of my resources" }, { value: "slot", label: "A spell slot" }, ...(hasCharges || f.switchCost === "charges" ? [{ value: "charges", label: "Item charges" }] : [])];
    sections.push(h("div", { cls: "fe-cz-section", data: { section: "switch" } },
      check("isSwitch", "Make it a switch (Start / End)", f.isSwitch, v => ctl.touchCustomize(x => { x.isSwitch = v; })),
      f.isSwitch ? h("div", { cls: "fe-cz-body" },
        row("Starting it costs", seg("switchCost", costs, f.switchCost, v => ctl.touchCustomize(x => { x.switchCost = v as CustomizeForm["switchCost"]; }))),
        f.switchCost === "resource" ? row("Which resource", resourceList("switchResource", f.switchResource, "Which resource", v => ctl.touchCustomize(x => { x.switchResource = v; }), "Pick a resource"), text("switchAmount", f.switchAmount, "How many (blank means one)", v => { f.switchAmount = v; }, { placeholder: "How many (blank means one)" })) : null,
        f.switchCost === "slot" ? row("Spell slot level", text("switchSlot", f.switchSlot, "Spell slot level", v => { f.switchSlot = v; }, { type: "number", placeholder: "1" })) : null,
        f.switchCost === "charges" ? row("Charges it uses", text("switchCharges", f.switchCharges, "Charges it uses", v => { f.switchCharges = v; }, { type: "number", placeholder: "1" })) : null,
        row("Only one switch in this group can be on at a time", text("group", f.group, "Switch group", v => { f.group = v; }, { placeholder: "group name, optional" })),
        row("Turns off after", seg("endsOn", [{ value: "short", label: "a short rest" }, { value: "long", label: "a long rest" }, { value: "never", label: "never" }], f.endsOn, v => ctl.touchCustomize(x => { x.endsOn = v as CustomizeForm["endsOn"]; })))) : null));

    // ---- attack option
    sections.push(h("div", { cls: "fe-cz-section", data: { section: "option" } },
      check("isOption", "Make it an attack option", f.isOption, v => ctl.touchCustomize(x => { x.isOption = v; })),
      f.isOption ? h("div", { cls: "fe-cz-body" },
        check("toHit", "Adds dice to every attack roll", f.toHit, v => ctl.touchCustomize(x => { x.toHit = v; })),
        f.toHit ? diceControl(ctl, st, "toHitDice", "Dice added to attack rolls", f.toHitDice) : null,
        check("onHit", "Adds damage dice when the attack hits", f.onHit, v => ctl.touchCustomize(x => { x.onHit = v; })),
        f.onHit ? diceControl(ctl, st, "onHitDice", "Damage dice added on a hit", f.onHitDice) : null,
        check("reroll", "Roll weapon damage twice, keep the higher", f.reroll, v => ctl.touchCustomize(x => { x.reroll = v; })),
        row("Spends one", resourceList("optionResource", f.optionResource, "Spends one", v => ctl.touchCustomize(x => { x.optionResource = v; }), "Free")),
        check("oncePerTurn", "Once per turn (switches itself off after one use)", f.oncePerTurn, v => ctl.touchCustomize(x => { x.oncePerTurn = v; }))) : null));
  }

  // ---- Use button
  const caster = st.casters.length > 0;
  const dcs: Choice[] = [...(caster ? [{ value: "spell", label: "My spell save DC" }] : []), ...dcChoices(st), { value: "fixed", label: "A fixed number" }];
  const abils: Choice[] = [{ value: "", label: "None" }, ...(Object.keys(ABIL_NAME) as Abil[]).map(a => ({ value: a, label: ABIL_NAME[a] }))];
  const useCosts: Choice[] = [{ value: "free", label: "Nothing" }, { value: "resource", label: "One of my resources" }, ...(hasCharges || f.useCost === "charges" ? [{ value: "charges", label: "Item charges" }] : [])];
  sections.push(h("div", { cls: "fe-cz-section", data: { section: "use" } },
    check("hasUse", "Give it a Use button", f.hasUse, v => ctl.touchCustomize(x => { x.hasUse = v; })),
    f.hasUse ? h("div", { cls: "fe-cz-body" },
      row("Name", text("useName", f.useName, "Name of the Use button", v => { f.useName = v; }, { placeholder: "Name" })),
      row("What it does", seg("useEffect", [{ value: "none", label: "Nothing to roll" }, { value: "damage", label: "Deals damage" }, { value: "heal", label: "Heals" }], f.useEffect, v => ctl.touchCustomize(x => { x.useEffect = v as CustomizeForm["useEffect"]; }))),
      f.useEffect !== "none" ? diceControl(ctl, st, "useDice", f.useEffect === "heal" ? "Healing dice" : "Damage dice", f.useDice) : null,
      f.useEffect === "damage" ? row("Damage type", pick("damageType", [{ value: "", label: "Not set" }, ...DAMAGE_TYPES.map(x => ({ value: x, label: sentence(x) }))], f.damageType, "Damage type", v => ctl.touchCustomize(x => { x.damageType = v; }))) : null,
      row("Target makes a save", pick("saveAbil", abils, f.saveAbil, "Target makes a save", v => ctl.touchCustomize(x => { x.saveAbil = v as CustomizeForm["saveAbil"]; if (v && !dcs.some(o => o.value === x.dcFrom)) x.dcFrom = dcs[0].value; }))),
      f.saveAbil ? row("Save DC from", pick("dcFrom", dcs, f.dcFrom, "Save DC from", v => ctl.touchCustomize(x => { x.dcFrom = v; }))) : null,
      f.saveAbil && f.dcFrom === "fixed" ? row("Fixed DC", text("dcFixed", f.dcFixed, "Fixed save DC", v => { f.dcFixed = v; }, { type: "number", placeholder: "13" })) : null,
      row("Using it costs", seg("useCost", useCosts, f.useCost, v => ctl.touchCustomize(x => { x.useCost = v as CustomizeForm["useCost"]; }))),
      f.useCost === "resource" ? row("Which resource", resourceList("useResource", f.useResource, "Which resource", v => ctl.touchCustomize(x => { x.useResource = v; }), "Pick a resource"), text("useAmount", f.useAmount, "How many (blank means one)", v => { f.useAmount = v; }, { placeholder: "How many (blank means one)" })) : null,
      f.useCost === "charges" ? row("Charges it uses", text("useCharges", f.useCharges, "Charges it uses", v => { f.useCharges = v; }, { type: "number", placeholder: "1" })) : null) : null));

  // ---- pin and footer
  const mine = t.kind === "feature" ? c.customize[`feature:${t.key}`] !== undefined : entry?.customize !== undefined;
  return h("div", { cls: "fe-cz-form" }, ...sections,
    h("div", { cls: "fe-cz-section" }, check("pin", "Pin to Resources and charges", f.pin, v => ctl.touchCustomize(x => { x.pin = v; }))),
    d.error ? h("div", { cls: "fe-warn", text: d.error }) : null,
    h("div", { cls: "fe-kv fe-cz-footer" },
      h("button", { cls: "fe-btn mod-cta", text: "Save", data: { act: "cz-save" }, attrs: { type: "button" }, on: { click: () => { ctl.saveCustomize(); } } }),
      h("button", { cls: "fe-btn", text: "Cancel", data: { act: "cz-cancel" }, attrs: { type: "button" }, on: { click: () => ctl.cancelCustomize() } }),
      mine ? h("button", { cls: "fe-btn", text: "Reset to the note", data: { act: "cz-reset" }, attrs: { type: "button" }, on: { click: () => { ctl.resetCustomize(); } } }) : null),
    mine ? h("div", { cls: "fe-faint", text: "Removes your changes. The class, race, feat or item note is never changed." }) : null);
}
