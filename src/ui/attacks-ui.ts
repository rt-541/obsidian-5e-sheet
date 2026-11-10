import type { Entry } from "../content/registry";
import type { ItemData, MasteryData } from "../content/types";
import { masteryOptions } from "../core/levelup";
import { entryItem } from "../core/item-entry";
import type { ActorStats, AttackStat } from "../core/derive";
import type { Abil } from "../core/types";
import type { SheetController } from "./controller";
import { h, sgn } from "./h";
import { btn } from "./widgets";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const refData = (ref?: string, noclick = false, act?: string): { data: Record<string, string> } | Record<string, never> =>
  (ref || act ? { data: { ...(ref ? { ref } : {}), ...(ref && noclick ? { noclick: "" } : {}), ...(act ? { act } : {}) } } : {});

/** "1d8+3 slashing + 1d6 fire" -> "1d8+3 + 1d6": the damage type words drop off, the full text stays in the button's label. */
export function compactDamage(damage: string): string {
  return damage.split(" + ").map(t => t.trim().replace(/\s+[A-Za-z]+$/, "")).join(" + ");
}

/** The attack rows: name, `+N Atk / dice`, Crit on one line. Notes live in the hover card (desktop) or the tap panel (tablet, phone). */
export function attacksList(ctl: SheetController, st: ActorStats, who?: number): HTMLElement {
  if (!st.attacks.length) return h("div", { cls: "fe-faint", text: "No attacks" });
  return h("div", { cls: "fe-attacks" },
    who === undefined && st.kind === "character" && st.attacksPerAction > 1 ? h("div", { cls: "fe-muted fe-attacks-per", text: `Attacks per action: ${st.attacksPerAction}` }) : null,
    ...st.attacks.flatMap((a, ai) => {
      const noteRef = a.why ? `why:attack:${ai}` : a.note ? `attack-note:${who ?? "self"}:${ai}` : undefined;
      const own = who === undefined && st.kind === "character";
      const hit = a.toHit !== undefined
        ? h("button", { cls: "fe-roll fe-atk", text: `${sgn(a.toHit)} Atk`, ...refData(a.why?.hit ? `why:attack:${ai}:hit` : undefined, true, "to-hit"),
          on: { click: (e: MouseEvent) => { if (own) ctl.attackRoll(ai, e); else ctl.roll(`${a.name} to hit`, a.toHit!, a.target, e, who); } } })
        : a.save ? h("span", { cls: "fe-faint fe-atk-save", text: `DC ${a.save.dc} ${ABIL_NAME[a.save.abil]}` }) : null;
      const armed = own && ctl.hitWindow?.ai === ai ? ctl.hitWindow : null, shown = armed?.crit && a.critDamage ? a.critDamage : a.damage;
      // the damage button doubles as the hit prompt. Own-dice rows hold both labels stacked in one grid cell (the unused one hidden),
      // so the button is always as wide as the longer label and nothing slides sideways when the window opens or closes.
      const plain = a.damage ? compactDamage(a.damage) : "", hitWord = armed?.crit ? "Crit!" : "Hit?";
      const dmg = a.damage
        ? h("button", { cls: `fe-roll fe-atk-dmg${armed ? " fe-hit-armed" : ""}${own ? " fe-lbl-stack" : ""}`,
          ...(own ? {} : { text: plain }),
          title: armed ? `${a.name}: tap if it hit. Damage ${shown}` : `${a.name} damage: ${a.damage}`,
          attrs: { "aria-label": armed ? `${a.name}: did it hit? Roll damage ${shown}` : `${a.name} damage: ${a.damage}` },
          ...refData(a.why?.damage ? `why:attack:${ai}:damage` : undefined, true, "damage"),
          on: { click: () => { if (own) ctl.attackDamage(ai, armed?.crit ?? false); else ctl.damage(`${a.name} damage`, a.damage!); } } },
          ...(own ? [h("span", { cls: `fe-lbl fe-lbl-dice${armed ? " fe-lbl-off" : ""}`, text: plain }),
            h("span", { cls: `fe-lbl fe-lbl-hit${armed ? "" : " fe-lbl-off"}`, text: hitWord, attrs: { "aria-hidden": "true" } })] : []))
        : null;
      const row = h("div", { cls: "fe-attack", data: { attack: String(ai) } },
        h("span", { cls: "fe-grow", text: a.name, ...refData(noteRef) }),
        a.mastery ? h("button", { cls: "fe-mastery-chip", text: a.mastery.name, attrs: { type: "button", "aria-label": `${a.name}: weapon mastery ${a.mastery.name}` }, data: { ref: `mastery:${a.mastery.id}` } }) : null,
        a.note ? h("span", { cls: "fe-faint fe-attack-note-mark", text: "notes", ...refData(noteRef) }) : null,
        h("span", { cls: "fe-attack-ctl" },
          gripSwitch(ctl, a, who),
          hit, hit && dmg ? h("span", { cls: "fe-faint fe-attack-sep", text: "/" }) : null, dmg,
          a.critDamage ? h("button", { cls: "fe-roll fe-crit", text: "Crit", data: { act: "crit" }, title: `Damage on a critical hit: ${a.critDamage}`, attrs: { "aria-label": `${a.name} critical hit damage` },
            on: { click: () => { if (own) ctl.attackDamage(ai, true); else ctl.damage(`${a.name} critical damage`, a.critDamage!); } } }) : null,
          ));
      const asking = who === undefined && a.grip && a.grip.shield && a.item !== undefined && ctl.gripPrompt === a.item;
      if (!asking) return [row];
      const item = a.item!;
      const put = btn("Put away shield", () => { ctl.setHands(item, 2, true); }); put.dataset.act = "put-away-shield";
      const no = btn("Not now", () => ctl.askGrip(null)); no.dataset.act = "grip-cancel";
      return [row, h("div", { cls: "fe-kv fe-grip-prompt", data: { note: "grip-shield" } }, h("span", { text: "Put away your shield to use two hands." }), h("span", { cls: "fe-seg" }, put, no))];
    }));
}

/** 1H | 2H for a versatile weapon on the character's own rows; 2H is greyed (not disabled, so a tap still asks) while a shield is on. */
function gripSwitch(ctl: SheetController, a: AttackStat, who?: number): HTMLElement | null {
  if (who !== undefined || !a.grip || a.item === undefined) return null;
  const item = a.item, g = a.grip, blocked = g.shield;
  const row = ctl.character?.inventory[item], oneHand = row ? entryItem(row, ctl.host.registry)?.weapon?.dmg : undefined;
  const opt = (hands: 1 | 2, label: string, title: string, greyed: boolean) => h("button", { cls: `fe-mode-opt${g.hands === hands ? " is-on" : ""}${greyed ? " is-blocked" : ""}`, text: label, title,
    data: { hands: String(hands) }, attrs: { "aria-pressed": String(g.hands === hands), ...(greyed ? { "aria-disabled": "true" } : {}) },
    on: { click: () => { if (greyed) ctl.askGrip(item); else ctl.setHands(item, hands); } } });
  return h("div", { cls: "fe-seg fe-grip", attrs: { role: "group", "aria-label": `${a.name}: one or two hands` } },
    opt(1, "1H", `One hand: ${oneHand ?? a.damage ?? ""}`, false),
    opt(2, "2H", blocked ? "Put away your shield to use two hands" : `Two hands: ${g.twoHanded}`, blocked));
}

/** Edit mode, inside the Attacks card: the mastered weapons, each with a Change button that offers the same weapons the level-up does (minus the ones already mastered). */
export function masteryEdit(ctl: SheetController): HTMLElement | null {
  const c = ctl.character; if (!ctl.editing || !c?.mastery?.length) return null;
  const reg = ctl.host.registry;
  return h("div", { cls: "fe-mastery-edit", data: { block: "weapon-mastery" } },
    h("div", { cls: "fe-muted", text: "Weapon mastery" }),
    ...c.mastery.flatMap(id => {
      // untyped on purpose: c.mastery names library weapons, not inventory rows
      const item = reg.get("item", id) as Entry<ItemData> | undefined, prop = item?.data.weapon?.mastery, note = prop ? reg.get<MasteryData>("mastery", prop) : undefined;
      const open = ctl.masteryChanging === id;
      const row = h("div", { cls: "fe-kv", data: { masteryRow: id } },
        h("span", { cls: "fe-grow", text: item?.name ?? id }),
        note ? h("span", { cls: "fe-faint", text: note.data.name }) : null,
        h("button", { cls: "fe-mastery-change", text: open ? "Cancel" : "Change", attrs: { type: "button", "aria-label": `Change mastery of ${item?.name ?? id}` },
          on: { click: () => ctl.changeMastery(open ? null : id) } }));
      if (!open) return [row];
      const opts = masteryOptions(ctl.pickers(), c).filter(o => !o.disabled);
      return [row, h("div", { cls: "fe-mastery-options", data: { masteryPick: id } },
        ...(opts.length ? opts.map(o => h("button", { cls: "fe-mastery-option", text: o.text ? `${o.name} (${o.text})` : o.name, attrs: { type: "button" }, data: { id: o.id },
          on: { click: () => ctl.dispatch({ type: "mastery", out: id, in: o.id }) } })) : [h("div", { cls: "fe-faint", text: "No other weapon to choose." })]))];
    }),
    h("div", { cls: "fe-faint", text: "You can change these after a long rest." }));
}
