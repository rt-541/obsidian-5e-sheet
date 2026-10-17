import type { RestDef, RuleModule } from "./module";
import { restExcursion, restStandard } from "./rests";
export const MODULES: RuleModule[] = [restStandard, restExcursion];
export const activeRests = (rules: Record<string, boolean>): RestDef[] => MODULES.filter(m => rules[m.id]).flatMap(m => m.rests);
