import { resolveRules, resolveSections } from "../../src/rules/module";
import { MODULES, activeRests } from "../../src/rules";

describe("rule toggles", () => {
  it("defaults: standard rests on", () => expect(resolveRules(MODULES, [])).toEqual({ "rest-standard": true, "rest-excursion": false }));
  it("campaign turns excursion on, which forces standard off", () => {
    expect(resolveRules(MODULES, [undefined, { "rest-excursion": true }])).toEqual({ "rest-standard": false, "rest-excursion": true });
  });
  it("character overrides campaign", () => {
    expect(resolveRules(MODULES, [{}, { "rest-excursion": true }, { "rest-standard": true }])).toEqual({ "rest-standard": true, "rest-excursion": false });
  });
  it("both rests off brings standard back", () => {
    expect(resolveRules(MODULES, [{ "rest-standard": false }])).toEqual({ "rest-standard": true, "rest-excursion": false });
  });
  it("unknown keys pass through for future modules", () => {
    expect(resolveRules(MODULES, [{ rations: true }]).rations).toBe(true);
  });
  it("active rest buttons follow the rules", () => {
    expect(activeRests({ "rest-standard": true }).map(r => r.id)).toEqual(["short", "long"]);
    expect(activeRests({ "rest-excursion": true }).map(r => r.id)).toEqual(["night"]);
  });
});

describe("section toggles", () => {
  const all = ["hp", "death-saves", "conditions", "companions"];
  it("later show undoes earlier hide", () => {
    expect(resolveSections(all, [{ hide: ["death-saves", "companions"], show: [] }, { hide: [], show: ["companions"] }], {}, MODULES)).toEqual(["hp", "conditions", "companions"]);
  });
  it("sections owned by an off module are hidden", () => {
    const mods = [...MODULES, { id: "downtime", title: "Downtime", defaultOn: false, excludes: [], rests: [], sections: ["downtime-tab"] }];
    expect(resolveSections([...all, "downtime-tab"], [], { downtime: false }, mods)).not.toContain("downtime-tab");
    expect(resolveSections([...all, "downtime-tab"], [], { downtime: true }, mods)).toContain("downtime-tab");
  });
});
