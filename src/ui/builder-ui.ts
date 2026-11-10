import { refFor, sameRef, splitRef } from "../content/edition";
import { EDITIONS, editionRules, otherEdition, type Edition } from "../core/edition";
import { generalChangeList } from "./edition-ui";
import { bringBackButton, bringInButton, editionChip } from "./bring-in";
import type { GrantsData, SubraceData } from "../content/types";
import { gearList, STANDARD_ARRAY, POINT_BUY_BUDGET, type ScoreMethod } from "../core/builder";
import { ABILS, type Abil } from "../core/types";
import type { BuilderController, BuilderPage } from "./builder";
import { clear, h } from "./h";
import { asiPage, choiceButton, featPage, optionalPage, patternPage, pickPage, spellsPage, stepCounter, subclassPage } from "./levelup-ui";
import { btn } from "./widgets";
import { backgroundPitch, classPitch, originPitch } from "./builder-pitch";
import { entryCard } from "./details";
import type { Entry } from "../content/registry";
import type { ClassData } from "../content/types";
import { sourceLabel } from "../content/registry";

const ABIL_NAME: Record<Abil, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
const body = (step: string, ...kids: (Node | null)[]) => h("div", { cls: "fe-lu-body", data: { step } }, ...kids);
const hint = (text: string) => h("div", { cls: "fe-muted", text });

/** A choice with its one-line pitch and an About button that opens the full card under it. */
function aboutRow(ctl: BuilderController, kind: string, e: Entry, pitch: string, on: boolean, pick: () => void): HTMLElement {
  const own = ctl.edition(), ref = refFor(e, own), open = ctl.view.about === ref;
  const about = h("button", { cls: `fe-btn fe-about ${open ? "is-on" : ""}`.trim(), text: "About", data: { act: "about", about: ref }, attrs: { type: "button", "aria-expanded": String(open), "aria-label": `About ${e.name}` }, on: { click: () => ctl.toggleAbout(ref) } });
  return h("div", { data: { row: kind } }, h("div", { cls: "fe-subclass" }, choiceButton(e.name, pitch || undefined, on, undefined, pick, { [kind]: ref }, sourceLabel(e)), editionChip(ref, own), about), open ? entryCard(ctl.pickers(), e) : null);
}

/** The picker view flag: showing the other edition's list of `key` (not saved). */
const isOther = (ctl: BuilderController, key: string): boolean => !!ctl.view.other?.has(key);
function setOther(ctl: BuilderController, key: string, on: boolean): void {
  const set = (ctl.view.other ??= new Set<string>());
  if (on) set.add(key); else set.delete(key);
  ctl.emit();
}
/** One picker list: the rows, then (own list) the Bring in button as its last child, or (other list) a Back link first. */
function pickList(ctl: BuilderController, key: string, what: string, lead: (HTMLElement | null)[], rows: HTMLElement[], reason?: string): HTMLElement {
  const on = isOther(ctl, key), own = ctl.edition();
  return h("div", { cls: "fe-pick-list", data: { list: key } },
    on ? h("div", { cls: "fe-cf-row", data: { brought: "" } }, h("span", { cls: "fe-muted", text: `${what} from the ${otherEdition(own)} books` }), bringBackButton(own, () => setOther(ctl, key, false))) : null,
    ...lead, ...rows,
    !on && reason ? h("div", { cls: "fe-warn", data: { empty: key }, text: reason }) : null,
    on && !rows.length ? h("div", { cls: "fe-faint", data: { empty: "" }, text: `Nothing of this kind in the ${otherEdition(own)} books.` }) : null,
    on ? null : bringInButton(otherEdition(own), () => setOther(ctl, key, true)));
}

/** The word for a race in the draft's edition. */
const raceWord = (ctl: BuilderController): string => editionRules(ctl.edition()).raceWord;

/** The first page: which rules the table uses. The default is pre-highlighted; the difference is explained inline (no sheet yet, so no panel). */
function editionPage(ctl: BuilderController): HTMLElement {
  const own = ctl.edition(), open = ctl.view.about === "edition";
  const about = h("button", { cls: `fe-btn fe-about ${open ? "is-on" : ""}`.trim(), text: "What is the difference?", data: { act: "about", about: "edition" }, attrs: { type: "button", "aria-expanded": String(open) }, on: { click: () => ctl.toggleAbout("edition") } });
  const target = ctl.view.switchTo as Edition | undefined, kinds = target ? ctl.pickedKinds(editionRules(target).raceWord.toLowerCase()) : [];
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}` : kinds.join("");
  return body("edition", h("div", { cls: "fe-name", text: "Which rules does your table use?" }),
    ...EDITIONS.map(e => choiceButton(e === target ? "Tap again to switch" : editionRules(e).label, e === target ? editionRules(e).label : undefined, e === own, undefined, () => ctl.chooseEdition(e), { edition: e })),
    target && kinds.length ? h("div", { cls: "fe-muted", data: { confirm: "edition" }, attrs: { role: "status" }, text: `Switching to the ${editionRules(target).label} clears your ${list} picks.` }) : null,
    about, open ? generalChangeList(own) : null);
}

function racePage(ctl: BuilderController): HTMLElement {
  const reg = ctl.pickers(), d = ctl.draft, own = ctl.edition(), word = raceWord(ctl);
  const races = isOther(ctl, "race") ? reg.listEdition<GrantsData>("race", otherEdition(own)) : reg.list<GrantsData>("race");
  const subOf = (list: Entry<SubraceData>[]) => d.race ? list.filter(e => e.data.race === splitRef(d.race!).id) : [];
  const ownSubs = subOf(reg.list<SubraceData>("subrace")), otherSubs = subOf(reg.listEdition<SubraceData>("subrace", otherEdition(own)));
  const subs = isOther(ctl, "subrace") ? otherSubs : ownSubs;
  const pick = (e: Entry<SubraceData>) => aboutRow(ctl, "subrace", e, originPitch(e, reg), !!d.subrace && sameRef(d.subrace, refFor(e, own), own), () => ctl.setSubrace(refFor(e, own)));
  return body("race", hint(`Pick a ${word.toLowerCase()}.`),
    pickList(ctl, "race", `${word}${/s$/.test(word) ? "" : "s"}`, [], races.map(e => aboutRow(ctl, "race", e, originPitch(e, reg), sameRef(d.race ?? "", refFor(e, own), own) && !!d.race, () => ctl.setRace(refFor(e, own)))), ctl.emptyReason("race")),
    ownSubs.length || otherSubs.length ? hint("Subrace") : null,
    ...(ownSubs.length || otherSubs.length ? [pickList(ctl, "subrace", "Subraces", [choiceButton("No subrace", undefined, !d.subrace, undefined, () => ctl.setSubrace(undefined), { subrace: "" })], subs.map(pick))] : []));
}

function backgroundPage(ctl: BuilderController): HTMLElement {
  const d = ctl.draft, own = ctl.edition(), reg = ctl.pickers();
  const list = isOther(ctl, "background") ? reg.listEdition<GrantsData>("background", otherEdition(own)) : reg.list<GrantsData>("background");
  return body("background", hint("Pick a background."),
    pickList(ctl, "background", "Backgrounds", [choiceButton("No background", undefined, !d.background, undefined, () => ctl.setBackground(undefined), { background: "" })],
      list.map(e => aboutRow(ctl, "background", e, backgroundPitch(e, reg), !!d.background && sameRef(d.background, refFor(e, own), own), () => ctl.setBackground(refFor(e, own)))), ctl.emptyReason("background")));
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
    const bonus = d.bonus[a] ?? 0, parts = ctl.originParts().filter(p => p.delta[a]), total = ctl.character.abilities[a];
    return h("div", { cls: "fe-kv", data: { abil: a } }, h("span", { cls: "fe-grow", text: ABIL_NAME[a] }), base,
      h("span", { cls: "fe-kv" }, bLess, h("span", { cls: "fe-faint", text: bonus ? sgn(bonus) : "+0", data: { bonus: a } }), bMore),
      parts.length ? h("span", { cls: "fe-faint", text: parts.map(p => `${p.source === "race" ? raceWord(ctl).toLowerCase() : p.source} ${sgn(p.delta[a]!)}`).join(", "), data: { origin: a } }) : null,
      h("span", { cls: "fe-name", text: `= ${total}`, data: { final: a } }));
  });
  return body("scores", h("div", { cls: "fe-filters" }, ...METHODS.map(([m, label]) => choiceButton(label, undefined, d.method === m, undefined, () => ctl.setMethod(m), { method: m }))),
    hint(note), hint(`Right-hand buttons add bonuses by hand; a ${raceWord(ctl).toLowerCase()}'s own ability increases are added for you${ctl.originParts().some(p => p.source === "background") ? ", and so are the background's" : ""}.`), ...rows);
}

function classPage(ctl: BuilderController): HTMLElement {
  const d = ctl.draft, own = ctl.edition(), reg = ctl.pickers();
  const list = isOther(ctl, "class") ? reg.listEdition<ClassData>("class", otherEdition(own)) : reg.list<ClassData>("class");
  return body("class", hint("Pick a class (level 1)."),
    pickList(ctl, "class", "Classes", [], list.map(e => aboutRow(ctl, "class", e, classPitch(e), !!d.classId && sameRef(d.classId, refFor(e, own), own), () => ctl.setClass(refFor(e, own)))), ctl.emptyReason("class")));
}

/** `5d4*10` read as "roll 5d4 × 10 gp". */
const goldWords = (dice: string) => `roll ${dice.replace(/\s*\*\s*/, " × ")} gp`;

function equipmentPage(ctl: BuilderController): HTMLElement {
  const c = ctl.classData(), d = ctl.draft, e = d.equipment;
  if (!c) return body("equipment", hint("Pick a class first."));
  const gold = e?.kind === "gold" ? e.gold : undefined;
  return body("equipment", hint("Starting equipment or gold."),
    ...(c.equipment ?? []).map((items, i) => choiceButton(`Option ${i + 1}`, gearList(items, ctl.pickers()), e?.kind === "option" && e.index === i, undefined, () => ctl.setEquipment({ kind: "option", index: i }), { equip: String(i) })),
    c.gold !== undefined ? h("div", { cls: "fe-kv" },
      choiceButton("Starting gold", `${goldWords(c.gold)}${gold !== undefined ? `: ${gold} gp` : ""}`, e?.kind === "gold", undefined, () => ctl.rollStartingGold(), { equip: "gold" }),
      h("input", { cls: "fe-amt", data: { field: "gold" }, attrs: { type: "number", min: "0", value: gold !== undefined ? String(gold) : "", placeholder: "gp", "aria-label": "Starting gold" },
        on: { change: (ev: Event) => { const n = +(ev.target as HTMLInputElement).value; ctl.setEquipment({ kind: "gold", gold: Number.isInteger(n) && n >= 0 ? n : -1 }); } } })) : null);
}

/** Create lives in the footer next to Back, so it is where the thumb already is after going back to fix something. */
function createButton(ctl: BuilderController): HTMLButtonElement {
  const create = btn(ctl.creating ? "Creating..." : "Create character", () => { void ctl.create(); }, "mod-cta");
  create.dataset.act = "bd-create"; create.disabled = ctl.problems().length > 0 || ctl.creating;
  return create;
}

function namePage(ctl: BuilderController, create: HTMLButtonElement): HTMLElement {
  const d = ctl.draft;
  const list = h("div", {});
  const fill = () => {
    clear(list);
    const pr = ctl.problems();
    if (pr.length) list.append(h("ul", {}, ...pr.map(m => h("li", { cls: "fe-warn", text: m }))));
    else { const p = ctl.preview(); list.append("error" in p ? h("div", { cls: "fe-warn", text: p.error }) : h("ul", {}, ...p.summary.map(l => h("li", { text: l })))); }
    create.disabled = pr.length > 0 || ctl.creating;
  };
  const input = h("input", { cls: "fe-search", data: { field: "name" }, attrs: { type: "text", placeholder: "Character name", value: d.name, "aria-label": "Character name" },
    on: { input: (e: Event) => { ctl.draft = { ...ctl.draft, name: (e.target as HTMLInputElement).value }; delete ctl.error; fill(); } } });
  fill();
  return body("name", hint("Name the character."), input,
    h("input", { cls: "fe-search", data: { field: "campaign" }, attrs: { type: "text", placeholder: "Campaign note name (optional)", value: d.campaign ?? "", "aria-label": "Campaign" },
      on: { change: (e: Event) => ctl.setCampaign((e.target as HTMLInputElement).value) } }),
    list, ctl.error ? h("div", { cls: "fe-warn", text: ctl.error }) : null);
}

function stepPage(ctl: BuilderController, p: Extract<BuilderPage, { id: "step" }>): HTMLElement {
  const s = p.step, st = { choices: ctl.draft.choices, view: ctl.view };
  switch (s.kind) {
    case "subclass": return subclassPage(ctl, s, st);
    case "asi": return asiPage(ctl, s, st);
    case "feat": return featPage(ctl, s, st);
    case "pick": return pickPage(ctl, s, st);
    case "pattern": return patternPage(ctl, s, st);
    case "optional": return optionalPage(ctl, s, st);
    case "spells": return spellsPage(ctl, s, st);
  }
}

const TITLES: Record<string, string> = { edition: "Rules", background: "Background", scores: "Ability scores", class: "Class", equipment: "Equipment", name: "Name" };

/** The builder wizard: one page per screen, Back and Next at the bottom, Create on the last page. */
export function builderView(ctl: BuilderController): HTMLElement {
  const create = createButton(ctl);
  const pages = ctl.pages(), page = Math.max(0, Math.min(ctl.page, pages.length - 1)), cur = pages[page], last = page === pages.length - 1;
  const content = cur.id === "edition" ? editionPage(ctl) : cur.id === "race" ? racePage(ctl) : cur.id === "background" ? backgroundPage(ctl) : cur.id === "scores" ? scoresPage(ctl) : cur.id === "class" ? classPage(ctl)
    : cur.id === "equipment" ? equipmentPage(ctl) : cur.id === "name" ? namePage(ctl, create) : stepPage(ctl, cur);
  const back = btn(page === 0 ? "Cancel" : "Back", () => { if (page === 0) ctl.host.close(); else ctl.go(page - 1); });
  back.dataset.act = "bd-back";
  const next = btn("Next", () => ctl.go(page + 1), "mod-cta"); next.dataset.act = "bd-next"; next.disabled = !ctl.ready(cur); next.hidden = last;
  const title = cur.id === "step" ? `${cur.step.source}: ${cur.step.label}` : cur.id === "race" ? raceWord(ctl) : TITLES[cur.id];
  return h("div", { cls: "fe-levelup", data: { page: String(page), builder: cur.id } },
    h("div", { cls: "fe-kv" }, h("span", { cls: "fe-name", text: `New character: ${title}` }), h("span", { cls: "fe-faint", text: stepCounter(page, pages.length, !!ctl.draft.classId) })),
    content, h("div", { cls: "fe-kv fe-lu-nav" }, back, ...(last ? [create] : [next])));
}

/** Mount the builder into `root` (a modal's content element); redraws on every change. */
export function mountBuilder(root: HTMLElement, ctl: BuilderController, mobile: boolean): { destroy(): void } {
  const cls = ["fe-sheet", "fe-builder", mobile ? "fe-mobile" : "fe-desktop"];
  const render = () => { clear(root); root.classList.add(...cls); root.append(builderView(ctl)); };   // keep the host's own classes
  const off = ctl.subscribe(render); render();
  return { destroy: () => { off(); clear(root); root.classList.remove(...cls); } };
}
