import type { RestDef, RuleModule } from "./module";
import { holyDay, restExcursion, restStandard } from "./rests";
export const MODULES: RuleModule[] = [restStandard, restExcursion];
/** The holy-day dawn is its own rest, offered whenever the holy-days rule is on. */
export const activeRests = (rules: Record<string, boolean>): RestDef[] => [...MODULES.filter(m => rules[m.id]).flatMap(m => m.rests), ...(rules["holy-days"] ? [holyDay] : [])];
