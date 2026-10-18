// @vitest-environment jsdom
import { bar, pips, PIP_LIMIT } from "../../src/ui/widgets";

const click = (el: Element | null) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };

describe("resource bars", () => {
  it("small resources keep pips; pools above the limit become a bar showing what is left", () => {
    expect(pips(5, 2, () => {}).querySelectorAll(".fe-pip")).toHaveLength(5);
    const pool = pips(PIP_LIMIT + 13, 5, () => {});
    expect(pool.querySelector(".fe-pip")).toBeNull();
    expect(pool.querySelector(".fe-bar-num")!.textContent).toBe("20 / 25");
  });
  it("a pool spends and restores by the typed amount, never past its limits", () => {
    let used = 5; const el = bar(25, used, n => { used = n; }, "pool");
    (el.querySelector(".fe-bar-amt") as HTMLInputElement).value = "7";
    click([...el.querySelectorAll("button")].find(b => b.textContent === "Spend")!);
    expect(used).toBe(12);
    (el.querySelector(".fe-bar-amt") as HTMLInputElement).value = "99";
    click([...el.querySelectorAll("button")].find(b => b.textContent === "Spend")!);
    expect(used).toBe(25);
  });
  it("a progress tracker fills as it grows (Learning Smith 72 / 80) and adds up to the max", () => {
    let used = 72; const el = bar(80, used, n => { used = n; }, "progress");
    expect(el.querySelector(".fe-bar-num")!.textContent).toBe("72 / 80");
    expect((el.querySelector(".fe-bar-fill") as HTMLElement).getAttribute("style")).toBe("width:90%");
    (el.querySelector(".fe-bar-amt") as HTMLInputElement).value = "5";
    click([...el.querySelectorAll("button")].find(b => b.textContent === "Add")!);
    expect(used).toBe(77);
    (el.querySelector(".fe-bar-amt") as HTMLInputElement).value = "50";
    click([...el.querySelectorAll("button")].find(b => b.textContent === "Add")!);
    expect(used).toBe(80);
  });
});
