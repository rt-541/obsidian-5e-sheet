import type { Entry, Registry } from "../content/registry";
import type { ClassData, GrantsData } from "../content/types";
import { ABIL_FULL } from "../content/glossary";
import { ABILS } from "../core/types";

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
