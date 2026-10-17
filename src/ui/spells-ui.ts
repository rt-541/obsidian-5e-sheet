import type { SpellData } from "../content/types";
import { spellRows, type SpellRow } from "../core/spells";
import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { clear, h, sgn } from "./h";

const btn = (text: string, onClick: () => void, cls = "", data?: Record<string, string>) =>
  h("button", { cls: `fe-btn ${cls}`.trim(), text, ...(data ? { data } : {}), on: { click: onClick } });
const ABIL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" } as const;
const levelTitle = (n: number) => n === 0 ? "Cantrips" : `Level ${n}`;

function costLabel(src: Extract<SpellRow["source"], { kind: "item" }>): string {
  const c = src.cost;
  return c.kind === "charges" ? `${c.amount} charge${c.amount === 1 ? "" : "s"}` : c.kind === "perDay" ? `${src.usesLeft ?? c.uses}/${c.uses} per day` : "at will";
}

function rolls(ctl: SheetController, r: SpellRow): (Node | null)[] {
  return [
    r.attack !== undefined ? h("button", { cls: "fe-roll", text: sgn(r.attack), title: "Spell attack", on: { click: (e: MouseEvent) => ctl.roll(`${r.name} attack`, r.attack!, { kind: "attack", range: r.data?.attack }, e) } }) : null,
    r.dc !== undefined && r.data?.save ? h("span", { cls: "fe-faint", text: `DC ${r.dc} ${ABIL[r.data.save.abil]}` }) : null,
    r.damage ? h("button", { cls: "fe-roll", text: r.damage, title: "Damage", on: { click: () => ctl.damage(`${r.name} damage`, r.damage!) } }) : null,
    r.heal ? h("button", { cls: "fe-roll", text: r.heal, title: "Healing", on: { click: () => ctl.damage(`${r.name} healing`, r.heal!) } }) : null,
  ];
}

function nameCell(r: SpellRow): HTMLElement {
  return h("div", { cls: "fe-grow" }, h("span", { cls: `fe-spell-name ${r.known ? "" : "is-missing"}`, text: r.known ? r.name : `${r.id} (missing from compendium)`, ...(r.known ? { data: { ref: `spell:${r.id}` } } : {}) }),
    r.concentration ? h("span", { cls: "fe-src", text: "C" }) : null);
}

function ownRow(ctl: SheetController, r: SpellRow, index: number): HTMLElement {
  const prepared = r.source.kind === "own" && r.source.prepared;
  return h("div", { cls: "fe-inv", data: { spell: r.id } },
    r.level >= 1 && r.known ? h("button", { cls: `fe-dot ${prepared ? "is-prof" : ""}`, title: prepared ? "Prepared" : "Not prepared", attrs: { "aria-label": `Prepared: ${r.name}` },
      data: { act: "prepare" }, on: { click: () => ctl.dispatch({ type: "prepare", index, on: !prepared }) } }) : null,
    nameCell(r), ...rolls(ctl, r),
    r.known ? btn("Cast", () => r.level >= 1 ? ctl.open({ kind: "cast", spell: r.id }) : ctl.cast(r.id), "", { act: "cast" }) : null,
    ctl.editing ? btn("Remove", () => ctl.dispatch({ type: "removeSpell", index }), "", { act: "remove-spell" }) : null);
}

export function spellsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character!, rows = spellRows(c, st, ctl.ctx());
  const head = h("div", { cls: "fe-kv" }, h("span", { text: st.spellcasting ? `Spell DC ${st.spellcasting.dc} · attack ${sgn(st.spellcasting.attack)} · ${ABIL[st.spellcasting.abil]}` : "No spellcasting" }),
    h("span", { cls: "fe-muted", text: st.slots.map(s => `${s.level === "pact" ? "P" : s.level}: ${s.max - s.used}/${s.max}`).join("  ") }));
  const byLevel = new Map<number, { r: SpellRow; i: number }[]>();
  rows.own.forEach((r, i) => { const l = r.known ? r.level : 0; byLevel.set(l, [...(byLevel.get(l) ?? []), { r, i }]); });
  const own = [...byLevel.keys()].sort((a, b) => a - b).map(l => h("div", { cls: "fe-spell-group", data: { level: String(l) } },
    h("div", { cls: "fe-card-title", text: levelTitle(l) }), ...byLevel.get(l)!.map(x => ownRow(ctl, x.r, x.i))));
  const items = new Map<number, SpellRow[]>();
  for (const r of rows.fromItems) if (r.source.kind === "item") items.set(r.source.itemIndex, [...(items.get(r.source.itemIndex) ?? []), r]);
  const fromItems = [...items.entries()].map(([idx, list]) => h("div", {},
    h("div", { cls: "fe-card-title", text: (list[0].source as { itemName: string }).itemName }),
    ...list.map(r => h("div", { cls: "fe-inv", data: { spell: r.id } }, nameCell(r), ...rolls(ctl, r),
      h("span", { cls: "fe-faint", text: costLabel(r.source as Extract<SpellRow["source"], { kind: "item" }>) }),
      r.known ? btn("Cast", () => ctl.cast(r.id, r.castLevel !== r.level ? r.castLevel : undefined, idx), "", { act: "cast" }) : null))));
  return h("div", { cls: "fe-card fe-spells" }, head,
    h("div", { cls: "fe-card-title", text: "Your spells" }),
    ...(own.length ? own : [h("div", { cls: "fe-faint", text: "No spells yet." })]),
    ctl.editing ? btn("Add spell", () => ctl.open({ kind: "add-spell" }), "", { act: "add-spell" }) : null,
    h("div", { data: { fromItems: "" } }, h("div", { cls: "fe-card-title", text: "From items" }),
      ...(fromItems.length ? fromItems : [h("div", { cls: "fe-faint", text: "None from equipped items." })])));
}

export function concentrationFeature(ctl: SheetController): HTMLElement {
  const id = ctl.character?.concentration;
  if (!id) return h("div", { cls: "fe-conc fe-faint", text: "Not concentrating" });
  const sp = ctl.host.registry.get<SpellData>("spell", id);
  return h("div", { cls: "fe-conc" }, h("span", { cls: `fe-chip ${sp ? "" : "is-missing"}`, text: sp ? `Concentrating: ${sp.name}` : `${id} (missing from compendium)`, ...(sp ? { data: { ref: `spell:${id}` } } : {}) }),
    btn("End", () => ctl.dispatch({ type: "endConcentration" }), "", { act: "end-concentration" }));
}

let castLevel: number | undefined;
export function castPanel(ctl: SheetController, spell: string): HTMLElement {
  const sp = ctl.host.registry.get<SpellData>("spell", spell), st = ctl.stats()!;
  if (!sp) return h("div", { cls: "fe-warn", text: "Spell missing from compendium" });
  const levels = [...new Set(st.slots.filter(s => s.used < s.max).map(s => s.level === "pact" ? s.pactLevel! : Number(s.level)).filter(l => l >= sp.data.level))].sort((a, b) => a - b);
  if (castLevel === undefined || !levels.includes(castLevel)) castLevel = levels[0];
  const chosen = castLevel;
  return h("div", {}, h("div", { cls: "fe-muted", text: `${sp.name}: choose a slot level` }),
    levels.length ? h("div", { cls: "fe-filters" }, ...levels.map(l => btn(`Level ${l}`, () => { castLevel = l; ctl.emit(); }, chosen === l ? "is-on" : "", { slot: String(l) }))) : h("div", { cls: "fe-warn", text: "No free spell slots." }),
    h("div", { cls: "fe-kv" }, btn("Cancel", () => ctl.close()),
      btn("Cast", () => { if (chosen !== undefined && ctl.cast(spell, chosen)) { castLevel = undefined; ctl.close(); } }, "mod-cta", { act: "cast-apply" })));
}

let showAll = false, query = "";
export function addSpellPanel(ctl: SheetController): HTMLElement {
  const c = ctl.character!, mine = new Set(c.classes.map(x => x.class)), owned = new Set(c.spells.map(s => s.id));
  const all = ctl.host.registry.list<SpellData>("spell");
  const list = h("div", {});
  const fill = () => {
    clear(list);
    const rows = all.filter(e => e.name.toLowerCase().includes(query) && (showAll || !mine.size || e.data.classes.some(k => mine.has(k))));
    for (const e of rows.slice(0, 80)) list.append(h("div", { cls: "fe-inv" },
      h("div", { cls: "fe-grow" }, h("span", { cls: "fe-spell-name", text: e.name, data: { ref: `spell:${e.id}`, noclick: "" } }), h("div", { cls: "fe-faint", text: `${levelTitle(e.data.level)} · ${e.data.school}` })),
      owned.has(e.id) ? h("span", { cls: "fe-faint", text: "added" }) : btn("Add", () => { ctl.dispatch({ type: "addSpell", id: e.id }); }, "", { add: e.id })));
    if (rows.length > 80) list.append(h("div", { cls: "fe-faint", text: `${rows.length - 80} more: narrow the search.` }));
    if (!rows.length) list.append(h("div", { cls: "fe-faint", text: "No spells match." }));
  };
  const search = h("input", { cls: "fe-search", attrs: { placeholder: "Search spells", value: query }, on: { input: (e: Event) => { query = (e.target as HTMLInputElement).value.toLowerCase(); fill(); } } });
  fill();
  return h("div", {}, search,
    h("label", { cls: "fe-kv" }, h("span", { text: "Show all classes" }),
      h("button", { cls: `fe-switch ${showAll ? "is-on" : ""}`, data: { act: "show-all" }, on: { click: () => { showAll = !showAll; ctl.emit(); } } })), list);
}
