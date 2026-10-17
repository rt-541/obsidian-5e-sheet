export const FULL_CASTER: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const PACT: [number, number][] = [[0, 0], [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];

type P = "full" | "half" | "third" | "pact";
export function slotTable(classes: { level: number; progression?: P }[]) {
  const out: { level: string; max: number; pactLevel?: number }[] = [];
  const casters = classes.filter(c => c.progression && c.progression !== "pact");
  let casterLevel = 0;
  if (casters.length === 1) {
    const c = casters[0];
    casterLevel = c.progression === "full" ? c.level : c.progression === "half" ? (c.level >= 2 ? Math.ceil(c.level / 2) : 0) : (c.level >= 3 ? Math.ceil(c.level / 3) : 0);
  } else {
    for (const c of casters) casterLevel += c.progression === "full" ? c.level : c.progression === "half" ? Math.floor(c.level / 2) : Math.floor(c.level / 3);
  }
  FULL_CASTER[Math.min(casterLevel, 20)].forEach((max, i) => out.push({ level: String(i + 1), max }));
  const pact = classes.filter(c => c.progression === "pact").reduce((a, c) => a + c.level, 0);
  if (pact > 0) { const [max, pactLevel] = PACT[Math.min(pact, 20)]; out.push({ level: "pact", max, pactLevel }); }
  return out;
}
