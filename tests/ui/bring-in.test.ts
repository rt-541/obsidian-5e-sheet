// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { provenanceLine } from "../../src/content/edition";
import type { Registry } from "../../src/content/registry";
import { baseCharacter, characterFrontmatter, newDraft } from "../../src/core/builder";
import { parseNote, type Character } from "../../src/core/character";
import { deriveCharacter } from "../../src/core/derive";
import { applyLevel, planLevel, undoLevel } from "../../src/core/levelup";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { bringInButton, editionChip } from "../../src/ui/bring-in";
import { detailCard, entryCard } from "../../src/ui/details";
import { editionRegistry } from "../fixtures/editions";
import { LAYOUTS, sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");
afterEach(() => document.body.replaceChildren());

type Reg = Awaited<ReturnType<typeof editionRegistry>>["r"];
const SCORES = { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
const add = (r: Reg, type: string, raw: Record<string, unknown>, edition?: "2014" | "2024") => { const p = r.add("vault", type, raw, { path: `${type}-${String(raw.name)}${edition ?? ""}.md`, ...(edition ? { edition } : {}) }); if (p) throw new Error(JSON.stringify(p)); };
/** Extra invented content: a 2024 class and a 2014 sibling with a subclass, feats in two categories, spell asks, creatures, a 2014 background. */
function extras(r: Reg) {
  add(r, "mastery", { name: "Snag", rules: "Invented snag text." }, "2024");
  add(r, "class", { name: "Scout", hitDie: 8, saves: ["str", "con"], levels: { 1: [{ op: "feature", name: "Trek", text: "Invented." }], 2: [{ op: "feature", name: "Sprint", text: "Invented." }], 3: [{ op: "subclass" }], 4: [{ op: "asi", feats: ["origin"] }, { op: "feat", categories: ["origin"] }] } }, "2024");
  add(r, "subclass", { name: "Ember", class: "scout", levels: { 3: [{ op: "feature", name: "Glow", text: "Invented." }] } }, "2014");
  add(r, "feat", { name: "Vim", category: "origin", grants: [{ op: "feature", name: "Vigor", text: "Invented." }] }, "2014");
  add(r, "feat", { name: "Bold", category: "origin", grants: [{ op: "feature", name: "Daring", text: "Invented." }] }, "2024");
  add(r, "class", { name: "Chanter", hitDie: 6, levels: { 1: [{ op: "spells", count: 1, from: "wizard" }] } }, "2024");
  add(r, "background", { name: "Drifter", grants: [{ op: "feature", name: "Roam", text: "Invented." }] }, "2014");
  const mk = (name: string, edition: "2014" | "2024") => add(r, "creature", { name, size: "Small", ctype: "beast", ac: 11, hp: { average: 5, formula: "1d8" }, speed: { walk: 20 }, cr: "1/8", abilities: { str: 5, dex: 5, con: 5, int: 1, wis: 5, cha: 1 } }, edition);
  mk("Moth", "2024"); mk("Mouse", "2014");
}
const note = (edition: "2014" | "2024", o: Record<string, unknown> = {}) => ({ type: "5e-character", schema: 1, name: "Pip", edition, abilities: SCORES, hp: { max: 12, current: 12, temp: 0 }, classes: [], ...o });
async function mount(layout: (typeof LAYOUTS)[number], n: Record<string, unknown>, host: Record<string, unknown> = {}) {
  const { r } = await editionRegistry(); extras(r);
  return { r, ...sheet(layout, n, [], { registry: r, ...host }) };
}
const OTHER = { "2024": "2014", "2014": "2024" } as const;
const camp = (sources: Record<string, boolean>) => ({ name: "T", rules: {}, sources, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } });
const last = (el: Element | null) => el?.lastElementChild as HTMLElement | null;
const isBring = (el: Element | null | undefined, from: string) => !!el && el.matches("button.fe-btn.fe-bring-in") && el.textContent === `Bring in from the ${from} books` && el.getAttribute("data-act") === "bring-in" && el.getAttribute("type") === "button";
const showAll = (s: { click: (e: Element | null | undefined) => void; q: (x: string) => HTMLElement }) => s.click(s.q('.fe-add-spell [data-act="higher-levels"]'));

describe("the shared pieces", () => {
  it("bringInButton and editionChip have the contracted shape", () => {
    let hit = 0; const b = bringInButton("2014", () => { hit++; });
    expect(isBring(b, "2014")).toBe(true); b.click(); expect(hit).toBe(1);
    const chip = editionChip("hush@2014", "2024")!; expect(chip.tagName).toBe("SPAN"); expect(chip.classList.contains("fe-chip") && chip.classList.contains("fe-edition")).toBe(true); expect(chip.textContent).toBe("2014");
    expect(editionChip("hush", "2024")).toBeNull();
  });
});

for (const layout of LAYOUTS) {
  describe(`bring in from the other edition, ${layout} sheet`, () => {
    it("the add spell, add item and add companion lists end with the button, on a 2024 and a 2014 sheet", async () => {
      for (const ed of ["2024", "2014"] as const) {
        const s = await mount(layout, note(ed));
        s.ctl.open({ kind: "add-spell" }); expect(isBring(last(s.q(".fe-add-spell [data-results]")), OTHER[ed])).toBe(true); s.ctl.close();
        s.ctl.open({ kind: "compendium" }); expect(isBring(last(s.q('.fe-panel [data-pane="item-results"]')), OTHER[ed])).toBe(true); s.ctl.close();
        s.ctl.open({ kind: "add-companion" }); expect(isBring(last(s.q(".fe-companion-panel [data-list]")), OTHER[ed])).toBe(true);
        document.body.replaceChildren();
      }
    });

    it("nothing is brought in by itself: the own list never shows the other edition", async () => {
      const s = await mount(layout, note("2024"));
      s.ctl.open({ kind: "add-spell" }); showAll(s);
      s.type(s.q(".fe-add-spell .fe-search"), "hush");
      expect(s.root.querySelector('[data-pick="hush"], [data-pick="hush@2014"]')).toBeNull();
      s.ctl.close(); s.ctl.open({ kind: "add-companion" }); s.type(s.q('.fe-companion-panel [aria-label="Search creatures"]'), "mouse");
      expect(s.root.querySelector(".fe-companion-panel [data-creature]")).toBeNull();
    });

    it("pressing it lists only the other edition; a pick stores a qualified id and keeps a chip and a card naming book and edition", async () => {
      const s = await mount(layout, note("2024"));
      s.ctl.open({ kind: "add-spell" }); showAll(s);
      s.click(s.q(".fe-add-spell .fe-bring-in"));
      s.type(s.q(".fe-add-spell .fe-search"), "");
      expect(s.all(".fe-add-spell [data-pick]").every(e => e.dataset.pick!.endsWith("@2014"))).toBe(true);
      s.type(s.q(".fe-add-spell .fe-search"), "nova"); expect(s.root.querySelector(".fe-add-spell [data-pick]")).toBeNull();
      s.type(s.q(".fe-add-spell .fe-search"), "hush");
      expect(s.all(".fe-add-spell [data-pick]").map(e => e.dataset.pick)).toEqual(["hush@2014"]);
      expect(s.q(".fe-add-spell .fe-bring-back").textContent).toBe("Back to the 2024 list");
      expect(s.root.querySelector(".fe-add-spell .fe-bring-in")).toBeNull();
      s.type(s.q(".fe-add-spell .fe-search"), "hush");
      s.click(s.q('.fe-add-spell [data-add="hush@2014"]'));
      expect(s.ctl.character!.spells.at(-1)!.id).toBe("hush@2014");
      s.click(s.q(".fe-add-spell .fe-bring-back"));
      expect(s.root.querySelector('.fe-add-spell [data-pick="hush@2014"]')).toBeNull();
      expect(s.root.querySelector(".fe-add-spell .fe-bring-in")).not.toBeNull();
      s.ctl.close();
      const row = s.q('[data-spell="hush@2014"]');
      expect(row.querySelector(".fe-chip.fe-edition")!.textContent).toBe("2014");
      expect(row.textContent).not.toContain("@");
      const card = detailCard("spell:hush@2014", s.ctl)!.textContent!;
      expect(card).toContain("WotC"); expect(card).toContain("2014 rules");
    });

    it("bringing in the same-id spell beside the own one gives two rows (Review Focus 3)", async () => {
      const s = await mount(layout, note("2024"));
      s.ctl.open({ kind: "add-spell" }); showAll(s); s.type(s.q(".fe-add-spell .fe-search"), "glint");
      s.click(s.q('.fe-add-spell [data-add="glint"]'));
      s.click(s.q(".fe-add-spell .fe-bring-in")); s.click(s.q('.fe-add-spell [data-add="glint@2014"]'));
      expect(s.ctl.character!.spells.map(x => x.id)).toEqual(["glint", "glint@2014"]);
      s.ctl.close();
      expect(s.all('[data-spell="glint"]').length + s.all('[data-spell="glint@2014"]').length).toBe(2);
      expect(s.all('[data-spell="glint@2014"] .fe-chip.fe-edition').length).toBe(1);
      expect(s.all('[data-spell="glint"] .fe-chip.fe-edition').length).toBe(0);
    });

    it("a campaign that switched the library off hides it from the bring-in list too (Review Focus 4)", async () => {
      for (const [sources, found] of [[{}, true], [{ "Test Press": false }, false]] as const) {
        const s = await mount(layout, note("2024"), { campaign: camp(sources) });
        s.ctl.open({ kind: "compendium" }); s.click(s.q(".fe-panel .fe-bring-in"));
        s.type(s.q(".fe-panel .fe-search"), "pewter");
        expect(s.all('.fe-panel [data-item="pewter-blade@2014"]').length).toBe(found ? 1 : 0);
        document.body.replaceChildren();
      }
    });

    it("an item and a companion are brought in as qualified ids and keep their chips", async () => {
      const s = await mount(layout, note("2024"));
      s.ctl.open({ kind: "compendium" }); s.click(s.q(".fe-panel .fe-bring-in"));
      s.type(s.q(".fe-panel .fe-search"), "pewter");
      expect(s.q(".fe-panel .fe-bring-back").textContent).toBe("Back to the 2024 list");
      expect(s.q('.fe-panel [data-item="pewter-blade@2014"]').closest(".fe-inv")!.querySelector(".fe-chip.fe-edition")!.textContent).toBe("2014");
      s.click(s.q('.fe-panel [data-item="pewter-blade@2014"]'));
      await vi.waitFor(() => expect(s.q('[data-act="add-only"]')).not.toBeNull());
      s.click(s.q('[data-act="add-only"]'));
      expect(s.ctl.character!.inventory.at(-1)!.id).toBe("pewter-blade@2014");
      s.ctl.close();
      expect(s.root.querySelector('[data-feature="inventory"] .fe-chip.fe-edition, .fe-inv .fe-chip.fe-edition')!.textContent).toBe("2014");
      s.ctl.open({ kind: "add-companion" }); s.click(s.q(".fe-companion-panel .fe-bring-in"));
      s.type(s.q('.fe-companion-panel [aria-label="Search creatures"]'), "mouse");
      expect(s.q(".fe-companion-panel [data-creature]").dataset.creature).toBe("mouse@2014");
      s.click(s.q(".fe-companion-panel [data-creature]"));
      expect(s.ctl.character!.companions.at(-1)!.creature).toBe("mouse@2014");
      s.ctl.close();
      expect(s.q('[data-companion="0"] .fe-chip.fe-edition').textContent).toBe("2014");
    });

    it("the identity line and the derived label name entries and chips, never raw qualified ids", async () => {
      const s = await mount(layout, note("2024", { race: "fenling@2014", subrace: "marsh-fenling@2014", background: "drifter@2014", classes: [{ class: "lantern-keeper@2014", level: 1 }], feats: ["keen@2014"] }));
      const id = s.q(".fe-identity-label");
      expect(id.textContent).not.toContain("@"); expect(id.textContent).toContain("Fenling"); expect(id.textContent).toContain("Lantern-keeper");
      expect(id.querySelectorAll(".fe-chip.fe-edition").length).toBe(4);
      const st = deriveCharacter(s.ctl.character!, { registry: s.ctl.host.registry });
      expect(st.label).not.toContain("@"); expect(st.label).toContain("Lantern-keeper");
      expect(s.root.querySelector(".fe-trait-group[data-group=feats] .fe-chip.fe-edition, [data-trait=\"feat:keen@2014\"] .fe-chip.fe-edition")).not.toBeNull();
    });

    it("a mastery of a brought-in weapon shows its chip and offers the Change picker", async () => {
      const s = await mount(layout, note("2014", { inventory: [{ id: "tin-blade@2024", equipped: true }], mastery: ["tin-blade@2024"] }));
      expect(s.q(".fe-attack .fe-mastery-chip").textContent).toBe("Snag");
      s.ctl.setEditing(true); s.click(s.q('[data-mastery-row="tin-blade@2024"] button.fe-mastery-change'));
      expect(s.q('[data-mastery-pick="tin-blade@2024"]')).not.toBeNull();
    });

    it("an attack row of a brought-in weapon keeps its edition chip; the own one has none and the numbers are unchanged", async () => {
      const s = await mount(layout, note("2024", { inventory: [{ id: "tin-blade", equipped: true }, { id: "tin-blade@2014", equipped: true }] }));
      const rows = s.all(".fe-attack").filter(x => /Tin-blade/.test(x.textContent ?? ""));
      expect(rows).toHaveLength(2);
      const chips = rows.map(x => x.querySelectorAll(".fe-chip.fe-edition").length);
      expect(chips.sort()).toEqual([0, 1]);
      expect(rows.find(x => x.querySelector(".fe-chip.fe-edition"))!.querySelector(".fe-chip.fe-edition")!.textContent).toBe("2014");
      const st = deriveCharacter(s.ctl.character!, { registry: s.ctl.host.registry });
      expect(st.attacks.filter(a => a.name === "Tin-blade").map(a => a.ref)).toEqual([undefined, "tin-blade@2014"]);
    });
  });
}

describe("the level-up pages", () => {
  const levelled = (n: Record<string, unknown> = {}) => note("2024", { classes: [{ class: "scout", level: 2 }], levelLog: [], ...n });
  const stepPage = (s: Awaited<ReturnType<typeof mount>>, kind: string) => {
    const steps = s.ctl.levelUpSteps().steps; const i = steps.findIndex(x => x.kind === kind);
    if (i < 0) throw new Error(`no ${kind} step: ${steps.map(x => x.kind)}`);
    s.ctl.setLevelUp({ page: 1 + i }); return { step: steps[i], body: s.q(`.fe-levelup [data-step="${steps[i].key}"]`) };
  };
  for (const layout of LAYOUTS) {
    it(`${layout}: a class whose subclasses are all 2014 says so and brings one in; the pick is applied qualified`, async () => {
      const s = await mount(layout, levelled());
      s.ctl.startLevelUp(); s.ctl.setLevelUp({ classId: "scout" });
      const { step, body } = stepPage(s, "subclass");
      expect(body.querySelector("[data-empty]")!.textContent).toContain("2024"); expect(isBring(last(body), "2014")).toBe(true);
      s.click(last(body)); expect(s.root.querySelector(`[data-step="${step.key}"] .fe-bring-in`)).toBeNull();
      const row = s.q(`[data-step="${step.key}"] [data-opt="ember@2014"]`); expect(row.textContent).toContain("Ember");
      s.click(row); expect((s.ctl.levelUp!.choices as Record<string, unknown>)[step.key]).toBe("ember@2014");
      expect(s.q(`[data-step="${step.key}"] .fe-bring-back`).textContent).toBe("Back to the 2024 list");
    });
  }
  it("the feat slot and the feat op offer only what the check accepts, and an asi slot takes a brought-in feat", async () => {
    const s = await mount("desktop", levelled({ classes: [{ class: "scout", level: 3, subclass: "ember@2014" }] }));
    s.ctl.startLevelUp(); s.ctl.setLevelUp({ classId: "scout" });
    const steps = s.ctl.levelUpSteps().steps;
    const asi = steps.find(x => x.kind === "asi")!, feat = steps.find(x => x.kind === "feat")!;
    // the other-edition lists are the same filter as the check: the strict op never offers an uncategorised 2014 feat
    expect((feat as { other: { id: string }[] }).other.map(o => o.id)).toEqual(["vim@2014"]);
    expect((asi as { other: { id: string }[] }).other.map(o => o.id)).toEqual(expect.arrayContaining(["keen@2014", "vim@2014"]));
    s.ctl.setLevelUp({ page: 1 + steps.indexOf(asi) });
    s.click(s.q('[data-mode="feat"]'));
    const list = s.q('[data-feats="list"]'); expect(isBring(last(list), "2014")).toBe(true); s.click(last(list));
    expect(s.all('[data-feats="list"] [data-feat]').map(e => e.dataset.feat)).toEqual(expect.arrayContaining(["keen@2014", "vim@2014"]));
    s.click(s.q('[data-feat="vim@2014"] button'));
    s.ctl.setLevelUp({ page: 1 + steps.indexOf(feat) });
    const fl = s.q(`[data-step="${feat.key}"] [data-feats="list"]`); expect(isBring(last(fl), "2014")).toBe(true);
    s.click(last(fl)); expect(s.all(`[data-step="${feat.key}"] [data-feat]`).map(e => e.dataset.feat)).toEqual(["vim@2014"]);
  });
  it("a brought-in feat in an asi slot is accepted and recorded qualified", async () => {
    const s = await mount("desktop", levelled({ classes: [{ class: "scout", level: 3, subclass: "ember@2014" }] }));
    const steps = (planLevel(s.ctl.character!, "scout", s.ctl.pickers(), {}) as { steps: { kind: string; key: string }[] }).steps;
    const asi = steps.find(x => x.kind === "asi")!, feat = steps.find(x => x.kind === "feat")!;
    const out = applyLevel(s.ctl.character!, { class: "scout" }, { hp: { method: "average" }, choices: { [asi.key]: { feat: "keen@2014" }, [feat.key]: "vim@2014" } }, s.ctl.pickers());
    if ("error" in out) throw new Error(out.error);
    expect(out.value.feats).toEqual(["keen@2014", "vim@2014"]);
    const bad = applyLevel(s.ctl.character!, { class: "scout" }, { hp: { method: "average" }, choices: { [asi.key]: { abilities: { str: 2 } }, [feat.key]: "keen@2014" } }, s.ctl.pickers());
    expect("error" in bad).toBe(true);
  });
  it("the spell step brings in a spell of the other edition", async () => {
    const s = await mount("desktop", note("2024"));
    s.ctl.startLevelUp(); s.ctl.setLevelUp({ classId: "chanter" });
    const { step, body } = stepPage(s, "spells");
    const btn = s.q(`[data-step="${step.key}"] .fe-bring-in`); expect(isBring(btn, "2014")).toBe(true);
    // the button is the last child of the spell list, after every row
    const list = btn.parentElement!; expect(list.lastElementChild).toBe(btn); expect(list.childElementCount).toBeGreaterThan(1); expect(body.contains(list)).toBe(true);
    s.click(btn);
    s.click(s.q(`[data-step="${step.key}"] [data-spell="hush@2014"] button`));
    expect((s.ctl.levelUp!.choices as Record<string, unknown>)[step.key]).toEqual(["hush@2014"]);
    s.ctl.setLevelUp({ page: 1 + s.ctl.levelUpSteps().steps.length });
    s.click(s.q('[data-act="lu-apply"]'));
    expect(s.ctl.character!.spells.map(x => x.id)).toEqual(["hush@2014"]);
  });
  it("the log lines name entries, not raw qualified ids", async () => {
    const { r } = await editionRegistry(); extras(r); add(r, "class", { name: "Drifter", hitDie: 8, levels: { 1: [{ op: "grant", items: ["rope-coil"] }] } }, "2014"); add(r, "item", { name: "Rope-coil", kind: "gear" }, "2014");
    const reg = r.forEdition("2024"), p = parseNote(note("2024")); if (p.kind !== "character") throw new Error("parse");
    const out = applyLevel(p.value, { class: "drifter@2014" }, { hp: { method: "average" }, choices: {} }, reg); if ("error" in out) throw new Error(out.error);
    expect(out.summary.join("\n")).toContain("Gained: Rope-coil (2014)"); expect(out.summary.join("\n")).not.toContain("@");
    const undone = undoLevel(out.value, reg); if ("error" in undone) throw new Error(undone.error);
    expect(undone.summary[0]).toBe("Undid Drifter 1 (2014)"); expect(undone.summary.join("\n")).not.toContain("@");
  });
});

describe("cards and the builder", () => {
  it("every entry card shows its source, book and edition", async () => {
    const { r } = await editionRegistry(); extras(r);
    const s = sheet("desktop", note("2024"), [], { registry: r });
    for (const ref of ["spell:hush@2014", "item:tin-blade@2014", "feat:keen@2014", "subclass:ember@2014", "spell:nova", "feat:bold"]) {
      const e = s.ctl.host.registry.get(ref.split(":")[0], ref.split(":")[1])!;
      expect(detailCard(ref, s.ctl)!.textContent, ref).toContain(provenanceLine(e));
    }
    for (const [t, id] of [["race", "fenling@2014"], ["class", "warden"], ["background", "drifter@2014"], ["creature", "mouse@2014"], ["condition", "blinded"]]) {
      const e = s.ctl.host.registry.get(t, id); if (!e) continue;
      expect(entryCard(s.ctl.host.registry, e).textContent, `${t}:${id}`).toContain(provenanceLine(e));
    }
  });

  const host = (r: Reg): BuilderHost => ({ registry: r, folder: "", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined });
  async function builder() {
    const { r } = await editionRegistry(); extras(r);
    const ctl = new BuilderController({ ...host(r), defaultEdition: () => "2024" }), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, false); ctl.go(1);   // page 0 is the edition page
    const q = (sel: string) => root.querySelector(sel) as HTMLElement, qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
    const click = (el: Element | null | undefined) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
    return { ctl, root, q, qa, click, r };
  }
  it("race, subrace, background and class lists end with the button and a pick is stored qualified", async () => {
    const b = await builder();
    expect(isBring(last(b.q('[data-list="race"]')), "2014")).toBe(true);
    b.click(last(b.q('[data-list="race"]')));
    expect(b.q('[data-list="race"] .fe-bring-back').textContent).toBe("Back to the 2024 list");
    b.click(b.q('[data-race="fenling@2014"]'));
    expect(b.ctl.draft.race).toBe("fenling@2014"); expect(b.ctl.ready({ id: "race" })).toBe(true);
    // the own edition has no subraces of it: the subrace list still shows and brings the 2014 ones in
    const sub = b.q('[data-list="subrace"]'); expect(isBring(last(sub), "2014")).toBe(true);
    b.click(last(sub)); b.click(b.q('[data-subrace="marsh-fenling@2014"]'));
    expect(b.ctl.draft.subrace).toBe("marsh-fenling@2014");
    b.ctl.go(2); expect(isBring(last(b.q('[data-list="background"]')), "2014")).toBe(true);
    b.click(last(b.q('[data-list="background"]'))); b.click(b.q('[data-background="drifter@2014"]'));
    expect(b.ctl.draft.background).toBe("drifter@2014");
    b.ctl.go(4); expect(isBring(last(b.q('[data-list="class"]')), "2014")).toBe(true);
    b.click(last(b.q('[data-list="class"]'))); b.click(b.q('[data-class="lantern-keeper@2014"]'));
    expect(b.ctl.draft.classId).toBe("lantern-keeper@2014");
    // the built note keeps the qualified ids
    b.ctl.setName("Pip"); b.ctl.draft = { ...b.ctl.draft };
    const r = b.ctl.preview(); if ("error" in r) throw new Error(r.error);
    const fm = characterFrontmatter(r.value) as Record<string, any>;
    expect(fm.race).toBe("fenling@2014"); expect(fm.subrace).toBe("marsh-fenling@2014"); expect(fm.background).toBe("drifter@2014"); expect(fm.classes[0].class).toBe("lantern-keeper@2014");
    expect(baseCharacter({ ...newDraft(), edition: "2024" }, b.r.forEdition("2024")).edition).toBe("2024");
  });
});

describe("builder step pages", () => {
  it("the builder's spell step ends with the button and a brought-in spell lands qualified in the draft and the note", async () => {
    const { r } = await editionRegistry(); extras(r);
    const ctl = new BuilderController({ registry: r, folder: "", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined, defaultEdition: () => "2024" }), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, true);
    ctl.setClass("chanter");
    const i = ctl.pages().findIndex(p => p.id === "step" && p.step.kind === "spells"); expect(i).toBeGreaterThan(0);
    ctl.go(i);
    const btn = root.querySelector(".fe-bring-in") as HTMLElement; expect(isBring(btn, "2014")).toBe(true);
    btn.click();
    (root.querySelector('[data-spell="hush@2014"] button') as HTMLElement).click();
    const key = (ctl.pages()[i] as { step: { key: string } }).step.key;
    expect(ctl.draft.choices[key]).toEqual(["hush@2014"]);
  });
});

describe("styles", () => {
  it("the button and chip have plugin rules that beat Obsidian's, 44 px on touch", () => {
    expect(css).toContain(".fe-sheet button.fe-bring-in"); expect(css).toContain(".fe-sheet button.fe-bring-back"); expect(css).toContain(".fe-chip.fe-edition");
    for (const k of ["bring-in", "bring-back"]) for (const m of ["mobile", "tablet"]) expect(css).toMatch(new RegExp(`\\.fe-${m} button\\.fe-${k}[^{]*\\{[^}]*min-height: 44px`));
  });
});
