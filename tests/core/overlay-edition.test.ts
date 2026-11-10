import { useOverlayData } from "../../src/content/overlay";
import { Registry } from "../../src/content/registry";
import type { Edition } from "../../src/core/edition";
import { pc, srdRegistry, stats } from "../fixtures/overlay";

const ac = (n: number) => ({ effects: { modifiers: [{ target: "ac", value: n }] } });
const feats = (...eds: (Edition | undefined)[]): Registry => {
  const r = srdRegistry();
  eds.forEach((ed, i) => r.add("vault", "feat", { name: `Tooth${i}`, grants: [{ op: "feature", name: "Tooth", text: "Invented." }] }, { path: `tooth${i}.md`, ...(ed ? { edition: ed } : {}) }));
  return r;
};

describe("overlay edition at the feature loop", () => {
  afterEach(() => useOverlayData(undefined));
  const bonus = (c: ReturnType<typeof pc>, r: Registry) => stats(c, r).ac.value - stats(pc("fighter", 1, {}, {}), r).ac.value;

  it("a feature takes the numbers of the edition of the entry that supplies it", () => {
    useOverlayData({ entries: { "feat::tooth@2014": ac(1), "feat::tooth@2024": ac(2) } });
    const r = feats("2014", "2024");
    expect(bonus(pc("fighter", 1, {}, { feats: ["tooth0"] }), r)).toBe(1);
    expect(bonus(pc("fighter", 1, {}, { feats: ["tooth1"] }), r)).toBe(2);
  });

  it("an entry with no edition follows the character's edition", () => {
    useOverlayData({ entries: { "feat::tooth@2014": ac(1), "feat::tooth@2024": ac(2) } });
    const r = feats(undefined);
    expect(bonus(pc("fighter", 1, {}, { feats: ["tooth0"] }), r)).toBe(1);
    expect(bonus(pc("fighter", 1, {}, { feats: ["tooth0"], edition: "2024" }), r)).toBe(2);
  });
});
