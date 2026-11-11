// @vitest-environment jsdom
import { foodDays, findRations } from "../../src/rules/hexploration";
import { DESKTOP, MOBILE, TABLET, placed } from "../../src/ui/layouts";
import { makeChar, mechanicsRegistry } from "../fixtures/mechanics";
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

const ON = { rules: { hexploration: true } };
type S = ReturnType<typeof setup>;
/** Make the next d20 come up as `d`. */
const rig = (s: S, d: number) => { s.host.rng = () => (d - 1) / 20 + 0.01; };
const survival = (s: S) => s.ctl.stats()!.skills.find(k => k.id === "survival")!.mod;

describe("forage math", () => {
  it("nothing under 10, then 1 day at 10, and one more for each 5 above", () => {
    expect([0, 9, 10, 14, 15, 19, 20, 24, 25, 30].map(foodDays)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 5]);
  });
});

describe("finding the rations entry", () => {
  const r = mechanicsRegistry();
  it("matches the compendium rations, a rations-1-day id and any name with ration in it", () => {
    expect(findRations(makeChar({ inventory: [{ id: "tin-whistle" }, { id: "rations" }] }), r)).toBe(1);
    expect(findRations(makeChar({ inventory: [{ id: "rations-1-day" }] }), r)).toBe(0);
    expect(findRations(makeChar({ inventory: [{ name: "Trail Rations" }] }), r)).toBe(0);
    expect(findRations(makeChar({ inventory: [{ name: "Torch" }] }), r)).toBe(-1);
  });
});

describe("rule module", () => {
  it("places the rations card exactly once per layout, beside Resources", () => {
    for (const l of [DESKTOP, TABLET, MOBILE]) expect(placed(l).filter(f => f === "rations")).toHaveLength(1);
    const col = (l: typeof DESKTOP, tab: string) => l.tabs.find(t => t.id === tab)!.columns.find(c => c.includes("rations"))!;
    for (const [l, tab] of [[DESKTOP, "main"], [TABLET, "main"], [MOBILE, "combat"]] as const) expect(col(l, tab).indexOf("rations")).toBe(col(l, tab).indexOf("resources") + 1);
  });
});

for (const layout of LAYOUTS) {
  describe(`hexploration rations (${layout})`, () => {
    it("the card is hidden while the rule is off", () => {
      const s = setup(layout, { inventory: [{ id: "rations", qty: 3 }] });
      expect(s.root.querySelector('[data-feature="rations"]')).toBeNull();
    });
    it("Customize lists the rule and switching it on shows the card", () => {
      const s = setup(layout);
      s.ctl.setEditing(true); s.ctl.open({ kind: "customize" });
      expect(s.q('[data-rule="hexploration"]')).not.toBeNull();
      expect(s.q(".fe-panel").textContent).toContain("Hexploration: rations and foraging");
      s.click(s.q('[data-rule="hexploration"]'));
      expect(s.root.querySelectorAll('[data-feature="rations"]')).toHaveLength(1);
    });
    it("shows the count and days of food, with a stepper on the ordinary inventory entry", () => {
      const s = setup(layout, { ...ON, inventory: [{ id: "rations", qty: 3 }] });
      const card = s.q('[data-feature="rations"]');
      expect(card.querySelector('[data-note="rations-count"]')!.textContent).toBe("3 rations (3 days)");
      s.click(card.querySelector('[data-act="qty-minus"]'));
      expect(s.char().inventory[0].qty).toBe(2);
      expect(s.q('[data-feature="rations"] [data-note="rations-count"]').textContent).toBe("2 rations (2 days)");
      expect(s.row("Rations (1 day)").querySelector('[data-act="qty"]')!.textContent).toBe("2");
      s.click(s.q('[data-feature="rations"] [data-act="qty-plus"]'));
      expect(s.char().inventory[0].qty).toBe(3);
    });
    it("at 0 the entry stays, greyed out", () => {
      const s = setup(layout, { ...ON, inventory: [{ id: "rations", qty: 1 }] });
      s.click(s.q('[data-feature="rations"] [data-act="qty-minus"]'));
      expect(s.char().inventory).toHaveLength(1);
      expect(s.q('[data-feature="rations"] [data-rations]').classList.contains("is-used-up")).toBe(true);
      expect(s.q('[data-feature="rations"] [data-note="rations-count"]').textContent).toBe("0 rations (0 days)");
    });
    it("+ Add rations adds the library rations when the pack has none", () => {
      const s = setup(layout, ON);
      s.click(s.q('[data-feature="rations"] [data-act="add-rations"]'));
      expect(s.char().inventory.map(e => [e.id, e.qty])).toEqual([["rations", 1]]);
      expect(s.q('[data-feature="rations"] [data-note="rations-count"]').textContent).toBe("1 ration (1 day)");
    });
    it("+ Add rations falls back to a custom Rations (1 day) entry weighing 2 lb when the library has none", () => {
      const s = setup(layout, ON);
      const get = s.host.registry.get.bind(s.host.registry);
      s.host.registry.get = ((t: string, id: string) => (t === "item" && id === "rations" ? undefined : get(t, id))) as typeof get;
      s.ctl.addRations(1);
      expect(s.char().inventory[0]).toEqual({ name: "Rations (1 day)", qty: 1, equipped: false, attuned: false, weight: 2, consumable: true });
      expect(findRations(s.char(), s.host.registry)).toBe(0);
    });
    it("a custom Trail rations entry is found and used", () => {
      const s = setup(layout, { ...ON, inventory: [{ name: "Trail rations", qty: 4 }] });
      expect(s.q('[data-note="rations-count"]').textContent).toBe("4 rations (4 days)");
    });

    it("Forage (4 hours) rolls Wisdom (Survival) with the Survival modifier", () => {
      const s = setup(layout, ON); rig(s, 8);
      s.click(s.q('[data-act="forage"]'));
      const r = s.host.log[0];
      expect(r.title).toBe("Forage (Wisdom, Survival)");
      expect(r.dice).toEqual([8]); expect(r.total).toBe(8 + survival(s));
    });
    it("a roll under 10 finds nothing", () => {
      const s = setup(layout, ON); rig(s, 5);
      s.click(s.q('[data-act="forage"]'));
      expect(s.notices.at(-1)).toBe(`Found nothing to eat (rolled ${5 + survival(s)}, needed 10).`);
      expect(s.char().rest.foraged).toBeUndefined(); expect(s.char().inventory).toHaveLength(0);
    });
    it("finding 3 days feeds tonight and puts 2 rations in the pack", () => {
      const s = setup(layout, { ...ON, inventory: [{ id: "rations", qty: 1 }] }); rig(s, 20 - 1 + 1);   // 20 + mod: at least 10 + 5 + 5
      s.click(s.q('[data-act="forage"]'));
      const days = foodDays(20 + survival(s));
      expect(days).toBeGreaterThanOrEqual(3);
      expect(s.char().rest.foraged).toBe(1);
      expect(s.char().inventory[0].qty).toBe(1 + days - 1);
      expect(s.notices.at(-1)).toBe(`Found food for ${days} days: tonight's meal plus ${days - 1} rations into your pack`);
      expect(s.q('[data-feature="rations"]').textContent).toContain("You found food for tonight's meal.");
    });
    it("exactly 10 is one day: just tonight's meal", () => {
      const s = setup(layout, ON); rig(s, 10 - survival(s));
      s.click(s.q('[data-act="forage"]'));
      expect(s.notices.at(-1)).toBe("Found food for 1 day: tonight's meal");
      expect(s.char().rest.foraged).toBe(1); expect(s.char().inventory).toHaveLength(0);
    });
    it("foraging again before eating puts the whole find in the pack", () => {
      const s = setup(layout, { ...ON, rest: { nightsInPlace: 0, foraged: 1 } }); rig(s, 10 - survival(s));
      s.click(s.q('[data-act="forage"]'));
      expect(s.char().rest.foraged).toBe(1);
      expect(s.char().inventory[0]).toMatchObject({ id: "rations", qty: 1 });
      expect(s.notices.at(-1)).toBe("Found food for 1 day: 1 ration into your pack");
    });
    it("Quick forage rolls with disadvantage", () => {
      const s = setup(layout, ON); rig(s, 12);
      s.click(s.q('[data-act="forage-quick"]'));
      const r = s.host.log[0];
      expect(r.title).toBe("Quick forage (Wisdom, Survival)");
      expect(r.dice).toHaveLength(2); expect(r.detail).toContain("dis [");
      s.click(s.q('[data-act="forage"]'));
      expect(s.host.log[0].dice).toHaveLength(1);   // an ordinary forage is unchanged
    });
    it("the player's own advantage cancels the hurried forage's disadvantage", () => {
      const s = setup(layout, ON); rig(s, 12); s.ctl.setMode("adv");
      s.click(s.q('[data-act="forage-quick"]'));
      expect(s.host.log[0].dice).toHaveLength(1);
    });
    it("other rolls ignore the new mode override", () => {
      const s = setup(layout, ON); rig(s, 12);
      s.ctl.roll("Plain", 2, { kind: "check", abil: "str" });
      expect(s.host.log[0].dice).toHaveLength(1);
      s.ctl.setMode("dis"); s.ctl.roll("Plain", 2, { kind: "check", abil: "str" });
      expect(s.host.log[0].dice).toHaveLength(2);
    });
  });

  describe(`hexploration nights (${layout})`, () => {
    const night = { rules: { hexploration: true, "rest-excursion": true } };
    const rest = (s: S, id: string) => { s.ctl.open({ kind: "rest", id }); s.click(s.q('[data-act="rest-apply"]')); };
    it("a night eats one ration and the rest summary says so", () => {
      const s = setup(layout, { ...night, inventory: [{ id: "rations", qty: 3 }] });
      rest(s, "night");
      expect(s.char().inventory[0].qty).toBe(2);
      expect(s.host.log[0].detail).toContain("Ate a ration (2 left)");
    });
    it("the rest panel previews the meal before you apply it, without eating it", () => {
      const s = setup(layout, { ...night, inventory: [{ id: "rations", qty: 3 }] });
      s.ctl.open({ kind: "rest", id: "night" });
      expect(s.q(".fe-panel").textContent).toContain("Ate a ration (2 left)");
      expect(s.char().inventory[0].qty).toBe(3);
    });
    it("a long rest under standard rests is a night too", () => {
      const s = setup(layout, { ...ON, inventory: [{ id: "rations", qty: 2 }] });
      rest(s, "long");
      expect(s.char().inventory[0].qty).toBe(1);
    });
    it("a short rest eats nothing", () => {
      const s = setup(layout, { ...ON, inventory: [{ id: "rations", qty: 2 }] });
      rest(s, "short");
      expect(s.char().inventory[0].qty).toBe(2);
    });
    it("foraged food is eaten first and the count is cleared", () => {
      const s = setup(layout, { ...night, rest: { nightsInPlace: 0, foraged: 1 }, inventory: [{ id: "rations", qty: 3 }] });
      rest(s, "night");
      expect(s.char().inventory[0].qty).toBe(3);
      expect(s.char().rest.foraged).toBeUndefined();
      expect(s.host.log[0].detail).toContain("Ate the food you foraged today");
    });
    it("with none left you go hungry, and the entry stays at 0", () => {
      const s = setup(layout, { ...night, inventory: [{ id: "rations", qty: 0 }] });
      rest(s, "night");
      expect(s.host.log[0].detail).toContain("No rations left: you go hungry tonight");
      expect(s.char().inventory).toHaveLength(1); expect(s.char().inventory[0].qty).toBe(0);
    });
    it("with no rations entry at all you go hungry too", () => {
      const s = setup(layout, night);
      rest(s, "night");
      expect(s.host.log[0].detail).toContain("No rations left: you go hungry tonight");
    });
    it("rests are untouched while the rule is off", () => {
      const s = setup(layout, { rules: { "rest-excursion": true }, inventory: [{ id: "rations", qty: 3 }] });
      rest(s, "night");
      expect(s.char().inventory[0].qty).toBe(3); expect(s.host.log[0].detail).not.toContain("ration");
    });
  });
}

describe("rest.foraged in the note", () => {
  it("is read, kept off the note when 0, and a bad value is an error", () => {
    expect(makeChar({ rest: { nightsInPlace: 1, foraged: 2 } }).rest).toEqual({ nightsInPlace: 1, foraged: 2 });
    expect(makeChar({ rest: { nightsInPlace: 1 } }).rest).toEqual({ nightsInPlace: 1 });
  });
});
