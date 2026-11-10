import { campaignType } from "../../src/content/types/campaign";

describe("campaign edition", () => {
  it("the campaign note may name an edition", () => {
    expect(campaignType.validate({ name: "C", edition: "2024" }).value!.edition).toBe("2024");
    expect(campaignType.validate({ name: "C", edition: 2014 }).value!.edition).toBe("2014");
    expect(campaignType.validate({ name: "C" }).value!.edition).toBeUndefined();
  });
  it("a bad edition is an error naming the field", () => {
    const r = campaignType.validate({ name: "C", edition: "3e" });
    expect(r.errors).toContain("edition: must be 2014 or 2024");
    expect(r.value).toBeUndefined();
  });
});
