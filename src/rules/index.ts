import type { RestDef, RuleModule } from "./module";
import { hexploration } from "./hexploration";
import { holyDay, restExcursion, restStandard } from "./rests";
export const MODULES: RuleModule[] = [restStandard, restExcursion, hexploration];
/** The holy-day dawn is its own rest, offered whenever the holy-days rule is on. */
export const activeRests = (rules: Record<string, boolean>): RestDef[] => [...MODULES.filter(m => rules[m.id]).flatMap(m => m.rests), ...(rules["holy-days"] ? [holyDay] : [])];
