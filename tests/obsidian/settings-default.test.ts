import { readFileSync } from "node:fs";

// settings.ts imports obsidian (not loadable under node), so the default is checked in the source.
describe("settings defaults", () => {
  it("the compendium root defaults to compendium/5e and a cleared field falls back to it", () => {
    const src = readFileSync("src/obsidian/settings.ts", "utf8");
    expect(src).toMatch(/DEFAULT_SETTINGS: Settings = \{ compendiumFolder: "compendium\/5e"/);
    expect(src).toMatch(/v\.trim\(\) \|\| DEFAULT_SETTINGS\.compendiumFolder/);
  });
  it("built-in mechanics are on by default and the setting reaches the overlay", () => {
    expect(readFileSync("src/obsidian/settings.ts", "utf8")).toMatch(/builtinMechanics: true/);
    expect(readFileSync("src/obsidian/settings.ts", "utf8")).toMatch(/setBuiltinMechanics\(v\)/);
    expect(readFileSync("src/main.ts", "utf8")).toMatch(/setBuiltinMechanics\(this\.data\.settings\.builtinMechanics\)/);
  });
  it("the default edition setting is 2014 and has a dropdown that saves", () => {
    const src = readFileSync("src/obsidian/settings.ts", "utf8");
    expect(src).toMatch(/defaultEdition: "2014"/);
    expect(src).toMatch(/setName\("Default rules edition"\)/);
    expect(src).toMatch(/"2014": "2014 rules", "2024": "2024 rules"/);
    expect(src).toMatch(/s\.defaultEdition = v as Edition; await this\.plugin\.persist\(\)/);
  });
  it("the content layer never writes: no vault write calls in src/content", () => {
    for (const f of ["registry", "vault-loader", "library", "sources"]) expect(readFileSync(`src/content/${f}.ts`, "utf8"), f).not.toMatch(/app\.vault|fileManager|adapter\.(create|modify|delete|rename|trash|write|process)\b/);
  });
});
