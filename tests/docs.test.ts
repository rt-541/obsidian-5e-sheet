import { existsSync, readFileSync } from "node:fs";

const using = readFileSync("docs/USING.md", "utf8");
const importing = existsSync("docs/IMPORTING.md") ? readFileSync("docs/IMPORTING.md", "utf8") : "";
const readme = readFileSync("README.md", "utf8");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

describe("player docs", () => {
  it("USING.md has the six sections in order and no emoji", () => {
    const headings = using.split("\n").filter(l => /^## /.test(l)).map(l => l.slice(3).trim());
    expect(headings).toEqual(["Install", "Create a character", "Pick an edition", "Bring something in from the other edition", "Read the what-changed panel", "Common questions"]);
    expect(using).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it("the manifest and README say both editions", () => {
    expect(manifest.description).toMatch(/2014/);
    expect(manifest.description).toMatch(/2024/);
    expect(readme).toMatch(/2024/);
    expect(readme).toMatch(/2014/);
  });
  it("IMPORTING.md has the seven sections in order, names the folders, marker and stamp, and has no emoji", () => {
    const headings = importing.split("\n").filter(l => /^## /.test(l)).map(l => l.slice(3).trim());
    expect(headings).toEqual(["What you need", "Import a book", "Import the 2014 and 2024 data", "Refresh", "Work through the Needs Review list", "Sync the vault", "Check it worked"]);
    expect(importing).toMatch(/compendium\/5e\/WotC(`|$|\s*\|)/m);
    expect(importing).toContain("compendium/5e/WotC 2024");
    expect(importing).toContain(".dnd-compendium-generated");
    expect(importing).toMatch(/`edition`/);
    expect(importing).toMatch(/private/i);
    expect(importing).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(importing.split("\n").every(l => l.length <= 200)).toBe(true);
  });
});
