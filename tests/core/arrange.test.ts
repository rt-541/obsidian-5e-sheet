import { arrangeLayout, dropSlot, moveSlot, slotKey, STAT_KEY, tabKeys } from "../../src/core/arrange";
import type { LayoutSpec } from "../../src/ui/layouts";

/** An invented two-tab layout: Main has three columns, one of them opening with a group of tiles. */
const spec: LayoutSpec = {
  pinned: ["identity"],
  tabs: [
    { id: "main", label: "Main", columns: [["a", "b"], [["t1", "t2"], "c", "d"], ["e", "f", "g"]] },
    { id: "other", label: "Other", columns: [["x"]] },
  ],
};
const all = new Set(["a", "b", "c", "d", "e", "f", "g", "t1", "t2", "x"]);

describe("section arrangement", () => {
  it("slot keys: a feature id, or stat-tiles for the tile group", () => {
    expect(slotKey("a")).toBe("a"); expect(slotKey(["t1", "t2"])).toBe(STAT_KEY);
    expect(tabKeys(spec, "main")).toEqual([["a", "b"], [STAT_KEY, "c", "d"], ["e", "f", "g"]]);
  });
  it("no saved arrangement gives the default layout unchanged", () => {
    expect(arrangeLayout(spec, undefined)).toBe(spec);
  });
  it("a saved arrangement reorders and moves slots between columns; other tabs keep their default", () => {
    const out = arrangeLayout(spec, { main: [["e", "a"], [STAT_KEY, "d", "b", "c"], ["f", "g"]] });
    expect(out.tabs[0].columns).toEqual([["e", "a"], [["t1", "t2"], "d", "b", "c"], ["f", "g"]]);
    expect(out.tabs[1]).toBe(spec.tabs[1]);
    expect(out.pinned).toEqual(["identity"]);
  });
  it("unknown and repeated ids are dropped; slots the save misses go back to their default column", () => {
    const out = arrangeLayout(spec, { main: [["zzz", "a", "a"], ["c"], ["e"]] });
    expect(out.tabs[0].columns).toEqual([["a", "b"], ["c", [ "t1", "t2"], "d"], ["e", "f", "g"]]);
    const placed = out.tabs[0].columns.flat(2);
    expect(new Set(placed).size).toBe(placed.length);
  });
  it("a save with the wrong number of columns is ignored for that tab", () => {
    expect(arrangeLayout(spec, { main: [["a", "b", "c", "d", "e", "f", "g", STAT_KEY]] }).tabs[0]).toEqual(spec.tabs[0]);
  });
  it("arrows: up and down within a column, left and right to the same height in the next column", () => {
    expect(moveSlot(spec, "main", "d", "up", all)).toEqual([["a", "b"], [STAT_KEY, "d", "c"], ["e", "f", "g"]]);
    expect(moveSlot(spec, "main", "a", "down", all)).toEqual([["b", "a"], [STAT_KEY, "c", "d"], ["e", "f", "g"]]);
    expect(moveSlot(spec, "main", "c", "right", all)).toEqual([["a", "b"], [STAT_KEY, "d"], ["e", "c", "f", "g"]]);
    expect(moveSlot(spec, "main", "g", "left", all)).toEqual([["a", "b"], [STAT_KEY, "c", "g", "d"], ["e", "f"]]);
  });
  it("arrows at an edge do nothing", () => {
    expect(moveSlot(spec, "main", "a", "up", all)).toBeUndefined();
    expect(moveSlot(spec, "main", "a", "left", all)).toBeUndefined();
    expect(moveSlot(spec, "main", "g", "down", all)).toBeUndefined();
    expect(moveSlot(spec, "main", "e", "right", all)).toBeUndefined();
    expect(moveSlot(spec, "other", "x", "up", all)).toBeUndefined();
  });
  it("up and down step over hidden sections so every press moves something visible", () => {
    const shown = new Set([...all].filter(k => k !== "f"));
    expect(moveSlot(spec, "main", "g", "up", shown)).toEqual([["a", "b"], [STAT_KEY, "c", "d"], ["g", "e", "f"]]);
  });
  it("drag and drop: before another slot, or at the end of a column", () => {
    expect(dropSlot(spec, "main", "a", 2, "f")).toEqual([["b"], [STAT_KEY, "c", "d"], ["e", "a", "f", "g"]]);
    expect(dropSlot(spec, "main", "e", 0, null)).toEqual([["a", "b", "e"], [STAT_KEY, "c", "d"], ["f", "g"]]);
    expect(dropSlot(spec, "main", "c", 1, "c")).toBeUndefined();
    expect(dropSlot(spec, "main", "nope", 1, null)).toBeUndefined();
    expect(dropSlot(spec, "main", "a", 7, null)).toBeUndefined();
  });
});
