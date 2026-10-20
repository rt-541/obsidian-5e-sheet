// @vitest-environment jsdom
import { LAYOUTS, setup } from "./inventory-helpers";

afterEach(() => document.body.replaceChildren());

// invented item text
const PASTE = "Moss Ring\nRing, uncommon\nWeight: 1 lb\n\nAn invented sentence.";

for (const layout of LAYOUTS) {
  describe(`item form preview (${layout})`, () => {
    it("typing updates the card and keeps the caret in the box", () => {
      const s = setup(layout);
      s.ctl.open({ kind: "compendium" }); s.click(s.q('.fe-panel [data-act="item-more"]'));
      expect(s.q('.fe-panel [data-pane="item-preview"]').textContent).toContain("Give the item a name");
      const name = s.q('.fe-panel [data-field="name"]'); name.focus(); s.type(name, "Fern Cloak");
      expect(s.q('.fe-panel [data-pane="item-preview"] .fe-sb-name').textContent).toBe("Fern Cloak");
      expect(document.activeElement).toBe(name);
      s.type(s.q('.fe-panel [data-field="charges"]'), "2");
      expect(s.q('.fe-panel [data-pane="item-preview"] [data-fact="Charges"]').textContent).toBe("Charges: 2, back at dawn");
    });
    it("after Read item the card shows what was read", () => {
      const s = setup(layout);
      s.ctl.open({ kind: "compendium" }); s.click(s.q('[data-act="import-item"]'));
      s.type(s.q('[data-field="import-text"]'), PASTE); s.click(s.q('[data-act="read-item"]'));
      const pane = s.q('.fe-panel [data-pane="item-preview"]');
      expect(pane.querySelector(".fe-sb-name")!.textContent).toBe("Moss Ring");
      expect(pane.textContent).toContain("Wondrous item, uncommon");
    });
  });
}
