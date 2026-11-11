// @vitest-environment jsdom
import { parseNote } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { ROLL_SCHEMES, rollScores, describeRoll } from "../../src/core/builder";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { homebrewRegistry } from "../fixtures/homebrew";

const squire = { type: "5e-class", name: "Squire", hitDie: 10, saves: ["str", "con"], levels: { 1: [{ op: "feature", name: "Drill" }] } };
const reg = homebrewRegistry([squire]);

function setup(mobile = false) {
  const created: { path: string; fm: Record<string, unknown> }[] = [];
  const host: BuilderHost = { registry: reg, rng: seeded(11), folder: "Characters", exists: () => false, notify: () => undefined,
    createNote: async (path, fm) => { created.push({ path, fm }); return path; }, open: () => undefined, close: () => undefined };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const next = () => click('[data-act="bd-next"]');
  const nextOn = () => !(q('[data-act="bd-next"]') as HTMLButtonElement).disabled;
  const pick = (a: string, v: number) => { const sel = q(`[data-abil="${a}"] select`) as HTMLSelectElement; sel.value = String(v); sel.dispatchEvent(new Event("change", { bubbles: true })); };
  s0(ctl);
  next(); click('[data-race="skink"]'); next(); next();
  return { ctl, root, q, qa, click, next, nextOn, pick, created };
}
function s0(_c: BuilderController) { /* start on the edition page */ }
afterEach(() => document.body.replaceChildren());

describe.each([["desktop", false], ["mobile", true]] as const)("rolling for scores in the builder on the %s layout", (_n, mobile) => {
  it("offers a Roll method and the five ways with their labels", () => {
    const s = setup(mobile);
    expect(s.qa("[data-method]").map(b => b.dataset.method)).toEqual(["point-buy", "standard-array", "manual", "rolled"]);
    expect(s.q('[data-method="rolled"]').textContent).toBe("Roll");
    expect(s.q('[data-method="rolled"]').getAttribute("type")).toBe("button");
    expect(s.root.textContent).toContain("Rolled your own dice at the table? Choose Manual and type the numbers.");
    expect(s.q("[data-scheme]")).toBeNull();
    s.click('[data-method="rolled"]');
    expect(s.qa("[data-scheme]").map(b => [b.dataset.scheme, b.querySelector(".fe-name")!.textContent])).toEqual(ROLL_SCHEMES.map(x => [x.id, x.label]));
    for (const [i, b] of s.qa("[data-scheme]").entries()) { expect(b.getAttribute("type")).toBe("button"); expect(b.getAttribute("title")).toBe(ROLL_SCHEMES[i].text); }
    expect(s.root.textContent).toContain("Pick how to roll.");
    expect(s.qa("[data-abil]")).toHaveLength(0);
    expect(s.q("[data-roll]")).toBeNull();
    expect(s.nextOn()).toBe(false);
  });

  it("pressing a way shows six roll lines and six selects of the rolled totals", () => {
    const s = setup(mobile);
    s.click('[data-method="rolled"]'); s.click('[data-scheme="4d6-drop-lowest"]');
    const expected = rollScores("4d6-drop-lowest", seeded(11));
    expect(s.qa("[data-roll]").map(r => r.textContent)).toEqual(expected.map(describeRoll));
    expect(s.qa("[data-roll]").map(r => r.dataset.roll)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(s.root.textContent).toContain("Give each number to one ability. Picking a number another ability has swaps them.");
    expect(s.qa("[data-abil]")).toHaveLength(6);
    const totals = expected.map(r => r.total);
    expect(s.ctl.draft.scores).toEqual({ str: totals[0], dex: totals[1], con: totals[2], int: totals[3], wis: totals[4], cha: totals[5] });
    for (const sel of s.qa("[data-abil] select")) expect([...(sel as HTMLSelectElement).options].map(o => +o.value).sort((a, b) => a - b)).toEqual([...new Set(totals)].sort((a, b) => a - b));
    expect(s.qa("[data-abil] [data-final]")).toHaveLength(6);
    expect(s.nextOn()).toBe(true);
  });

  it("picking a total another ability holds swaps them", () => {
    const s = setup(mobile);
    s.click('[data-method="rolled"]'); s.click('[data-scheme="1d20"]');
    const before = { ...s.ctl.draft.scores };
    const want = before.dex;
    if (want === before.str) throw new Error("seed gives equal first two rolls; pick another seed");
    s.pick("str", want);
    expect(s.ctl.draft.scores.str).toBe(want); expect(s.ctl.draft.scores.dex).toBe(before.str);
    expect(s.nextOn()).toBe(true);
  });

  it("rolling again needs a second tap; the first changes nothing and any other action disarms it", () => {
    const s = setup(mobile);
    s.click('[data-method="rolled"]'); s.click('[data-scheme="3d6"]');
    const first = JSON.stringify(s.ctl.draft.rolled), label = s.q('[data-scheme="3d6"]').textContent;
    s.click('[data-scheme="3d6"]');
    expect(JSON.stringify(s.ctl.draft.rolled)).toBe(first);
    expect(s.q('[data-scheme="3d6"]').textContent).not.toBe(label);
    expect(s.q('[data-scheme="3d6"]').textContent).toContain("Tap again");
    s.click('[data-scheme="3d6"]');
    expect(JSON.stringify(s.ctl.draft.rolled)).not.toBe(first);
    expect(s.q('[data-scheme="3d6"]').textContent).toBe(label);
    // arm, then do something else: disarmed
    s.click('[data-scheme="3d6"]'); expect(s.q('[data-scheme="3d6"]').textContent).toContain("Tap again");
    s.pick("str", s.ctl.draft.scores.dex);
    expect(s.q('[data-scheme="3d6"]').textContent).toBe(label);
    // a different way is a roll of its own kind and also needs the second tap
    const held = JSON.stringify(s.ctl.draft.rolled);
    s.click('[data-scheme="1d20"]'); expect(JSON.stringify(s.ctl.draft.rolled)).toBe(held);
  });

  it("switching to another method and back clears the rolls", () => {
    const s = setup(mobile);
    s.click('[data-method="rolled"]'); s.click('[data-scheme="3d6"]');
    s.click('[data-method="manual"]'); expect(s.ctl.draft.rolled).toBeUndefined();
    s.click('[data-method="rolled"]');
    expect(s.qa("[data-roll]")).toHaveLength(0); expect(s.qa("[data-abil]")).toHaveLength(0); expect(s.nextOn()).toBe(false);
  });

  it("the finished note holds the assigned totals plus origin bonuses", async () => {
    const s = setup(mobile);
    s.click('[data-method="rolled"]'); s.click('[data-scheme="3d6-and-1d20"]');
    const t = rollScores("3d6-and-1d20", seeded(11)).map(r => r.total);
    s.pick("str", t[5]);
    s.ctl.setClass("squire"); s.ctl.pick("race:skink:choose-2", ["elvish"]); s.ctl.setName("Vex");
    const r = s.ctl.preview();
    if ("error" in r) throw new Error(r.error);
    const assigned = s.ctl.draft.scores, bonus = s.ctl.originBonus(), ab = r.value.abilities;
    expect(assigned.str).toBe(t[5]);
    expect(Object.values(assigned).sort((x, y) => x - y)).toEqual([...t].sort((x, y) => x - y));
    for (const a of ["str", "dex", "con", "int", "wis", "cha"] as const) expect(ab[a]).toBe(assigned[a] + (bonus[a] ?? 0));
    expect(r.summary.some(l => l.startsWith("Ability scores rolled with Four 3d6 and two 1d20: "))).toBe(true);
    expect(await s.ctl.create()).toBe(true);
    const parsed = parseNote(JSON.parse(JSON.stringify(s.created[0].fm)));
    expect(parsed.kind).toBe("character");
  });

  it("the three old methods render as before", () => {
    const s = setup(mobile);
    expect(s.qa("[data-abil]")).toHaveLength(6); expect(s.q("[data-scheme]")).toBeNull(); expect(s.q("[data-roll]")).toBeNull();
    expect(s.q('[data-base="str"]').textContent).toBe("8"); expect(s.root.textContent).toContain("27 of 27 points left");
    s.click('[data-method="standard-array"]'); expect(s.qa("[data-abil] select")).toHaveLength(6); expect(s.root.textContent).toContain("Assign 15, 14, 13, 12, 10, 8 once each");
    s.click('[data-method="manual"]'); expect(s.qa("[data-abil] input")).toHaveLength(6); expect(s.root.textContent).toContain("Type the scores you rolled or were given");
  });
});
