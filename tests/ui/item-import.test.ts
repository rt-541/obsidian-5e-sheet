// @vitest-environment jsdom
import { ITEM_TEMPLATE } from "../../src/content/itemblock";
import type { Registry } from "../../src/content/registry";
import type { NoteIO } from "../../src/obsidian/create-note";
import { saveItem } from "../../src/obsidian/save-item";
import { renderItemBlock } from "../../src/ui/itemblock-card";
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

// invented item text
const PASTE = `**Salt-Glass Compass**
*Wondrous item, rare (requires attunement by a ranger)*
Weight: 1 lb.
Cost: 800 gp

The needle points toward the nearest fresh water.

The compass has 3 charges. It regains 1d3 expended charges daily at dawn.
Source: my own notes`;

const vault = () => {
  const files = new Map<string, string>();
  const io: NoteIO = { exists: p => files.has(p), ensureFolder: async () => undefined, create: async (p, t) => { files.set(p, t); } };
  return { files, io };
};
const withSave = (v: ReturnType<typeof vault>) => (r: Registry) => ({ saveItem: async (d: Parameters<typeof saveItem>[1]) => (await saveItem({ registry: r, io: v.io, compendiumFolder: "compendium/5e", stringify: o => JSON.stringify(o) }, d)).id });
const flush = () => new Promise<void>(res => setTimeout(res, 0));

for (const layout of LAYOUTS) {
  describe(`importing an item (${layout})`, () => {
    const open = (s: ReturnType<typeof setup>) => { s.ctl.open({ kind: "compendium" }); s.click(s.q('[data-act="import-item"]')); };
    const read = (s: ReturnType<typeof setup>, text = PASTE) => { s.type(s.q('[data-field="import-text"]'), text); s.click(s.q('[data-act="read-item"]')); };
    const val = (s: ReturnType<typeof setup>, f: string) => (s.q(`[data-field="${f}"]`) as HTMLInputElement).value;

    it("Import an item opens a paste view with Read item, Copy template and Back", () => {
      const s = setup(layout); open(s);
      expect(s.q('[data-form="import-item"]')).not.toBeNull();
      expect(s.q('[data-form="custom-item"]')).toBeNull();
      for (const a of ["read-item", "copy-item-template", "import-back"]) expect(s.q(`[data-act="${a}"]`)).not.toBeNull();
      s.click(s.q('[data-act="import-back"]'));
      expect(s.q('[data-form="custom-item"]')).not.toBeNull();
    });
    it("Read with nothing pasted says so", () => {
      const s = setup(layout); open(s); s.click(s.q('[data-act="read-item"]'));
      expect(s.q('.fe-additem-import [role="alert"]').textContent).toBe("Paste an item first.");
    });
    it("Read fills the form (name, weight, kind, rarity, attunement, charges, description) and lists unread lines", () => {
      const s = setup(layout); open(s); read(s);
      expect(s.q('[data-form="custom-item"]')).not.toBeNull();
      expect(val(s, "name")).toBe("Salt-Glass Compass"); expect(val(s, "weight")).toBe("1");
      expect(val(s, "kind")).toBe("wondrous"); expect(val(s, "rarity")).toBe("rare");
      expect(s.q('[data-act="custom-attunement"]').getAttribute("aria-checked")).toBe("true");
      expect(val(s, "attunement-note")).toBe("by a ranger");
      expect(val(s, "charges")).toBe("3"); expect(val(s, "charges-reset")).toBe("dawn");
      expect((s.q('[data-field="description"]') as HTMLTextAreaElement).value).toContain("The needle points toward the nearest fresh water.");
      expect(s.q("[data-unread]").textContent).toContain("Source: my own notes");
    });
    it("a fenced 5e-item block reads the same", () => {
      const s = setup(layout); open(s); read(s, "```5e-item\n" + PASTE + "\n```");
      expect(val(s, "name")).toBe("Salt-Glass Compass"); expect(val(s, "charges")).toBe("3");
    });
    it("Save to compendium and add writes the Homebrew note, registers it and puts it in the pack", async () => {
      const v = vault(), s = setup(layout, {}, undefined, undefined, withSave(v)); open(s); read(s);
      s.type(s.q('[data-field="qty"]'), "2");
      s.click(s.q('[data-act="save-item"]')); await flush();
      expect([...v.files.keys()]).toEqual(["compendium/5e/Homebrew/Items/Salt-Glass Compass.md"]);
      expect(s.char().inventory).toHaveLength(1);
      expect(s.char().inventory[0]).toMatchObject({ id: "salt-glass-compass", qty: 2 });
      expect(s.host.registry.get("item", "salt-glass-compass")).toMatchObject({ sourceName: "Homebrew" });
      expect(s.notices.at(-1)).toBe("Saved Salt-Glass Compass to your Homebrew items and added it.");
      expect(s.ctl.panel?.kind).toBe("compendium");
      expect(s.row("Salt-Glass Compass")).toBeDefined();
    });
    it("saving the same item again keeps the first note and makes (2)", async () => {
      const v = vault(), s = setup(layout, {}, undefined, undefined, withSave(v));
      for (let i = 0; i < 2; i++) { s.ctl.open({ kind: "compendium" }); s.click(s.q('[data-act="import-item"]')); read(s); s.click(s.q('[data-act="save-item"]')); await flush(); }
      expect([...v.files.keys()].sort()).toEqual(["compendium/5e/Homebrew/Items/Salt-Glass Compass (2).md", "compendium/5e/Homebrew/Items/Salt-Glass Compass.md"]);
    });
    it("a problem is shown in plain words and nothing is written", async () => {
      const v = vault(), s = setup(layout, {}, undefined, undefined, withSave(v)); open(s); read(s);
      s.type(s.q('[data-field="charges"]'), "0");
      s.click(s.q('[data-act="save-item"]')); await flush();
      expect(s.q('[data-note="custom-item-error"]').textContent).toBe("Charges must be a whole number, 1 or more (or leave it empty).");
      expect(v.files.size).toBe(0); expect(s.char().inventory).toHaveLength(0);
    });
    it("without a host that can save notes there is no Save button, and Add custom item still works", () => {
      const s = setup(layout); open(s); read(s);
      expect(s.q('[data-act="save-item"]')).toBeNull();
      s.click(s.q('[data-act="add-custom"]'));
      expect(s.char().inventory[0]).toMatchObject({ name: "Salt-Glass Compass", qty: 1, weight: 1 });
    });
    it("More details shows and hides the extra fields on a plain form", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      expect(s.q('[data-form="item-details"]')).toBeNull();
      s.click(s.q('[data-act="item-more"]')); expect(s.q('[data-form="item-details"]')).not.toBeNull();
      s.click(s.q('[data-act="item-more"]')); expect(s.q('[data-form="item-details"]')).toBeNull();
    });
    it("Copy template puts the blank 5e-item block on the clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      const s = setup(layout); open(s); s.click(s.q('[data-act="copy-item-template"]')); await flush();
      expect(writeText).toHaveBeenCalledWith(ITEM_TEMPLATE);
      expect(s.notices.at(-1)).toBe("Template copied. Paste it into a note and fill it in.");
    });
    it("when copying is not possible the template is shown to copy by hand", async () => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      const s = setup(layout); open(s); s.click(s.q('[data-act="copy-item-template"]')); await flush();
      expect(s.q('textarea[aria-label="Item template"]')).not.toBeNull();
    });
    it("touch targets: the buttons and fields are the shared 44px classes", () => {
      const s = setup(layout); s.ctl.open({ kind: "compendium" });
      expect(s.q(".fe-additem .fe-btn")).not.toBeNull();   // sized by the .fe-mobile / .fe-tablet .fe-additem rules in styles.css
    });
  });
}

describe("the 5e-item block card", () => {
  const card = (src: string, save = vi.fn().mockResolvedValue({ name: "X", path: "p/X.md" })) => {
    const el = document.createElement("div"); document.body.append(el); renderItemBlock(el, src, save); return { el, save };
  };
  it("shows the item read from the text with an Add to compendium button that saves it", async () => {
    const { el, save } = card(PASTE);
    expect(el.querySelector(".fe-sb-name")!.textContent).toBe("Salt-Glass Compass");
    expect(el.textContent).toContain("Wondrous item, rare (requires attunement by a ranger)");
    expect(el.textContent).toContain("Charges 3, back at dawn"); expect(el.textContent).toContain("Cost 800 gp");
    expect(el.querySelector("[data-unread]")!.textContent).toContain("Source: my own notes");
    (el.querySelector('[data-act="add-to-compendium"]') as HTMLButtonElement).click(); await flush();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Salt-Glass Compass", kind: "wondrous" }));
    expect(el.querySelector(".fe-sb-status")!.textContent).toContain("Saved X to p/X.md");
  });
  it("cannot be added while it has a problem, and says why", () => {
    const { el } = card("```5e-item\n```");
    expect((el.querySelector('[data-act="add-to-compendium"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector("[data-problems]")!.textContent).toContain("Give the item a name.");
  });
  it("shows a save failure in words and lets you try again", async () => {
    const { el } = card(PASTE, vi.fn().mockRejectedValue(new Error("The vault is read-only.")));
    const b = el.querySelector('[data-act="add-to-compendium"]') as HTMLButtonElement; b.click(); await flush();
    expect(el.querySelector(".fe-sb-status")!.textContent).toBe("The vault is read-only."); expect(b.disabled).toBe(false);
  });
});
