import type { SheetController } from "./controller";
import { h } from "./h";
import { card } from "./widgets";
import { OWN_DICE } from "../rules";
import { editionRow } from "./edition-ui";

interface SettingOpt { text: string; on: boolean; attrs: Record<string, string>; click: () => void; }

/** One row: a label and a two-way segmented switch. Pressing the option that is already on does nothing. */
function row(setting: string, label: string, ...opts: SettingOpt[]): HTMLElement {
  return h("div", { cls: "fe-kv fe-setting", data: { setting } },
    h("span", { cls: "fe-grow", text: label }),
    h("div", { cls: "fe-seg", attrs: { role: "group", "aria-label": label } },
      ...opts.map(o => h("button", { cls: `fe-mode-opt ${o.on ? "is-on" : ""}`.trim(), text: o.text, data: o.attrs,
        attrs: { type: "button", "aria-pressed": String(o.on) }, on: { click: () => { if (!o.on) o.click(); } } }))));
}

/** The Settings card: switches you rarely touch (rest mode, Hex / Trad, rolling your own dice), kept out of the play area. */
export function settingsFeature(ctl: SheetController): HTMLElement {
  const rules = ctl.rules(), ex = !!rules["rest-excursion"], hex = !!rules["hexploration"], own = ctl.ownDice();
  return card("Settings",
    row("rest-mode", "Rest mode",
      { text: "Normal (short and long)", on: !ex, attrs: { restMode: "standard" }, click: () => ctl.setRule("rest-excursion", false) },
      { text: "Hexploration (night's rest)", on: ex, attrs: { restMode: "excursion" }, click: () => ctl.setRule("rest-excursion", true) }),
    row("hex", "Hex / Trad",
      { text: "Hex (rations and foraging)", on: hex, attrs: { opt: "on" }, click: () => ctl.setRule("hexploration", true) },
      { text: "Trad (no rations)", on: !hex, attrs: { opt: "off" }, click: () => ctl.setRule("hexploration", false) }),
    row("own-dice", "I roll my own dice",
      { text: "Off", on: !own, attrs: { opt: "off" }, click: () => ctl.setRule(OWN_DICE, false) },
      { text: "On", on: own, attrs: { opt: "on" }, click: () => ctl.setRule(OWN_DICE, true) }),
    editionRow(ctl));
}
