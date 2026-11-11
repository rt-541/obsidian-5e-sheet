import type { RollMode } from "../core/types";
import type { SheetController } from "./controller";
import { h } from "./h";

const STOPS: { mode: RollMode; label: string }[] = [
  { mode: "dis", label: "Disadvantage" }, { mode: "normal", label: "Normal" }, { mode: "adv", label: "Advantage" },
];

/** A three-position slider: Disadvantage, Normal, Advantage. It sits right above Attacks; one roll snaps it back to Normal. */
export function rollModeSlider(ctl: SheetController): HTMLElement {
  const pos = STOPS.findIndex(s => s.mode === ctl.mode);
  const stops = STOPS.map(s => h("button", {
    cls: "fe-slider-stop", data: { mode: s.mode, keep: `roll-mode-${s.mode}` },
    attrs: { type: "button", role: "radio", "aria-checked": String(ctl.mode === s.mode), "aria-label": s.label, tabindex: ctl.mode === s.mode ? "0" : "-1" },
    on: { click: () => { ctl.focusNext = `roll-mode-${s.mode}`; ctl.setMode(s.mode); } },
  }));
  const group = h("div", { cls: "fe-roll-mode", attrs: { role: "radiogroup", "aria-label": "Roll mode" } },
    h("span", { cls: "fe-roll-mode-end", text: "Disadvantage", data: { ref: "glossary:disadvantage" } }),
    h("div", { cls: "fe-slider", data: { pos: String(pos) } }, ...stops, h("span", { cls: "fe-slider-knob", attrs: { "aria-hidden": "true" } })),
    h("span", { cls: "fe-roll-mode-end", text: "Advantage", data: { ref: "glossary:advantage" } }));
  group.addEventListener("keydown", e => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(2, pos + d));
    if (next !== pos) { ctl.focusNext = `roll-mode-${STOPS[next].mode}`; ctl.setMode(STOPS[next].mode); }
  });
  return group;
}
