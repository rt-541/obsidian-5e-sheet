// @vitest-environment jsdom
import { newCharacter, parseNote, writeInto, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const feat = (name: string, extra: object = {}) => ({ type: "5e-feat", name, grants: [], ...extra });
const reg = homebrewRegistry([
  feat("Keen", { category: "general" }), feat("Snag", { category: "general", minLevel: 4 }), feat("Hush", { category: "origin" }),
  feat("Nova", { category: "epic-boon", minLevel: 19 }), feat("Lore", { category: "origin", abilityPick: { from: ["int", "wis"], patterns: [[1]] } }), feat("Plain"),
  { type: "5e-class", name: "Vigil", hitDie: 8, levels: { 2: [{ op: "asi", feats: ["general"] }], 3: [{ op: "asi", feats: ["general", "origin", "epic-boon"] }], 4: [{ op: "feat", categories: ["origin"] }], 5: [{ op: "asi" }] } },
  { type: "5e-class", name: "Squire", hitDie: 8, levels: { 1: [{ op: "feature", name: "Drill" }] } },
  { type: "5e-background", name: "Wanderer", grants: [{ op: "feat", categories: ["origin"] }] },
  { type: "5e-background", name: "Scholar", grants: [{ op: "feat", feat: "lore" }] },
  { type: "5e-race", name: "Plain Folk", grants: [] },
]);
const abil = { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 8 };
const at = (n: number): Character => ({ ...newCharacter("Tester"), abilities: abil, classes: [{ class: "vigil", level: n }] });
const noteOf = (c: Character) => { const fm: Record<string, unknown> = { type: "5e-character", name: c.name }; writeInto(fm, c); return fm; };

function sheet(c: Character, mobile: boolean) {
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: reg, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(noteOf(c)); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, mobile);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  const next = () => click('[data-act="lu-next"]');
  const toStep = () => { click('[data-act="level-up"]'); click('[data-class="vigil"]'); next(); click('[data-hp="average"]'); next(); };
  return { q, qa, click, next, toStep, last: () => saved[saved.length - 1] as Character };
}
const nextOn = (s: { q: (x: string) => HTMLElement }) => !(s.q('[data-act="lu-next"]') as HTMLButtonElement).disabled;

describe.each([["desktop", false], ["mobile", true]] as const)("feat slots on the %s layout", (_n, mobile) => {
  it("an asi slot words its feat list in plain words and lists only those categories", () => {
    const s = sheet(at(1), mobile); s.toStep();
    s.click('[data-mode="feat"]');
    expect(s.q('[data-feats="heading"]').textContent).toBe("This slot offers general feats");
    const shown = s.qa("[data-feat]").map(r => r.dataset.feat);
    expect(shown).toEqual(expect.arrayContaining(["keen", "plain", "snag"])); expect(shown).not.toContain("hush");
    const snag = s.q('[data-feat="snag"]');
    expect(snag.textContent).toContain("needs level 4"); expect(snag.querySelector("button")).toBeNull();
    (s.q('[data-feat="keen"] button')).click();
    expect(nextOn(s)).toBe(true);
    s.next(); s.click('[data-act="lu-apply"]');
    expect(s.last().feats).toEqual(["keen"]);
  });
  it("several categories are joined in plain words", () => {
    const s = sheet(at(2), mobile); s.toStep();
    s.click('[data-mode="feat"]');
    expect(s.q('[data-feats="heading"]').textContent).toBe("This slot offers general, origin or epic boon feats");
    expect(s.qa("[data-feat]").map(r => r.dataset.feat).sort()).toEqual(expect.arrayContaining(["hush", "keen", "lore", "nova", "snag"]));
  });
  it("a slot without a list offers every feat, with or without a category", () => {
    const s = sheet(at(4), mobile); s.toStep();
    s.click('[data-mode="feat"]');
    expect(s.q('[data-feats="heading"]').textContent).toBe("This slot offers any feat");
    expect(s.qa("[data-feat]").map(r => r.dataset.feat)).toEqual(expect.arrayContaining(["plain", "keen", "hush"]));
  });
  it("a feat op that asks has its own page, and a feat pick brings its ability pick page", () => {
    const s = sheet(at(3), mobile); s.toStep();
    expect(s.q('[data-step="class:vigil:4:feat-0"]')).not.toBeNull();
    expect(s.q('[data-feats="heading"]').textContent).toBe("This slot offers origin feats");
    expect(nextOn(s)).toBe(false);
    expect(s.qa("[data-feat]").map(r => r.dataset.feat).sort()).toEqual(["hush", "lore"]);
    s.q('[data-feat="lore"] button').click(); expect(nextOn(s)).toBe(true);
    s.next();
    expect(s.q('[data-step="feat:lore:pick"]')).not.toBeNull(); expect(nextOn(s)).toBe(false);
    s.click('[data-pattern="0"]');
    const sel = s.q('[data-step="feat:lore:pick"] select') as HTMLSelectElement; sel.value = "wis"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(nextOn(s)).toBe(true);
    s.next(); s.click('[data-act="lu-apply"]');
    expect(s.last().feats).toEqual(["lore"]); expect(s.last().abilities.wis).toBe(13);
  });
});

describe.each([["desktop", false], ["mobile", true]] as const)("the builder and a background's feat on the %s layout", (_n, mobile) => {
  function builder() {
    const host: BuilderHost = { registry: reg, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => {}, createNote: async p => p, open: () => {}, close: () => {} };
    const ctl = new BuilderController(host), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, mobile);
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
    const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
    const nextOn = () => !(q('[data-act="bd-next"]') as HTMLButtonElement).disabled;
    return { ctl, q, qa, click, nextOn };
  }
  const toBackground = (b: ReturnType<typeof builder>, bg: string) => {
    b.click('[data-race="plain-folk"]'); b.click('[data-act="bd-next"]');
    b.click(`[data-background="${bg}"]`); b.click('[data-act="bd-next"]');
    b.click('[data-method="manual"]'); b.click('[data-act="bd-next"]');
    b.click('[data-class="squire"]'); b.click('[data-act="bd-next"]');
  };
  it("asks the background's feat from its categories and does not go on until one is picked", () => {
    const b = builder(); toBackground(b, "wanderer");
    expect(b.q("[data-step]").dataset.step).toBe("background:wanderer:feat-0");
    expect(b.q('[data-feats="heading"]').textContent).toBe("This slot offers origin feats");
    expect(b.nextOn()).toBe(false);
    b.q('[data-feat="hush"] button').click(); expect(b.nextOn()).toBe(true);
    expect(b.ctl.draft.choices["background:wanderer:feat-0"]).toBe("hush");
  });
  it("a fixed feat with an ability pick is asked in the same pattern page and adds to the scores", () => {
    const b = builder(); toBackground(b, "scholar");
    expect(b.q("[data-step]").dataset.step).toBe("feat:lore:pick");
    b.click('[data-pattern="0"]');
    const sel = b.q("select") as HTMLSelectElement; sel.value = "int"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(b.q('[data-result="int"]').textContent).toBe("INT 10 -> 11");
    expect(b.nextOn()).toBe(true);
    expect(b.ctl.character.feats).toEqual(["lore"]);
  });
});
