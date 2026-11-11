import { slug } from "../content/registry";
import type { ActorStats } from "../core/derive";
import type { FeatureRow } from "../core/progression";
import type { SheetController } from "./controller";
import { btn } from "./widgets";

/** Features whose action spends this resource (Breath Weapon spends Breath Weapon; Flurry of Blows spends Ki). */
export function actionsSpending(st: ActorStats, resourceId: string): FeatureRow[] {
  return st.progress.features.filter(f => f.action?.cost && "resource" in f.action.cost && slug(f.action.cost.resource) === resourceId);
}

/**
 * Use buttons for a resource row: one "Use" when a single action spends it, else one button per action named after it.
 * Each does what the Features tab's Use does (spends the use, notes the save DC, rolls attack and damage), and is greyed out
 * when nothing is left.
 */
export function resourceUseButtons(ctl: SheetController, st: ActorStats, r: { id: string; name: string; max: number; used: number; unlimited?: string }): HTMLElement[] {
  const acts = actionsSpending(st, r.id), empty = !r.unlimited && r.used >= r.max;
  return acts.map(f => {
    const b = btn(acts.length > 1 ? f.action!.name : "Use", () => ctl.useAction(f));
    b.dataset.act = "use-resource"; b.dataset.action = f.key;
    if (empty) { (b as HTMLButtonElement).disabled = true; b.title = `No ${r.name} left`; }
    return b;
  });
}
