import type { GrantsData, SubraceData } from "../content/types";
import { STANDARD_ARRAY, POINT_BUY_BUDGET, type ScoreMethod } from "../core/builder";
import { ABILS, type Abil } from "../core/types";
import type { BuilderController, BuilderPage } from "./builder";
import { clear, h } from "./h";
import { asiPage, choiceButton, optionalPage, pickPage, spellsPage, subclassPage } from "./levelup-ui";
import { btn, titleCase } from "./widgets";
import { sourceLabel } from "../content/registry";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const body = (step: string, ...kids: (Node | null)[]) => h("div", { cls: "fe-lu-body", data: { step } }, ...kids);
const hint = (text: string) => h("div", { cls: "fe-muted", text });

function racePage(ctl: BuilderController): HTMLElement {
  const reg = ctl.pickers(), d = ctl.draft;
  const subs = d.race ? reg.list<SubraceData>("subrace").filter(e => e.data.race === d.race) : [];
  return body("race", hint("Pick a race."),
    ...reg.list<GrantsData>("race").map(e => choiceButton(e.name, undefined, d.race === e.id, undefined, () => ctl.setRace(e.id), { race: e.id }, sourceLabel(e))),
    subs.length ? hint("Subrace") : null,
    ...(subs.length ? [choiceButton("No subrace", undefined, !d.subrace, undefined, () => ctl.setSubrace(undefined), { subrace: "" }),
      ...subs.map(e => choiceButton(e.name, undefined, d.subrace === e.id, undefined, () => ctl.setSubrace(e.id), { subrace: e.id }, sourceLabel(e)))] : []));
}

function backgroundPage(ctl: BuilderController): HTMLElement {
  const d = ctl.draft;
  return body("background", hint("Pick a background."),
    choiceButton("No background", undefined, !d.background, undefined, () => ctl.setBackground(undefined), { background: "" }),
    ...ctl.pickers().list<GrantsData>("background").map(e => choiceButton(e.name, undefined, d.background === e.id, undefined, () => ctl.setBackground(e.id), { background: e.id }, sourceLabel(e))));
}

const METHODS: [ScoreMethod, string][] = [["point-buy", "Point buy"], ["standard-array", "Standard array"], ["manual", "Manual"]];

function scoresPage(ctl: BuilderController): HTMLElement {
  const d = ctl.draft;
  const note = d.method === "point-buy" ? `${POINT_BUY_BUDGET - ctl.pointBuySpent()} of ${POINT_BUY_BUDGET} points left (scores 8 to 15)`
    : d.method === "standard-array" ? `Assign ${STANDARD_ARRAY.join(", ")} once each` : "Type the scores you rolled or were given";
  const rows = ABILS.map(a => {
    const less = btn("-", () => ctl.nudgeScore(a, -1)), more = btn("+", () => ctl.nudgeScore(a, 1));
    less.setAttribute("aria-label", `Less ${ABIL_NAME[a]}`); more.setAttribute("aria-label", `More ${ABIL_NAME[a]}`);
    const base = d.method === "point-buy" ? h("span", { cls: "fe-kv" }, less, h("span", { cls: "fe-name", text: String(d.scores[a]), data: { base: a } }), more)
      : d.method === "standard-array"
        ? h("select", { attrs: { "aria-label": `${ABIL_NAME[a]} score` }, data: { base: a }, on: { change: (e: Event) => ctl.setScore(a, +(e.target as HTMLSelectElement).value) } },
            ...STANDARD_ARRAY.map(n => h("option", { text: String(n), attrs: { value: String(n), ...(d.scores[a] === n ? { selected: "" } : {}) } })))
        : h("input", { cls: "fe-amt", data: { base: a }, attrs: { type: "number", min: "1", max: "30", value: String(d.scores[a]), "aria-label": `${ABIL_NAME[a]} score` },
            on: { change: (e: Event) => ctl.setScore(a, +(e.target as HTMLInputElement).value) } });
    const bLess = btn("-", () => ctl.nudgeBonus(a, -1)), bMore = btn("+", () => ctl.nudgeBonus(a, 1));
    bLess.setAttribute("aria-label", `Less ${ABIL_NAME[a]} bonus`); bMore.setAttribute("aria-label", `More ${ABIL_NAME[a]} bonus`);
    const bonus = d.bonus[a] ?? 0, fromRace = ctl.originBonus()[a] ?? 0, total = ctl.character.abilities[a];
    return h("div", { cls: "fe-kv", data: { abil: a } }, h("span", { cls: "fe-grow", text: ABIL_NAME[a] }), base,
      h("span", { cls: "fe-kv" }, bLess, h("span", { cls: "fe-faint", text: bonus ? sgn(bonus) : "+0", data: { bonus: a } }), bMore),
      fromRace ? h("span", { cls: "fe-faint", text: `race ${sgn(fromRace)}`, data: { origin: a } }) : null,
      h("span", { cls: "fe-name", text: `= ${total}`, data: { final: a } }));
  });
  return body("scores", h("div", { cls: "fe-filters" }, ...METHODS.map(([m, label]) => choiceButton(label, undefined, d.method === m, undefined, () => ctl.setMethod(m), { method: m }))),
    hint(note), hint("Right-hand buttons add bonuses by hand; a race's own ability increases are added for you."), ...rows);
}

function classPage(ctl: BuilderController): HTMLElement {
  const d = ctl.draft;
  return body("class", hint("Pick a class (level 1)."),
    ...ctl.pickers().list<{ name: string; hitDie: number }>("class").map(e => choiceButton(e.name, `d${e.data.hitDie}`, d.classId === e.id, undefined, () => ctl.setClass(e.id), { class: e.id }, sourceLabel(e))));
}

function equipmentPage(ctl: BuilderController): HTMLElement {
  const c = ctl.classData(), d = ctl.draft, e = d.equipment;
  if (!c) return body("equipment", hint("Pick a class first."));
  const gold = e?.kind === "gold" ? e.gold : undefined;
  return body("equipment", hint("Starting equipment or gold."),
    ...(c.equipment ?? []).map((items, i) => choiceButton(`Option ${i + 1}`, items.map(titleCase).join(", "), e?.kind === "option" && e.index === i, undefined, () => ctl.setEquipment({ kind: "option", index: i }), { equip: String(i) })),
    c.gold !== undefined ? h("div", { cls: "fe-kv" },
      choiceButton("Starting gold", `${c.gold}${gold !== undefined ? `: ${gold} gp` : ""}`, e?.kind === "gold", undefined, () => ctl.rollStartingGold(), { equip: "gold" }),
      h("input", { cls: "fe-amt", data: { field: "gold" }, attrs: { type: "number", min: "0", value: gold !== undefined ? String(gold) : "", placeholder: "gp", "aria-label": "Starting gold" },
        on: { change: (ev: Event) => { const n = +(ev.target as HTMLInputElement).value; ctl.setEquipment({ kind: "gold", gold: Number.isInteger(n) && n >= 0 ? n : -1 }); } } })) : null);
}

function namePage(ctl: BuilderController): HTMLElement {
  const d = ctl.draft, problems = ctl.problems();
  const create = btn(ctl.creating ? "Creating..." : "Create character", () => { void ctl.create(); }, "mod-cta");
  create.dataset.act = "bd-create"; create.disabled = problems.length > 0 || ctl.creating;
  const list = h("div", {});
  const fill = () => {
    clear(list);
    const pr = ctl.problems();
    if (pr.length) list.append(h("ul", {}, ...pr.map(m => h("li", { cls: "fe-warn", text: m }))));
    else { const p = ctl.preview(); list.append("error" in p ? h("div", { cls: "fe-warn", text: p.error }) : h("ul", {}, ...p.summary.map(l => h("li", { text: l })))); }
    create.disabled = pr.length > 0 || ctl.creating;
  };
  const input = h("input", { cls: "fe-search", data: { field: "name" }, attrs: { placeholder: "Character name", value: d.name, "aria-label": "Character name" },
    on: { input: (e: Event) => { ctl.draft = { ...ctl.draft, name: (e.target as HTMLInputElement).value }; delete ctl.error; fill(); } } });
  fill();
  return body("name", hint("Name the character."), input,
    h("input", { cls: "fe-search", data: { field: "campaign" }, attrs: { placeholder: "Campaign link, e.g. [[Ekron Campaign]] (optional)", value: d.campaign ?? "", "aria-label": "Campaign" },
      on: { change: (e: Event) => ctl.setCampaign((e.target as HTMLInputElement).value) } }),
    list, ctl.error ? h("div", { cls: "fe-warn", text: ctl.error }) : null, create);
}

function stepPage(ctl: BuilderController, p: Extract<BuilderPage, { id: "step" }>): HTMLElement {
  const s = p.step, st = { choices: ctl.draft.choices, view: ctl.view };
  switch (s.kind) {
    case "subclass": return subclassPage(ctl, s, st);
    case "asi": return asiPage(ctl, s, st);
    case "pick": return pickPage(ctl, s, st);
    case "optional": return optionalPage(ctl, s, st);
    case "spells": return spellsPage(ctl, s, st);
  }
}

const TITLES: Record<string, string> = { race: "Race", background: "Background", scores: "Ability scores", class: "Class", equipment: "Equipment", name: "Name" };

/** The builder wizard: one page per screen, Back and Next at the bottom, Create on the last page. */
export function builderView(ctl: BuilderController): HTMLElement {
  const pages = ctl.pages(), page = Math.max(0, Math.min(ctl.page, pages.length - 1)), cur = pages[page], last = page === pages.length - 1;
  const content = cur.id === "race" ? racePage(ctl) : cur.id === "background" ? backgroundPage(ctl) : cur.id === "scores" ? scoresPage(ctl) : cur.id === "class" ? classPage(ctl)
    : cur.id === "equipment" ? equipmentPage(ctl) : cur.id === "name" ? namePage(ctl) : stepPage(ctl, cur);
  const back = btn(page === 0 ? "Cancel" : "Back", () => { if (page === 0) ctl.host.close(); else ctl.go(page - 1); });
  back.dataset.act = "bd-back";
  const next = btn("Next", () => ctl.go(page + 1), "mod-cta"); next.dataset.act = "bd-next"; next.disabled = !ctl.ready(cur); next.hidden = last;
  const title = cur.id === "step" ? `${cur.step.source}: ${cur.step.label}` : TITLES[cur.id];
  return h("div", { cls: "fe-levelup", data: { page: String(page), builder: cur.id } },
    h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: `New character: ${title}` }), h("span", { cls: "fe-faint", text: `Step ${page + 1} of ${pages.length}` })),
    content, h("div", { cls: "fe-kv fe-lu-nav" }, back, next));
}

/** Mount the builder into `root` (a modal's content element); redraws on every change. */
export function mountBuilder(root: HTMLElement, ctl: BuilderController, mobile: boolean): { destroy(): void } {
  const cls = ["fe-sheet", "fe-builder", mobile ? "fe-mobile" : "fe-desktop"];
  const render = () => { clear(root); root.classList.add(...cls); root.append(builderView(ctl)); };   // keep the host's own classes
  const off = ctl.subscribe(render); render();
  return { destroy: () => { off(); clear(root); root.classList.remove(...cls); } };
}
