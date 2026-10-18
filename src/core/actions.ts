import type { Character, Combo, CompanionEntry, Npc } from "./character";
import { validateCombo } from "./combos";
import type { ActorStats } from "./derive";
import type { ConditionData, ItemData, SpellData } from "../content/types";
import { itemWorks, type EffectContext } from "./effects";
import { slug } from "../content/registry";
import { evalFormula } from "./formula";
import { formulaVars } from "./progression";
import type { Abil } from "./types";

export type Who = { companion: number } | undefined;
export type Action =
  | { type: "damage"; amount: number; /** acid, fire, ...: resistance, immunity and vulnerability then apply. */ damageType?: string; who?: Who } | { type: "heal"; amount: number; who?: Who } | { type: "temp"; amount: number; who?: Who }
  | { type: "condition"; id: string; level: number; who?: Who }
  | { type: "slot"; level: string; used: number } | { type: "resource"; index: number; used: number }
  | { type: "charges"; index: number; used: number } | { type: "hitDie"; die: string; used: number }
  | { type: "deathSave"; which: "successes" | "failures"; value: number }
  | { type: "equip"; index: number; on: boolean } | { type: "attune"; index: number; on: boolean }
  | { type: "inspiration"; on: boolean }
  | { type: "addItem"; id: string } | { type: "removeItem"; index: number }
  | { type: "addCompanion"; creature: string; name: string; kind: CompanionEntry["kind"] } | { type: "removeCompanion"; index: number }
  | { type: "ability"; abil: Abil; value: number }
  | { type: "cast"; spell: string; level?: number; item?: number } | { type: "endConcentration" }
  | { type: "addSpell"; id: string } | { type: "removeSpell"; index: number } | { type: "prepare"; index: number; on: boolean }
  | { type: "pinSpell"; key: string; on: boolean }
  /** Used count of a resource derived from class operations (stored in character.uses). */
  | { type: "uses"; id: string; used: number }
  | { type: "xp"; value: number }
  | { type: "languages"; value: string[] }
  /** Switch a class DC to its alternate ability (stored as character.choices["dc.<id>.alt"]). */
  | { type: "dcAlt"; id: string; on: boolean }
  /** Switch a toggle (Rage, a stance) on or off. Starting spends its cost and ends the others in its group; `value` sets a value toggle's number. */
  | { type: "toggle"; id: string; on: boolean; value?: number }
  /** Save a combo: replaces the one at `index`, or adds a new one at the end when `index` is left out. */
  | { type: "combo"; index?: number; combo: Combo } | { type: "comboRemove"; index: number }
  | { type: "comboMove"; index: number; by: -1 | 1 } | { type: "comboPin"; index: number; on: boolean };
export interface Limits {
  self: ActorStats; companions: (ActorStats | undefined)[]; chargesMax: (index: number) => number;
  /** Re-derive after a condition change so stored HP can be clamped to the new effective max. */
  derive?: (c: Character) => ActorStats;
  deriveCompanion?: (e: CompanionEntry) => ActorStats | undefined;
  /** Needed for casting: spell and item data come from the registry. */
  ctx?: EffectContext;
}
export const MAX_ATTUNED = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
type Hp = { current?: number; temp: number };
export interface Applied { value: Character; error?: string; note?: string; /** Damage while concentrating: the Constitution save the player should now make. */ concentrationCheck?: { dc: number; spell: string }; }

function hpChange(hp: Hp, a: Action, max: number): void {
  const cur = Math.min(hp.current ?? max, max);
  if (a.type === "damage") { const n = Math.max(0, a.amount), fromTemp = Math.min(hp.temp, n); hp.temp -= fromTemp; hp.current = Math.max(0, cur - (n - fromTemp)); }
  if (a.type === "heal") hp.current = Math.min(max, cur + Math.max(0, a.amount));
  if (a.type === "temp") hp.temp = Math.max(hp.temp, Math.max(0, a.amount));
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Names of the effects that give this actor the trait for the damage type (a line such as "bludgeoning, piercing, and slashing from nonmagical attacks" matches each type it names). */
function traitFrom(st: ActorStats | undefined, kind: "resist" | "immune" | "vulnerable", type: string): string[] {
  const re = new RegExp(`\\b${esc(type)}\\b`, "i");
  return [...new Set((st?.effects ?? []).filter(s => (s.effects[kind] ?? []).some(t => re.test(t))).map(s => s.source))];
}
const list = (xs: string[]) => xs.join(" and ");
/** Resistance halves (rounding down), vulnerability doubles, immunity zeroes; the note explains the number in words. */
export function adjustDamage(amount: number, type: string | undefined, st: ActorStats | undefined): { amount: number; note?: string } {
  const n = Math.max(0, Math.round(amount)), t = type?.trim().toLowerCase();
  if (!t || !st || n === 0) return { amount: n };
  const imm = traitFrom(st, "immune", t), res = traitFrom(st, "resist", t), vul = traitFrom(st, "vulnerable", t), head = `${cap(t)} damage: ${n}`;
  if (imm.length) return { amount: 0, note: `${head} becomes 0 (immune, from ${list(imm)}).` };
  if (res.length && vul.length) { const h = Math.floor(n / 2); return { amount: h * 2, note: `${head} is halved to ${h}, then doubled to ${h * 2} (resistance and vulnerability from ${list([...new Set([...res, ...vul])])}).` }; }
  if (res.length) return { amount: Math.floor(n / 2), note: `${head} is halved to ${Math.floor(n / 2)} (resistance from ${list(res)}).` };
  if (vul.length) return { amount: n * 2, note: `${head} is doubled to ${n * 2} (vulnerable, from ${list(vul)}).` };
  return { amount: n };
}

/** The source that makes this actor immune to the condition (or to every disease), if any. */
function conditionBlock(st: ActorStats | undefined, id: string, lim: Limits): { source: string; name: string } | undefined {
  const entry = lim.ctx?.registry.get<ConditionData>("condition", id);
  const hit = (st?.effects ?? []).find(s => (s.effects.conditionImmune ?? []).some(x => x === id || (entry?.data.kind !== undefined && x === entry.data.kind)));
  return hit ? { source: hit.source, name: entry?.name ?? id } : undefined;
}
const knocksOut = (lim: Limits) => !lim.ctx || !!lim.ctx.registry.get("condition", "unconscious");

/** Damage, healing and temporary hit points for one actor: damage types, Unconscious at 0, the concentration prompt. */
function hpStep(hp: Hp, conds: Record<string, number>, a: Extract<Action, { type: "damage" | "heal" | "temp" }>, st: ActorStats, lim: Limits, concentration?: string): Pick<Applied, "note" | "concentrationCheck"> {
  const before = Math.min(hp.current ?? st.hp.max, st.hp.max);
  if (a.type !== "damage") {
    hpChange(hp, a, st.hp.max);
    if (a.type === "heal" && before === 0 && (hp.current ?? 0) > 0) delete conds.unconscious;
    return {};
  }
  const adj = adjustDamage(a.amount, a.damageType, st);
  hpChange(hp, { ...a, amount: adj.amount }, st.hp.max);
  if (before > 0 && hp.current === 0 && knocksOut(lim) && !conditionBlock(st, "unconscious", lim)) conds.unconscious = 1;
  const check = concentration && before > 0 && adj.amount > 0 ? { dc: Math.max(10, Math.floor(adj.amount / 2)), spell: concentration } : undefined;
  return { ...(adj.note ? { note: adj.note } : {}), ...(check ? { concentrationCheck: check } : {}) };
}
function setCondition(conds: Record<string, number>, id: string, level: number, maxLevel: number): void {
  const l = clamp(level, 0, maxLevel); if (l === 0) delete conds[id]; else conds[id] = l;
}
const condMax = (s: ActorStats | undefined, id: string) => id === "exhaustion" ? 6 : 1;

function cast(c0: Character, c: Character, a: Extract<Action, { type: "cast" }>, lim: Limits): { value: Character; error?: string; note?: string } {
  const fail = (error: string) => ({ value: c0, error });
  const reg = lim.ctx?.registry, sp = reg?.get<SpellData>("spell", a.spell)?.data;
  if (!sp) return fail("Spell missing from compendium");
  if (a.item !== undefined) {
    const e = c.inventory[a.item], it = e?.id ? reg!.get<ItemData>("item", e.id)?.data : undefined;
    if (!e || !it || !itemWorks(e, it)) return fail("That item isn't working");
    const g = it.grants?.spells.find(x => x.id === a.spell);
    if (!g) return fail("That item doesn't grant this spell");
    if (g.cost.kind === "charges") {
      const used = e.charges?.used ?? 0;
      if (used + g.cost.amount > (it.charges?.max ?? 0)) return fail("Not enough charges");
      e.charges = { ...e.charges, used: used + g.cost.amount };
    } else if (g.cost.kind === "perDay") {
      const used = e.spellUses?.[a.spell] ?? 0;
      if (used >= g.cost.uses) return fail("No uses left today");
      e.spellUses = { ...e.spellUses, [a.spell]: used + 1 };
    }
  } else {
    if (!c.spells.some(x => x.id === a.spell)) return fail("Not one of your spells");
    if (sp.level >= 1) {
      const lvl = a.level ?? sp.level;
      if (lvl < sp.level) return fail("Can't cast below the spell's level");
      const slot = lim.self.slots.find(s => s.level === String(lvl) && s.used < s.max) ?? lim.self.slots.find(s => s.level === "pact" && s.pactLevel === lvl && s.used < s.max);
      if (!slot) return fail(`No level ${lvl} slots left`);
      c.spellSlots[slot.level] = { ...c.spellSlots[slot.level], used: slot.used + 1 };
    }
  }
  let note: string | undefined;
  if (sp.concentration) {
    const prev = c.concentration;
    if (prev && prev !== a.spell) note = `Concentration on ${reg!.get<SpellData>("spell", prev)?.data.name ?? prev} ends`;
    c.concentration = a.spell;
  }
  return { value: c, ...(note ? { note } : {}) };
}

/** Switch a toggle: starting it spends its cost (refusing in words when nothing is left) and ends the others in its group; ending it is free. */
function toggle(c0: Character, c: Character, a: Extract<Action, { type: "toggle" }>, lim: Limits): Applied {
  const fail = (error: string) => ({ value: c0, error });
  const t = lim.self.toggles.find(x => x.id === a.id);
  if (!t) return fail("That switch isn't on this character.");
  const v = t.def.value, setValue = (n: number | undefined): true | number => v ? clamp(n ?? v.min, v.min, v.max) : true;
  if (!a.on) { delete c.active[a.id]; return { value: c, note: `${t.name} ended.` }; }
  if (t.on) { if (v && a.value !== undefined) c.active[a.id] = setValue(a.value); return { value: c }; }
  const cost = t.def.cost; let spent = "";
  if (cost && "resource" in cost) {
    const id = slug(cost.resource), r = lim.self.resources.find(x => x.id === id || (!x.derived && slug(x.name) === id));
    if (!r) return fail(`${t.name} needs ${cost.resource}, which this character doesn't have.`);
    if (r.unlimited) spent = `${r.name} is unlimited`;
    else {
      let n: number;
      try { n = cost.amount === undefined ? 1 : Math.max(0, Math.floor(evalFormula(cost.amount, formulaVars(c, lim.self.progress.scales)))); }
      catch (x) { return fail(`${t.name}: ${(x as Error).message}`); }
      if (r.used + n > r.max) return fail(`No ${r.name} left, so ${t.name} can't start. Take a rest first.`);
      if (r.derived) { c.uses[r.id] = r.used + n; } else { const i = Number(r.id.split(":")[1]); if (c.resources[i]) c.resources[i].used = r.used + n; }
      spent = `${n} ${r.name} spent`;
    }
  } else if (cost && "slot" in cost) {
    const lvl = (s: { level: string; pactLevel?: number }) => (s.level === "pact" ? s.pactLevel ?? 0 : Number(s.level));
    const slot = lim.self.slots.filter(s => s.used < s.max && lvl(s) >= cost.slot).sort((x, y) => lvl(x) - lvl(y))[0];
    if (!slot) return fail(`No spell slot of level ${cost.slot} or higher left, so ${t.name} can't start.`);
    c.spellSlots[slot.level] = { ...c.spellSlots[slot.level], used: slot.used + 1 };
    spent = `a level ${lvl(slot)} spell slot spent`;
  } else if (cost && "charges" in cost) {
    const e = t.itemIndex !== undefined ? c.inventory[t.itemIndex] : undefined;
    if (!e) return fail(`${t.name} needs item charges, but isn't on an item.`);
    const used = e.charges?.used ?? 0;
    if (used + cost.charges > lim.chargesMax(t.itemIndex!)) return fail(`Not enough charges left, so ${t.name} can't start.`);
    e.charges = { ...e.charges, used: used + cost.charges }; spent = `${cost.charges} charge${cost.charges === 1 ? "" : "s"} spent`;
  }
  const ended: string[] = [];
  if (t.def.group) for (const o of lim.self.toggles) if (o.id !== t.id && o.on && o.def.group === t.def.group) { delete c.active[o.id]; ended.push(o.name); }
  c.active[a.id] = setValue(a.value);
  return { value: c, note: [`${t.name} started`, spent, ended.length ? `${ended.join(" and ")} ended` : ""].filter(Boolean).join(". ") + "." };
}

export function apply(c0: Character, a: Action, lim: Limits): Applied {
  const c = structuredClone(c0);
  const who = "who" in a ? a.who : undefined;
  if (who) {
    const comp = c.companions[who.companion], st = lim.companions[who.companion];
    if (!comp) return { value: c0, error: "No such companion" };
    if (!st && a.type !== "condition") return { value: c0, error: "Unknown creature" };
    if (a.type === "condition") {
      const block = a.level > (comp.conditions[a.id] ?? 0) ? conditionBlock(st, a.id, lim) : undefined;
      if (block) return { value: c0, error: `Can't be ${block.name.toLowerCase()}: ${block.source} protects against it.` };
      setCondition(comp.conditions, a.id, a.level, condMax(st, a.id));
      const after = lim.deriveCompanion?.(comp); if (after && comp.hp.current !== undefined) comp.hp.current = Math.min(comp.hp.current, after.hp.max);
      return { value: c };
    }
    if (a.type !== "damage" && a.type !== "heal" && a.type !== "temp") return { value: c0, error: "Not available for companions" };
    const r = hpStep(comp.hp, comp.conditions, a, st!, lim);
    return { value: c, ...(r.note ? { note: r.note } : {}) };
  }
  switch (a.type) {
    case "damage": case "heal": case "temp": {
      const wasDown = c.hp.current === 0;
      const r = hpStep(c.hp, c.conditions, a, lim.self, lim, c.concentration);
      if (a.type === "heal" && wasDown && c.hp.current > 0) c.deathSaves = { successes: 0, failures: 0 };
      return { value: c, ...(r.note ? { note: r.note } : {}), ...(r.concentrationCheck ? { concentrationCheck: r.concentrationCheck } : {}) };
    }
    case "condition": {
      const block = a.level > (c.conditions[a.id] ?? 0) ? conditionBlock(lim.self, a.id, lim) : undefined;
      if (block) return { value: c0, error: `Can't be ${block.name.toLowerCase()}: ${block.source} protects against it.` };
      setCondition(c.conditions, a.id, a.level, condMax(lim.self, a.id)); c.hp.current = Math.min(c.hp.current, lim.derive?.(c).hp.max ?? c.hp.max); break;
    }
    case "slot": { const s = lim.self.slots.find(x => x.level === a.level); c.spellSlots[a.level] = { used: clamp(a.used, 0, s?.max ?? 0) }; break; }
    case "resource": { const r = c.resources[a.index]; if (r) r.used = clamp(a.used, 0, r.max); break; }
    case "charges": { const e = c.inventory[a.index]; if (e) e.charges = { used: clamp(a.used, 0, lim.chargesMax(a.index)) }; break; }
    case "hitDie": { const h = lim.self.hitDice.find(x => x.die === a.die); c.hitDice[a.die] = { used: clamp(a.used, 0, h?.max ?? 0) }; break; }
    case "deathSave": c.deathSaves[a.which] = clamp(a.value, 0, 3); break;
    case "equip": { const e = c.inventory[a.index]; if (e) { e.equipped = a.on; if (!a.on) e.attuned = false; } break; }
    case "attune": {
      const e = c.inventory[a.index]; if (!e) break;
      if (a.on && !e.attuned && c.inventory.filter(x => x.attuned).length >= MAX_ATTUNED) return { value: c0, error: "Already attuned to 3 items" };
      e.attuned = a.on; if (a.on) e.equipped = true; break;
    }
    case "inspiration": c.inspiration = a.on; break;
    case "addItem": c.inventory.push({ id: a.id, qty: 1, equipped: false, attuned: false }); break;
    case "removeItem": c.inventory.splice(a.index, 1); break;
    case "addCompanion": c.companions.push({ creature: a.creature, name: a.name, kind: a.kind, hp: { temp: 0 }, conditions: {} }); break;
    case "removeCompanion": c.companions.splice(a.index, 1); break;
    case "cast": return cast(c0, c, a, lim);
    case "toggle": return toggle(c0, c, a, lim);
    case "endConcentration": delete c.concentration; break;
    case "addSpell": if (!c.spells.some(x => x.id === a.id)) c.spells.push({ id: a.id, prepared: false }); break;
    case "removeSpell": { const gone = c.spells.splice(a.index, 1)[0]; if (gone) c.mainSpells = c.mainSpells.filter(k => k !== gone.id); break; }
    case "pinSpell": c.mainSpells = c.mainSpells.filter(k => k !== a.key); if (a.on) c.mainSpells.push(a.key); break;
    case "prepare": { const s = c.spells[a.index]; if (s) s.prepared = a.on; break; }
    case "languages": c.languages = a.value.map(s => s.trim()).filter(Boolean); break;
    case "xp": c.xp = Math.max(0, Math.round(a.value)); break;
    case "dcAlt": {
      if (!lim.self.progress.dcs.some(d => d.id === a.id && d.alt)) return { value: c0, error: "That class DC has no alternate ability" };
      if (a.on) c.choices[`dc.${a.id}.alt`] = true; else delete c.choices[`dc.${a.id}.alt`];
      break;
    }
    case "uses": {
      const r = lim.self.resources.find(x => x.derived && x.id === a.id);
      if (!r) return { value: c0, error: "Unknown resource" };
      const n = r.unlimited ? 0 : clamp(a.used, 0, r.max);
      if (n) c.uses[a.id] = n; else delete c.uses[a.id];
      break;
    }
    case "combo": {
      const bad = validateCombo(a.combo); if (bad) return { value: c0, error: bad };
      const clean: Combo = { ...structuredClone(a.combo), name: a.combo.name.trim(), when: a.combo.when.trim() };
      if (!clean.notes?.trim()) delete clean.notes; if (!clean.pinned) delete clean.pinned;
      if (a.index === undefined) c.combos.push(clean);
      else if (c.combos[a.index]) c.combos[a.index] = clean;
      else return { value: c0, error: "That combo no longer exists." };
      break;
    }
    case "comboRemove": c.combos.splice(a.index, 1); break;
    case "comboMove": { const j = a.index + a.by; if (c.combos[a.index] && c.combos[j]) [c.combos[a.index], c.combos[j]] = [c.combos[j], c.combos[a.index]]; break; }
    case "comboPin": { const k = c.combos[a.index]; if (k) { if (a.on) k.pinned = true; else delete k.pinned; } break; }
    case "ability": c.abilities[a.abil] = clamp(a.value, 1, 30); break;
  }
  return { value: c };
}

export function applyNpc(n0: Npc, a: Action, stats: ActorStats, rederive?: (n: Npc) => ActorStats | undefined): { value: Npc; error?: string; note?: string } {
  const n = structuredClone(n0);
  if (a.type === "damage" || a.type === "heal" || a.type === "temp") {
    const adj = a.type === "damage" ? adjustDamage(a.amount, a.damageType, stats) : undefined;
    hpChange(n.hp, adj ? { ...a, amount: adj.amount } : a, stats.hp.max);
    return { value: n, ...(adj?.note ? { note: adj.note } : {}) };
  }
  if (a.type === "condition") { setCondition(n.conditions, a.id, a.level, condMax(stats, a.id));
    const after = rederive?.(n); if (after && n.hp.current !== undefined) n.hp.current = Math.min(n.hp.current, after.hp.max);
    return { value: n }; }
  return { value: n0, error: "Not available for NPCs" };
}
