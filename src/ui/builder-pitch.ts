import type { Entry, Registry } from "../content/registry";
import type { ClassData, FeatData, GrantsData } from "../content/types";
import { ABIL_FULL } from "../content/glossary";
import { ABILS } from "../core/types";
import { plural, titleCase } from "../core/words";

/** One line about a race, subrace or background, from its data only: "Speed 25 ft · Darkvision 60 ft · +2 Constitution". */
export function originPitch(e: Entry<GrantsData>, _r: Registry): string {
  let speed: number | undefined, dark: number | undefined;
  for (const g of e.data.grants) if (g.op === "grant") { if (g.speed !== undefined) speed = g.speed; if (g.darkvision !== undefined) dark = Math.max(dark ?? 0, g.darkvision); }
  const parts: string[] = [];
  if (speed !== undefined) parts.push(`Speed ${speed} ft`);
  if (dark !== undefined) parts.push(`Darkvision ${dark} ft`);
  const fixed = e.data.ability?.fixed ?? {};
  for (const a of ABILS) { const n = fixed[a]; if (n) parts.push(`${n > 0 ? "+" : ""}${n} ${ABIL_FULL[a]}`); }
  return parts.join(" · ");
}

/** One line about a class: "Hit die d8 · Saves DEX, INT · 2 skills". */
export function classPitch(e: Entry<ClassData>): string {
  const d = e.data, parts = [`Hit die d${d.hitDie}`, `Saves ${d.saves.map(a => a.toUpperCase()).join(", ")}`];
  if (d.skills) parts.push(`${d.skills.count} skill${d.skills.count === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

const orList = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(", ")} or ${w[w.length - 1]}` : w[0] ?? "");

/** One line about a background, from its data only: "Sleight of Hand, Stealth · Rope Kit · Feat: Tough Mind · Raises Strength, Dexterity or Constitution". */
export function backgroundPitch(e: Entry<GrantsData>, r: Registry): string {
  const skills: string[] = [], tools: string[] = [], langs: string[] = [], feats: string[] = [];
  for (const g of e.data.grants) {
    if (g.op === "grant") {
      for (const p of g.proficiencies) {
        const m = /^(skill|tool):(.+)$/.exec(p);
        if (m) (m[1] === "skill" ? skills : tools).push(titleCase(m[2]));
      }
      langs.push(...g.languages.map(titleCase));
    } else if (g.op === "choose") {
      if (g.what === "skills") skills.push(`${plural(g.count, "skills")} of your choice`);
      else if (g.what === "tools") tools.push(g.count === 1 ? "a tool of your choice" : `${g.count} tools of your choice`);
      else if (g.what === "languages") langs.push(`${plural(g.count, "languages")} of your choice`);
    } else if (g.op === "feat") {
      if (g.feat) feats.push(`Feat: ${r.get<FeatData>("feat", g.feat)?.name ?? titleCase(g.feat)}`);
      else if (g.categories) feats.push("a feat of your choice");
    }
  }
  const parts = [skills, tools, langs].map(l => l.join(", ")).filter(Boolean);
  parts.push(...feats);
  const fixed = e.data.ability?.fixed ?? {};
  for (const a of ABILS) { const n = fixed[a]; if (n) parts.push(`${n > 0 ? "+" : ""}${n} ${ABIL_FULL[a]}`); }
  if (e.data.abilityPick) parts.push(`Raises ${orList(e.data.abilityPick.from.map(a => ABIL_FULL[a]))}`);
  return parts.join(" · ");
}
