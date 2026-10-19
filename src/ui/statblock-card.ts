import { ABIL_NAMES, validateDraft, type Draft } from "../content/creature-note";
import { parseStatblock } from "../content/statblock";
import { ABILS } from "../core/types";
import { h, sgn } from "./h";

const mod = (score: number) => Math.floor((score - 10) / 2);

/**
 * The card a ```5e-statblock block shows in a note: the creature read from the text, anything that could not be read, and an
 * "Add to compendium" button that saves it as a Homebrew creature. `save` writes the note and resolves to where it went.
 */
export function renderStatblock(el: HTMLElement, source: string, save: (draft: Draft) => Promise<{ name: string; path: string }>): void {
  const { draft: d, unread } = parseStatblock(source);
  const problems = validateDraft(d);
  const speeds = [`${d.speed.walk ?? 0} ft.`, ...(["climb", "fly", "swim"] as const).filter(k => d.speed[k]).map(k => `${k} ${d.speed[k]} ft.`)].join(", ");
  const line = (label: string, value: string | undefined) => value ? h("div", {}, h("b", { text: `${label} ` }), value) : null;
  const status = h("div", { cls: "fe-sb-status", attrs: { role: "status" } });
  const add = h("button", { cls: "fe-btn mod-cta", text: "Add to compendium", attrs: { type: "button" }, data: { act: "add-to-compendium" } });
  add.disabled = problems.length > 0;
  add.addEventListener("click", () => {
    add.disabled = true;
    save(d).then(r => { status.className = "fe-sb-status"; status.textContent = `Saved ${r.name} to ${r.path}. Add it as a companion from the sheet's Companions tab.`; add.textContent = "Added"; },
      (err: unknown) => { add.disabled = false; status.className = "fe-sb-status fe-warn"; status.textContent = err instanceof Error ? err.message : String(err); });
  });
  el.append(h("div", { cls: "fe-sb", data: { statblock: d.name } },
    h("div", { cls: "fe-sb-name", text: d.name || "(no name)" }),
    h("div", { cls: "fe-faint", text: `${d.size} ${d.ctype}${d.alignment ? `, ${d.alignment}` : ""}` }),
    line("Armor Class", d.ac === undefined ? undefined : `${d.ac}${d.acNote ? ` (${d.acNote})` : ""}`),
    line("Hit Points", d.hpAvg === undefined ? undefined : `${d.hpAvg}${d.hpFormula ? ` (${d.hpFormula})` : ""}`),
    line("Speed", speeds),
    h("div", { cls: "fe-sb-scores" }, ...ABILS.map(a => h("div", { cls: "fe-sb-score", title: ABIL_NAMES[a] }, h("b", { text: a.toUpperCase() }), h("div", { text: `${d.abilities[a]} (${sgn(mod(d.abilities[a]))})` })))),
    line("Saving Throws", ABILS.filter(a => d.saves[a] !== undefined).map(a => `${a.toUpperCase()} ${sgn(d.saves[a]!)}`).join(", ")),
    line("Skills", Object.entries(d.skills).map(([k, v]) => `${k.replace(/-/g, " ")} ${sgn(v)}`).join(", ")),
    line("Senses", d.senses), line("Languages", d.languages), line("Challenge", d.cr),
    ...d.extras.map(x => h("div", { text: x.replace(/\*\*/g, "") })),
    d.traits.length ? h("div", { cls: "fe-card-title", text: "Traits" }) : null,
    ...d.traits.map(t => h("div", {}, h("b", { text: `${t.name}. ` }), t.text)),
    d.attacks.length ? h("div", { cls: "fe-card-title", text: "Actions" }) : null,
    ...d.attacks.map(a => h("div", {}, h("b", { text: `${a.name}. ` }),
      [a.toHit !== undefined ? `${sgn(a.toHit)} to hit.` : "", a.save ? `DC ${a.save.dc} ${ABIL_NAMES[a.save.abil]} saving throw.` : "", a.damage ? `Damage ${a.damage}.` : "", a.note ?? ""].filter(Boolean).join(" "))),
    unread.length ? h("div", { cls: "fe-warn", data: { unread: "" } }, h("div", { text: "I could not read these lines:" }), ...unread.map(l => h("div", { text: l }))) : null,
    problems.length ? h("div", { cls: "fe-warn", data: { problems: "" } }, h("div", { text: "To add this creature, fix these first:" }), ...problems.map(p => h("div", { text: p }))) : null,
    h("div", { cls: "fe-sb-actions" }, add), status));
}
