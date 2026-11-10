import { readFileSync } from "node:fs";

const using = readFileSync("docs/USING.md", "utf8");
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
});
