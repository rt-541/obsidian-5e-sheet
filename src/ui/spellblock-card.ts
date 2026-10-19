import { LEVEL_LABELS, validateSpellDraft, type SpellDraft } from "../content/spell-note";
import { parseSpellblock } from "../content/spellblock";
import { ABIL_NAMES } from "../content/creature-note";
import { h } from "./h";

/**
 * The card a ```5e-spell block shows in a note: the spell read from the text, anything that could not be read, and an
 * "Add to compendium" button that saves it as a Homebrew spell. `save` writes the note and resolves to where it went.
 */
export function renderSpellblock(el: HTMLElement, source: string, save: (draft: SpellDraft) => Promise<{ name: string; path: string }>): void {
  const { draft: d, unread } = parseSpellblock(source);
  const problems = validateSpellDraft(d);
  const comps = [d.v ? "V" : "", d.s ? "S" : "", d.m ? "M" : ""].filter(Boolean).join(", ") + (d.m && d.material ? ` (${d.material})` : "");
  const line = (label: string, value: string | undefined) => value ? h("div", {}, h("b", { text: `${label} ` }), value) : null;
  const status = h("div", { cls: "fe-sb-status", attrs: { role: "status" } });
  const add = h("button", { cls: "fe-btn mod-cta", text: "Add to compendium", attrs: { type: "button" }, data: { act: "add-to-compendium" } });
  add.disabled = problems.length > 0;
  add.addEventListener("click", () => {
    add.disabled = true;
    save(d).then(r => { status.className = "fe-sb-status"; status.textContent = `Saved ${r.name} to ${r.path}. Add it to a character from the Spells tab.`; add.textContent = "Added"; },
      (err: unknown) => { add.disabled = false; status.className = "fe-sb-status fe-warn"; status.textContent = err instanceof Error ? err.message : String(err); });
  });
  el.append(h("div", { cls: "fe-sb fe-spellblock", data: { spellblock: d.name } },
    h("div", { cls: "fe-sb-name", text: d.name || "(no name)" }),
    h("div", { cls: "fe-faint", text: `${d.level === 0 ? `${d.school} cantrip` : `${LEVEL_LABELS[d.level] ?? `Level ${d.level}`} ${d.school.toLowerCase()}`}${d.ritual ? " (ritual)" : ""}` }),
    line("Casting Time", d.castingTime), line("Range", d.range), line("Components", comps),
    line("Duration", d.concentration ? `Concentration, ${d.duration.toLowerCase()}` : d.duration),
    ...d.description.split("\n\n").filter(Boolean).map(p => h("p", { text: p })),
    d.higherLevel ? h("p", {}, h("b", { text: "At Higher Levels. " }), d.higherLevel) : null,
    line("Classes", d.classes.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(", ")),
    d.dice || d.heal || d.save || d.attack ? h("div", { cls: "fe-faint", data: { detected: "" }, text: ["Sheet will roll:", d.attack ? `${d.attack} spell attack` : "", d.dice ? `${d.dice} ${d.dtype} damage` : "", d.heal ? `${d.heal}${d.healMod ? " + modifier" : ""} healing` : "",
      d.save ? `${ABIL_NAMES[d.save]} save` : ""].filter(Boolean).join(" · ") }) : null,
    unread.length ? h("div", { cls: "fe-warn", data: { unread: "" } }, h("div", { text: "I could not read these lines:" }), ...unread.map(l => h("div", { text: l }))) : null,
    problems.length ? h("div", { cls: "fe-warn", data: { problems: "" } }, h("div", { text: "To add this spell, fix these first:" }), ...problems.map(p => h("div", { text: p }))) : null,
    h("div", { cls: "fe-sb-actions" }, add), status));
}
