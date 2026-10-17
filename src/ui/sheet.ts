import type { SheetController } from "./controller";
import { RENDER } from "./components";
import { clear, h } from "./h";
import { CHARACTER_FEATURES, NPC_FEATURES, layoutFor } from "./layouts";
import { detailCard } from "./details";
import { renderPanel } from "./panels";

const TOAST_MS = 2600, HOVER_MS = 250;

/** Mount a sheet into `root`; re-renders on every controller change. */
export function mountSheet(root: HTMLElement, ctl: SheetController, mobile: boolean): { destroy(): void; render(): void } {
  let toastTimer: number | undefined, shownRoll: unknown, hoverTimer: number | undefined, popover: HTMLElement | undefined;
  const hidePopover = () => { window.clearTimeout(hoverTimer); hoverTimer = undefined; popover?.remove(); popover = undefined; };
  const showPopover = (el: HTMLElement) => {
    const card = detailCard(el.dataset.ref ?? "", ctl); if (!card) return;
    popover = h("div", { cls: "fe-popover", attrs: { role: "tooltip" } }, card); root.append(popover);
    const r = el.getBoundingClientRect(), w = popover.offsetWidth, ph = popover.offsetHeight;
    const left = Math.max(8, Math.min(r.right + 8, window.innerWidth - w - 8)), top = Math.max(8, Math.min(r.top, window.innerHeight - ph - 8));
    popover.style.left = `${left}px`; popover.style.top = `${top}px`;
  };
  const refOf = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>("[data-ref]") ?? null;
  const onOver = (e: MouseEvent) => {
    if (mobile || window.matchMedia?.("(hover: none)")?.matches) return;   // touch: tap opens the panel instead
    const el = refOf(e); if (!el) return;
    const from = (e.relatedTarget as Node | null);
    if (from && el.contains(from)) return;      // moving between children of the same name
    hidePopover(); hoverTimer = window.setTimeout(() => { hoverTimer = undefined; showPopover(el); }, HOVER_MS);
  };
  const onOut = (e: MouseEvent) => {
    const el = refOf(e), to = e.relatedTarget as Node | null;
    if (el && !(to && el.contains(to))) hidePopover();
  };
  const onClick = (e: MouseEvent) => {
    const el = refOf(e); if (!el || "noclick" in el.dataset) return;   // chips and condition rows keep their own click behaviour
    hidePopover(); ctl.open({ kind: "details", ref: el.dataset.ref! });
  };
  root.addEventListener("mouseover", onOver); root.addEventListener("mouseout", onOut); root.addEventListener("click", onClick);
  window.addEventListener("scroll", hidePopover, true);
  const render = () => {
    const features = ctl.isNpc ? NPC_FEATURES : CHARACTER_FEATURES;
    const layout = layoutFor(ctl.isNpc, mobile), visible = new Set(ctl.visible([...features])), st = ctl.stats();
    hidePopover(); clear(root);
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
  return { render, destroy: () => {
    off(); window.clearTimeout(toastTimer); hidePopover(); clear(root);
    root.removeEventListener("mouseover", onOver); root.removeEventListener("mouseout", onOut); root.removeEventListener("click", onClick);
    window.removeEventListener("scroll", hidePopover, true);
  } };
}
