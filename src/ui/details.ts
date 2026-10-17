import type { ConditionData, CreatureData, FeatData, ItemData, SpellData, SubclassData } from "../content/types";
import type { Effects } from "../core/types";
import { diceAt } from "../core/spells";
import type { SheetController } from "./controller";
import { describeEffects } from "./widgets";
import { h, sgn } from "./h";

const MOD_LABEL: Record<string, string> = { ac: "AC", speed: "speed", hpMax: "max HP", save: "saves", attack: "attack rolls", damage: "damage", spellDC: "spell DC",
  spellAttack: "spell attacks", check: "checks", initiative: "initiative", carry: "carrying capacity" };
const ABIL = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One line per fact: numeric modifiers read "+1 AC", everything else comes from describeEffects. */
function effectLines(e: Effects): string[] {
  const mods = (e.modifiers ?? []).map(m => typeof m.value === "number" ? `${sgn(m.value)} ${MOD_LABEL[m.target] ?? m.target}` : `${m.target} ${m.value}`);
  const rest = describeEffects({ ...e, modifiers: [] });
  return [...mods, ...(rest ? [rest] : [])];
}

function card(title: string, subtitle: string, lines: string[], rules: string | undefined, path?: string): HTMLElement {
  return h("div", { cls: "fe-detail" },
    h("div", { cls: "fe-name", text: title }),
    subtitle ? h("div", { cls: "fe-muted", text: subtitle }) : null,
    ...lines.filter(Boolean).map(l => h("div", { cls: "fe-detail-line", text: l })),
    rules ? h("div", { cls: "fe-rules", text: rules }) : null,
    path ? h("div", { cls: "fe-faint", text: `Source note: ${path}` }) : null);
}

function itemCard(id: string, ctl: SheetController): HTMLElement | null {
  const reg = ctl.host.registry, e = reg.get<ItemData>("item", id); if (!e) return null;
  const d = e.data, lines: string[] = [];
  if (d.armor) lines.push(`Armor: AC ${d.armor.base}${d.armor.dex === "full" ? " + Dex" : d.armor.dex === "max2" ? " + Dex (max 2)" : ""}${d.armor.stealthDis ? ", disadvantage on Stealth" : ""}`);
  if (d.weapon) lines.push(`Weapon: ${d.weapon.dmg}${d.weapon.bonus ? sgn(d.weapon.bonus) : ""} ${d.weapon.type}${d.weapon.extraDamage ? ` + ${d.weapon.extraDamage}` : ""} (${d.weapon.range})`);
  lines.push(...effectLines(d.effects));
  if (d.charges) lines.push(`Charges: ${d.charges.max}, resets ${d.charges.reset === "none" ? "never" : d.charges.reset}`);
  for (const g of d.grants?.spells ?? []) {
    const sp = reg.get<SpellData>("spell", g.id), c = g.cost;
    lines.push(`Casts ${sp?.name ?? `${g.id} (missing from compendium)`}: ${c.kind === "charges" ? `${c.amount} charge${c.amount === 1 ? "" : "s"}` : c.kind === "perDay" ? `${c.uses} per day` : "at will"}`);
  }
  return card(e.name, [cap(d.kind), d.rarity, d.attunement ? "requires attunement" : ""].filter(Boolean).join(" · "), lines, d.rules, e.source === "vault" ? e.path : undefined);
}

function spellCard(id: string, ctl: SheetController): HTMLElement | null {
  const e = ctl.host.registry.get<SpellData>("spell", id); if (!e) return null;
  const d = e.data, lines: string[] = [];
  lines.push(`Casting time: ${d.castingTime}${d.ritual ? " (ritual)" : ""}`, `Range: ${d.range}`,
    `Components: ${d.components.join(", ")}${d.material ? ` (${d.material})` : ""}`, `Duration: ${d.concentration ? "Concentration, " : ""}${d.duration}`);
  if (d.attack) lines.push(`${cap(d.attack)} spell attack`);
  if (d.save) lines.push(`${ABIL[d.save.abil]} save, ${d.save.onSuccess === "half" ? "half damage on success" : "no effect on success"}`);
  const dmg = d.damage && (diceAt(d.damage.bySlot, Math.max(1, d.level)) ?? diceAt(d.damage.byCharLevel, 1));
  if (d.damage && dmg) lines.push(`Damage: ${dmg} ${d.damage.type}`);
  const heal = diceAt(d.heal?.bySlot, d.level);
  if (heal) lines.push(`Healing: ${heal.replace(/\+MOD/g, " + spellcasting modifier")}`);
  const sub = [d.level === 0 ? `${d.school} cantrip` : `Level ${d.level} ${d.school}`, d.classes.length ? d.classes.map(cap).join(", ") : ""].filter(Boolean).join(" · ");
  return card(e.name, sub, lines, [d.rules, d.higherLevel ? `At higher levels: ${d.higherLevel}` : ""].filter(Boolean).join("\n\n") || undefined, e.source === "vault" ? e.path : undefined);
}

function conditionCard(id: string, ctl: SheetController): HTMLElement | null {
  const e = ctl.host.registry.get<ConditionData>("condition", id) ?? ctl.host.registry.get<ConditionData>("injury", id); if (!e) return null;
  const d = e.data, lvl = ctl.value.conditions[id] ?? 0;
  const eff = d.levels && d.levelEffects ? d.levelEffects[Math.min(Math.max(lvl, 1), d.levels)] ?? {} : d.effects;
  return card(e.name, d.levels ? `${cap(d.category)}, ${d.levels} levels${lvl ? ` (level ${lvl} active)` : ""}` : cap(d.category), effectLines(eff), d.rules, e.source === "vault" ? e.path : undefined);
}

function traitCard(creature: string, index: number, ctl: SheetController): HTMLElement | null {
  const e = ctl.host.registry.get<CreatureData>("creature", creature), t = e?.data.traits[index];
  return e && t ? card(t.name, e.name, [], t.text, e.source === "vault" ? e.path : undefined) : null;
}

function featureCard(key: string, ctl: SheetController): HTMLElement | null {
  const f = ctl.stats()?.progress.features.find(x => x.key === key); if (!f) return null;
  const a = f.action, lines = effectLines(f.effects);
  if (a) lines.push(`Action: ${a.name}${a.cost && "resource" in a.cost ? `, costs ${a.cost.amount ?? 1} ${a.cost.resource}` : a.cost && "selfDamage" in a.cost ? `, costs ${a.cost.selfDamage} damage to you` : ""}${a.damage ? `, ${a.damage}` : ""}${a.heal ? `, heals ${a.heal}` : ""}${a.save ? `, ${ABIL[a.save.abil]} save against ${a.save.dc}` : ""}${a.text ? `. ${a.text}` : ""}`);
  return card(f.name, `${f.source}${f.sourceKind === "option" ? " (option)" : ""}`, lines, f.text);
}

/** Every feature a subclass or feat grants, by level, for the pick lists. */
function opsCard(title: string, sub: string, byLevel: [string, import("../content/types").Op[]][], path?: string): HTMLElement {
  const lines: string[] = [], text: string[] = [];
  for (const [lvl, ops] of byLevel) for (const op of ops) if (op.op === "feature") { lines.push(lvl ? `Level ${lvl}: ${op.name}` : op.name); if (op.text) text.push(`${op.name}. ${op.text}`); }
  return card(title, sub, lines, text.join("\n\n") || undefined, path);
}
function subclassCard(id: string, ctl: SheetController): HTMLElement | null {
  const e = ctl.host.registry.get<SubclassData>("subclass", id); if (!e) return null;
  return opsCard(e.name, `${cap(e.data.class)} subclass`, Object.entries(e.data.levels), e.source === "vault" ? e.path : undefined);
}
function featCard(id: string, ctl: SheetController): HTMLElement | null {
  const e = ctl.host.registry.get<FeatData>("feat", id); if (!e) return null;
  return opsCard(e.name, e.data.prerequisite ? `Prerequisite: ${e.data.prerequisite}` : "Feat", [["", e.data.grants]], e.source === "vault" ? e.path : undefined);
}

function effectCard(source: string, ctl: SheetController): HTMLElement | null {
  const hit = ctl.stats()?.effects.find(x => x.source === source); if (!hit) return null;
  return card(source, "Active effect", effectLines(hit.effects), undefined);
}

/** A detail card for `ref` (item:, spell:, condition:, trait:<creature>:<index>, effect:<source>), or null if it is not known. All text goes in as text nodes. */
export function detailCard(ref: string, ctl: SheetController): HTMLElement | null {
  const i = ref.indexOf(":"); if (i < 0) return null;
  const kind = ref.slice(0, i), rest = ref.slice(i + 1);
  switch (kind) {
    case "item": return itemCard(rest, ctl);
    case "spell": return spellCard(rest, ctl);
    case "condition": return conditionCard(rest, ctl);
    case "effect": return effectCard(rest, ctl);
    case "feature": return featureCard(rest, ctl);
    case "subclass": return subclassCard(rest, ctl);
    case "feat": return featCard(rest, ctl);
    case "trait": { const j = rest.lastIndexOf(":"); return j < 0 ? null : traitCard(rest.slice(0, j), Number(rest.slice(j + 1)), ctl); }
    default: return null;
  }
}
