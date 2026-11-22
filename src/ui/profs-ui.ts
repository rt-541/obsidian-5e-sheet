import type { ActorStats } from "../core/derive";
import type { SheetController } from "./controller";
import { h } from "./h";
import { card } from "./widgets";

type List = "languages" | "other";

/**
 * The Languages and proficiencies card: languages, then armor, weapon and tool proficiencies, each as chips.
 * Edit mode adds a box per list for the player's own entries (Smith's Tools after training); only those can be
 * removed here, since the others come from class, race and background.
 */
export function profsFeature(ctl: SheetController, st: ActorStats): HTMLElement {
  const c = ctl.character!;
  const own: Record<List, string[]> = { languages: c.languages, other: c.proficiencies.other ?? [] };
  const shown: Record<List, string[]> = { languages: st.languages ?? c.languages, other: st.otherProfs ?? own.other };
  const section = (list: List, title: string, empty: string) => {
    const chips = shown[list].map(v => h("span", { cls: "fe-chip fe-prof", data: { prof: v } }, h("span", { text: v }),
      ctl.editing && own[list].includes(v)
        ? h("button", { cls: "fe-chip-x", text: "x", attrs: { "aria-label": `Remove ${v}` }, data: { [list === "other" ? "removeOther" : "removeLanguages"]: v }, on: { click: () => ctl.dispatch({ type: "profRemove", list, value: v }) } })
        : null));
    let add: HTMLElement | null = null;
    if (ctl.editing) {
      const box = h("input", { cls: "fe-search", data: { keep: `prof-add-${list}` }, attrs: { type: "text", placeholder: list === "languages" ? "Add a language" : "Add a tool, armor or weapon", "aria-label": list === "languages" ? "Language to add" : "Proficiency to add" },
        on: { keydown: (e: KeyboardEvent) => { if (e.key === "Enter") go(); } } }) as HTMLInputElement;
      const go = () => { if (box.value.trim()) ctl.dispatch({ type: "profAdd", list, value: box.value }); };
      add = h("div", { cls: "fe-kv fe-prof-add" }, box, h("button", { cls: "fe-btn", text: "Add", data: { act: `prof-add-${list}` }, on: { click: go } }));
    }
    return h("div", { cls: "fe-prof-list", data: { list } }, h("div", { cls: "fe-muted", text: title }),
      chips.length ? h("div", { cls: "fe-chips" }, ...chips) : h("div", { cls: "fe-faint", text: empty }), add);
  };
  return card("Languages and proficiencies",
    section("languages", "Languages", "None yet"),
    section("other", "Armor, weapons and tools", "None yet"));
}
