import { readFileSync } from "node:fs";

const css = readFileSync("styles.css", "utf8");
const BUTTON = ["fe-btn", "fe-roll", "fe-tab", "fe-pip", "fe-switch", "fe-chip-add", "fe-mode-opt", "fe-choice", "fe-crow-btn", "fe-trait-head", "fe-effects-head", "fe-effect-head", "fe-qty-btn", "fe-toggle-btn", "fe-crit", "fe-dmg", "fe-menu-btn", "fe-item-menu-btn"];
const CONTESTED = /(^|;)\s*(background(-color)?|padding|border(-radius)?|box-shadow|height)\s*:/;

/** [ids, classes+attributes+pseudo-classes, elements] of one selector. */
function specificity(sel: string): [number, number, number] {
  let a = 0, b = 0, c = 0;
  let s = sel.replace(/::[\w-]+(\([^)]*\))?/g, () => { c++; return " "; });   // pseudo-elements count as elements
  s = s.replace(/:not\(([^)]*)\)/g, (_m, arg: string) => ` ${arg} `);         // :not(x) counts as its argument
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return " "; });
  s = s.replace(/#[\w-]+/g, () => { a++; return " "; });
  s = s.replace(/\.[\w-]+/g, () => { b++; return " "; });
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return " "; });
  s = s.replace(/[>+~]/g, " ");
  for (const t of s.split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(t)) c++;
  return [a, b, c];
}

describe("Obsidian's CSS cannot restyle the plugin's buttons", () => {
  it("every contested button style outranks Obsidian's button rules", () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of bare.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const sel of m[1].split(",").map(s => s.trim())) {
      const last = sel.split(/\s+/).at(-1)!;
      if (sel.includes("::") || !BUTTON.some(c => new RegExp(`\\.${c}(?![\\w-])`).test(last)) || !CONTESTED.test(m[2])) continue;
      const [a, b, c] = specificity(sel);
      expect(a > 0 || b > 2 || (b === 2 && c >= 1), sel).toBe(true);
    }
  });
  it("chips that are buttons keep their pill shape", () => expect(css).toMatch(/\.fe-sheet button\.fe-chip \{[^}]*border-radius: 12px/));
  it("tabs are underlined text, not filled buttons", () => expect(css).toMatch(/\.fe-sheet button\.fe-tab \{[^}]*background: none;[^}]*box-shadow: none;/));
});
