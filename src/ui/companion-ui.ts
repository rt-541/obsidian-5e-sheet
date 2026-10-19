import { sourceLabel } from "../content/registry";
import type { CreatureData } from "../content/types";
import { blankDraft, type Draft } from "../content/creature-note";
import { parseStatblock, STATBLOCK_TEMPLATE } from "../content/statblock";
import type { CompanionKind } from "../core/character";
import type { Panel, SheetController } from "./controller";
import { creatureForm } from "./creature-form";
import { clear, h } from "./h";
import { playBadge } from "./widgets";
import { titleCase } from "../core/words";

export const KIND_LABELS: Record<CompanionKind, string> = { familiar: "Familiar", companion: "Animal companion", steed: "Steed", summon: "Summon", sidekick: "Sidekick" };
const MAX_ROWS = 80;

interface State { mode: "pick" | "form" | "import"; query: string; cname: string; kind: CompanionKind; draft: Draft; unread: string[]; importText: string; showTemplate: boolean }
/** One state per opened panel: reopening the panel starts fresh, while a redraw of the same panel keeps what was typed. */
const states = new WeakMap<Panel, State>();

/** Kinds that are almost always animals: the picker lists beasts first for these. */
const BEAST_KINDS: CompanionKind[] = ["familiar", "companion", "steed"];

/** Creatures that match the search: names starting with it first, then names that merely contain it, each group A to Z. */
export function matchCreatures<T extends { name: string }>(all: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  if (!q) return [...all].sort(byName);
  const starts: T[] = [], inside: T[] = [];
  for (const e of all) { const n = e.name.toLowerCase(); if (n.startsWith(q)) starts.push(e); else if (n.includes(q)) inside.push(e); }
  return [...starts.sort(byName), ...inside.sort(byName)];
}

const btn = (label: string, onClick: () => void, cls = "", data?: Record<string, string>) =>
  h("button", { cls: `fe-btn ${cls}`.trim(), text: label, attrs: { type: "button" }, ...(data ? { data } : {}), on: { click: onClick } });

function facts(d: CreatureData): string {
  return [`${d.size} ${d.ctype}`, d.cr !== undefined ? `CR ${d.cr}` : "", `AC ${d.ac}`, `HP ${d.hp.average}`].filter(Boolean).join(" · ");
}

export function addCompanionPanel(ctl: SheetController, panel: Panel): HTMLElement {
  let st = states.get(panel);
  if (!st) { st = { mode: "pick", query: "", cname: "", kind: "familiar", draft: blankDraft(), unread: [], importText: "", showTemplate: false }; states.set(panel, st); }
  const s = st;
  const canMake = !!ctl.host.saveCreature;
  const root = h("div", { cls: "fe-companion-panel" });
  const body = h("div", {});
  const go = (mode: State["mode"]) => { s.mode = mode; draw(); };

  // Always shown: what the companion is called and what role it plays.
  const nameBox = h("input", { cls: "fe-search", attrs: { type: "text", placeholder: "Leave empty to use the creature's name", value: s.cname, "aria-label": "Nickname (optional)" },
    on: { input: (e: Event) => { s.cname = (e.target as HTMLInputElement).value; } } });
  const kindSel = h("select", { cls: "fe-cf-input", attrs: { "aria-label": "Kind of companion" }, on: { change: (e: Event) => { s.kind = (e.target as HTMLSelectElement).value as CompanionKind; if (s.mode === "pick") draw(); } } },
    ...(Object.keys(KIND_LABELS) as CompanionKind[]).map(k => h("option", { text: KIND_LABELS[k], attrs: { value: k, ...(k === s.kind ? { selected: "" } : {}) } })));
  const nameField = h("label", { cls: "fe-cf-field fe-cf-grow" }, h("span", { cls: "fe-cf-label", text: "Nickname (optional)" }), nameBox);
  root.append(h("div", { cls: "fe-cf-row" }, nameField,
    h("label", { cls: "fe-cf-field" }, h("span", { cls: "fe-cf-label", text: "Kind" }), kindSel)), body);

  const addCompanion = (id: string, fallbackName: string) => {
    ctl.dispatch({ type: "addCompanion", creature: id, name: s.cname.trim() || fallbackName, kind: s.kind });
    ctl.close();
  };
  const makeButtons = () => canMake ? h("div", { cls: "fe-cf-row", data: { make: "" } },
    btn("Add custom creature", () => { s.draft = { ...blankDraft(), name: titleCase(s.query.trim()) }; s.unread = []; go("form"); }, "", { act: "custom-creature" }),
    btn("Import from stat block", () => go("import"), "", { act: "import-statblock" })) : null;

  function drawPick() {
    const all = ctl.pickers().list<CreatureData>("creature");
    const list = h("div", {}), note = h("div", { cls: "fe-faint" });
    const fill = () => {
      clear(list);
      const rows = matchCreatures(all, s.query);
      // Familiars, animal companions and steeds are beasts nearly every time: list those first (stable, so A to Z holds inside each group).
      if (BEAST_KINDS.includes(s.kind)) rows.sort((a, b) => Number(b.data.ctype.toLowerCase() === "beast") - Number(a.data.ctype.toLowerCase() === "beast"));
      for (const e of rows.slice(0, MAX_ROWS)) list.append(h("div", { cls: "fe-inv" },
        h("div", { cls: "fe-grow" }, h("span", { cls: "fe-inv-name", text: e.name }), playBadge(sourceLabel(e)), h("div", { cls: "fe-faint", text: facts(e.data) })),
        btn("Add", () => addCompanion(e.id, e.name), "", { creature: e.id })));
      if (rows.length > MAX_ROWS) list.append(h("div", { cls: "fe-faint", text: `${rows.length - MAX_ROWS} more: narrow the search.` }));
      if (!rows.length) {
        list.append(h("div", { cls: "fe-faint", data: { empty: "" }, text: s.query.trim() ? `No creature called '${s.query.trim()}'.` : "There are no creatures in the compendium yet." }));
      }
      note.textContent = rows.length ? `${rows.length} creature${rows.length === 1 ? "" : "s"}` : "";
    };
    const search = h("input", { cls: "fe-search", attrs: { placeholder: "Search creatures", value: s.query, "aria-label": "Search creatures", type: "search" },
      on: { input: (e: Event) => { s.query = (e.target as HTMLInputElement).value; fill(); } } });
    fill();
    const make = makeButtons();
    body.append(...(make ? [make] : []), search, note, list);
    // Focus the search on desktop only: on a phone or tablet it would pop the keyboard over the list.
    const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
    if (!touch) window.setTimeout(() => search.focus(), 0);
  }

  function drawForm() {
    body.append(creatureForm({
      draft: s.draft, unread: s.unread,
      onCancel: () => go(s.unread.length || s.importText ? "import" : "pick"),
      onSave: async d => {
        const id = await ctl.host.saveCreature!(d);
        const made = ctl.host.registry.get<CreatureData>("creature", id);
        ctl.host.notify(`Saved ${made?.name ?? d.name} to your Homebrew creatures.`);
        addCompanion(id, made?.name ?? d.name);
      },
    }));
  }

  function drawImport() {
    const area = h("textarea", { cls: "fe-cf-input fe-cf-paste", attrs: { rows: "12", placeholder: "Paste the stat block here: from D&D Beyond, 5e.tools, a PDF, or a ```5e-statblock block from a note.", "aria-label": "Stat block text" }, text: s.importText,
      on: { input: (e: Event) => { s.importText = (e.target as HTMLTextAreaElement).value; } } });
    const msg = h("div", { cls: "fe-warn", attrs: { role: "alert" } }); msg.hidden = true;
    const fallback = h("div", {});
    const drawFallback = () => {
      clear(fallback);
      if (!s.showTemplate) return;
      const box = h("textarea", { cls: "fe-cf-input fe-cf-paste", attrs: { rows: "14", readonly: "", "aria-label": "Stat block template" }, text: STATBLOCK_TEMPLATE });
      fallback.append(h("div", { cls: "fe-faint", text: "Your device would not copy it for you. Select all of this text and copy it by hand." }), box);
      window.setTimeout(() => { box.focus(); box.select(); }, 0);
    };
    drawFallback();
    const copy = async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
        await navigator.clipboard.writeText(STATBLOCK_TEMPLATE);
        s.showTemplate = false; drawFallback(); ctl.host.notify("Template copied. Paste it into a note and fill it in.");
      } catch { s.showTemplate = true; drawFallback(); }
    };
    body.append(
      h("div", { cls: "fe-faint", text: "Paste a stat block and press Read. You can check everything before it is saved." }), area, msg,
      h("div", { cls: "fe-cf-row" },
        btn("Read stat block", () => {
          if (!s.importText.trim()) { msg.hidden = false; msg.textContent = "Paste a stat block first."; return; }
          const r = parseStatblock(s.importText);
          s.draft = r.draft; s.unread = r.unread; go("form");
        }, "mod-cta", { act: "read-statblock" }),
        btn("Copy template", () => { void copy(); }, "", { act: "copy-template" }),
        btn("Back", () => go("pick"), "", { act: "import-back" })), fallback);
  }

  function draw() {
    clear(body);
    if (s.mode === "form") drawForm(); else if (s.mode === "import") drawImport(); else drawPick();
  }
  draw();
  return root;
}
