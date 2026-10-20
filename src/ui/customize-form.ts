import type { ActionDef } from "../content/types/ops";
import type { AttackOptionDef } from "../content/types/attack-option";
import type { ToggleCost, ToggleDef } from "../content/types/toggle";
import { checkDice } from "../core/dice";
import { freshToggleId, type CustomDice, type Customization, type RowDefs } from "../core/customize";
import type { Abil } from "../core/types";

/** How a dice value is entered: typed, taken from a scale, or a table of levels. */
export interface DiceField { mode: "dice" | "scale" | "levels"; dice: string; scale: string; levels: { level: string; dice: string }[] }
/** Everything the Customize form edits, as typed text and choices (a half-typed number is kept as is). */
export interface CustomizeForm {
  pin: boolean;
  isSwitch: boolean; switchCost: "free" | "resource" | "slot" | "charges"; switchResource: string; switchAmount: string; switchSlot: string; switchCharges: string; group: string; endsOn: "short" | "long" | "never";
  isOption: boolean; toHit: boolean; toHitDice: DiceField; onHit: boolean; onHitDice: DiceField; reroll: boolean; optionResource: string; oncePerTurn: boolean;
  hasUse: boolean; useName: string; useEffect: "none" | "damage" | "heal"; useDice: DiceField; damageType: string; saveAbil: "" | Abil;
  /** `spell`, `fixed` or a class DC name. */ dcFrom: string; dcFixed: string;
  useCost: "free" | "resource" | "charges"; useResource: string; useAmount: string; useCharges: string;
}

const blankDice = (): DiceField => ({ mode: "dice", dice: "", scale: "", levels: [] });
const SCALE_ONLY = /^\{([a-z0-9-]+)\}$/;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isTable = (v: unknown): v is { byLevel: Record<number, string> } => typeof v === "object" && v !== null && "byLevel" in v;
const tableRows = (t: Record<number | string, string>) => Object.entries(t).map(([level, dice]) => ({ level, dice }));

/** Open a dice value in the mode that shows it best: a level table, a lone {scale}, or plain dice. */
function diceFieldOf(value: string | undefined, table: Record<number | string, string> | undefined): DiceField {
  if (table) return { mode: "levels", dice: "", scale: "", levels: tableRows(table) };
  if (value === undefined) return blankDice();
  const m = SCALE_ONLY.exec(value);
  return m ? { mode: "scale", dice: "", scale: m[1], levels: [] } : { mode: "dice", dice: value, scale: "", levels: [] };
}

/** The form for a row, prefilled from its effective values. `mine` supplies level tables, which the effective values flatten. */
export function formFrom(effective: RowDefs, mine: Customization | undefined, pinned: boolean, name: string): CustomizeForm {
  void name;
  const t = effective.toggle, o = effective.attackOption, a = effective.action;
  const mo = mine && mine.attackOption ? mine.attackOption : undefined, ma = mine && mine.action ? mine.action : undefined;
  const tableOf = (v: CustomDice | null | undefined) => (isTable(v) ? v.byLevel : undefined);
  const f: CustomizeForm = {
    pin: pinned,
    isSwitch: !!t, switchCost: "free", switchResource: "", switchAmount: "", switchSlot: "", switchCharges: "", group: t?.group ?? "", endsOn: t?.endsOn ?? "long",
    isOption: !!o, toHit: false, toHitDice: blankDice(), onHit: false, onHitDice: blankDice(), reroll: !!o?.reroll, optionResource: o?.resource ?? "", oncePerTurn: !!o?.oncePerTurn,
    hasUse: !!a, useName: a?.name ?? "", useEffect: "none", useDice: blankDice(), damageType: a?.damageType ?? "", saveAbil: a?.save?.abil ?? "", dcFrom: "spell", dcFixed: "",
    useCost: "free", useResource: "", useAmount: "", useCharges: "",
  };
  const c = t?.cost;
  if (c) {
    if ("resource" in c) { f.switchCost = "resource"; f.switchResource = c.resource; f.switchAmount = c.amount === undefined ? "" : String(c.amount); }
    else if ("slot" in c) { f.switchCost = "slot"; f.switchSlot = String(c.slot); }
    else { f.switchCost = "charges"; f.switchCharges = String(c.charges); }
  }
  if (o) {
    // a level table of the player's own wins; otherwise the note's own table (scale) opens as a level table too
    const toHitTable = tableOf(mo?.toHit), onHitTable = tableOf(mo?.onHit) ?? (mo?.onHit === undefined ? o.scale : undefined);
    f.toHit = !!(o.toHit || toHitTable); f.toHitDice = diceFieldOf(o.toHit, toHitTable);
    f.onHit = !!(o.onHit || onHitTable); f.onHitDice = diceFieldOf(o.onHit, onHitTable);
  }
  if (a) {
    const dmgTable = tableOf(ma?.damage), healTable = tableOf(ma?.heal);
    if (a.damage || dmgTable) { f.useEffect = "damage"; f.useDice = diceFieldOf(a.damage, dmgTable); }
    else if (a.heal || healTable) { f.useEffect = "heal"; f.useDice = diceFieldOf(a.heal, healTable); }
    const ac = a.cost;
    if (ac) {
      if ("resource" in ac) { f.useCost = "resource"; f.useResource = ac.resource; f.useAmount = ac.amount === undefined ? "" : String(ac.amount); }
      else if ("charges" in ac) { f.useCost = "charges"; f.useCharges = String(ac.charges); }
    }
    if (a.save) { if (/^\d+$/.test(a.save.dc.trim())) { f.dcFrom = "fixed"; f.dcFixed = a.save.dc.trim(); } else f.dcFrom = a.save.dc; }
  }
  return f;
}

const wholeLevel = (s: string) => /^\d+$/.test(s.trim()) && +s >= 1 && +s <= 20;
const goodRows = (d: DiceField) => d.levels.filter(r => wholeLevel(r.level) && checkDice(r.dice.trim()));

/** The dice a field stands for: typed text, a lone {scale}, or a table (rows that are not a level from 1 to 20 are left out). */
function diceOut(d: DiceField): CustomDice | undefined {
  if (d.mode === "dice") return d.dice.trim() || undefined;
  if (d.mode === "scale") return d.scale ? `{${d.scale}}` : undefined;
  const rows = goodRows(d);
  return rows.length ? { byLevel: Object.fromEntries(rows.map(r => [+r.level, r.dice.trim()])) } : undefined;
}

/** What is wrong with the form in plain words (the first problem found), or undefined when it can be saved. `scales` are the scale ids a dice value may use. */
export function formProblem(f: CustomizeForm, scales: string[]): string | undefined {
  if (f.isSwitch && f.switchCost === "resource" && !f.switchResource.trim()) return "Pick the resource it spends.";
  if (f.hasUse && f.useCost === "resource" && !f.useResource.trim()) return "Pick the resource it spends.";
  const dice: DiceField[] = [];
  if (f.isOption && f.toHit) dice.push(f.toHitDice);
  if (f.isOption && f.onHit) dice.push(f.onHitDice);
  if (f.hasUse && f.useEffect !== "none") dice.push(f.useDice);
  const badRow = (r: { level: string; dice: string }) => (r.level.trim() || r.dice.trim()) && wholeLevel(r.level) && !checkDice(r.dice.trim());
  if (dice.some(d => (d.mode === "dice" && !checkDice(d.dice.trim())) || (d.mode === "levels" && d.levels.some(badRow)))) return "Dice must look like 1d4 or 2d6+1.";
  if (dice.some(d => d.mode === "scale" && !scales.includes(d.scale))) return "Pick a scale.";
  if (dice.some(d => d.mode === "levels" && !goodRows(d).length)) return "Give at least one level and its dice.";
  if (f.isOption && !f.toHit && !f.onHit && !f.reroll) return "Pick what the attack option does.";
  if (f.hasUse && f.saveAbil && f.dcFrom === "fixed" && !/^\d+$/.test(f.dcFixed.trim())) return "A fixed DC must be a whole number, such as 13.";
  if (f.hasUse && !f.useName.trim()) return "Give the Use button a name.";
  return undefined;
}

const formula = (s: string): number | string | undefined => { const t = s.trim(); return !t ? undefined : /^\d+$/.test(t) ? Number(t) : t; };
const wholeNum = (s: string) => Number(s.trim());

/** Keep, in `out[key]`, the form value when it differs from the note's, or `null` when the form dropped a field the note has. */
function diff(out: Record<string, unknown>, key: string, form: unknown, note: unknown) {
  if (same(form, note)) return;
  out[key] = form === undefined ? null : form;
}

/**
 * What to keep in the character note: per part, only the fields that differ from the note's own values (so later note changes still show through).
 * A part switched off that the note has is `false`; a part switched on that the note lacks is stored in full. `{}` means nothing to keep.
 * `takenToggleIds` are the switch and attack option ids already in use elsewhere, so a new id is fresh.
 */
export function customizationFrom(f: CustomizeForm, note: RowDefs, name: string, takenToggleIds: string[]): Customization {
  const out: Customization = {};

  // ---- switch
  if (!f.isSwitch) { if (note.toggle) out.toggle = false; }
  else {
    let cost: ToggleCost | undefined;
    if (f.switchCost === "resource") { const amount = formula(f.switchAmount); cost = { resource: f.switchResource.trim(), ...(amount !== undefined ? { amount } : {}) }; }
    else if (f.switchCost === "slot") cost = { slot: wholeNum(f.switchSlot) };
    else if (f.switchCost === "charges") cost = { charges: wholeNum(f.switchCharges) };
    const group = f.group.trim() || undefined;
    const nt = note.toggle;
    if (!nt) out.toggle = { id: freshToggleId(name, takenToggleIds), endsOn: f.endsOn, ...(cost ? { cost } : {}), ...(group ? { group } : {}) };
    else {
      const d: Record<string, unknown> = {};
      diff(d, "cost", cost, nt.cost); diff(d, "group", group, nt.group); diff(d, "endsOn", f.endsOn, nt.endsOn);
      if (Object.keys(d).length) out.toggle = d as Partial<ToggleDef>;
    }
  }

  // ---- attack option
  if (!f.isOption) { if (note.attackOption) out.attackOption = false; }
  else {
    const toHit = f.toHit ? diceOut(f.toHitDice) : undefined, onHit = f.onHit ? diceOut(f.onHitDice) : undefined;
    const resource = f.optionResource.trim() || undefined, reroll = f.reroll || undefined, oncePerTurn = f.oncePerTurn || undefined;
    const na = note.attackOption;
    if (!na) {
      const full: Record<string, unknown> = { id: freshToggleId(name, takenToggleIds) };
      for (const [k, v] of Object.entries({ toHit, onHit, reroll, resource, oncePerTurn })) if (v !== undefined) full[k] = v;
      out.attackOption = full;
    } else {
      const d: Record<string, unknown> = {};
      diff(d, "toHit", toHit, na.toHit);
      diff(d, "onHit", onHit, na.onHit ?? (na.scale ? { byLevel: na.scale } : undefined));
      diff(d, "reroll", reroll, na.reroll || undefined); diff(d, "resource", resource, na.resource); diff(d, "oncePerTurn", oncePerTurn, na.oncePerTurn || undefined);
      if (Object.keys(d).length) out.attackOption = d as Partial<AttackOptionDef>;
    }
  }

  // ---- Use button
  if (!f.hasUse) { if (note.action) out.action = false; }
  else {
    const dice = f.useEffect === "none" ? undefined : diceOut(f.useDice);
    let cost: ActionDef["cost"];
    if (f.useCost === "resource") { const amount = formula(f.useAmount); cost = { resource: f.useResource.trim(), ...(amount !== undefined ? { amount } : {}) }; }
    else if (f.useCost === "charges") cost = { charges: wholeNum(f.useCharges) };
    const save = f.saveAbil ? { abil: f.saveAbil, dc: f.dcFrom === "fixed" ? f.dcFixed.trim() : f.dcFrom } : undefined;
    const damage = f.useEffect === "damage" ? dice : undefined, heal = f.useEffect === "heal" ? dice : undefined;
    const damageType = f.useEffect === "damage" ? f.damageType.trim() || undefined : undefined;
    const na = note.action;
    if (!na) {
      const full: Record<string, unknown> = { name: f.useName.trim() };
      for (const [k, v] of Object.entries({ cost, save, damage, heal, damageType })) if (v !== undefined) full[k] = v;
      out.action = full as Customization["action"];
    } else {
      const d: Record<string, unknown> = {};
      diff(d, "name", f.useName.trim(), na.name);
      // a cost the form cannot show (hurting yourself) is left as the note has it
      if (!(na.cost && "selfDamage" in na.cost)) diff(d, "cost", cost, na.cost);
      diff(d, "save", save, na.save); diff(d, "damage", damage, na.damage); diff(d, "heal", heal, na.heal); diff(d, "damageType", damageType, na.damageType);
      if (Object.keys(d).length) out.action = d as Customization["action"];
    }
  }
  return out;
}
