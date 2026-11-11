import { newCharacterAction } from "../../src/obsidian/menu";

describe("right-click new character", () => {
  it("a folder offers a new character saved in that folder", () => {
    expect(newCharacterAction({ kind: "folder", path: "5e-sheet/Characters" })).toEqual({ title: "New 5e character here", folder: "5e-sheet/Characters" });
  });
  it("the vault root is the empty folder", () => {
    expect(newCharacterAction({ kind: "folder", path: "/" })).toEqual({ title: "New 5e character here", folder: "" });
  });
  it("a campaign note offers a character in that campaign, beside the note, with the campaign linked", () => {
    expect(newCharacterAction({ kind: "file", basename: "Hexploration", folder: "campaigns/Hex", frontmatter: { type: "5e-campaign" } }))
      .toEqual({ title: "New character in this campaign", folder: "campaigns/Hex", campaign: "[[Hexploration]]" });
  });
  it("other notes offer nothing", () => {
    expect(newCharacterAction({ kind: "file", basename: "Tindra", folder: "x", frontmatter: { type: "5e-character" } })).toBeUndefined();
    expect(newCharacterAction({ kind: "file", basename: "Plain", folder: "" })).toBeUndefined();
  });
});
