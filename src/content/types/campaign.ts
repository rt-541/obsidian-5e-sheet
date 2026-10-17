import { isObj, oneOf, str, strList, type Raw } from "../check";
import type { TypeDef } from "../registry";

export type LevelingMode = "xp" | "milestone";
export interface CampaignData { name: string; /** Absent means milestone. */ leveling?: LevelingMode; rules: Record<string, boolean>; sections: { hide: string[]; show: string[] };
  calendar: { weekday?: string; holyDay: string }; weather?: { name: string; adv: string[]; dis: string[] }; }

export const campaignType: TypeDef<CampaignData> = {
  type: "campaign",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e);
    const rules: Record<string, boolean> = {};
    if (isObj(raw.rules)) for (const [k, v] of Object.entries(raw.rules)) { if (typeof v === "boolean") rules[k] = v; else e.push(`rules.${k}: must be true or false`); }
    const sec = isObj(raw.sections) ? raw.sections : {};
    const cal = isObj(raw.calendar) ? raw.calendar : {};
    const out: CampaignData = { name: name ?? "", rules, sections: { hide: strList(sec.hide, "sections.hide", e), show: strList(sec.show, "sections.show", e) },
      calendar: { holyDay: typeof cal.holyDay === "string" ? cal.holyDay : "Sunday", ...(typeof cal.weekday === "string" ? { weekday: cal.weekday } : {}) } };
    if (raw.leveling !== undefined) { const l = oneOf(raw.leveling, ["xp", "milestone"] as const, "leveling", e); if (l) out.leveling = l; }
    if (isObj(raw.weather)) out.weather = { name: String(raw.weather.name ?? ""), adv: strList(raw.weather.adv, "weather.adv", e), dis: strList(raw.weather.dis, "weather.dis", e) };
    if (e.length || !name) return { errors: e };
    return { errors: e, value: out };
  },
};
