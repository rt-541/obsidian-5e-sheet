// @vitest-environment jsdom
import type { CampaignData } from "../../src/content/types";
import { newCharacter, parseNote, writeInto, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { applyLevel } from "../../src/core/levelup";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { CHARACTER_FEATURES, DESKTOP, MOBILE, placed } from "../../src/ui/layouts";
import { detailCard } from "../../src/ui/details";
import { mountSheet } from "../../src/ui/sheet";
import { describeEffects } from "../../src/ui/widgets";
import { homebrewRegistry } from "../fixtures/homebrew";

const reg = homebrewRegistry([{ type: "5e-feat", name: "Linguist", grants: [{ op: "choose", what: "languages", count: 1, from: ["elvish", "dwarvish"] }] }]);
const L1 = { "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] };
const L2 = { "class:skirmisher:2:choose-2": ["stealth"] };
const L3 = { "class:skirmisher:3:subclass-0": "scholar" };
const abil = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 };
const fresh = (): Character => ({ ...newCharacter("Newbie"), abilities: abil });
function upTo(n: number): Character {
  let c = fresh();
  for (const a of [L1, L2, L3, { "class:skirmisher:4:asi-0": { abilities: { int: 2 } } }, { "class:skirmisher:5:spells-2": ["acid-splash", "burning-hands", "charm-person"] }, {}].slice(0, n)) {
    const r = applyLevel(c, { class: "skirmisher" }, { hp: { method: "average" }, choices: a }, reg); if ("error" in r) throw new Error(r.error); c = r.value;
  }
  return c;
}
const noteOf = (c: Character, extra: object = {}) => { const fm: Record<string, unknown> = { type: "5e-character", name: c.name }; writeInto(fm, c); return { ...fm, ...extra }; };

function setup(note: object, mobile: boolean, campaign?: CampaignData) {
  const saved: (Character | Npc)[] = [], notices: string[] = [];
  const host: SheetHost = { registry: reg, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: m => notices.push(m), log: [], rng: seeded(11), body: "", ...(campaign ? { campaign } : {}) };
  const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const next = () => click('[data-act="lu-next"]');
  const edit = () => click('[data-feature="play-edit"] .fe-seg .fe-btn:last-child');
  return { ctl, root, saved, notices, q, qa, click, next, edit, host };
}
const campaign = (leveling: "xp" | "milestone"): CampaignData => ({ name: "C", leveling, rules: {}, sections: { hide: [], show: [] }, calendar: { holyDay: "Sunday" } });
const last = (s: ReturnType<typeof setup>) => s.saved[s.saved.length - 1] as Character;

describe.each([["desktop", false], ["mobile", true]] as const)("level up on the %s layout", (_n, mobile) => {
  it("a new character: class, first-level HP, skills and stance, summary, apply", () => {
    const s = setup(noteOf(fresh()), mobile);
    s.click('[data-act="level-up"]');
    expect(s.q('[data-panel="level-up"]')).not.toBeNull();
    expect((s.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(true);        // no class yet
    s.click('[data-class="skirmisher"]'); s.next();
    expect(s.q('[data-step="hp"]').textContent).toContain("Full hit die: d8 (8) +2 Constitution = 10 hit points"); s.next();
    expect(s.q('[data-step="class:skirmisher:1:skills"]').textContent).toContain("(0 of 2)");
    expect((s.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(true);
    s.click('[data-opt="acrobatics"]'); expect((s.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(true);
    s.click('[data-opt="athletics"]'); expect((s.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(false); s.next();
    s.click('[data-opt="duelist"]'); s.next();
    expect(s.q('[data-step="summary"]').textContent).toContain("Skirmisher 1 (character level 1)"); expect(s.q('[data-step="summary"]').textContent).toContain("HP +10");
    s.click('[data-act="lu-apply"]');
    expect(s.q('[data-panel="level-up"]')).toBeNull();
    const c = last(s);
    expect(c.classes).toEqual([{ class: "skirmisher", level: 1 }]); expect(c.hp).toEqual({ max: 10, current: 10, temp: 0 });
    expect(c.levelLog[0]).toMatchObject({ class: "skirmisher", level: 1, hp: { method: "first", gained: 8, added: 10 } });
    expect(s.q('[data-feature="identity"]').textContent).toContain("skirmisher 1");
    expect(s.host.log[0].title).toBe("Level up");
  });

  it("Back keeps the picks; HP can be rolled (deterministic) or averaged", () => {
    const s = setup(noteOf(upTo(1)), mobile);
    s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]'); s.next();
    s.click('[data-hp="roll"]');
    const rolled = Number(/Rolled (\d+)/.exec(s.q('[data-result="hp"]').textContent!)![1]);
    expect(rolled).toBeGreaterThanOrEqual(1); expect(rolled).toBeLessThanOrEqual(8);
    s.click('[data-hp="average"]'); expect(s.q('[data-result="hp"]').textContent).toBe("Average 5 +2 Constitution = 7 hit points");
    s.next(); expect(s.q('[data-step="class:skirmisher:2:choose-2"]')).not.toBeNull();
    s.click('[data-opt="stealth"]'); s.click('[data-act="lu-back"]');
    expect(s.q('[data-step="hp"]')).not.toBeNull(); s.next();
    expect(s.q('[data-opt="stealth"]').getAttribute("aria-pressed")).toBe("true");
    s.next(); s.click('[data-act="lu-apply"]');
    expect(last(s).hp.max).toBe(17); expect(last(s).classes[0].level).toBe(2);
  });

  it("subclass cards add the subclass's own steps; the ASI page enforces +2 / +1 +1; a feat adds its choice", () => {
    const s = setup(noteOf(upTo(2)), mobile);
    s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]'); s.next(); s.click('[data-hp="average"]'); s.next();
    expect(s.qa("[data-opt]").map(b => b.dataset.opt)).toEqual(["pact-mind", "scholar"]);
    s.click('[data-opt="pact-mind"]'); s.next();
    expect(s.q('[data-step="subclass:pact-mind:3:boon"]')).not.toBeNull();
    s.click('[data-act="lu-back"]'); s.click('[data-opt="scholar"]'); s.next();
    expect(s.q('[data-act="lu-apply"]')).not.toBeNull();                                 // scholar has no extra steps
    s.click('[data-act="lu-apply"]');
    expect(last(s).classes[0]).toEqual({ class: "skirmisher", subclass: "scholar", level: 3 });

    const t = setup(noteOf(upTo(3)), mobile);
    t.click('[data-act="level-up"]'); t.click('[data-class="skirmisher"]'); t.next(); t.click('[data-hp="average"]'); t.next();
    expect((t.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(true);
    t.click('[data-abil="int"] .fe-btn:last-child'); t.click('[data-abil="dex"] .fe-btn:last-child');
    expect((t.q('[data-abil="wis"] .fe-btn:last-child') as HTMLButtonElement).disabled).toBe(true);     // both points spent
    expect((t.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(false);
    t.click('[data-mode="feat"]'); expect((t.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(true);
    const pick = t.qa(".fe-inv .fe-btn").find(b => b.closest(".fe-inv")!.textContent!.includes("Linguist"))!; pick.click();
    t.next(); expect(t.q('[data-step="feat:linguist:choose-0"]')).not.toBeNull();
    t.click('[data-opt="elvish"]'); t.next(); t.click('[data-act="lu-apply"]');
    expect(last(t).feats).toEqual(["linguist"]); expect(last(t).abilities).toEqual(upTo(3).abilities);
  });

  it("spells step: add from the list up to the counts, with a swap-free level", () => {
    const s = setup(noteOf(upTo(4)), mobile);
    s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]'); s.next(); s.click('[data-hp="average"]'); s.next();
    expect(s.q('[data-step="class:skirmisher:5:spells-2"]').textContent).toContain("cantrips 0 of 1, spells 0 of 2");
    for (const id of ["acid-splash", "burning-hands", "charm-person"]) s.click(`[data-spell="${id}"] .fe-btn`);
    expect(s.q('[data-step="class:skirmisher:5:spells-2"]').textContent).toContain("cantrips 1 of 1, spells 2 of 2");
    s.click('[data-spell="alarm"] .fe-btn'); expect(s.notices.at(-1)).toBe("Only 2 spells here");
    s.next(); s.click('[data-act="lu-apply"]');
    expect(last(s).spells.map(x => x.id)).toEqual(["acid-splash", "burning-hands", "charm-person"]);
  });

  it("a rejected apply keeps the wizard open with the reason; nothing is saved", () => {
    const s = setup(noteOf(upTo(1)), mobile);
    s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]'); s.next(); s.click('[data-hp="average"]'); s.next();
    s.click('[data-opt="stealth"]');
    s.ctl.pick("class:skirmisher:2:choose-2", ["acrobatics"]);                          // not one of the expertise choices; the page still counts it as answered
    s.next();
    expect(s.q('[data-step="summary"]').textContent).toContain("not one of the choices");
    expect((s.q('[data-act="lu-apply"]') as HTMLButtonElement).disabled).toBe(true);
    expect(s.ctl.applyLevelUp()).toBe(false);
    expect(s.saved).toEqual([]); expect(s.q('[data-panel="level-up"]')).not.toBeNull(); expect(s.notices.at(-1)).toContain("not one of the choices");
  });

  it("class page explains multiclass prerequisites and blocks them", () => {
    const s = setup(noteOf({ ...upTo(3), abilities: { ...abil, dex: 10, int: 10 } }), mobile);
    s.click('[data-act="level-up"]');
    expect((s.q('[data-class="wizard"]') as HTMLButtonElement).disabled).toBe(true);
    expect(s.q('[data-panel="level-up"]').textContent).toContain("Leaving Skirmisher needs DEX 13 or INT 13");
    s.click('[data-class="skirmisher"]'); expect((s.q('[data-act="lu-next"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("Undo last level is an Edit-mode button that asks twice and restores the note", () => {
    const before = upTo(3), s = setup(noteOf(before), mobile);
    expect(s.q('[data-act="undo-level"]')).toBeNull();
    s.edit();
    s.click('[data-act="undo-level"]'); expect(s.saved).toEqual([]);
    expect(s.q('[data-act="undo-level"]').textContent).toBe("Confirm undo");
    s.click('[data-act="undo-level"]');
    expect(last(s)).toEqual(upTo(2)); expect(s.q('[data-feature="identity"]').textContent).toContain("skirmisher 2");
    expect(s.host.log[0].title).toBe("Undo level");
  });

  it("a read-only note cannot level up", () => {
    const s = setup({ ...noteOf(upTo(1)), hp: "lots" }, mobile);
    s.click('[data-act="level-up"]');
    expect(s.q('[data-panel="level-up"]')).toBeNull(); expect(s.notices[0]).toContain("read-only"); expect(s.saved).toEqual([]);
  });
});

describe("leveling mode and XP", () => {
  it("milestone (the default): no bar, Level up never highlighted", () => {
    const s = setup(noteOf({ ...upTo(2), xp: 99999 }), false);
    expect(s.q('[data-feature="xp"]').textContent).toBe("XP 99999"); expect(s.q("[data-xpbar]")).toBeNull();
    expect(s.q('[data-act="level-up"]').classList.contains("mod-cta")).toBe(false);
    expect(s.ctl.levelingMode()).toBe("milestone");
  });
  it("xp mode: progress bar toward the next threshold, highlight once crossed, still usable before", () => {
    const low = setup(noteOf({ ...upTo(2), xp: 600 }), false, campaign("xp"));
    expect(low.ctl.levelingMode()).toBe("xp");
    expect(low.q('[data-feature="xp"]').textContent).toContain("XP 600 / 900");
    expect(low.q("[data-xpbar] .fe-bar-fill").getAttribute("style")).toBe("width:50%");
    expect(low.q('[data-act="level-up"]').classList.contains("mod-cta")).toBe(false); expect(low.q('[data-act="level-up"]').title).toBe("300 XP to level 3");
    const high = setup(noteOf({ ...upTo(2), xp: 900 }), true, campaign("xp"));
    expect(high.q('[data-act="level-up"]').classList.contains("mod-cta")).toBe(true);
    expect(high.q('[data-feature="xp"]').textContent).toContain("Level up ready");
    expect(high.ctl.levelUpReady()).toBe(true); expect(low.ctl.levelUpReady()).toBe(false);
  });
  it("Edit mode lets XP be typed in; level 20 disables Level up", () => {
    const s = setup(noteOf({ ...upTo(2), xp: 0 }), false, campaign("xp"));
    s.edit();
    const input = s.q('[data-feature="xp"] input') as HTMLInputElement; input.value = "1000"; input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(last(s).xp).toBe(1000);
    const maxed = setup(noteOf({ ...fresh(), classes: [{ class: "fighter", level: 20 }] }), false);
    expect((maxed.q('[data-act="level-up"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Features tab", () => {
  const six = () => noteOf(upTo(6));
  it("both layouts place the new features exactly once and render them", () => {
    for (const l of [DESKTOP, MOBILE]) { const p = placed(l); expect(p.filter(f => f === "features")).toHaveLength(1); expect(p.filter(f => f === "level-up")).toHaveLength(1); }
    expect(CHARACTER_FEATURES).toEqual(expect.arrayContaining(["level-up", "features"]));
    expect(DESKTOP.tabs.map(t => t.label)).toContain("Features");
    expect(MOBILE.tabs.find(t => t.id === "more")!.columns.flat()).toContain("features");
  });
  describe.each([["desktop", false], ["mobile", true]] as const)("on %s", (_n, mobile) => {
    it("lists features by source, DCs, scales and resources", () => {
      const s = setup(six(), mobile), f = s.q('[data-feature="features"]');
      expect(s.qa("[data-source]").map(e => e.dataset.source)).toEqual(["Skirmisher 1", "Skirmisher 3", "Scholar (Skirmisher 3)"]);
      expect(f.textContent).toContain("Quick Wits"); expect(f.textContent).toContain("Duelist"); expect(f.textContent).toContain("AC uses INT");
      expect(f.querySelector('[data-dc="analysis"]')!.textContent).toBe("Analysis: DC 15 · attack +7 · INT");
      expect(f.querySelector('[data-scale="plan-die"]')!.textContent).toBe("Plan die1d6");
      expect(f.querySelector('[data-scale="plan-count"]')!.textContent).toBe("Plan count8");
      expect(f.querySelectorAll('[data-resource="plans"] .fe-pip')).toHaveLength(9);
      expect(f.querySelector('[data-resource="focus"]')!.textContent).toContain("short rest regains 1 once per long rest");
    });
    it("clicking a pip spends a derived resource and saves it in uses", () => {
      const s = setup(six(), mobile);
      s.click('[data-resource="plans"] .fe-pip:nth-child(3)');
      expect(last(s).uses).toEqual({ plans: 3 });
      s.click('[data-resource="plans"] .fe-pip:nth-child(3)'); expect(last(s).uses).toEqual({ plans: 2 });
    });
    it("an action button spends its cost and rolls attack, damage with the scale filled in, and shows the save DC", () => {
      const s = setup(six(), mobile);
      expect(s.q('[data-action] .fe-faint').textContent).toContain("costs 1 Focus");
      s.click('[data-action] > .fe-btn');
      expect(last(s).uses).toEqual({ focus: 1 });
      const titles = s.host.log.map(r => r.title);
      expect(titles).toEqual(expect.arrayContaining(["Sudden Strike attack", "Sudden Strike damage", "Sudden Strike used"]));
      expect(s.host.log.find(r => r.title === "Sudden Strike used")!.detail).toBe("Focus -1 · WIS save DC 15");
      expect(s.host.log.find(r => r.title === "Sudden Strike damage")!.detail).toMatch(/^1d6\+2: \[\d\]$/);
      for (let i = 0; i < 4; i++) s.click('[data-action] > .fe-btn');
      expect(last(s).uses).toEqual({ focus: 3 }); expect(s.notices.at(-1)).toBe("No Focus left for Sudden Strike");
    });
    it("the class DC ability toggle is an Edit-mode control", () => {
      const s = setup(six(), mobile);
      expect(s.q('[data-dc="analysis"] .fe-btn')).toBeNull();
      s.edit(); s.click('[data-dc="analysis"] .fe-btn');
      expect(last(s).choices).toEqual({ "dc.analysis.alt": true });
      expect(s.q('[data-dc="analysis"]').textContent).toContain("DC 12 · attack +4 · WIS");
    });
    it("tapping a feature name opens its details; a subclass card is available too", () => {
      const s = setup(six(), mobile);
      s.click('[data-ref="feature:class:skirmisher:3:feature-1"]');
      expect(s.q('[data-panel="details"]').textContent).toContain("Sudden Strike");
      expect(s.q('[data-panel="details"]').textContent).toContain("Action: Sudden Strike, costs 1 Focus");
    });
  });
  it("pending choices on a note without a log: Choose opens the wizard at that step and resolves it", () => {
    const legacy = { ...noteOf(upTo(1)), levelLog: undefined, classes: [{ class: "skirmisher", level: 2 }] };
    delete (legacy as Record<string, unknown>).levelLog;
    const s = setup(legacy, false);
    expect(s.qa("[data-pending]").map(e => e.dataset.pending)).toEqual(["class:skirmisher:1:skills", "class:skirmisher:1:stance", "class:skirmisher:2:choose-2"]);
    s.click('[data-pending="class:skirmisher:1:stance"] .fe-btn');
    expect(s.q('[data-panel="level-up"]')).not.toBeNull(); expect(s.q('[data-step="class:skirmisher:1:stance"]')).not.toBeNull();
    s.click('[data-opt="guardian"]'); s.click('[data-act="lu-back"]');
    s.click('[data-opt="acrobatics"]'); s.click('[data-opt="athletics"]'); s.next(); s.next();
    s.click('[data-opt="stealth"]'); s.next();
    expect(s.q('[data-step="summary"]').textContent).toContain("Stances: Guardian");
    s.click('[data-act="lu-apply"]');
    const c = last(s);
    expect(c.levelLog).toEqual([]); expect(c.classes[0].level).toBe(2); expect(c.choices["class:skirmisher:1:stance"]).toEqual(["guardian"]);
    expect(s.qa("[data-pending]")).toHaveLength(0); expect(s.host.log[0].title).toBe("Choices made");
  });
  it("homebrew problems and unknown content are listed, never thrown", () => {
    const s = setup({ ...noteOf(upTo(2)), race: "pixie" }, false);
    expect(s.q('[data-feature="features"]').textContent).toContain("race:pixie is not in the compendium");
  });
});

describe("parity and details", () => {
  it("the same level-up session gives identical notes, summaries and logs on both layouts", () => {
    const run = (mobile: boolean) => {
      const s = setup(noteOf(upTo(2)), mobile);
      s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]'); s.next();
      s.click('[data-hp="roll"]'); s.next();
      s.click('[data-opt="pact-mind"]'); s.next(); s.click('[data-opt="tome"]'); s.next();
      const summary = s.q('[data-step="summary"]').textContent!;
      s.click('[data-act="lu-apply"]');
      s.edit(); s.click('[data-act="undo-level"]'); s.click('[data-act="undo-level"]');
      return { saved: s.saved, summary, log: s.host.log.map(r => [r.title, r.detail]) };
    };
    const d = run(false), m = run(true);
    expect(d).toEqual(m);
    expect(d.saved).toHaveLength(2); expect(d.saved[1]).toEqual(upTo(2));
    expect(d.summary).toContain("Boons: Tome");
  });
  it("subclass, feat and feature cards are available for hover and tap", () => {
    const s = setup(noteOf(upTo(6)), false);
    const text = (ref: string) => detailCard(ref, s.ctl)?.textContent ?? "";
    expect(text("subclass:scholar")).toContain("Level 3: Lore"); expect(text("subclass:scholar")).toContain("You know things.");
    expect(text("feat:tough-mind")).toContain("Tough Mind"); expect(text("feat:tough-mind")).toContain("Prerequisite: Intelligence 13");
    expect(text("feature:class:skirmisher:1:quick-wits")).toContain("AC uses INT");
    expect(text("feature:nope")).toBe(""); expect(text("subclass:nope")).toBe("");
  });
  it("effects added by classes read as plain sentences", () => {
    expect(describeEffects({ acAbility: "int", saveBonus: [{ abils: ["int", "wis"], value: "prof" }], critRange: 19, critVs: "analyzed creatures", maxScore: { abil: "int", max: 22 } }))
      .toBe("AC uses INT · INT/WIS saves + prof · Crit on 19-20 vs analyzed creatures · INT max 22");
  });
});
