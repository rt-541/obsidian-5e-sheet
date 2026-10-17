import { readFileSync } from "node:fs";

// settings.ts imports obsidian (not loadable under node), so the default is checked in the source.
describe("settings defaults", () => {
  it("the compendium root defaults to compendium/5e and a cleared field falls back to it", () => {
    const src = readFileSync("src/obsidian/settings.ts", "utf8");
    expect(src).toMatch(/DEFAULT_SETTINGS: Settings = \{ compendiumFolder: "compendium\/5e"/);
    expect(src).toMatch(/v\.trim\(\) \|\| DEFAULT_SETTINGS\.compendiumFolder/);
  });
  it("the content layer never writes: no vault write calls in src/content", () => {
    for (const f of ["registry", "vault-loader", "library", "sources"]) expect(readFileSync(`src/content/${f}.ts`, "utf8"), f).not.toMatch(/app\.vault|fileManager|adapter\.(create|modify|delete|rename|trash|write|process)\b/);
  });
});
