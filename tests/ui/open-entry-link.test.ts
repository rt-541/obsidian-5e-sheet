// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { Registry } from "../../src/content/registry";
import { seeded } from "../../src/core/dice";
import { BuilderController, type BuilderHost } from "../../src/ui/builder";
import { mountBuilder } from "../../src/ui/builder-ui";
import { editionRegistry } from "../fixtures/editions";
import { homebrewRegistry } from "../fixtures/homebrew";
import { LAYOUTS, sheet } from "./review-helpers";

const css = readFileSync("styles.css", "utf8");
const glimmer = { type: "5e-spell", name: "Glimmer", level: 1, school: "Evocation", classes: ["wizard"] };
const charm = { type: "5e-item", name: "Warding Charm", kind: "wondrous", rarity: "rare", effects: { modifiers: [{ target: "ac", value: 1 }] } };
const note = { type: "5e-character", name: "Brann", classes: [{ class: "skirmisher", level: 3 }], inventory: [{ id: "warding-charm" }, { id: "dagger" }], spells: [{ id: "glimmer", prepared: true }, { id: "burning-hands", prepared: true }], feats: ["tough-mind"] };
const extra = [glimmer, charm];

for (const layout of LAYOUTS) {
  describe(`links to the entry's note on the cards (${layout})`, () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });
    const pop$ = () => document.querySelector(".fe-popover") as HTMLElement | null;
    /** The element on the sheet that carries `ref`, or (for refs this fixture does not render on every layout) one stood in for it. */
    const target = (s: ReturnType<typeof sheet>, ref: string): HTMLElement => {
      let el = s.root.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
      if (!el) { el = document.createElement("span"); el.dataset.ref = ref; s.root.append(el); }
      return el;
    };
    /** Desktop: hover until the popover shows. Touch: tap and read the details panel. */
    const show = (s: ReturnType<typeof sheet>, ref: string): HTMLElement => {
      const el = target(s, ref);
      if (layout === "desktop") { el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300); return pop$()!; }
      el.dispatchEvent(new MouseEvent("click", { bubbles: true })); return s.q('[data-panel="details"]');
    };
    const link = (card: HTMLElement) => card.querySelector<HTMLButtonElement>("button.fe-open-note");
    const opened = () => { const calls: string[] = []; return { calls, openNote: (p: string) => { calls.push(p); } }; };

    for (const [what, ref, name, path] of [["a class", "identity:class:skirmisher", "Skirmisher", "hb/Skirmisher.md"], ["a spell", "spell:glimmer", "Glimmer", "hb/Glimmer.md"],
      ["a feat", "feat:tough-mind", "Tough Mind", "hb/Tough Mind.md"], ["an item", "item:warding-charm", "Warding Charm", "hb/Warding Charm.md"]] as const) {
      it(`the card of ${what} has the link, and a click opens that note once and closes the popover`, () => {
        const h = opened(), s = sheet(layout, note, extra, { openNote: h.openNote });
        const card = show(s, ref), b = link(card)!;
        expect(b, ref).not.toBeNull();
        expect(b.type).toBe("button"); expect(b.dataset.act).toBe("open-note"); expect(b.dataset.path).toBe(path);
        expect(b.getAttribute("aria-label")).toBe(`Open ${name} in a new tab`);
        expect(b.textContent).toContain(name);
        b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(h.calls).toEqual([path]);
        if (layout === "desktop") expect(pop$()).toBeNull();
      });
    }
    it("an inventory item's card has the link", () => {
      const h = opened(), s = sheet(layout, { ...note, inventory: [{ id: "warding-charm", row: "r1", change: { notes: "Mine." } }] }, extra, { openNote: h.openNote });
      const card = show(s, "inv:r1"); expect(card.textContent).toContain("Mine.");
      const b = link(card)!; expect(b.dataset.path).toBe("hb/Warding Charm.md");
      b.dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(h.calls).toEqual(["hb/Warding Charm.md"]);
    });
    it("an entry bundled with the plugin has no note, so no link", () => {
      const h = opened(), s = sheet(layout, note, extra, { openNote: h.openNote });
      for (const ref of ["spell:burning-hands", "item:dagger"]) { const c = show(s, ref); expect(c.textContent, ref).not.toBe(""); expect(link(c), ref).toBeNull(); document.querySelectorAll(".fe-popover").forEach(e => e.remove()); }
    });
    it("a host that cannot open notes shows the name as plain text", () => {
      const s = sheet(layout, note, extra, { openNote: undefined });
      const c = show(s, "spell:glimmer");
      expect(link(c)).toBeNull(); expect(c.querySelector(".fe-detail .fe-name")!.textContent).toBe("Glimmer");
    });
  });

  describe(`the card popover stays reachable with a mouse (${layout})`, () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });
    const pop$ = () => document.querySelector(".fe-popover") as HTMLElement | null;
    const open = () => {
      const s = sheet(layout, note, extra, { openNote: () => undefined }), el = s.q('[data-ref="identity:class:skirmisher"]');
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300);
      return { s, el, pop: pop$()! };
    };
    const leave = (el: Element, to: Element | null) => el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: to }));
    if (layout !== "desktop") {
      it("on touch there is no hover popover; a tap opens the card and the link is a 44 px target", () => {
        const s = sheet(layout, note, extra, { openNote: () => undefined }), el = s.q('[data-ref="identity:class:skirmisher"]');
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300); expect(pop$()).toBeNull();
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(s.q('[data-panel="details"] button.fe-open-note')).not.toBeNull();
        expect(css).toMatch(/\.fe-mobile button\.fe-open-note[^{]*\{[^}]*min-height: 44px/);
        expect(css).toMatch(/\.fe-tablet button\.fe-open-note[^{]*\{[^}]*min-height: 44px/);
      });
      return;
    }
    it("stays open while the pointer travels to it (grace) and while it is over it, and closes when it leaves both", () => {
      const { el, pop } = open();
      leave(el, document.body); vi.advanceTimersByTime(100); expect(pop$()).not.toBeNull();
      pop.dispatchEvent(new MouseEvent("mouseenter")); vi.advanceTimersByTime(1000); expect(pop$()).not.toBeNull();
      pop.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: document.body })); vi.advanceTimersByTime(300); expect(pop$()).toBeNull();
    });
    it("closes after the grace period when the pointer never reaches it", () => {
      const { el } = open(); leave(el, document.body); vi.advanceTimersByTime(250); expect(pop$()).toBeNull();
    });
    it("stays open when the pointer goes back from the popover to the element", () => {
      const { el, pop } = open();
      leave(el, document.body); pop.dispatchEvent(new MouseEvent("mouseenter"));
      pop.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: el })); vi.advanceTimersByTime(500); expect(pop$()).not.toBeNull();
    });
    it("Escape closes it, and opening another card replaces it", () => {
      const { s } = open();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(pop$()).toBeNull();
      const a = s.q('[data-ref="identity:class:skirmisher"]'); a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300);
      const other = document.createElement("span"); other.dataset.ref = "spell:glimmer"; s.root.append(other);
      leave(a, document.body); other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300);
      expect(document.querySelectorAll(".fe-popover")).toHaveLength(1); expect(pop$()!.textContent).toContain("Glimmer");
    });
    it("scroll closes it", () => { open(); window.dispatchEvent(new Event("scroll")); expect(pop$()).toBeNull(); });
    it("the popover takes the pointer so its link can be clicked", () => {
      expect(css).toMatch(/\.fe-popover \{[^}]*pointer-events: auto/);
    });
  });
}

describe("a brought-in entry links to its own edition's note", () => {
  let r: Registry;
  beforeAll(async () => { r = (await editionRegistry()).r; });
  afterEach(() => { vi.useRealTimers(); document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });
  for (const layout of LAYOUTS) {
    it(`carries the path of the edition the card shows (${layout})`, () => {
      vi.useFakeTimers();
      const n = { type: "5e-character", name: "Brann", edition: "2024", classes: [{ class: "warden", level: 1 }], spells: [{ id: "nova", prepared: true }, { id: "hush@2014", prepared: true }] };
      const s = sheet(layout, n, [], { registry: r, openNote: () => undefined });
      const paths: string[] = [];
      for (const ref of ["spell:nova", "spell:hush@2014"]) {
        const el = document.createElement("span"); el.dataset.ref = ref; s.root.append(el);
        let card: HTMLElement;
        if (layout === "desktop") { el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300); card = document.querySelector(".fe-popover")!; }
        else { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); card = s.q('[data-panel="details"]'); }
        paths.push(card.querySelector<HTMLElement>("button.fe-open-note")!.dataset.path!);
        document.querySelectorAll(".fe-popover").forEach(e => e.remove());
      }
      expect(paths[0]).toBe("compendium/5e/WotC 2024/Spells/Nova.md"); expect(paths[1]).toBe("compendium/5e/WotC/Spells/Hush.md");
    });
  }
});

describe("a bundled entry links to the library note for the same id", () => {
  afterEach(() => { vi.useRealTimers(); document.querySelectorAll(".fe-popover").forEach(e => e.remove()); document.body.replaceChildren(); });
  const lib = (r: Registry, path: string, edition: "2014" | "2024") => {
    const p = r.add("vault", "spell", { id: "burning-hands", name: "Burning Hands", level: 1, school: "Evocation", classes: ["wizard"] }, { path, library: true, sourceName: `Test ${edition}`, edition });
    if (p) throw new Error(p.errors.join("; "));
  };
  const open = (layout: (typeof LAYOUTS)[number], r: Registry, edition: string, ref: string): HTMLElement | null => {
    vi.useFakeTimers();
    const s = sheet(layout, { ...note, edition, spells: [] }, [], { registry: r, openNote: () => undefined });
    const el = document.createElement("span"); el.dataset.ref = ref; s.root.append(el);
    let card: HTMLElement;
    if (layout === "desktop") { el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); vi.advanceTimersByTime(300); card = document.querySelector(".fe-popover")!; }
    else { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); card = s.q('[data-panel="details"]'); }
    expect(card.textContent).toContain("Burning Hands");
    return card.querySelector("button.fe-open-note");
  };
  for (const layout of LAYOUTS) {
    it(`links to the note when the entry shown is bundled (${layout})`, () => {
      const r = homebrewRegistry(); expect(r.get("spell", "burning-hands")!.path).toBeUndefined();
      lib(r, "lib/old/Burning Hands.md", "2014");
      expect(open(layout, r, "2014", "spell:burning-hands")!.dataset.path).toBe("lib/old/Burning Hands.md");
    });
    it(`prefers the character's edition when both editions have a note (${layout})`, () => {
      const r = homebrewRegistry(); lib(r, "lib/old/Burning Hands.md", "2014"); lib(r, "lib/new/Burning Hands.md", "2024");
      expect(open(layout, r, "2014", "spell:burning-hands")!.dataset.path).toBe("lib/old/Burning Hands.md");
    });
    it(`a brought-in reference links to the edition shown, not the character's (${layout})`, () => {
      const r = homebrewRegistry(); lib(r, "lib/old/Burning Hands.md", "2014"); lib(r, "lib/new/Burning Hands.md", "2024");
      expect(open(layout, r, "2024", "spell:burning-hands@2014")!.dataset.path).toBe("lib/old/Burning Hands.md");
    });
    it(`never links to the other edition's note for a plain card (${layout})`, () => {
      const r = homebrewRegistry(); lib(r, "lib/new/Burning Hands.md", "2024");
      expect(open(layout, r, "2014", "spell:burning-hands")).toBeNull();
    });
    it(`has no link when no note exists anywhere (${layout})`, () => {
      expect(open(layout, homebrewRegistry(), "2014", "spell:burning-hands")).toBeNull();
    });
  }
});

describe("the builder's About card has no link", () => {
  afterEach(() => document.body.replaceChildren());
  it("shows the card without it", () => {
    const host: BuilderHost = { registry: homebrewRegistry(), rng: seeded(4), folder: "Characters", exists: () => false, notify: () => undefined, createNote: async p => p, open: () => undefined, close: () => undefined };
    const ctl = new BuilderController(host), root = document.createElement("div");
    document.body.append(root); mountBuilder(root, ctl, false);
    ctl.go(ctl.pages().findIndex(p => p.id === "background"));
    root.querySelector<HTMLElement>('[data-act="about"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.querySelector(".fe-detail")).not.toBeNull();
    expect(root.querySelector(".fe-open-note")).toBeNull();
  });
});

describe("styles.css: the open-note link", () => {
  const rule = (sel: string) => css.split("\n").find(l => l.includes(sel)) ?? "";
  it("is styled as a link at sheet and popover specificity", () => {
    const l = rule(".fe-sheet button.fe-open-note");
    expect(l).toContain(".fe-popover button.fe-open-note");
    for (const part of ["background: none", "box-shadow: none", "text-decoration: underline", "color: var(--"]) expect(l).toContain(part);
  });
  it("is at least 44px tall on tablet and phone", () => {
    const l = rule(".fe-mobile button.fe-open-note");
    expect(l).toContain(".fe-tablet button.fe-open-note"); expect(l).toContain("min-height: 44px");
  });
});
