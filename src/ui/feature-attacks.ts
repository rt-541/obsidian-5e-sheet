import { slug } from "../content/registry";
import type { ActorStats } from "../core/derive";
import { evalFormula, fillDice } from "../core/formula";
import { formulaVars, type FeatureRow } from "../core/progression";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";
import { btn } from "./widgets";

const ABIL_NAME = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" } as const;

/** Features whose action attacks or deals damage (a Breath Weapon, a spirit's strike): they belong in the Attacks card too. */
export function featureAttacks(st: ActorStats): FeatureRow[] {
  return st.progress.features.filter(f => f.action && (f.action.attack !== undefined || !!f.action.damage));
}

/**
 * One Attacks-card row for a feature attack: its save DC or to-hit, the damage dice for this level, the uses left, and a Use
 * button that does what the Features tab's Use does (spends the use, notes the save, rolls the damage).
 */
export function featureAttackRow(ctl: SheetController, st: ActorStats, f: FeatureRow): HTMLElement {
  const a = f.action!, c = ctl.character!, scales = st.progress.scales;
  const dc = a.save ? st.progress.dcs.find(x => x.id === slug(a.save!.dc)) : undefined;
  const cost = a.cost && "resource" in a.cost ? st.resources.find(r => r.derived && r.id === slug((a.cost as { resource: string }).resource)) : undefined;
  let toHit: number | undefined;
  if (a.attack !== undefined) { try { toHit = Math.floor(evalFormula(a.attack, formulaVars(c, scales))); } catch { toHit = undefined; } }
  const left = cost && !cost.unlimited ? Math.max(0, cost.max - cost.used) : undefined;
  const use = btn("Use", () => ctl.useAction(f)); use.dataset.act = "use-feature-attack";
  if (left === 0) { (use as HTMLButtonElement).disabled = true; use.title = `No ${cost!.name} left`; }
  return h("div", { cls: "fe-attack fe-feature-attack", data: { featureAttack: f.key } },
    h("span", { cls: "fe-grow", text: a.name, data: { ref: `feature:${f.key}` } }),
    toHit !== undefined ? h("span", { cls: "fe-roll-like", text: sgn(toHit) }) : null,
    a.save ? h("span", { cls: "fe-faint", text: `DC ${dc ? dc.dc : "?"} ${ABIL_NAME[a.save.abil]}` }) : null,
    a.damage ? h("span", { cls: "fe-mono", text: fillDice(a.damage, scales) }) : null,
    left !== undefined ? h("span", { cls: "fe-faint", text: `${left} of ${cost!.max} left` }) : null,
    use,
    a.text ? h("div", { cls: "fe-note", text: a.text }) : null);
}
