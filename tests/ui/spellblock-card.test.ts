// @vitest-environment jsdom
import { renderSpellblock } from "../../src/ui/spellblock-card";

afterEach(() => document.body.replaceChildren());
const SRC = "Test Spark\n1st-level evocation\nCasting Time: 1 action\nRange: 60 feet\nComponents: V, S\nDuration: Instantaneous\nA blue spark. Make a ranged spell attack. On a hit: 2d6 lightning damage.\nClasses: Wizard";
const tick = () => new Promise<void>(res => setTimeout(res, 0));

describe("5e-spell code block card", () => {
  it("shows the spell read from the text and saves it with Add to compendium", async () => {
    const el = document.createElement("div"); document.body.append(el);
    const saved: string[] = [];
    renderSpellblock(el, "```5e-spell\n" + SRC + "\n```", async d => { saved.push(d.name); return { name: d.name, path: "compendium/5e/Homebrew/Spells/Test Spark.md" }; });
    expect(el.querySelector(".fe-sb-name")!.textContent).toBe("Test Spark");
    expect(el.textContent).toContain("1st level evocation");
    expect(el.textContent).toContain("Casting Time 1 action");
    expect(el.querySelector("[data-detected]")!.textContent).toContain("2d6 lightning damage");
    const add = el.querySelector<HTMLButtonElement>('[data-act="add-to-compendium"]')!;
    expect(add.disabled).toBe(false);
    add.click(); await tick();
    expect(saved).toEqual(["Test Spark"]);
    expect(el.querySelector(".fe-sb-status")!.textContent).toContain("Saved Test Spark to compendium/5e/Homebrew/Spells/Test Spark.md");
    expect(add.textContent).toBe("Added");
  });

  it("disables the button and says what to fix when the text is incomplete; a failed save is shown and can be retried", async () => {
    const bad = document.createElement("div"); document.body.append(bad);
    renderSpellblock(bad, "Half A Spell\n1st-level evocation", async () => ({ name: "x", path: "y" }));
    expect(bad.querySelector<HTMLButtonElement>('[data-act="add-to-compendium"]')!.disabled).toBe(true);
    expect(bad.querySelector("[data-problems]")!.textContent).toContain("Describe what the spell does.");
    const ok = document.createElement("div"); document.body.append(ok);
    renderSpellblock(ok, SRC, async () => { throw new Error("That note already exists."); });
    const add = ok.querySelector<HTMLButtonElement>('[data-act="add-to-compendium"]')!;
    add.click(); await tick();
    expect(ok.querySelector(".fe-sb-status")!.textContent).toBe("That note already exists.");
    expect(add.disabled).toBe(false);
  });
});
