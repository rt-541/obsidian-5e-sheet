import type { ClassData, GrantsData, SubclassData, SubraceData } from "../content/types";
import { ABIL_FULL } from "../content/glossary";
import type { AbilityIncrease } from "../content/types";
import type { Abil } from "../core/types";
import type { FeatureRow } from "../core/progression";
import type { SheetController } from "./controller";
import { h } from "./h";
import { summaryOf } from "./traits-ui";

/**
 * The cards behind the identity line (class, subclass, race, subrace, background): what you get from each, one line per feature.
 * The one-liners are the sheet's own summaries (summaryOf); no rules prose is repeated here.
 */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mk = (title: string, sub: string, lines: string[]) => h("div", { cls: "fe-detail" },
  h("div", { cls: "fe-name", text: title }), sub ? h("div", { cls: "fe-muted", text: sub }) : null,
  ...lines.filter(Boolean).map(l => h("div", { cls: "fe-detail-line", text: l })));

const featureLines = (rows: FeatureRow[]): string[] => {
  const sorted = [...rows].sort((a, b) => a.level - b.level);
  return sorted.map(f => { const s = summaryOf(f); return `${f.level ? `Level ${f.level}: ` : ""}${f.name}${s ? ` - ${s}` : ""}`; });
};
const withHeading = (heading: string, lines: string[]) => (lines.length ? [heading, ...lines] : []);

function abilityLine(a?: AbilityIncrease): string {
  if (!a) return "";
  const parts = [...(Object.entries(a.fixed) as [Abil, number][]).filter(([, n]) => n).map(([k, n]) => `${n > 0 ? "+" : ""}${n} ${ABIL_FULL[k]}`),
    ...a.choose.map(c => `+${c.amount} to ${c.count} ${c.from.length >= 6 ? `ability score${c.count > 1 ? "s" : ""} of your choice` : `of ${c.from.map(x => ABIL_FULL[x]).join(", ")}`}`)];
  return parts.length ? `Ability scores: ${parts.join(", ")}` : "";
}
const sensesLine = (senses: Partial<Record<string, number>>): string => {
  const s = Object.entries(senses).filter(([, n]) => n).map(([k, n]) => `${k} ${n} ft.`);
  return s.length ? `Senses: ${s.join(", ")}` : "";
};

/** `kind:id` after `identity:`: class:<id>, subclass:<id>, race, subrace, background (the last three read the character's own pick). */
export function identityCard(ref: string, ctl: SheetController): HTMLElement | null {
  const c = ctl.character, st = ctl.stats(); if (!c || !st) return null;
  const reg = ctl.host.registry, feats = st.progress.features, [kind, id] = ref.split(":");
  if (kind === "class") {
    const k = c.classes.find(x => x.class === id), e = reg.get<ClassData>("class", id); if (!k || !e) return null;
    const d = e.data, first = c.classes[0]?.class === id;
    const profs = (first ? d.proficiencies : d.multiclass?.proficiencies)?.filter(p => !/^(skill|save):/.test(p)) ?? [];
    return mk(`${e.name} ${k.level}`, "Class", [
      `Hit die: d${d.hitDie}`, `Saving throws: ${d.saves.map(a => ABIL_FULL[a]).join(", ")}`,
      ...(profs.length ? [`Armor, weapons and tools: ${profs.join(", ")}`] : []),
      ...(d.spellcasting ? [`Casts with ${ABIL_FULL[d.spellcasting.abil]} (${d.spellcasting.progression} caster)`] : []),
      ...withHeading("Features so far:", featureLines(feats.filter(f => f.key.startsWith(`class:${id}:`))))]);
  }
  if (kind === "subclass") {
    const e = reg.get<SubclassData>("subclass", id); if (!e) return null;
    return mk(e.name, `${reg.get<ClassData>("class", e.data.class)?.name ?? cap(e.data.class)} subclass`, withHeading("Features so far:", featureLines(feats.filter(f => f.key.startsWith(`subclass:${id}:`)))));
  }
  if (kind === "race" || kind === "subrace") {
    const sub = kind === "subrace", rid = sub ? c.subrace : c.race; if (!rid) return null;
    const e = reg.get<GrantsData | SubraceData>(kind, rid); if (!e) return null;
    const own = feats.filter(f => f.sourceKind === kind);
    return mk(e.name, sub ? `${reg.get<GrantsData>("race", c.race ?? "")?.name ?? "Race"} subrace` : "Race", [
      abilityLine(e.data.ability), ...(sub ? [] : [`Speed: ${st.speed.value} ft.`, sensesLine(st.senses), st.languages?.length ? `Languages: ${st.languages.join(", ")}` : ""]),
      ...withHeading("Traits:", featureLines(own))]);
  }
  if (kind === "background") {
    if (!c.background) return null;
    const e = reg.get<GrantsData>("background", c.background); if (!e) return null;
    return mk(e.name, "Background", withHeading("What it gives you:", featureLines(feats.filter(f => f.sourceKind === "background"))));
  }
  return null;
}
