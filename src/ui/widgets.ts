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

/** Dice with a {scale} placeholder in words: `{martial-arts-die}` reads "your Martial Arts die". */
const diceWords = (d: string | number) => String(d).replace(/\{([a-z0-9-]+)\}/g, (_m, id: string) => `your ${titleCase(id).toLowerCase()}`);
const WEAPON_WORDS: Record<string, string> = { all: "all weapons", monk: "monk weapons", unarmed: "unarmed strikes", offhand: "off-hand attacks", pact: "your pact weapon", magic: "magic weapons" };
const abilsWords = (a: string[]) => a.map(x => ABIL_WORD[x]).join(" or ");

/** Weapon rules, natural weapons, extra damage, crit dice, spell damage, half proficiency and d20 rules in plain words. */
function combatWords(e: Effects): string[] {
  const out: string[] = [];
  for (const r of e.weaponRule ?? []) {
    const bits = [...(r.abils ? [`use ${abilsWords(r.abils)} if it is better`] : []), ...(r.die ? [`damage die is at least ${diceWords(r.die)}`] : []),
      ...(r.magical ? ["count as magical"] : []), ...(r.addMod ? ["add your ability modifier to damage"] : []), ...(r.note ? [r.note] : [])];
    out.push(`${r.match.map(m => WEAPON_WORDS[m] ?? titleCase(m)).join(" and ")}: ${bits.join(", ")}`);
  }
  for (const w of e.weapons ?? []) {
    const ab = w.ab === "finesse" ? "Strength or Dexterity" : Array.isArray(w.ab) ? abilsWords(w.ab) : ABIL_WORD[w.ab];
    out.push(`Attack: ${w.name} ${diceWords(w.dmg)} ${w.type} (${w.range ?? "melee"}, ${ab})`);
  }
  for (const x of e.extraDamage ?? []) {
    out.push(`Extra ${diceWords(x.dice)} ${x.type === "weapon" ? "damage" : `${x.type} damage`}${x.on ? ` on ${tagWords(x.on)}` : " on weapon attacks"}${x.per === "turn" ? ", once per turn" : ""}${x.note ? ` (${x.note})` : ""}`);
  }
  for (const c of e.critDice ?? []) out.push(`Critical hits roll ${c.extra} extra weapon damage ${c.extra === 1 ? "die" : "dice"}${c.on ? ` on ${tagWords(c.on)}` : ""}`);
  for (const d of e.spellDamage ?? []) {
    const what = [d.spell ? titleCase(d.spell) : "", d.level !== undefined ? (d.level === 0 ? "cantrips" : `level ${d.level} spells`) : "", d.school ? `${titleCase(d.school)} spells` : "",
      d.damageType ? `${d.damageType.join(" or ")} spells` : "", d.class ? `${titleCase(d.class)} spells` : ""].filter(Boolean).join(", ") || "spells";
    out.push(`Extra ${diceWords(d.add)} damage on ${what}${d.perBeam ? " (for each beam)" : ""}`);
  }
  if (e.halfProf) out.push(`Half your proficiency bonus${e.halfProf.roundUp ? " (rounded up)" : ""} on ${e.halfProf.on.map(tagWords).join(" and ")} you are not proficient in`);
  for (const r of e.d20Rule ?? []) {
    if (r.min !== undefined) out.push(`A d20 roll of ${r.min - 1} or lower counts as ${r.min} on ${tagWords(r.on)}${r.proficient ? " you are proficient in" : ""}`);
    if (r.reroll !== undefined) out.push(`Reroll a d20 of ${r.reroll} or lower once on ${tagWords(r.on)}${r.proficient ? " you are proficient in" : ""}`);
  }
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
  out.push(...defenseWords(e), ...combatWords(e));
  if (e.note) out.push(e.note);
  const text = out.join(" · ");
  return e.while?.length ? `${text} (only while ${e.while.map(gateWords).join(" and ")})` : text;
}

/** Uses of a derived resource: pips, or the word for an unlimited one. */
export function usesPips(r: { max: number; used: number; unlimited?: string }, set: (n: number) => void) {
  return r.unlimited ? h("span", { cls: "fe-muted", text: r.unlimited }) : pips(r.max, r.used, set);
}

/** Above this many points a resource is a bar with a number box instead of a row of pips. */
export const PIP_LIMIT = 12;

/**
 * A bar for big pools and progress trackers. `mode: "pool"` shows what is left (max - used) and spends;
 * `mode: "progress"` fills as `used` grows (downtime, training) and adds. The number box takes an amount.
 */
export function bar(max: number, used: number, set: (n: number) => void, mode: "pool" | "progress", label = "") {
  const value = mode === "progress" ? used : max - used, pct = max ? Math.round(100 * value / max) : 0;
  const clamp = (n: number) => Math.max(0, Math.min(max, n));
  const amount = h("input", { cls: "fe-bar-amt", attrs: { type: "number", min: "1", value: "1", "aria-label": mode === "progress" ? "Amount to add" : "Amount to spend" } });
  const n = () => Math.max(1, Math.floor(+amount.value || 1));
  const step = (sign: 1 | -1) => () => set(clamp(used + sign * n()));
  return h("span", { cls: `fe-barbox is-${mode}` },
    h("span", { cls: "fe-bar fe-bar-wide", title: `${value} / ${max}${label ? " " + label : ""}` }, h("span", { cls: "fe-bar-fill", attrs: { style: `width:${pct}%` } })),
    h("span", { cls: "fe-bar-num", text: `${value} / ${max}${mode === "progress" ? ` (${pct}%)` : ""}${label ? " " + label : ""}` }),
    mode === "progress"
      ? h("span", { cls: "fe-bar-ctl" }, h("button", { cls: "fe-btn", text: "−", attrs: { "aria-label": "Undo progress" }, on: { click: step(-1) } }), amount, h("button", { cls: "fe-btn mod-cta", text: "Add", on: { click: step(1) } }))
      : h("span", { cls: "fe-bar-ctl" }, amount, h("button", { cls: "fe-btn", text: "Spend", on: { click: step(1) } }), h("button", { cls: "fe-btn", text: "Restore", on: { click: step(-1) } })));
}

/** Pips: click pip i to set used = i+1, or i if it was the last used one. Big pools become a bar. */
export function pips(max: number, used: number, set: (n: number) => void, cls = "") {
  if (max > PIP_LIMIT) return bar(max, used, set, "pool");
  return h("span", { cls: "fe-pips" }, ...Array.from({ length: max }, (_, i) =>
    h("button", { cls: `fe-pip ${cls} ${i < used ? "is-used" : ""}`, attrs: { "aria-label": `${i + 1} of ${max}` }, on: { click: () => set(used === i + 1 ? i : i + 1) } })));
}

