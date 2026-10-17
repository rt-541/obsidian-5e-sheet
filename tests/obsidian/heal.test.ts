import { readFileSync } from "node:fs";
import { COMPENDIUM_ROOT, healCompendiumFolder } from "../../src/obsidian/heal";

const vault = (...folders: string[]) => (p: string) => folders.includes(p);

describe("self-healing compendium folder", () => {
  it("switches to compendium/5e when the configured folder is gone and the root exists", async () => {
    expect(await healCompendiumFolder("5e-sheet/Compendium", vault("compendium/5e"))).toBe(COMPENDIUM_ROOT);
    expect(await healCompendiumFolder("", vault("compendium/5e"))).toBe(COMPENDIUM_ROOT);
    expect(await healCompendiumFolder("old", async p => p === "compendium/5e")).toBe(COMPENDIUM_ROOT);
  });
  it("never fires while the configured folder exists", async () => {
    expect(await healCompendiumFolder("5e-sheet/Compendium", vault("5e-sheet/Compendium", "compendium/5e"))).toBeUndefined();
    expect(await healCompendiumFolder("compendium/5e", vault("compendium/5e"))).toBeUndefined();
    expect(await healCompendiumFolder("/my/lib/", vault("my/lib", "compendium/5e"))).toBeUndefined();
  });
  it("does nothing when compendium/5e is missing too, and never points at a generated library folder", async () => {
    expect(await healCompendiumFolder("gone", vault())).toBeUndefined();
    expect(await healCompendiumFolder("gone", vault("compendium/5e/WotC"))).toBeUndefined();
    expect(COMPENDIUM_ROOT).not.toMatch(/WotC|Kobold|Necromancer/);
  });
  it("is wired into onload: persists the setting, shows the notice and re-indexes", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain("healCompendiumFolder(this.data.settings.compendiumFolder");
    expect(src).toContain("5e sheet: compendium folder moved to ${moved}");
    expect(src).toMatch(/if \(moved\) await this\.loader\.setFolder\(moved\)/);
    expect(src).toMatch(/compendiumFolder = moved; await this\.persist\(\)/);
  });
});
