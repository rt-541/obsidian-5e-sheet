import type { SheetController } from "./controller";
import { RENDER } from "./components";
import { clear, h } from "./h";
import { CHARACTER_FEATURES, NPC_FEATURES, layoutFor, type LayoutName } from "./layouts";
import { detailCard } from "./details";
import { renderPanel } from "./panels";

const TOAST_MS = 2600, TOAST_LONG_MS = 5000, HOVER_MS = 250;
const LAYOUT_CLASSES = ["fe-desktop", "fe-tablet", "fe-mobile"];

/** Mount a sheet into `root`; re-renders on every controller change. */
export function mountSheet(root: HTMLElement, ctl: SheetController, layoutIn: LayoutName | boolean): { destroy(): void; render(): void } {
  const layoutName: LayoutName = layoutIn === true ? "mobile" : layoutIn === false ? "desktop" : layoutIn;
  const touch = layoutName !== "desktop";   // phones and tablets: a tap opens the card, there is no hover
  let toastTimer: number | undefined, shownItem: unknown, toastLive = false, toastEl: HTMLElement | undefined, hoverTimer: number | undefined, popover: HTMLElement | undefined;
  const hidePopover = () => { window.clearTimeout(hoverTimer); hoverTimer = undefined; popover?.remove(); popover = undefined; };
  /**
   * The card lives on the window's <body>, not inside the sheet: Obsidian's pane containers create their own
   * containing block, which would make position:fixed relative to the pane instead of the window.
   * It is placed just below-right of the pointer and kept inside the window.
   */
  const showPopover = (el: HTMLElement, x: number, y: number) => {
    const card = detailCard(el.dataset.ref ?? "", ctl); if (!card) return;
    const doc = root.ownerDocument, win = doc.defaultView ?? window;
    popover = h("div", { cls: "fe-popover", attrs: { role: "tooltip" } }, card); doc.body.append(popover);
    const w = popover.offsetWidth, ph = popover.offsetHeight, gap = 14;
    let left = x + gap, top = y + gap;
    if (left + w > win.innerWidth - 8) left = x - gap - w;          // flip to the left of the pointer
    if (top + ph > win.innerHeight - 8) top = y - gap - ph;         // flip above the pointer
    popover.style.left = `${Math.max(8, left)}px`; popover.style.top = `${Math.max(8, top)}px`;
  };
  const refOf = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>("[data-ref]") ?? null;
  const onOver = (e: MouseEvent) => {
    if (touch || window.matchMedia?.("(hover: none)")?.matches) return;   // touch: tap opens the panel instead
    const el = refOf(e); if (!el) return;
    const from = (e.relatedTarget as Node | null);
    if (from && el.contains(from)) return;      // moving between children of the same name
    const x = e.clientX, y = e.clientY;
    hidePopover(); hoverTimer = window.setTimeout(() => { hoverTimer = undefined; showPopover(el, x, y); }, HOVER_MS);
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
  /** Nearest ancestor that scrolls (Obsidian's .view-content); re-rendering must not reset its position. */
  const scrollParent = (): HTMLElement | null => {
    for (let el: HTMLElement | null = root; el; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if (o === "auto" || o === "scroll" || el.classList.contains("view-content")) return el;
    }
    return null;
  };
  const render = () => {
    const sp = scrollParent(), keepTop = sp?.scrollTop ?? 0;
    const features = ctl.isNpc ? NPC_FEATURES : CHARACTER_FEATURES;
    const layout = layoutFor(ctl.isNpc, layoutName), visible = new Set(ctl.visible([...features])), st = ctl.stats();
    const body = root.querySelector<HTMLElement>(".fe-panel-body"), was = body ? { kind: (body.parentElement as HTMLElement).dataset.panel, top: body.scrollTop } : undefined;
    // a search box or form field the player is typing in keeps its focus and caret across the redraw
    const live = root.ownerDocument.activeElement as HTMLInputElement | null, keepKey = live && root.contains(live) ? live.dataset.keep : undefined;
    const caret = keepKey ? ([live!.selectionStart, live!.selectionEnd, live!.selectionDirection] as const) : undefined;
    hidePopover(); clear(root);
    // classList, never className: `root` is Obsidian's .view-content, and that class is what makes the pane scroll
    root.classList.remove(...LAYOUT_CLASSES); root.classList.add("fe-sheet", `fe-${layoutName}`); root.classList.toggle("is-editing", ctl.editing);
    if (ctl.errors.length) root.append(h("div", { cls: "fe-banner", data: { feature: "problems" } },
      h("b", { text: "This note has errors, so the sheet is read-only:" }), h("ul", {}, ...ctl.errors.map(e => h("li", { text: e })))));
    if (!st) { root.append(h("div", { cls: "fe-banner", text: "This NPC's creature is not in the compendium." })); return; }
    const slot = (f: string) => {
      if (!visible.has(f) || !RENDER[f]) return null;
      const el = RENDER[f](ctl, st); el.dataset.feature = f; return el;
    };
    // a group of tiles is one row; it vanishes when every tile in it is hidden
    const statRow = (fs: readonly string[]): HTMLElement | null => {
      const tiles = fs.map(slot).filter((e): e is HTMLElement => e !== null);
      return tiles.length ? h("div", { cls: "fe-stat-row", data: { row: "stats" } }, ...tiles) : null;
    };
    root.append(h("div", { cls: "fe-pinned" }, ...layout.pinned.map(slot)));
    const tabs = layout.tabs.filter(t => t.columns.flat(2).some(f => visible.has(f)));
    const active = tabs.find(t => t.id === ctl.tab) ?? tabs[0];
    const nav = h("nav", { cls: "fe-tabs", data: { feature: "tabs" } }, ...tabs.map(t =>
      h("button", { cls: `fe-tab ${t === active ? "is-on" : ""}`, text: t.label, data: { tab: t.id }, on: { click: () => ctl.setTab(t.id) } })));
    nav.style.setProperty("--fe-tabs", String(tabs.length));
    root.append(nav);
    // every tab is rendered (inactive ones hidden) so each feature exists in the DOM once
    for (const t of tabs) {
      // a tab that opens with the abilities column sizes it to its content; the other columns share the rest (desktop CSS)
      const checks = t.columns.length > 1 && t.columns[0][0] === "abilities";
      const pane = h("div", { cls: `fe-pane ${checks ? "has-checks" : ""}`.trim(), data: { pane: t.id } },
        ...t.columns.map((col, i) => h("div", { cls: `fe-col ${checks && i === 0 ? "fe-col-checks" : ""}`.trim() }, ...col.map(s => typeof s === "string" ? slot(s) : statRow(s)))));
      if (checks) pane.style.setProperty("--fe-rest", String(t.columns.length - 1));
      pane.hidden = t !== active; root.append(pane);
    }
    if (ctl.panel) {
      const panel = renderPanel(ctl, ctl.panel, features);
      root.append(h("div", { cls: "fe-scrim", on: { click: () => ctl.close() } }), panel);
      // a form that redraws (a step added) stays scrolled where it was
      if (was && was.kind === ctl.panel.kind) panel.querySelector<HTMLElement>(".fe-panel-body")!.scrollTop = was.top;
    }
    const focusKey = ctl.focusNext; ctl.focusNext = undefined;
    const target = !touch && focusKey ? root.querySelector<HTMLInputElement>(`[data-keep="${focusKey}"]`)
      : keepKey ? root.querySelector<HTMLInputElement>(`[data-keep="${keepKey}"]`)
      : !touch && ctl.panel && (!was || was.kind !== ctl.panel.kind) ? root.querySelector<HTMLInputElement>(".fe-panel [data-autofocus]") : null;
    if (target) {
      target.focus();
      if (keepKey && caret && target.dataset.keep === keepKey) { try { target.setSelectionRange(caret[0], caret[1], caret[2] ?? undefined); } catch { /* number inputs have no caret */ } }
    }
    const it = ctl.toastItem, r = it?.kind === "roll" ? it.roll : undefined;
    const toast = h("div", { cls: `fe-toast ${r ? (r.crit ? "is-crit" : r.fumble ? "is-fumble" : "") : ""}`, data: { feature: "roll-result" } },
      r ? h("div", { cls: "fe-muted", text: r.title }) : null, r && (r.dice.length || r.total !== 0) ? h("div", { cls: "fe-toast-total", text: String(r.total) }) : null, r ? h("div", { cls: "fe-mono", text: r.detail }) : null,
      it?.kind === "notice" ? h("div", { text: it.text }) : null);
    const fresh = !!it && it !== shownItem;   // a new item starts the timer; later renders keep it visible until the timer ends
    if (fresh) {
      shownItem = it; toastLive = true; window.clearTimeout(toastTimer);
      const ms = it?.kind === "notice" && it.text.length > 40 ? TOAST_LONG_MS : TOAST_MS;
      toastTimer = window.setTimeout(() => { toastLive = false; if (toastEl) toastEl.hidden = true; }, ms);
    }
    toast.hidden = !(toastLive && !!it); toastEl = toast;
    root.append(toast);
    if (sp && keepTop) sp.scrollTop = keepTop;
  };
  const off = ctl.subscribe(render); render();
  return { render, destroy: () => {
    off(); window.clearTimeout(toastTimer); hidePopover(); clear(root);
    root.classList.remove("fe-sheet", ...LAYOUT_CLASSES, "is-editing");
    root.removeEventListener("mouseover", onOver); root.removeEventListener("mouseout", onOut); root.removeEventListener("click", onClick);
    window.removeEventListener("scroll", hidePopover, true);
  } };
}
