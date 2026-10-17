// @vitest-environment jsdom
import { characterFrontmatter } from "../../src/core/builder";
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { mountBuilder } from "../../src/ui/builder-ui";
import { homebrewRegistry } from "../fixtures/homebrew";

const squire = { type: "5e-class", name: "Squire", hitDie: 10, saves: ["str", "con"], equipment: [["dagger", "silk-rope"], ["rations"]], gold: "5d4*10", levels: { 1: [{ op: "feature", name: "Drill" }] } };
const reg = homebrewRegistry([squire]);

function setup(mobile = false, fail = false) {
  const created: { path: string; fm: Record<string, unknown> }[] = [], opened: string[] = [], notices: string[] = [], taken = new Set<string>();
  let closed = 0;
  const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "Characters", exists: p => taken.has(p), notify: m => notices.push(m),
    createNote: async (path, fm) => { if (fail) throw new Error("disk full"); created.push({ path, fm }); taken.add(path); return path; },
    open: p => { opened.push(p); }, close: () => { closed++; } };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const next = () => click('[data-act="bd-next"]');
  const type = (sel: string, value: string, ev = "input") => { const el = q(sel) as HTMLInputElement; if (!el) throw new Error("missing " + sel); el.value = value; el.dispatchEvent(new Event(ev, { bubbles: true })); };
  const nextOn = () => !(q('[data-act="bd-next"]') as HTMLButtonElement).disabled;
  const at = () => q("[data-builder]").dataset.builder;
  return { ctl, root, q, qa, click, next, type, nextOn, at, created, opened, notices, closed: () => closed };
}

describe.each([["desktop", false], ["mobile", true]] as const)("character builder on the %s layout", (_n, mobile) => {
  it("walks race, background, scores, class, choices and name, then writes a valid note", async () => {
    const s = setup(mobile);
    expect(s.at()).toBe("race"); expect(s.nextOn()).toBe(false);
    s.click('[data-race="skink"]'); expect(s.nextOn()).toBe(true);
    expect(s.qa("[data-subrace]").map(b => b.dataset.subrace)).toEqual(["", "cave-skink"]);
    s.click('[data-subrace="cave-skink"]'); s.next();
    expect(s.at()).toBe("background"); s.click('[data-background="cartographer"]'); s.next();
    expect(s.at()).toBe("scores"); s.click('[data-method="standard-array"]');
    for (const [a, v] of [["str", 8], ["dex", 15], ["con", 13], ["int", 14], ["wis", 10], ["cha", 12]] as const) {
      const sel = q(s, `[data-abil="${a}"] select`) as HTMLSelectElement; sel.value = String(v); sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(s.ctl.draft.scores).toEqual({ str: 8, dex: 15, con: 13, int: 14, wis: 10, cha: 12 });
    s.click('[aria-label="More DEX bonus"]'); s.click('[aria-label="More DEX bonus"]');
    expect(s.q('[data-final="dex"]').textContent).toBe("= 17"); s.next();
    expect(s.at()).toBe("class"); s.click('[data-class="skirmisher"]'); s.next();
    // the skink language pick, then the skirmisher skills and stance
    expect(s.q("[data-step]").dataset.step).toBe("race:skink:choose-2"); expect(s.nextOn()).toBe(false);
    s.click('[data-opt="elvish"]'); s.next();
    s.click('[data-opt="acrobatics"]'); s.click('[data-opt="athletics"]'); s.next();
    s.click('[data-opt="duelist"]'); s.next();
    expect(s.at()).toBe("name");
    expect((s.q('[data-act="bd-create"]') as HTMLButtonElement).disabled).toBe(true);
    s.type('[data-field="name"]', "Vex");
    expect((s.q('[data-act="bd-create"]') as HTMLButtonElement).disabled).toBe(false);
    s.click('[data-act="bd-create"]'); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(s.created).toHaveLength(1);
    const { path, fm } = s.created[0];
    expect(path).toBe("Characters/Vex.md"); expect(s.opened).toEqual([path]); expect(s.closed()).toBe(1);
    const parsed = parseNote(JSON.parse(JSON.stringify(fm)));
    expect(parsed.kind).toBe("character");
    if (parsed.kind !== "character") return;
    expect(parsed.writable).toBe(true); expect(parsed.errors).toEqual([]);
    expect(parsed.value).toMatchObject({ name: "Vex", race: "skink", subrace: "cave-skink", background: "cartographer", classes: [{ class: "skirmisher", level: 1 }] });
    expect(parsed.value.abilities.dex).toBe(17); expect(parsed.value.hp.max).toBe(9);
    expect(fm).toEqual(characterFrontmatter(parsed.value));
  });

  it("point buy: + stops at 15 and at the 27 point budget, - gives points back", () => {
    const s = setup(mobile);
    s.click('[data-race="skink"]'); s.next(); s.next();
    const plus = (a: string) => s.click(`[aria-label="More ${a.toUpperCase()}"]`);
    for (let i = 0; i < 9; i++) plus("str");
    expect(s.q('[data-base="str"]').textContent).toBe("15");          // 9 points
    for (let i = 0; i < 9; i++) plus("dex");
    for (let i = 0; i < 9; i++) plus("con");
    expect(s.ctl.pointBuySpent()).toBe(27);
    plus("int");
    expect(s.q('[data-base="int"]').textContent).toBe("8");           // no points left
    expect(s.root.textContent).toContain("0 of 27 points left");
    s.click('[aria-label="Less STR"]');
    expect(s.q('[data-base="str"]').textContent).toBe("14"); expect(s.ctl.pointBuySpent()).toBe(25);
    plus("int"); plus("int");
    expect(s.q('[data-base="int"]').textContent).toBe("10");
  });

  it("the standard array swaps values and manual accepts typed scores", () => {
    const s = setup(mobile);
    s.click('[data-race="skink"]'); s.next(); s.next(); s.click('[data-method="standard-array"]');
    const str = s.q('[data-abil="str"] select') as HTMLSelectElement; str.value = "8"; str.dispatchEvent(new Event("change", { bubbles: true }));
    expect(s.ctl.draft.scores).toMatchObject({ str: 8, cha: 15 });
    expect(s.nextOn()).toBe(true);
    s.click('[data-method="manual"]'); s.type('[data-abil="str"] input', "18", "change");
    expect(s.ctl.draft.scores.str).toBe(18); expect(s.nextOn()).toBe(true);
    s.type('[data-abil="str"] input', "40", "change"); expect(s.nextOn()).toBe(false);
  });

  it("a class with equipment asks for an option or gold before the name", async () => {
    const s = setup(mobile);
    s.ctl.setRace("skink"); s.ctl.pick("race:skink:choose-2", ["elvish"]); s.ctl.setClass("squire");
    s.ctl.go(s.ctl.pages().findIndex(p => p.id === "equipment"));
    expect(s.at()).toBe("equipment"); expect(s.nextOn()).toBe(false);
    s.click('[data-equip="0"]'); expect(s.nextOn()).toBe(true);
    s.click('[data-equip="gold"]'); expect(s.nextOn()).toBe(true);
    const gold = s.ctl.draft.equipment; expect(gold).toMatchObject({ kind: "gold" });
    expect((gold as { gold: number }).gold % 10).toBe(0);
    s.type('[data-field="gold"]', "-5", "change"); expect(s.nextOn()).toBe(false);
    s.type('[data-field="gold"]', "75", "change"); expect(s.nextOn()).toBe(true);
    s.next(); expect(s.at()).toBe("name");
    s.type('[data-field="name"]', "Ser Tam");
    s.click('[data-act="bd-create"]'); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(s.created[0].fm.coins).toMatchObject({ gp: 75 });
  });

  it("changing the class clears its picks; a second Vex does not overwrite the first", async () => {
    const s = setup(mobile);
    s.ctl.setRace("skink"); s.ctl.pick("race:skink:choose-2", ["elvish"]); s.ctl.setClass("skirmisher"); s.ctl.pick("class:skirmisher:1:stance", ["duelist"]);
    s.ctl.setClass("squire");
    expect(s.ctl.draft.choices).toEqual({ "race:skink:choose-2": ["elvish"] });
    s.ctl.setEquipment({ kind: "option", index: 1 }); s.ctl.setName("Vex");
    expect(await s.ctl.create()).toBe(true); expect(await s.ctl.create()).toBe(true);
    expect(s.created.map(c => c.path)).toEqual(["Characters/Vex.md", "Characters/Vex 2.md"]);
  });

  it("a failed write is reported and the builder stays open", async () => {
    const s = setup(mobile, true);
    s.ctl.setRace("skink"); s.ctl.pick("race:skink:choose-2", ["elvish"]); s.ctl.setClass("squire"); s.ctl.setEquipment({ kind: "option", index: 0 }); s.ctl.setName("Vex");
    expect(await s.ctl.create()).toBe(false);
    expect(s.closed()).toBe(0); expect(s.ctl.error).toMatch(/disk full/); expect(s.notices.at(-1)).toMatch(/disk full/);
  });

  it("Back returns a page and Cancel on the first page closes", () => {
    const s = setup(mobile);
    s.click('[data-race="skink"]'); s.next(); expect(s.at()).toBe("background");
    s.click('[data-act="bd-back"]'); expect(s.at()).toBe("race");
    s.click('[data-act="bd-back"]'); expect(s.closed()).toBe(1);
  });
});

function q(s: ReturnType<typeof setup>, sel: string): HTMLElement { return s.q(sel); }

describe.each([["desktop", false], ["mobile", true]] as const)("builder entry point on the %s layout", (_n, mobile) => {
  const open = (note: object, withBuilder: boolean) => {
    let opened = 0;
    const p = parseNote(note); if (p.kind === "none") throw new Error("not a sheet");
    const host: SheetHost = { registry: reg, ruleDefaults: {}, save: () => {}, notify: () => {}, log: [], body: "", ...(withBuilder ? { openBuilder: () => { opened++; } } : {}) };
    const root = document.createElement("div"); document.body.append(root); mountSheet(root, new SheetController(host, p), mobile);
    return { root, opened: () => opened };
  };
  it("an empty sheet offers the builder", () => {
    const s = open({ type: "5e-character", name: "Blank" }, true);
    const b = s.root.querySelector<HTMLElement>('[data-act="open-builder"]')!; expect(b).not.toBeNull();
    b.dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(s.opened()).toBe(1);
  });
  it("a sheet with a class, or a host without a builder, does not", () => {
    expect(open({ type: "5e-character", name: "Old", classes: [{ class: "skirmisher", level: 1 }] }, true).root.querySelector('[data-act="open-builder"]')).toBeNull();
    expect(open({ type: "5e-character", name: "Blank" }, false).root.querySelector('[data-act="open-builder"]')).toBeNull();
  });
});
