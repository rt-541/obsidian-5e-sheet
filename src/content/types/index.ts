import type { Registry } from "../registry";
import { conditionType } from "./condition";
import { itemType } from "./item";
import { creatureType } from "./creature";
import { classType } from "./class";
import { campaignType } from "./campaign";
import { spellType } from "./spell";
import { backgroundType, featType, raceType, subclassType, subraceType } from "./origin";
export type { ConditionData } from "./condition";
export type { ItemData, GrantedSpell, ArmorData, WeaponData } from "./item";
export type { CreatureData, CreatureAttack } from "./creature";
export type { ClassData, AbilReq } from "./class";
export type { SubclassData, GrantsData, SubraceData, FeatData } from "./origin";
export type { Op, OpName, ActionDef, OptionDef, TableRow, Progression, Reset } from "./ops";
export type { CampaignData } from "./campaign";
export type { SpellData } from "./spell";

export function registerBuiltinTypes(r: Registry): void {
  for (const d of [conditionType("condition"), conditionType("injury"), itemType, creatureType, classType, campaignType, spellType, subclassType, raceType, subraceType, backgroundType, featType]) r.register(d as never);
}
