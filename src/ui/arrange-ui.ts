import { dropSlot, moveSlot, STAT_KEY, type MoveDir } from "../core/arrange";
import type { SheetController } from "./controller";
import { h } from "./h";
import type { LayoutName, LayoutSpec } from "./layouts";
import { SECTION_LABELS } from "./panels";

/** The slot being dragged (desktop). Module state: a drag never outlives one sheet's pointer gesture. */
let dragging: { tab: string; key: string } | undefined;

const ARROWS: [MoveDir, string, string][] = [["up", "^", "Move up"], ["down", "v", "Move down"], ["left", "<", "Move to the column on the left"], ["right", ">", "Move to the column on the right"]];
const nameOf = (key: string) => (key === STAT_KEY ? "Armor Class, initiative, speed, passive Perception" : SECTION_LABELS[key] ?? key);

export interface ArrangeCtx { ctl: SheetController; layout: LayoutName; spec: LayoutSpec; visible: ReadonlySet<string>; touch: boolean }

const save = (a: ArrangeCtx, tab: string, cols: string[][] | undefined) => { if (cols) a.ctl.dispatch({ type: "arrange", layout: a.layout, tab, columns: cols }); };

/**
 * Edit mode: one section wrapped with its move bar (name, then up / down / left / right; a button that cannot move is
 * disabled). On desktop the bar also drags; dropping on another section puts the dragged one before it.
 */
export function movable(a: ArrangeCtx, tab: string, key: string, el: HTMLElement): HTMLElement {
  const buttons = ARROWS.map(([dir, text, title]) => {
    const cols = moveSlot(a.spec, tab, key, dir, a.visible);
    const b = h("button", { cls: "fe-move-btn", text, title, attrs: { "aria-label": `${title}: ${nameOf(key)}` }, data: { act: `move-${dir}` }, on: { click: () => save(a, tab, moveSlot(a.spec, tab, key, dir, a.visible)) } }) as HTMLButtonElement;
    b.disabled = !cols;
    return b;
  });
  const bar = h("div", { cls: "fe-move", attrs: a.touch ? {} : { draggable: "true" }, on: {
    dragstart: (e: DragEvent) => { dragging = { tab, key }; e.dataTransfer?.setData("text/plain", key); },
    dragend: () => { dragging = undefined; },
  } }, h("span", { cls: "fe-grow fe-move-name", text: nameOf(key) }), ...buttons);
  return h("div", { cls: "fe-slot", data: { slot: key }, on: {
    dragover: (e: DragEvent) => { if (dragging?.tab === tab) e.preventDefault(); },
    drop: (e: DragEvent) => {
      if (!dragging || dragging.tab !== tab) return;
      e.preventDefault(); e.stopPropagation();
      const col = a.spec.tabs.find(t => t.id === tab)!.columns.findIndex(c => c.some(s => (typeof s === "string" ? s : STAT_KEY) === key));
      const from = dragging.key; dragging = undefined;
      save(a, tab, dropSlot(a.spec, tab, from, col, key));
    },
  } }, bar, el);
}

/** Edit mode: a column also takes a drop on its empty end. */
export function dropColumn(a: ArrangeCtx, tab: string, index: number, col: HTMLElement): HTMLElement {
  col.addEventListener("dragover", (e: DragEvent) => { if (dragging?.tab === tab) e.preventDefault(); });
  col.addEventListener("drop", (e: DragEvent) => {
    if (!dragging || dragging.tab !== tab) return;
    e.preventDefault();
    const from = dragging.key; dragging = undefined;
    save(a, tab, dropSlot(a.spec, tab, from, index, null));
  });
  return col;
}

/** Edit mode, top of a tab: how moving works, and Reset layout once this layout has an order of its own. */
export function arrangeHint(a: ArrangeCtx): HTMLElement {
  const own = !!a.ctl.character?.sheet.arrange?.[a.layout];
  return h("div", { cls: "fe-kv fe-move-hint", data: { part: "arrange-hint" } },
    h("span", { cls: "fe-grow fe-faint", text: a.touch ? "Move sections with the arrows on their bars." : "Move sections with the arrows on their bars, or drag a bar." }),
    own ? h("button", { cls: "fe-btn", text: "Reset layout", data: { act: "reset-arrange" }, on: { click: () => a.ctl.dispatch({ type: "arrange", layout: a.layout, columns: null }) } }) : null);
}
