// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { CompendiumController, mountCompendium, type CompendiumHost } from "../../src/ui/compendium";
import { LAYOUTS, sheet } from "./review-helpers";
import { thalia } from "../fixtures/notes";

afterEach(() => document.body.replaceChildren());

const owl = { name: "Lamp Owl", size: "Small", ctype: "beast", ac: 11, hp: { average: 4, formula: "1d6+1" }, speed: { walk: 10 }, abilities: { str: 4, dex: 12, con: 10, int: 3, wis: 12, cha: 6 }, cr: "0" };

it("unknown origin and subclass ids are marked missing", () => {
  const s = sheet("desktop", { ...thalia, race: "sky-kin", classes: [{ class: "cleric", subclass: "lantern-domain", level: 5 }] });
  expect(s.all(".fe-id-part.is-missing").map(e => e.textContent)).toEqual(["lantern-domain (missing from compendium)", "sky-kin (missing from compendium)"]);
});

it("the compendium detail clears when the selection leaves the list", () => {
  const r = new Registry(); registerBuiltinTypes(r);
  r.add("vault", "creature", owl, { path: "hb/Lamp Owl.md", sourceName: "Homebrew" });
  r.add("vault", "item", { name: "Calm Draught", kind: "potion" }, { path: "hb/Calm Draught.md", sourceName: "Homebrew" });
  const host: CompendiumHost = { registry: r, switches: () => undefined, target: () => undefined, add: () => "", openNote: () => {} };
  const ctl = new CompendiumController(host), root = document.createElement("div");
  document.body.append(root); mountCompendium(root, ctl, false);
  ctl.setType("creature");
  const lamp = ctl.matches().find(e => e.name === "Lamp Owl");
  expect(lamp).toBeTruthy();
  ctl.select(lamp);
  expect(ctl.visibleSelection()?.name).toBe("Lamp Owl");
  ctl.setType("item"); ctl.setQuery("calm");
  expect(ctl.visibleSelection()).toBeUndefined();
  expect(root.textContent).toContain("Pick an entry to see its card.");
});

it("combos explain themselves when empty", () => {
  const s = sheet("desktop", thalia); s.click(s.q('[data-tab="combos"]'));
  expect(s.q('[data-note="combo-intro"]').textContent).toBe("A combo is your plan for a turn: what to do first, then next.");
  expect(s.q('[data-act="add-combo"]').textContent).toBe("+ Add combo");
  expect(s.q(".fe-combo-empty")).toBeNull();
});

it("only one .fe-badge rule set exists", () => expect(readFileSync("styles.css", "utf8").match(/^\.fe-badge \{/gm)).toHaveLength(1));

for (const layout of LAYOUTS) it(`notes sit in a Notes card and go through the Markdown renderer (${layout})`, () => {
  const seen: string[] = [];
  const s = sheet(layout, thalia, [], { body: "# Backstory", renderMarkdown: (md, el) => { seen.push(md); el.append("rendered"); } });
  expect(seen).toEqual(["# Backstory"]);
  expect(s.q('[data-feature="notes"] .fe-card-title').textContent).toBe("Notes");
});
