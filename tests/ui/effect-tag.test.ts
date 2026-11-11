// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { effectTag, EFFECT_TAG_MAX } from "../../src/ui/widgets";

describe("collapsed effect rows", () => {
  it("a long note becomes a short tag, cut at a word, so the row stays one short line", () => {
    const note = "Storm charges: Draconic Charge (bonus action after your Breath Weapon) gives 1d4 charges for 1 hour. Storm Bolt (bonus action, 1 charge): auto-hit, 60 ft, 1d6 lightning.";
    const tag = effectTag({ note });
    expect(tag.length).toBeLessThanOrEqual(EFFECT_TAG_MAX + 1);
    expect(tag.endsWith("…")).toBe(true);
    expect(note.startsWith(tag.slice(0, -1))).toBe(true);
    expect(tag.slice(0, -1)).not.toMatch(/\s$/);
  });
  it("short tags are unchanged", () => {
    expect(effectTag({ modifiers: [{ target: "ac", value: 1 }] })).toBe("+1 AC");
    expect(effectTag({ note: "Glows faintly." })).toBe("Glows faintly.");
  });
  it("the tag is clipped with an ellipsis and can never spill out of its card", () => {
    const css = readFileSync("styles.css", "utf8");
    const rule = css.match(/\.fe-effect-tag \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("overflow: hidden");
    expect(rule).toContain("text-overflow: ellipsis");
    expect(rule).toContain("min-width: 0");
  });
});
