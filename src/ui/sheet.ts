import type { SheetController } from "./controller";
import { RENDER } from "./components";
import { clear, h } from "./h";
import { CHARACTER_FEATURES, NPC_FEATURES, layoutFor } from "./layouts";
import { renderPanel } from "./panels";

const TOAST_MS = 2600;

/** Mount a sheet into `root`; re-renders on every controller change. */
export function mountSheet(root: HTMLElement, ctl: SheetController, mobile: boolean): { destroy(): void; render(): void } {
  let toastTimer: number | undefined, shownRoll: unknown;
  const render = () => {
    const features = ctl.isNpc ? NPC_FEATURES : CHARACTER_FEATURES;
    const layout = layoutFor(ctl.isNpc, mobile), visible = new Set(ctl.visible([...features])), st = ctl.stats();
    clear(root);
    root.className = `fe-sheet ${mobile ? "fe-mobile" : "fe-desktop"} ${ctl.editing ? "is-editing" : ""}`;
    if (ctl.errors.length) root.append(h("div", { cls: "fe-banner", data: { feature: "problems" } },
      h("b", { text: "This note has errors, so the sheet is read-only:" }), h("ul", {}, ...ctl.errors.map(e => h("li", { text: e })))));
    if (!st) { root.append(h("div", { cls: "fe-banner", text: "This NPC's creature is not in the compendium." })); return; }
    const slot = (f: string) => {
      if (!visible.has(f) || !RENDER[f]) return null;
      const el = RENDER[f](ctl, st); el.dataset.feature = f; return el;
    };
    root.append(h("div", { cls: "fe-pinned" }, ...layout.pinned.map(slot)));
    const tabs = layout.tabs.filter(t => t.columns.flat().some(f => visible.has(f)));
    const active = tabs.find(t => t.id === ctl.tab) ?? tabs[0];
    root.append(h("nav", { cls: "fe-tabs", data: { feature: "tabs" } }, ...tabs.map(t =>
      h("button", { cls: `fe-tab ${t === active ? "is-on" : ""}`, text: t.label, data: { tab: t.id }, on: { click: () => ctl.setTab(t.id) } }))));
    // every tab is rendered (inactive ones hidden) so each feature exists in the DOM once
    for (const t of tabs) {
      const pane = h("div", { cls: "fe-pane", data: { pane: t.id } }, ...t.columns.map(col => h("div", { cls: "fe-col" }, ...col.map(slot))));
      pane.hidden = t !== active; root.append(pane);
    }
    if (ctl.panel) root.append(h("div", { cls: "fe-scrim", on: { click: () => ctl.close() } }), renderPanel(ctl, ctl.panel, features));
    const r = ctl.lastRoll;
    const toast = h("div", { cls: `fe-toast ${r ? (r.crit ? "is-crit" : r.fumble ? "is-fumble" : "") : ""}`, data: { feature: "roll-result" } },
      r ? h("div", { cls: "fe-muted", text: r.title }) : null, r && (r.dice.length || r.total !== 0) ? h("div", { cls: "fe-toast-total", text: String(r.total) }) : null, r ? h("div", { cls: "fe-mono", text: r.detail }) : null);
    const fresh = !!r && r !== shownRoll;   // show only for a new roll, then hide after TOAST_MS
    if (fresh) { shownRoll = r; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.hidden = true; }, TOAST_MS); }
    toast.hidden = !fresh;
    root.append(toast);
  };
  const off = ctl.subscribe(render); render();
  return { render, destroy: () => { off(); window.clearTimeout(toastTimer); clear(root); } };
}
