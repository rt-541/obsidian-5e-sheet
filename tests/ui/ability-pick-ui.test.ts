// @vitest-environment jsdom
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { homebrewRegistry } from "../fixtures/homebrew";

const race = { type: "5e-race", name: "Plain", grants: [] };
const drifter = { type: "5e-background", name: "Drifter", ability: [{ wis: 1 }], abilityPick: { from: ["str", "con", "wis"], patterns: [[2, 1], [1, 1, 1]] }, grants: [] };
const brute = { type: "5e-class", name: "Brute", hitDie: 12, levels: { 1: [{ op: "feature", name: "Rage" }] } };
const reg = homebrewRegistry([race, drifter, brute]);

function setup(mobile: boolean) {
  const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => {}, createNote: async p => p, open: () => {}, close: () => {} };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, mobile); ctl.go(1);   // page 0 is the edition page
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const choose = (el: HTMLElement, v: string) => { (el as HTMLSelectElement).value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
  const nextOn = () => !(q('[data-act="bd-next"]') as HTMLButtonElement).disabled;
  return { ctl, q, qa, click, choose, nextOn };
}

describe.each([["desktop", false], ["mobile", true]] as const)("background ability pick page on the %s layout", (_n, mobile) => {
  function toPage() {
    const s = setup(mobile);
    s.click('[data-race="plain"]'); s.click('[data-act="bd-next"]');
    s.click('[data-background="drifter"]'); s.click('[data-act="bd-next"]');
    s.click('[data-method="manual"]'); s.click('[data-act="bd-next"]');
    s.click('[data-class="brute"]'); s.click('[data-act="bd-next"]');
    return s;
  }
  it("shows a button per pattern, a select per number and the result per ability", () => {
    const s = toPage();
    expect(s.q("[data-step]").dataset.step).toBe("background:drifter:pick");
    expect(s.nextOn()).toBe(false);
    expect(s.qa("[data-pattern]").map(b => b.textContent)).toEqual(["+2 to one ability and +1 to another", "+1 to each of three abilities"]);
    expect(s.qa("select")).toHaveLength(0);
    s.click('[data-pattern="0"]');
    const sels = s.qa("select");
    expect(sels.map(x => x.getAttribute("aria-label"))).toEqual(["Which ability gets +2", "Which ability gets +1"]);
    expect([...sels[0].querySelectorAll("option")].map(o => o.value)).toEqual(["", "str", "con", "wis"]);
    expect(s.nextOn()).toBe(false);
    s.choose(s.qa("select")[0], "str"); s.choose(s.qa("select")[1], "con");
    expect(s.q('[data-result="str"]').textContent).toBe("STR 10 -> 12");
    expect(s.q('[data-result="con"]').textContent).toBe("CON 10 -> 11");
    expect(s.q('[data-result="wis"]').textContent).toBe("WIS 11");
    expect(s.qa("[data-result]")).toHaveLength(6);
    expect(s.nextOn()).toBe(true);
  });
  it("will not take one ability twice, and switching pattern starts the picks again", () => {
    const s = toPage();
    s.click('[data-pattern="1"]');
    s.choose(s.qa("select")[0], "str");
    const second = [...s.qa("select")[1].querySelectorAll<HTMLOptionElement>("option")];
    expect(second.find(o => o.value === "str")!.disabled).toBe(true);
    s.choose(s.qa("select")[1], "con"); s.choose(s.qa("select")[2], "wis");
    expect(s.nextOn()).toBe(true);
    s.click('[data-pattern="0"]');
    expect(s.nextOn()).toBe(false);
    expect(s.qa("select")).toHaveLength(2);
  });
  it("shows the score stopping at 20", () => {
    const s = setup(mobile);
    s.click('[data-race="plain"]'); s.click('[data-act="bd-next"]');
    s.click('[data-background="drifter"]'); s.click('[data-act="bd-next"]');
    s.click('[data-method="manual"]');
    const strIn = s.q('[data-abil="str"] input[data-base]') as HTMLInputElement; strIn.value = "19"; strIn.dispatchEvent(new Event("change", { bubbles: true }));
    s.click('[data-act="bd-next"]'); s.click('[data-class="brute"]'); s.click('[data-act="bd-next"]');
    s.click('[data-pattern="0"]'); s.choose(s.qa("select")[0], "str"); s.choose(s.qa("select")[1], "con");
    expect(s.q('[data-result="str"]').textContent).toBe("STR 19 -> 20");
  });
  it("never lowers a score already above 20", () => {
    const s = setup(mobile);
    s.click('[data-race="plain"]'); s.click('[data-act="bd-next"]');
    s.click('[data-background="drifter"]'); s.click('[data-act="bd-next"]');
    s.click('[data-method="manual"]');
    const strIn = s.q('[data-abil="str"] input[data-base]') as HTMLInputElement; strIn.value = "22"; strIn.dispatchEvent(new Event("change", { bubbles: true }));
    s.click('[data-act="bd-next"]'); s.click('[data-class="brute"]'); s.click('[data-act="bd-next"]');
    s.click('[data-pattern="0"]'); s.choose(s.qa("select")[0], "str"); s.choose(s.qa("select")[1], "con");
    expect(s.q('[data-result="str"]').textContent).toBe("STR 22");
  });
  it("labels each score bonus with its own source and says backgrounds add too", () => {
    const s = setup(mobile);
    s.click('[data-race="plain"]'); s.click('[data-act="bd-next"]');
    s.click('[data-background="drifter"]'); s.click('[data-act="bd-next"]');
    expect(s.q('[data-abil="wis"] [data-origin]').textContent).toBe("background +1");
    expect(s.q('[data-abil="str"] [data-origin]')).toBeNull();
    expect(s.q("[data-step=\"scores\"]").textContent).toContain("the background's");
  });
});
