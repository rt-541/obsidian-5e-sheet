import { parseItemBlock, typeLine, validateItemDraft, type ItemDraft } from "../content/itemblock";
import { h } from "./h";

const money = (cp: number) => (cp % 100 === 0 ? `${cp / 100} gp` : cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`);

/**
 * The card a ```5e-item block shows in a note: the item read from the text, anything that could not be read, and an
 * "Add to compendium" button that saves it as a Homebrew item. `save` writes the note and resolves to where it went.
 */
export function renderItemBlock(el: HTMLElement, source: string, save: (draft: ItemDraft) => Promise<{ name: string; path: string }>): void {
  const { draft: d, unread } = parseItemBlock(source);
  const problems = validateItemDraft(d);
  const line = (label: string, value: string | undefined) => value ? h("div", {}, h("b", { text: `${label} ` }), value) : null;
  const bonus = (n: number | undefined) => (n === undefined ? undefined : n >= 0 ? `+${n}` : String(n));
  const status = h("div", { cls: "fe-sb-status", attrs: { role: "status" } });
  const add = h("button", { cls: "fe-btn mod-cta", text: "Add to compendium", attrs: { type: "button" }, data: { act: "add-to-compendium" } });
  add.disabled = problems.length > 0;
  add.addEventListener("click", () => {
    add.disabled = true;
    save(d).then(r => { status.className = "fe-sb-status"; status.textContent = `Saved ${r.name} to ${r.path}. Add it to a character from the sheet's Inventory tab.`; add.textContent = "Added"; },
      (err: unknown) => { add.disabled = false; status.className = "fe-sb-status fe-warn"; status.textContent = err instanceof Error ? err.message : String(err); });
  });
  el.append(h("div", { cls: "fe-sb fe-itemcard", data: { itemblock: d.name } },
    h("div", { cls: "fe-sb-name", text: d.name || "(no name)" }),
    h("div", { cls: "fe-faint", text: typeLine(d) }),
    line("Weight", d.weight === undefined ? undefined : `${d.weight} lb`), line("Cost", d.value === undefined ? undefined : money(d.value)),
    line("Charges", d.charges ? `${d.charges.max}, back ${({ dawn: "at dawn", short: "after a short rest", long: "after a long rest", none: "never" })[d.charges.reset]}` : undefined),
    line("Attack bonus", bonus(d.attackBonus)), line("Damage bonus", bonus(d.damageBonus)), line("Armor Class bonus", bonus(d.acBonus)), line("Healing", d.heal),
    ...d.description.split("\n\n").filter(Boolean).map(p => h("p", { text: p })),
    unread.length ? h("div", { cls: "fe-warn", data: { unread: "" } }, h("div", { text: "I could not read these lines:" }), ...unread.map(l => h("div", { text: l }))) : null,
    problems.length ? h("div", { cls: "fe-warn", data: { problems: "" } }, h("div", { text: "To add this item, fix these first:" }), ...problems.map(p => h("div", { text: p }))) : null,
    h("div", { cls: "fe-sb-actions" }, add), status));
}
