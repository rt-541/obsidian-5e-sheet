// @vitest-environment jsdom
import type { Registry } from "../../src/content/registry";
import type { GrantsData } from "../../src/content/types";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { backgroundPitch } from "../../src/ui/builder-pitch";
import { editionRegistry } from "../fixtures/editions";
import { homebrewRegistry } from "../fixtures/homebrew";

const grant = (extra: Record<string, unknown>) => ({ op: "grant", proficiencies: [], languages: [], ...extra });
const drifter = { type: "5e-background", name: "Drifter", abilityPick: { from: ["str", "dex", "con"], patterns: [[2, 1], [1, 1, 1]] },
  grants: [grant({ proficiencies: ["skill:sleight-of-hand", "skill:stealth", "tool:rope kit"] }), { op: "feat", feat: "tough-mind" }, { op: "feature", name: "Wander", text: "You find roads." }] };
const wanderer = { type: "5e-background", name: "Wanderer",
  grants: [{ op: "choose", what: "skills", count: 2, from: ["stealth", "insight", "survival"] }, grant({ languages: ["elvish"] }), { op: "choose", what: "languages", count: 1 }, { op: "choose", what: "tools", count: 1 }, { op: "feat", categories: ["general"] }] };
const blank = { type: "5e-background", name: "Blank", grants: [{ op: "feature", name: "Nothing", text: "Plain." }] };
const reg = homebrewRegistry([drifter, wanderer, blank]);
const pitchOf = (r: Registry, id: string) => backgroundPitch(r.get<GrantsData>("background", id)!, r);

describe("backgroundPitch", () => {
  it("names skills, tools, the fixed feat and the ability pick", () => {
    expect(pitchOf(reg, "drifter")).toBe("Sleight of Hand, Stealth · Rope Kit · Feat: Tough Mind · Raises Strength, Dexterity or Constitution");
  });
  it("counts choices", () => {
    expect(pitchOf(reg, "wanderer")).toBe("2 skills of your choice · a tool of your choice · Elvish, 1 language of your choice · a feat of your choice");
  });
  it("is empty when the note gives nothing to summarise", () => {
    expect(pitchOf(reg, "blank")).toBe("");
  });
  it("turns an unknown feat id into words", () => {
    const r = homebrewRegistry([{ type: "5e-background", name: "Odd", grants: [{ op: "feat", feat: "lone-star" }] }]);
    expect(pitchOf(r, "odd")).toBe("Feat: Lone Star");
  });
});

function setup(r: Registry, mobile: boolean) {
  const host: BuilderHost = { registry: r, rng: seeded(4), folder: "Characters", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined };
  const ctl = new BuilderController(host), root = document.createElement("div");
  document.body.append(root); mountBuilder(root, ctl, mobile);
  ctl.go(ctl.pages().findIndex(p => p.id === "background"));
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const click = (sel: string) => { const el = q(sel); if (!el) throw new Error("missing " + sel); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
  return { ctl, root, q, qa, click };
}
afterEach(() => document.body.replaceChildren());

describe.each([["desktop", false], ["mobile", true]] as const)("the builder's background page on the %s layout", (_n, mobile) => {
  it("shows the summary on each row and opens and closes the details", () => {
    const s = setup(reg, mobile);
    const row = (id: string) => s.q(`[data-row="background"] [data-background="${id}"]`).closest('[data-row="background"]') as HTMLElement;
    expect(row("drifter").textContent).toContain("Sleight of Hand, Stealth · Rope Kit");
    expect(row("wanderer").textContent).toContain("2 skills of your choice");
    expect(s.q('[data-background=""]')).not.toBeNull();
    expect(row("drifter").querySelector(".fe-detail")).toBeNull();
    const about = '[data-row="background"] [data-act="about"][aria-label="About Drifter"]';
    s.click(about);
    expect(row("drifter").querySelector(".fe-detail")?.textContent).toContain("Wander");
    expect(row("drifter").querySelector('[data-act="about"]')!.getAttribute("aria-expanded")).toBe("true");
    s.click(about);
    expect(row("drifter").querySelector(".fe-detail")).toBeNull();
  });

  it("picking still sets the draft and No background clears it", () => {
    const s = setup(reg, mobile);
    s.click('[data-background="drifter"]'); expect(s.ctl.draft.background).toBe("drifter");
    s.click('[data-background=""]'); expect(s.ctl.draft.background).toBeUndefined();
  });

  it("keeps the bring-in button and the edition chip on a brought-in background", async () => {
    const { r } = await editionRegistry();
    r.add("vault", "background", { name: "Newer", grants: [grant({ proficiencies: ["skill:stealth"] })] }, { path: "hb/Newer.md", edition: "2024" });
    const s = setup(r, mobile);
    expect(s.q('[data-act="bring-in"]')).not.toBeNull();
    s.click('[data-act="bring-in"]');
    const row = s.q('[data-row="background"]');
    expect(row.querySelector(".fe-edition")?.textContent).toBe("2024");
    expect(row.textContent).toContain("Stealth");
    expect(s.q('[data-act="bring-back"]')).not.toBeNull();
  });
});
