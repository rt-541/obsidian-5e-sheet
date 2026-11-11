import { newNoteEdition } from "../../src/core/edition";

describe("newNoteEdition", () => {
  it("uses the default rules edition setting", () => {
    expect(newNoteEdition("2024")).toBe("2024");
    expect(newNoteEdition("2014")).toBe("2014");
  });
  it("a campaign's edition wins over the setting", () => {
    expect(newNoteEdition("2024", "2014")).toBe("2014");
    expect(newNoteEdition("2014", 2024)).toBe("2024");
  });
  it("falls back to the character default when nothing readable is given", () => {
    expect(newNoteEdition(undefined)).toBe("2014");
    expect(newNoteEdition("nonsense", "also nonsense")).toBe("2014");
  });
});
