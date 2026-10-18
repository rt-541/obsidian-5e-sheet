import { tagParts } from "../core/roll-tags";
import type { Effects, Modifier } from "../core/types";
import { h, sgn } from "./h";

export const card = (title: string, ...kids: (Node | null | false)[]) => h("div", { cls: "fe-card" }, title ? h("div", { cls: "fe-card-title", text: title }) : null, ...kids);
export const btn = (text: string, onClick: (e: MouseEvent) => void, cls = "") => h("button", { cls: `fe-btn ${cls}`.trim(), text, on: { click: onClick } });
/** A source badge (`WotC · PHB`, `Roll20`, `Homebrew`, `WotC (SRD)`): user sources are accented, WotC content is neutral. */
export const sourceBadge = (label: string, extra = "") => h("span", { cls: `fe-src ${label.startsWith("WotC") ? "" : "is-hb"} ${extra}`.replace(/\s+/g, " ").trim(), text: label, data: { source: label } });
export const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const TARGET_WORDS: Record<string, string> = { ac: "AC", speed: "Speed", hpMax: "Max HP", carry: "Carrying capacity", save: "Saving throws", attack: "Attack rolls", damage: "Damage",
  spellDC: "Spell save DC", spellAttack: "Spell attack", check: "Ability checks", initiative: "Initiative", passive: "Passive score" };
const GATE_WORDS: Record<string, string> = { "armor:none": "wearing no armor", "armor:worn": "wearing armor", "armor:light": "in light armor", "armor:medium": "in medium armor", "armor:heavy": "in heavy armor",
  "shield:none": "with no shield", "shield:worn": "with a shield", "wield:dual": "fighting with two weapons", concentrating: "concentrating on a spell" };
/** A gate in plain words: "wearing armor", "not in heavy armor", "while Rage is on". */
export function gateWords(g: string): string {
  const neg = g.startsWith("!"), x = neg ? g.slice(1) : g;
  const w = x.startsWith("toggle:") ? `${titleCase(x.slice(7))} is on` : GATE_WORDS[x] ?? x;
  return neg ? (x.startsWith("toggle:") ? `${titleCase(x.slice(7))} is off` : `not ${w}`) : w;
}
const TAG_WORDS: Record<string, string> = { "attack:melee": "melee attacks", "attack:ranged": "ranged attacks", concentration: "concentration saves", "attack:weapon": "weapon attacks" };
/** A roll tag in plain words ("ranged attacks", "Dexterity saves"); `+` joins with "and". */
export function tagWords(tag: string): string {
  const ABIL: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  return tagParts(tag).map(p => {
    if (TAG_WORDS[p]) return TAG_WORDS[p];
    const [k, q] = p.split(":");
    if (k === "attack" && q) return q.startsWith("!") ? `attacks not using ${ABIL[q.slice(1)] ?? q.slice(1)}` : `${ABIL[q] ?? q} attacks`;
    if (k === "save" && q) return `${ABIL[q] ?? q} saves`;
    if (k === "check" && q) return `${ABIL[q] ?? q} checks`;
    if (k === "skill" && q) return `${titleCase(q)} checks`;
    if (k === "passive" && q) return `passive ${titleCase(q)}`;
    if (k === "weapon") return q ? `${titleCase(q)} weapons` : "weapon attacks";
    return k === "attack" ? "attacks" : k === "save" ? "saves" : k === "check" ? "ability checks" : p;
  }).join(" and ");
}
const modWords = (m: Modifier): string => {
  const t = TARGET_WORDS[m.target] ?? m.target, on = m.on ? ` for ${tagWords(m.on)}` : "";
  if (m.value === "half") return `${t} halved${on}`;
  if (m.value === "zero") return `${t} drops to 0${on}`;
  if (m.value === "double") return `${t} doubled${on}`;
  return `${t} ${typeof m.value === "number" ? sgn(m.value) : `+ ${m.value}`}${on}`;
};

const ABIL_WORD: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const plusOrFormula = (v: number | string) => (typeof v === "number" ? sgn(v) : `+ ${v}`);

/** Armor class formulas, attacks per action, senses, extra speeds and ability bonuses in plain words. */
function defenseWords(e: Effects): string[] {
  const out: string[] = [];
  if (e.acFormula) {
    const f = e.acFormula, when = f.withArmor ? "" : f.noShield ? " when you wear no armor and no shield" : " when you wear no armor";
    out.push(`AC is ${[f.base, ...(f.abils ?? []).map(a => ABIL_WORD[a])].join(" + ")}${when}`);
  }
  if (e.armorDexMax !== undefined) out.push(`Medium armor lets you add up to +${e.armorDexMax} Dexterity to AC`);
  if (e.attacks !== undefined) out.push(`Attacks per Attack action: ${e.attacks}`);
  const sn = e.senses;
  if (sn) {
    if (sn.darkvision !== undefined) out.push(`You see in the dark up to ${sn.darkvision} ft.`);
    if (sn.darkvisionAdd !== undefined) out.push(`Your darkvision reaches ${sn.darkvisionAdd} ft. farther`);
    for (const k of ["blindsight", "tremorsense", "truesight", "telepathy"] as const) if (sn[k] !== undefined) out.push(`${titleCase(k)} ${sn[k]} ft.`);
  }
  const sp = e.speeds;
  if (sp) for (const k of ["fly", "swim", "climb", "burrow"] as const) if (sp[k] !== undefined) {
    out.push(`${titleCase(k)} speed ${sp[k] === "walk" ? "equal to your walking speed" : `${sp[k]} ft.`}${k === "fly" && sp.hover ? " (hover)" : ""}`);
  }
  for (const [a, v] of Object.entries(e.abilityBonus ?? {})) out.push(`${ABIL_WORD[a]} ${plusOrFormula(v)}`);
  return out;
}

export function describeEffects(e: Effects): string {
  const out: string[] = [];
  if (e.adv?.length) out.push("Adv: " + e.adv.join(", "));
  if (e.dis?.length) out.push("Disadv: " + e.dis.join(", "));
  if (e.autofail?.length) out.push("Auto-fail: " + e.autofail.join(", "));
  for (const m of e.modifiers ?? []) out.push(modWords(m));
  if (e.resist?.length) out.push("Resist " + e.resist.join(", "));
  if (e.acAbility) out.push(`AC uses ${e.acAbility.toUpperCase()}`);
  for (const b of e.saveBonus ?? []) out.push(`${b.abils.map(a => a.toUpperCase()).join("/")} saves ${typeof b.value === "number" ? sgn(b.value) : `+ ${b.value}`}`);
  if (e.critRange !== undefined) out.push(`Crit on ${e.critRange}-20${e.critOn ? ` for ${tagWords(e.critOn)}` : ""}${e.critVs ? ` vs ${e.critVs}` : ""}`);
  if (e.maxScore) out.push(`${e.maxScore.abil.toUpperCase()} max ${e.maxScore.max}`);
  if (e.conditionImmune?.length) out.push("Can't be " + e.conditionImmune.map(titleCase).join(" or ").toLowerCase());
  out.push(...defenseWords(e));
  if (e.note) out.push(e.note);
  const text = out.join(" · ");
  return e.while?.length ? `${text} (only while ${e.while.map(gateWords).join(" and ")})` : text;
}

/** Uses of a derived resource: pips, or the word for an unlimited one. */
export function usesPips(r: { max: number; used: number; unlimited?: string }, set: (n: number) => void) {
  return r.unlimited ? h("span", { cls: "fe-muted", text: r.unlimited }) : pips(r.max, r.used, set);
}

/** Pips: click pip i to set used = i+1, or i if it was the last used one. */
export function pips(max: number, used: number, set: (n: number) => void, cls = "") {
  return h("span", { cls: "fe-pips" }, ...Array.from({ length: max }, (_, i) =>
    h("button", { cls: `fe-pip ${cls} ${i < used ? "is-used" : ""}`, attrs: { "aria-label": `${i + 1} of ${max}` }, on: { click: () => set(used === i + 1 ? i : i + 1) } })));
}

