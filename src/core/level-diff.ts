import type { Character } from "./character";
import { deriveCharacter } from "./derive";
import type { EffectContext } from "./effects";
import { fillDice, hasPlaceholder } from "./formula";
import { ABILS, type Abil } from "./types";

/** One heading with the plain sentences under it. */
export interface ChangeGroup { title: string; lines: string[]; }

const ABIL_LONG: Record<Abil, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const words = (id: string) => { const t = id.replace(/[-_]/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const RESET = { short: "short rest", long: "long rest", dawn: "dawn", none: "never" } as const;
/** The first sentence of a feature's text, cut to a reasonable length: the one-line summary shown next to a new feature. */
export function oneLine(text: string | undefined, max = 140): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim(); if (!t) return "";
  const m = /^(.+?[.!?])(\s|$)/.exec(t), s = m ? m[1] : t;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}...` : s;
}
const list = (xs: string[]) => xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const damageOf = (s: string | undefined) => (s ?? "").replace(/ [a-z]+(?: \+ .*)?$/, "");

/**
 * Everything that changes between two versions of a character, in plain words, for the level-up summary
 * (before -> after the level) and for undo (current -> after the undo). Features that went away are listed as lost.
 */
export function explainChange(before: Character, after: Character, ctx: EffectContext): ChangeGroup[] {
  const b = deriveCharacter(before, ctx), a = deriveCharacter(after, ctx), out: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => { if (lines.length) out.push({ title, lines }); };

  // Features
  const bk = new Set(b.progress.features.map(f => f.key)), ak = new Set(a.progress.features.map(f => f.key));
  add("New features", a.progress.features.filter(f => !bk.has(f.key)).map(f => { const t = oneLine(f.text); return t ? `${f.name}: ${t}` : f.name; }));
  add("Features you lose", b.progress.features.filter(f => !ak.has(f.key)).map(f => f.name));

  // Things that grow with level: scales (Martial Arts die, Sneak Attack dice, Rage damage) and what they change
  const grew: string[] = [];
  for (const [id, now] of Object.entries(a.progress.scales)) {
    const was = b.progress.scales[id]; if (was === now) continue;
    const label = words(id), hit: string[] = [];
    for (const at of a.attacks) { const old = b.attacks.find(x => x.name === at.name); if (old && old.damage !== at.damage && at.damage) hit.push(`${at.name} now rolls ${damageOf(at.damage)}`); }
    for (const f of a.progress.features) {
      const act = f.action; if (!act) continue;
      for (const expr of [act.damage, act.heal]) if (expr && hasPlaceholder(expr) && expr.includes(`{${id}}`)) hit.push(`${act.name} now rolls ${fillDice(expr, a.progress.scales)}`);
    }
    grew.push(was === undefined ? `${label}: ${now}${hit.length ? `. ${list([...new Set(hit)])}` : ""}` : `${label} ${was} -> ${now}${hit.length ? `: ${list([...new Set(hit)])}` : ""}`);
  }
  const bres = new Map(b.resources.map(r => [r.id, r]));
  for (const r of a.resources) {
    if (!r.derived) continue;
    const old = bres.get(r.id), when = RESET[r.reset];
    if (!old) grew.push(r.unlimited ? `New: ${r.name} (${r.unlimited.toLowerCase()})` : `New: ${r.name}, ${r.max} (comes back after a ${when})`);
    else if (!r.unlimited && old.max !== r.max) grew.push(`${r.name} ${old.max} -> ${r.max} (comes back after a ${when})`);
  }
  for (const r of b.resources) if (r.derived && !a.resources.some(x => x.id === r.id)) grew.push(`${r.name} goes away`);
  add("What grows with your level", grew);

  // Hit points and hit dice
  const hp: string[] = [];
  if (a.hp.max !== b.hp.max) hp.push(`Max HP ${b.hp.max} -> ${a.hp.max} (${sgn(a.hp.max - b.hp.max)})`);
  const bd = new Map(b.hitDice.map(d => [d.die, d.max]));
  for (const d of a.hitDice) { const was = bd.get(d.die) ?? 0; if (was !== d.max) hp.push(`${d.die} hit dice ${was} -> ${d.max}`); }
  add("Hit points", hp);

  // Numbers that moved, and the proficiency bonus behind many of them
  const nums: string[] = [];
  if (a.prof !== b.prof) {
    const moved: string[] = [];
    if (a.attacks.some((x, i) => x.toHit !== undefined && x.toHit !== b.attacks[i]?.toHit)) moved.push("attack rolls");
    if (ABILS.some(k => a.saves[k].prof && a.saves[k].mod !== b.saves[k].mod)) moved.push("saving throws you are trained in");
    const sk = a.skills.filter(k => k.prof || k.expertise).length; if (sk) moved.push(`${sk} skill${sk === 1 ? "" : "s"}`);
    if (a.casters.length) moved.push("spell save DC and spell attack");
    if (a.progress.dcs.length) moved.push("class DCs");
    nums.push(`Proficiency bonus ${sgn(b.prof)} -> ${sgn(a.prof)}${moved.length ? `. It is added to ${list(moved)}, so those went up too` : ""}`);
  }
  const num = (label: string, was: number, now: number, signed = false) => { if (was !== now) nums.push(`${label} ${signed ? sgn(was) : was} -> ${signed ? sgn(now) : now}`); };
  num("Armor Class", b.ac.value, a.ac.value); num("Speed", b.speed.value, a.speed.value); num("Initiative", b.initiative, a.initiative, true);
  num("Passive Perception", b.passivePerception, a.passivePerception); num("Attacks per action", b.attacksPerAction, a.attacksPerAction);
  if (b.speed.other !== a.speed.other) nums.push(`Other movement: ${b.speed.other || "none"} -> ${a.speed.other || "none"}`);
  for (const k of ABILS) {
    if (before.abilities[k] !== after.abilities[k]) nums.push(`${ABIL_LONG[k]} ${before.abilities[k]} -> ${after.abilities[k]}${b.mods[k] !== a.mods[k] ? ` (modifier ${sgn(b.mods[k])} -> ${sgn(a.mods[k])}, which moves every roll that uses it)` : ""}`);
    if (b.saves[k].mod !== a.saves[k].mod && a.prof === b.prof && before.abilities[k] === after.abilities[k]) nums.push(`${ABIL_LONG[k]} save ${sgn(b.saves[k].mod)} -> ${sgn(a.saves[k].mod)}`);
  }
  const skillMoves = a.skills.filter(k => { const o = b.skills.find(x => x.id === k.id); return o && o.mod !== k.mod; }).map(k => `${words(k.id)} ${sgn(b.skills.find(x => x.id === k.id)!.mod)} -> ${sgn(k.mod)}`);
  if (skillMoves.length) nums.push(`Skills: ${skillMoves.join(", ")}`);
  for (const at of a.attacks) {
    const old = b.attacks.find(x => x.name === at.name);
    if (!old) { nums.push(`New attack: ${at.name}${at.toHit !== undefined ? ` ${sgn(at.toHit)}` : ""}${at.damage ? `, ${at.damage}` : ""}`); continue; }
    if (at.toHit !== undefined && old.toHit !== at.toHit) nums.push(`${at.name} to hit ${sgn(old.toHit ?? 0)} -> ${sgn(at.toHit)}`);
    if (old.damage !== at.damage && at.damage) nums.push(`${at.name} damage ${old.damage ?? "none"} -> ${at.damage}`);
  }
  for (const c of a.casters) {
    const o = b.casters.find(x => x.name === c.name);
    if (!o) nums.push(`${c.name} spellcasting: save DC ${c.dc}, spell attack ${sgn(c.attack)}`);
    else { num(`${c.name} spell save DC`, o.dc, c.dc); num(`${c.name} spell attack`, o.attack, c.attack, true); }
  }
  for (const d of a.progress.dcs) { const o = b.progress.dcs.find(x => x.id === d.id); if (o) num(`${d.name} save DC`, o.dc, d.dc); else nums.push(`${d.name} save DC ${d.dc}`); }
  if (a.crit?.range !== b.crit?.range) nums.push(`Critical hits on ${a.crit ? `${a.crit.range}-20` : "20"}${a.crit?.vs ? ` against ${a.crit.vs}` : ""} (was ${b.crit ? `${b.crit.range}-20` : "20"})`);
  num("Carrying capacity", b.carry.capacity, a.carry.capacity);
  add("Numbers that changed", nums);

  // Spells: slots and the spells you know
  const sp: string[] = [];
  const bs = new Map(b.slots.map(s => [s.level, s]));
  for (const s of a.slots) {
    const o = bs.get(s.level), name = s.level === "pact" ? `Pact slots (level ${s.pactLevel})` : `Level ${s.level} spell slots`;
    if (!o) sp.push(`${name}: new, ${s.max}`); else if (o.max !== s.max || o.pactLevel !== s.pactLevel) sp.push(`${name} ${o.max} -> ${s.max}`);
  }
  const name = (id: string) => ctx.registry.get<{ name: string }>("spell", id)?.name ?? words(id);
  const bsp = new Set(before.spells.map(x => x.id)), asp = new Set(after.spells.map(x => x.id));
  const gained = after.spells.filter(x => !bsp.has(x.id)).map(x => name(x.id)), lost = before.spells.filter(x => !asp.has(x.id)).map(x => name(x.id));
  if (gained.length) sp.push(`New spells: ${gained.join(", ")}`);
  if (lost.length) sp.push(`Spells you no longer know: ${lost.join(", ")}`);
  add("Spells", sp);

  // Everything else a feature can hand out
  const also: string[] = [];
  const diff = (title: string, was: string[], now: string[]) => {
    const g = now.filter(x => !was.includes(x)), l = was.filter(x => !now.includes(x));
    if (g.length) also.push(`${title}: ${g.join(", ")}`); if (l.length) also.push(`${title} lost: ${l.join(", ")}`);
  };
  diff("Resistant to", b.traits.resist, a.traits.resist); diff("Immune to", b.traits.immune, a.traits.immune); diff("Vulnerable to", b.traits.vulnerable, a.traits.vulnerable);
  diff("Cannot be", b.conditionImmune, a.conditionImmune);
  diff("Saving throw training", b.progress.proficiencies.saves.map(k => ABIL_LONG[k]), a.progress.proficiencies.saves.map(k => ABIL_LONG[k]));
  diff("Skill training", [...b.progress.proficiencies.skills, ...before.proficiencies.skills].map(words), [...a.progress.proficiencies.skills, ...after.proficiencies.skills].map(words));
  diff("Expertise", [...b.progress.proficiencies.expertise, ...before.proficiencies.expertise].map(words), [...a.progress.proficiencies.expertise, ...after.proficiencies.expertise].map(words));
  diff("Weapon and armor training", b.progress.proficiencies.other, a.progress.proficiencies.other);
  diff("Languages", b.languages ?? [], a.languages ?? []);
  for (const k of ["darkvision", "blindsight", "tremorsense", "truesight", "telepathy"] as const) if (b.senses[k] !== a.senses[k]) also.push(`${words(k)} ${b.senses[k] ?? 0} ft -> ${a.senses[k] ?? 0} ft`);
  const ag = after.inventory.filter(e => !before.inventory.some(x => x.id === e.id && x.name === e.name)).map(e => e.name ?? words(e.id ?? "item"));
  if (ag.length) also.push(`Items added to your gear: ${ag.join(", ")}`);
  add("Also", also);
  return out;
}

/** The groups flattened to plain lines ("New features: Ki: ..."), for the roll log and for tests. */
export const flattenChange = (groups: ChangeGroup[]): string[] => groups.flatMap(g => g.lines.map(l => `${g.title}: ${l}`));
