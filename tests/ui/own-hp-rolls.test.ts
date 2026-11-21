// @vitest-environment jsdom
import { newCharacter, parseNote, writeInto, type Character, type Npc } from "../../src/core/character";
import { seeded } from "../../src/core/dice";
import { applyLevel } from "../../src/core/levelup";
import { SheetController, type SheetHost } from "../../src/ui/controller";
import { mountSheet } from "../../src/ui/sheet";
import { homebrewRegistry } from "../fixtures/homebrew";

const reg = homebrewRegistry();
const L = [{ "class:skirmisher:1:skills": ["acrobatics", "athletics"], "class:skirmisher:1:stance": ["duelist"] }, { "class:skirmisher:2:choose-2": ["stealth"] }];
function upTo(n: number): Character {
  let c: Character = { ...newCharacter("Newbie"), abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 } };
  for (const a of L.slice(0, n)) { const r = applyLevel(c, { class: "skirmisher" }, { hp: { method: "average" }, choices: a }, reg); if ("error" in r) throw new Error(r.error); c = r.value; }
  return c;
}
const noteOf = (c: Character) => { const fm: Record<string, unknown> = { type: "5e-character", name: c.name }; writeInto(fm, c); return fm; };

function setup(c: Character, layout: "desktop" | "tablet" | "mobile") {
  const saved: (Character | Npc)[] = [];
  const host: SheetHost = { registry: reg, ruleDefaults: {}, save: v => saved.push(structuredClone(v)), notify: () => {}, log: [], rng: seeded(11), body: "" };
  const p = parseNote(noteOf(c)); if (p.kind === "none") throw new Error("not a sheet");
  const ctl = new SheetController(host, p), root = document.createElement("div");
  document.body.append(root); mountSheet(root, ctl, layout);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, saved, q, click, last: () => saved[saved.length - 1] as Character };
}

for (const layout of ["desktop", "tablet", "mobile"] as const) describe(`own hit point rolls (${layout})`, () => {
  it("level up offers I rolled it, without the own-dice setting, and takes the typed number", () => {
    const s = setup(upTo(1), layout);
    s.click('[data-act="level-up"]'); s.click('[data-class="skirmisher"]'); s.click('[data-act="lu-next"]');
    s.click('[data-hp="typed"]');
    expect(s.q(".fe-own-roll").textContent).toContain("1d8");
    (s.q('[data-keep="own-total"]') as HTMLInputElement).value = "8"; s.click('[data-act="own-apply"]');
    expect(s.q('[data-result="hp"]').textContent).toBe("Rolled 8 +2 Constitution = 10 hit points");
    expect(s.q('[data-hp="typed"]').getAttribute("aria-pressed")).toBe("true");
    s.click('[data-act="lu-next"]'); s.click('[data-opt="stealth"]'); s.click('[data-act="lu-next"]'); s.click('[data-act="lu-apply"]');
    expect(s.last().hp.max).toBe(20); expect(s.last().levelLog[1].hp).toMatchObject({ method: "roll", gained: 8, added: 10 });
  });

  it("Edit mode lists hit points by level and changing a roll fixes the record and the maximum", () => {
    const s = setup(upTo(2), layout);
    expect(s.q('[data-part="level-hp"]')).toBeNull();                         // Play mode: not shown
    s.ctl.setEditing(true);
    const rows = [...s.root.querySelectorAll<HTMLElement>('[data-part="level-hp"] [data-level-hp]')];
    expect(rows.map(r => r.dataset.levelHp)).toEqual(["0", "1"]);
    expect(rows[0].textContent).toContain("full hit die"); expect(rows[0].querySelector("input")).toBeNull();
    expect(rows[1].textContent).toContain("Skirmisher 2");
    const box = rows[1].querySelector('input[data-act="level-hp-roll"]') as HTMLInputElement;
    expect(box.type).toBe("number"); expect(box.min).toBe("1"); expect(box.max).toBe("8"); expect(box.value).toBe("5");
    box.value = "8"; box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(s.last().levelLog[1].hp).toMatchObject({ method: "roll", gained: 8, added: 10 });
    expect(s.last().hp.max).toBe(20);
    const again = s.q('[data-part="level-hp"] [data-level-hp="1"] input') as HTMLInputElement;
    again.value = "12"; again.dispatchEvent(new Event("change", { bubbles: true }));
    expect(s.last().hp.max).toBe(20);                                           // refused: outside the die
  });
});
