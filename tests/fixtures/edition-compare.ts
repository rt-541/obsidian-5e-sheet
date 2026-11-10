import { Registry } from "../../src/content/registry";
import { loadSrd } from "../../src/content/srd";
import { registerBuiltinTypes } from "../../src/content/types";
import { LIBRARY_MARKER } from "../../src/content/sources";
import { VaultLoader } from "../../src/content/vault-loader";
import { fakeVault, type FakeAdapter, type Notes } from "./library";

/**
 * An invented two-edition library for the per-character comparison: 2014 `lantern-keeper` (and its subclass `dusk`, which the 2024
 * books lack) against 2024 `beacon-warden` (replaces lantern-keeper), plus pairs that share an id. Every name and number is made up.
 */
type Fm = Record<string, unknown>;
const ROOT = "compendium/5e";
const feat = (id: string, name: string, text = "Invented.") => ({ id, op: "feature", name, text });
const stamp = (year: string, replaces?: string[]): Fm => ({ edition: year, ...(replaces ? { replaces } : {}) });

export function compareNotes(extra: Notes = {}): Notes {
  const n: Notes = {}, put = (folder: string, path: string, fm: Fm, body = "An invented sentence.") => { n[`${ROOT}/${folder}/${path}`] = { fm, body }; };
  const old = (path: string, fm: Fm, body?: string) => put("WotC", path, { schema: 1, source: "TST", ...stamp("2014"), ...fm }, body);
  const now = (path: string, fm: Fm, replaces?: string[], body?: string) => put("WotC 2024", path, { schema: 1, source: "TST", ...stamp("2024", replaces), ...fm }, body);
  // classes: the 2024 one has a bigger die, one feature earlier, one new and one dropped, a different save and a bigger resource
  old("Classes/Lantern-keeper/Lantern-keeper.md", { type: "5e-class", id: "lantern-keeper", name: "Lantern-keeper", hitDie: 8, saves: ["wis", "con"], subclassLevel: 3,
    levels: { 1: [feat("lk-guard", "Guard"), { id: "lk-oil", op: "resource", name: "Lantern oil", max: 2, reset: "long" }], 3: [feat("lk-dim", "Dim Vision")], 5: [feat("lk-shutter", "Shutter")] } });
  now("Classes/Beacon-warden/Beacon-warden.md", { type: "5e-class", id: "beacon-warden", name: "Beacon-warden", hitDie: 10, saves: ["wis", "str"], subclassLevel: 3,
    levels: { 1: [feat("bw-guard", "Guard"), { id: "bw-oil", op: "resource", name: "Lantern oil", max: 3, reset: "long" }], 2: [feat("bw-dim", "Dim Vision")], 4: [feat("bw-flare", "Flare")] } }, ["lantern-keeper"]);
  old("Classes/Lantern-keeper/Subclasses/Dusk.md", { type: "5e-subclass", id: "dusk", name: "Dusk", levels: { 3: [feat("dusk-fade", "Fade")] } });
  // same-id pairs
  old("Races/Fenling/Fenling.md", { type: "5e-race", id: "fenling", name: "Fenling", ability: [{ con: 2 }], grants: [{ id: "f-hop", op: "grant", speed: 25, darkvision: 60, proficiencies: [], languages: [], spells: [], items: [] }, feat("f-hop2", "Hop")] });
  now("Races/Fenling/Fenling.md", { type: "5e-race", id: "fenling", name: "Fenling", grants: [{ id: "f-hop", op: "grant", speed: 30, proficiencies: [], languages: [], spells: [], items: [] }, feat("f-hop2", "Hop"), feat("f-glide", "Glide")] });
  old("Backgrounds/Scribe.md", { type: "5e-background", id: "scribe", name: "Scribe", grants: [feat("s-rec", "Records")] });
  now("Backgrounds/Scribe.md", { type: "5e-background", id: "scribe", name: "Scribe", abilityPick: { from: ["int", "wis", "cha"], patterns: [[2, 1], [1, 1, 1]] }, grants: [feat("s-rec", "Records")] });
  old("Feats/Keen.md", { type: "5e-feat", id: "keen", name: "Keen", grants: [feat("k-edge", "Edge")] });
  now("Feats/Keen.md", { type: "5e-feat", id: "keen", name: "Keen", minLevel: 4, grants: [feat("k-edge", "Edge")] });
  const spell = (id: string, name: string, level: number, extra: Fm = {}): Fm => ({ type: "5e-spell", id, name, level, school: "evocation", ritual: false, casting_time: "1 action", range: "30 feet", components: "V, S",
    duration: "Instantaneous", concentration: false, classes: ["wizard"], tags: ["5e/spell"], ...extra });
  old("Spells/Glint.md", spell("glint", "Glint", 1), "A bolt deals 2d6 fire damage to the target.");
  now("Spells/Glint.md", spell("glint", "Glint", 2, { casting_time: "1 bonus action", range: "60 feet", duration: "1 minute" }), undefined, "A bolt deals 3d6 fire damage to the target.");
  old("Spells/Hush.md", spell("hush", "Hush", 2));
  const weapon = (id: string, name: string, dmg: string, mastery?: string): Fm => ({ type: "5e-item", id, name, item_type: "Weapon", rarity: "none", attunement: false, magic: false, kind: "weapon",
    weapon: { dmg, type: "slashing", ...(mastery ? { mastery } : {}) }, tags: ["5e/item", "5e/item/weapon"] });
  old("Items/Tin-blade.md", weapon("tin-blade", "Tin-blade", "1d6"));
  now("Items/Tin-blade.md", weapon("tin-blade", "Tin-blade", "1d8", "snag"));
  now("Masteries/Snag.md", { type: "5e-mastery", id: "snag", name: "Snag" }, undefined, "An invented sentence.");
  // padding the comparison must never read
  for (let i = 0; i < 25; i++) { old(`Spells/Pad-${i}.md`, spell(`pad-${i}`, `Pad ${i}`, 1)); now(`Spells/Pad-${i}.md`, spell(`pad-${i}`, `Pad ${i}`, 1)); }
  return { ...n, ...extra };
}

/** The in-memory vault, loaded on top of the bundled SRD. `only` drops the 2024 folder (a vault with no 2024 library). */
export async function compareRegistry(opts: { no2024?: boolean; extra?: Notes } = {}): Promise<{ r: Registry; vault: FakeAdapter }> {
  const notes = compareNotes(opts.extra);
  if (opts.no2024) for (const p of Object.keys(notes)) if (p.includes("/WotC 2024/")) delete notes[p];
  const vault = fakeVault(notes, { markers: opts.no2024 ? [] : [`${ROOT}/WotC 2024/${LIBRARY_MARKER}`] });
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  await new VaultLoader(r, vault, ROOT).indexAll();
  return { r, vault };
}
