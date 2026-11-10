import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { LIBRARY_MARKER } from "../../src/content/sources";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, type FakeAdapter, type Notes } from "./library";

/** An invented two-edition library: every id, name and number below is made up. */
export interface EditionOpts {
  /** Add `edition`, `replaces` and the edition tag to the unstamped notes too (the pin: today's code must ignore them). */
  stampPlain?: boolean;
  /** Library folder names to include (default all three). Homebrew is always present. */
  only?: string[];
}
const ROOT = "compendium/5e";
type Fm = Record<string, unknown>;
const stamp = (year: string, replaces?: string[]): Fm => ({ edition: year, ...(replaces ? { replaces } : {}) });

const spell = (id: string, name: string, level: number, extra: Fm = {}): Fm => ({
  type: "5e-spell", schema: 1, id, name, source: "TST", level, school: "evocation", ritual: false, casting_time: "1 action", range: "30 feet",
  components: "V, S", duration: "Instantaneous", concentration: false, classes: ["wizard"], tags: ["5e/spell", ...(extra.tags as string[] ?? [])], ...extra,
});
const weapon = (id: string, name: string, dmg: string, extra: Fm = {}): Fm => ({
  type: "5e-item", schema: 1, id, name, source: "TST", item_type: "Weapon", rarity: "none", attunement: false, magic: false, kind: "weapon",
  weapon: { dmg, type: "slashing", ...(extra.mastery ? { mastery: extra.mastery } : {}) }, tags: ["5e/item", "5e/item/weapon", ...(extra.tags as string[] ?? [])],
});
const feat = (id: string, name: string, extra: Fm = {}): Fm => ({
  type: "5e-feat", schema: 1, id, name, source: "TST", tags: ["5e/feat", ...(extra.tags as string[] ?? [])],
  grants: [{ id: `${id}-edge`, op: "feature", name: "Edge", text: "Invented." }],
});
const cls = (id: string, name: string, extra: Fm = {}): Fm => ({
  type: "5e-class", schema: 1, id, name, source: "TST", hitDie: 8, saves: ["wis", "con"], tags: ["5e/class", ...(extra.tags as string[] ?? [])],
  levels: { 1: [{ id: `${id}-guard`, op: "feature", name: "Guard", text: "Invented." }] },
});
/** Extra frontmatter for a library: the 2024 one always, the plain ones only when stampPlain. */
const withStamp = (fm: Fm, on: boolean, year: string, replaces?: string[]): Fm => {
  if (!on) return fm;
  const { tags, ...rest } = fm;
  return { ...rest, ...stamp(year, replaces), tags: [...(tags as string[]), `5e/edition/${year}`] };
};

export function editionNotes(opts: EditionOpts = {}): Notes {
  const only = new Set(opts.only ?? ["WotC", "WotC 2024", "Test Press"]);
  const n: Notes = {}, put = (folder: string, path: string, fm: Fm) => { n[`${ROOT}/${folder}/${path}`] = { fm, body: "An invented sentence." }; };
  const plain = !!opts.stampPlain;
  if (only.has("WotC")) {
    const s = (fm: Fm, replaces?: string[]) => withStamp(fm, plain, "2014", replaces);
    put("WotC", "Spells/Glint.md", s(spell("glint", "Glint", 1)));
    put("WotC", "Spells/Hush.md", s(spell("hush", "Hush", 2)));
    put("WotC", "Items/Tin-blade.md", s(weapon("tin-blade", "Tin-blade", "1d6")));
    put("WotC", "Feats/Keen.md", s(feat("keen", "Keen")));
    put("WotC", "Classes/Warden/Warden.md", s(cls("warden", "Warden"), ["lantern-keeper"]));
    put("WotC", "Classes/Lantern-keeper/Lantern-keeper.md", s(cls("lantern-keeper", "Lantern-keeper")));
  }
  if (only.has("WotC 2024")) {
    const s = (fm: Fm, replaces?: string[]) => withStamp(fm, true, "2024", replaces);
    put("WotC 2024", "Spells/Glint.md", s(spell("glint", "Glint", 2)));
    put("WotC 2024", "Spells/Nova.md", s(spell("nova", "Nova", 3)));
    put("WotC 2024", "Items/Tin-blade.md", s(weapon("tin-blade", "Tin-blade", "1d8", { mastery: "snag" })));
    put("WotC 2024", "Feats/Keen.md", s(feat("keen", "Keen")));
    put("WotC 2024", "Classes/Warden/Warden.md", s(cls("warden", "Warden"), ["lantern-keeper"]));
  }
  if (only.has("Test Press")) {
    const s = (fm: Fm) => withStamp(fm, plain, "2014");
    put("Test Press", "Spells/Glint.md", s(spell("glint", "Glint", 3)));
    put("Test Press", "Items/Tin-blade.md", s(weapon("tin-blade", "Tin-blade", "1d8")));
    put("Test Press", "Feats/Keen.md", s(feat("keen", "Keen")));
  }
  // Homebrew: hand-made notes, no edition.
  n[`${ROOT}/Homebrew/Spells/Spark.md`] = { fm: { type: "5e-spell", name: "Spark", level: 1, school: "Evocation", classes: ["wizard"] }, body: "" };
  n[`${ROOT}/Homebrew/Spells/Glint.md`] = { fm: { type: "5e-spell", name: "Glint", level: 4, school: "Evocation", classes: ["wizard"] }, body: "" };
  return n;
}

/** The in-memory vault: WotC (unstamped), WotC 2024 (marker, stamped), Test Press (marker, unstamped) and Homebrew. */
export function editionVault(opts: EditionOpts = {}): FakeAdapter {
  const markers = ["WotC 2024", "Test Press"].filter(f => (opts.only ?? [f]).includes(f)).map(f => `${ROOT}/${f}/${LIBRARY_MARKER}`);
  return fakeVault(editionNotes(opts), { markers });
}

/** The vault loaded with `VaultLoader` on top of the bundled SRD. */
export async function editionRegistry(opts: EditionOpts = {}): Promise<{ r: Registry; vault: FakeAdapter }> {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const vault = editionVault(opts);
  await new VaultLoader(r, vault, ROOT).indexAll();
  return { r, vault };
}
