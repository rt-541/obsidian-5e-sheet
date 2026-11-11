import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Registry } from "../../src/content/registry";
import { registerBuiltinTypes } from "../../src/content/types";
import { loadSrd } from "../../src/content/srd";
import { parseNote } from "../../src/core/character";
import { comboViews, validateCombo } from "../../src/core/combos";
import { deriveCharacter } from "../../src/core/derive";

/** Reads a note's frontmatter with PyYAML (a stand-in for the Obsidian metadata cache); undefined when python or PyYAML is missing. */
function frontmatter(path: string): Record<string, unknown> | undefined {
  const text = readFileSync(path, "utf8"), m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) throw new Error(`${path}: no frontmatter`);
  try {
    const out = execFileSync("python3", ["-I", "-c", "import sys,json,yaml;print(json.dumps(yaml.safe_load(sys.stdin.read())))"], { input: m[1], encoding: "utf8" });
    return JSON.parse(out);
  } catch { return undefined; }
}

const ren = frontmatter("examples/Ren Ashfall.md");
const run = ren ? describe : describe.skip;

run("example: Ren Ashfall", () => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const p = parseNote(ren!);
  if (p.kind !== "character") throw new Error("Ren is not a character");
  const c = p.value, st = deriveCharacter(c, { registry: r });

  it("reads without errors and resolves every id", () => { expect(p.errors).toEqual([]); expect(st.missing).toEqual([]); expect(st.progress.problems).toEqual([]); });
  it("is a Monk 5 with AC 17 and Dex-based unarmed strikes", () => {
    expect(st.ac.value).toBe(17);
    expect(st.attacks.find(a => a.name === "Unarmed Strike")).toMatchObject({ toHit: 7, damage: "1d6+4 bludgeoning" });
  });
  it("has the four combos, each valid and ready with ki to spend", () => {
    expect(c.combos.map(x => x.name)).toEqual(["Stun Lock", "Open Hand Topple", "Hit and Fade", "Turtle Up"]);
    for (const x of c.combos) expect(validateCombo(x)).toBeUndefined();
    for (const x of comboViews(c, st, [], { registry: r })) { expect(x.steps.flatMap(s => s.problems), x.combo.name).toEqual([]); expect(x.ready, x.combo.name).toBe(true); }
  });
});
