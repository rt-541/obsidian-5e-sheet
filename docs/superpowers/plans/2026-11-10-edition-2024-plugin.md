# 2014 and 2024 Rules (Plugin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A character is built and played under the 2014 or the 2024 rules, reads its own edition's compendium, can bring single things in from the other edition, and the sheet explains in plain words what differs.

**Architecture:** An `edition` on the character note picks a lens on the registry (`Registry.forEdition`): strict lookups, no silent fall-back. Every rule the sheet computes that differs lives in one typed table (`src/core/edition.ts`). A thing brought in from the other edition is stored as an edition-qualified reference (`glint@2014`), so existing notes load unchanged and two rows may hold both versions. New data shapes (background ability picks, feat categories, weapon mastery, overlay by edition) are generic. The what-changed panel has a general part (data plus the table) and a per-character part computed from the two libraries at run time.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest + jsdom (`npm test`, `npm run typecheck`, `npm run build`). Plugin repo only; the importer is a separate plan.

**Spec:** `docs/superpowers/specs/2026-11-10-edition-2024-design.md` (goals 1 to 5 and 7, and the plugin's half of "Contract between the importer and the plugin"). Library notes are assumed to arrive in the contract's format (`edition`, `replaces`, `abilityPick`, the `feat` op, `asi.feats`, feat `category` and `minLevel`, `choose what: mastery`, `5e-mastery`, weapon `mastery`).

## Global Constraints

- No book text in the plan, in git, on scratch or the about-site: no quoted rules wording, every test fixture INVENTED (numbers too). The one exception is the edition table, whose 2024 values are real rule facts (book id and entry name beside each, no wording).
- A note without `edition` is 2014; new characters always write it; the edition is chosen as the builder's first step and not changeable in place. Existing notes load and behave exactly as today.
- Strict lookups: a character reads entries of its own edition or of no edition, in today's source order; homebrew (no edition) still wins over both. A generated library note without `edition` is 2014; the bundled SRD is 2014; a hand-made note without `edition` belongs to both.
- Code never branches on an edition name outside `src/core/edition.ts` (a guard test enforces it) and never names a race, class, feat, item or mastery property.
- Weapon mastery is shown, never applied.
- Plain DOM via `h()`, never innerHTML; mount roots use `classList`, never `className`; plugin button rules need `.fe-sheet button.x` specificity; every text input has `type="text"`; 44 px touch targets; desktop hover, tablet and phone tap parity; layout tests place each feature id once per layout. This plan adds no feature id: the chip lives in `identity`, the panel is a `Panel` kind, the entry point is a row in the `settings` card.
- Players never type YAML, keywords or formulas; every number explains itself; destructive actions confirm. Never write to library notes; per-character changes go in the character note.
- Test first. `npm test`, `npm run typecheck` and `npm run build` stay green after every task. Known flaky: `tests/ui/sheet.test.ts` "roll log keeps the last 50" can time out under load; rerun that file alone. Where an existing test encodes behaviour a task changes (builder page order, full-frontmatter equality), the task updates it and says so in its commit.
- Commits: conventional prefix, one sentence on why, last line `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- This plan never pushes, opens a PR, merges, deploys to the vault or touches the public mirror (`/docker/dnd-sheet-export`, any `-public` path). Deploy order matters to the owner: the edition-aware build ships before the 2024 folder is synced.

## Review Focus

- A hand-edited note whose edition or reference the libraries lack (`edition: "2024"` with no 2024 library; a spell only the 2014 books have) must show the "missing" marker with a plain line and never throw; the builder and level-up say no classes were found and point at `docs/IMPORTING.md` (Tasks 5, 16, 18).
- A qualified reference (`id@2014`) passes through code that slugs or splits ids: overlay owners, `data.class` / `data.race` comparisons, `classOfKey`, level-log keys, resource ids, `mainPins`. A brought-in feat or subclass keeps its mechanics, and level-up undo round-trips (Task 14).
- Both editions' version of one thing as two rows (the same spell twice, the same weapon twice) stay independent through equip, prepare, pin, remove and undo (Task 14).
- Third-party libraries without a stamp (`Kobold Press`, `Necromancer Games`) count as 2014: they appear for 2014 characters, only through "Bring in" for 2024 characters, and campaign source switches hide them in both (Tasks 3, 15).
- The per-character comparison reads only the notes it pairs (never the whole library), says so when there is no counterpart or the other library is missing, and survives a class with no hit die or an empty level table (Task 19).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/edition.ts` (create) | `Edition`, `readEdition`, `characterEdition`, `otherEdition`, the edition table `EDITION_RULES` |
| `src/content/edition.ts` (create) | `entryEdition`, reference helpers (`splitRef`, `qualifyRef`, `canonRef`, `refFor`), `provenanceLine` |
| `src/content/registry.ts` (modify) | `Entry.edition/replaces`, `forEdition`, `listEdition`, `otherEditionHas`, qualified `get` |
| `src/content/edition-changes.ts` (create) | general "what changed" data and `generalChanges(rules)` |
| `src/core/edition-compare.ts` (create) | per-character comparison (`counterpartOf`, `swapEdition`, `compareCharacter`) |
| `src/content/srd/conditions-2024.json` (create) | 2024 condition effects, no rules text |
| `src/ui/bring-in.ts`, `src/ui/edition-ui.ts` (create) | bring-in button and chip; edition chip card, panel, builder step body |
| `tests/fixtures/editions.ts` (create) | invented two-edition library for every edition test |

---

### Task 1: Pin today's behaviour

**Depends on:** none.

**Files:**
- Modify: `tests/fixtures/library.ts` (`fakeVault(notes, opts?: { markers?: string[] })` gains `exists`, true for `<folder>/<marker>` paths listed in `markers`, else false)
- Create: `tests/fixtures/editions.ts`, `tests/content/edition-pin.test.ts`, `tests/core/edition-pin.test.ts`

**Interfaces:**
- Produces: `editionVault(opts?: { stampPlain?: boolean; only?: string[] })` (`only` lists the library folder names to include, default all): an in-memory vault with libraries `compendium/5e/WotC` (unstamped), `compendium/5e/WotC 2024` (marker, `edition: "2024"`) and `compendium/5e/Test Press` (marker, unstamped), plus `compendium/5e/Homebrew`. Invented ids: spell `glint` (all three libraries, different levels), spell `hush` (WotC only), spell `nova` (WotC 2024 only), item `tin-blade` (WotC 1d6, Test Press 1d8, WotC 2024 1d8 with `weapon.mastery: "snag"`), feat `keen` (all three), class `warden` (WotC, WotC 2024 with `replaces: ["lantern-keeper"]`), class `lantern-keeper` (WotC), homebrew spell `spark` and homebrew `glint` (no edition). `editionRegistry(opts?)` (same options) loads it with `VaultLoader` and the bundled SRD and returns `{ r, vault }`. Notes in the contract's frontmatter shape (`edition`, `replaces`, tag `5e/edition/<year>`) only in the 2024 library. `stampPlain: true` adds `edition`, `replaces` and the tag to the unstamped notes too (the second half of the pin).

- [ ] **Step 1: Write the failing tests** (they must fail only because the fixtures do not exist yet; the assertions describe today's behaviour and must also pass after every later task)

```ts
// tests/content/edition-pin.test.ts
it("an existing character resolves the same entries when another generated library shares its ids", async () => {
  const { r } = await editionRegistry({ only: ["WotC", "Test Press"] });   // no 2024 library yet
  expect(r.get("spell", "glint")!.sourceName).toBe("Homebrew");            // homebrew wins
  expect(r.get("item", "tin-blade")!.sourceName).toBe("WotC");
  expect((r.get<any>("item", "tin-blade")!.data).weapon.dmg).toBe("1d6");
  expect(r.list("spell").filter(e => e.id === "glint")).toHaveLength(1);
  expect(r.getAll("item", "tin-blade").map(e => e.sourceName)).toEqual(["WotC", "Test Press"]);
  expect(r.scoped({ WotC: false }).get("item", "tin-blade")!.sourceName).toBe("Test Press");
});
it("a library note carrying edition, replaces and an edition tag reads exactly like one without", async () => {
  const a = await editionRegistry({ only: ["WotC"] }), b = await editionRegistry({ only: ["WotC"], stampPlain: true });
  for (const t of ["spell", "item", "class", "feat", "race", "subclass", "background", "creature", "condition"])
    expect(b.r.listAll(t).map(e => [e.id, e.data])).toEqual(a.r.listAll(t).map(e => [e.id, e.data]));
  expect(b.r.problems()).toEqual([]); expect(b.r.referenceOnlyCount()).toBe(a.r.referenceOnlyCount());
});
```
```ts
// tests/core/edition-pin.test.ts  (invented characters from tests/fixtures/homebrew.ts)
it("multiclass slots round as they do today", () => {
  expect(slotTable([{ level: 3, progression: "half" }, { level: 3, progression: "half" }])).toEqual([{ level: "1", max: 3 }]);
  expect(slotTable([{ level: 1, progression: "half" }])).toEqual([]);
  expect(slotTable([{ level: 2, progression: "half" }])).toEqual([{ level: "1", max: 2 }]);
  expect(slotTable([{ level: 5, progression: "half" }])).toEqual([{ level: "1", max: 4 }, { level: "2", max: 2 }]);
});
it("a long rest gives back half the Hit Dice, lowers exhaustion by one and halves max HP only from level 4", () => { /* tests/rules/rests.test.ts helpers: 5 dice all used -> "Regain 2 Hit Dice"; exhaustion 5 -> 4 sets HP to floor(hpFull/2); exhaustion 3 -> 2 sets HP to hpFull */ });
it("the level-up asks as many spells as the class's spells ops say", () => { /* invented class with { op: "spells", count: 2 } at level 1 and { count: 1 } at level 2 -> the level-2 spells step asks for 1; this is how the 2024 library carries prepared-spell counts (see the contract) */ });
it("a class with a spellcasting table asks what its known column says", () => { /* invented class with table known: 3 at level 5 -> spells step count 3 */ });
it("a character with no edition derives the numbers it derives today", () => { /* record hp.max, ac, slots, attacks of an invented two-class character from today's code as literals */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/content/edition-pin.test.ts tests/core/edition-pin.test.ts` — Expected: FAIL on the missing fixtures only.
- [ ] **Step 3: Implement** `fakeVault` markers and `tests/fixtures/editions.ts`; record the literals for the last core test by running today's code once.
- [ ] **Step 4: Run** the two files, then `npm test && npm run typecheck && npm run build` — Expected: PASS on unchanged `src`.
- [ ] **Step 5: Commit** `test: pin what existing characters resolve and derive so the edition work cannot change them`

---

### Task 2: Edition vocabulary and entry stamps

**Depends on:** 1.

**Files:**
- Create: `src/core/edition.ts` (vocabulary only; the table arrives in Task 6), `src/content/edition.ts`
- Modify: `src/content/registry.ts` (`Entry`, `AddMeta`, `add`), `src/content/vault-loader.ts` (read `edition`, `replaces` for library and hand-made notes alike, op-type notes included)
- Test: `tests/content/edition-stamp.test.ts`

**Interfaces:**
- Produces in `src/core/edition.ts`: `type Edition = "2014" | "2024"`; `EDITIONS: readonly Edition[]`; `readEdition(v: unknown): Edition | undefined` (accepts `"2014"`, `2014`, `"2024"`, `2024`, else undefined); `otherEdition(e: Edition): Edition`; `characterEdition(c: { edition?: Edition }): Edition` (absent is `"2014"`).
- Produces in `src/content/edition.ts`: `entryEdition(e: { source: "srd" | "vault"; library?: boolean; edition?: Edition }): Edition | undefined`; `splitRef(ref: string): { id: string; edition?: Edition }` (only a trailing `@2014` or `@2024` is a qualifier); `qualifyRef(id: string, e: Edition): string`; `canonRef(ref: string, own: Edition): string` (drops a qualifier equal to `own`); `refFor(entry: Entry, own: Edition): string` (plain when the entry's edition is `own` or none, else qualified); `provenanceLine(e: Entry): string` such as `WotC · PHB · 2014 rules` (the card line that names book and edition; no edition part for hand-made notes).
- `Entry.edition?: Edition` and `Entry.replaces?: string[]` (ids of the same type, strings only); `AddMeta.edition`, `AddMeta.replaces`. `Registry.add` sets `entry.edition = meta.edition ?? (library || source === "srd" ? "2014" : undefined)`. The tag `5e/edition/<year>` is for Obsidian search and is not read.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads editions as text or number", () => { expect(readEdition(2024)).toBe("2024"); expect(readEdition("2014")).toBe("2014"); expect(readEdition("2025")).toBeUndefined(); expect(characterEdition({})).toBe("2014"); });
it("stamps entries: unstamped library 2014, stamped 2024, SRD 2014, hand-made none, hand-made with edition that edition", async () => {
  const { r } = await editionRegistry();
  expect(r.getAll("spell", "hush")[0].edition).toBe("2014"); expect(r.getAll("spell", "nova")[0].edition).toBe("2024");
  expect(r.srdEntry("condition", "prone")!.edition).toBe("2014"); expect(r.getAll("spell", "spark")[0].edition).toBeUndefined();
});
it("keeps replaces as ids and nothing else", async () => { const { r } = await editionRegistry(); expect(r.getAll<any>("class", "warden").find(e => e.edition === "2024")!.replaces).toEqual(["lantern-keeper"]); });
it("splits and builds references", () => {
  expect(splitRef("glint@2014")).toEqual({ id: "glint", edition: "2014" }); expect(splitRef("a@b")).toEqual({ id: "a@b" });
  expect(canonRef("glint@2024", "2024")).toBe("glint"); expect(canonRef("glint@2014", "2024")).toBe("glint@2014");
});
it("provenanceLine names book and edition", () => { /* library entry with book TST and edition 2024 -> "WotC 2024 · TST · 2024 rules"; homebrew -> "Homebrew" */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/content/edition-stamp.test.ts` — Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the files above; the loader passes `readEdition(fm.edition)` and a `replaces` string list through `AddMeta` (library non-op notes via `loadLibrary`, op-type and hand-made notes via the `add` call in `load`). `libraryMeta` and every type validator stay untouched, so the Task 1 pin keeps passing.
- [ ] **Step 4: Run** this file, `edition-pin`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: content entries know their edition so a character can read its own`

---

### Task 3: Registry lens, strict lookups, qualified ids

**Depends on:** 2.

**Files:**
- Modify: `src/content/registry.ts`
- Test: `tests/content/edition-lens.test.ts`

**Interfaces:**
- Consumes: `Entry.edition`, `splitRef`.
- Produces: `ListOpts.edition?: Edition` (overrides the lens for one call); `Registry.forEdition(e: Edition | undefined): Registry` (a view like `scoped`; `undefined` returns `this`; composes with `scoped` in both orders); `Registry.get/list` on a lensed view only consider entries whose `edition` is the lens or undefined, and run the existing winner rules (including "library entry yields to the SRD entry") on that filtered set; `get(type, "<id>@<year>")` resolves exactly the entry of that edition (an entry with no edition never matches a qualifier) whatever the lens; `Registry.listEdition<T>(type: string, e: Edition, o?: ListOpts): Entry<T>[]` (entries whose edition is exactly `e`, one winner per id, sorted by name: the list behind "Bring in"); `Registry.otherEditionHas(type: string, id: string): Edition | undefined` (the other edition's winner exists while the lens has none). `getAll`, `listAll`, `srdEntry` stay unfiltered. An unlensed registry behaves as today.

- [ ] **Step 1: Write the failing tests** (`editionRegistry()` with all libraries)

```ts
const r24 = r.forEdition("2024"), r14 = r.forEdition("2014");
it("homebrew outranks both editions", () => { expect(r24.get("spell", "glint")!.sourceName).toBe("Homebrew"); expect(r14.get("spell", "glint")!.sourceName).toBe("Homebrew"); });
it("there is no silent fall-back", () => { expect(r24.get("spell", "hush")).toBeUndefined(); expect(r14.get("spell", "nova")).toBeUndefined(); });
it("a lens lists one row per id and only its edition plus homebrew", () => {
  expect(r24.list("spell").map(e => e.id)).toEqual(["glint", "nova", "spark"]); expect(r14.list("spell").map(e => e.id)).toEqual(["glint", "hush", "spark"]);
  expect(r24.get<any>("item", "tin-blade")!.data.weapon.mastery).toBe("snag"); expect(r14.get<any>("item", "tin-blade")!.data.weapon.dmg).toBe("1d6");
});
it("a qualified id resolves that edition exactly", () => { expect(r24.get("spell", "hush@2014")!.edition).toBe("2014"); expect(r14.get("spell", "nova@2024")!.edition).toBe("2024"); expect(r24.get("spell", "spark@2014")).toBeUndefined(); });
it("listEdition is the bring-in list", () => { expect(r24.listEdition("spell", "2014").map(e => e.id)).toEqual(["glint", "hush"]); });
it("composes with campaign switches", () => { expect(r24.scoped({ "WotC 2024": false }).list("class")).toEqual([]); expect(r24.scoped({ "WotC 2024": false }).get("class", "warden")).toBeDefined(); });
it("tells which books have a missing id", () => { expect(r24.otherEditionHas("spell", "hush")).toBe("2014"); expect(r24.otherEditionHas("spell", "zzz")).toBeUndefined(); });
it("third-party libraries without a stamp are 2014 (Review Focus 4)", () => { expect(r24.get("item", "tin-blade")!.sourceName).toBe("WotC 2024"); expect(r24.listEdition("item", "2014").some(e => e.sourceName === "Test Press")).toBe(true); });
```

- [ ] **Step 2: Run** `npx vitest run tests/content/edition-lens.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `forEdition` as `Object.create(this, { lens: { value: e } })` with a private `lens` field read by `winner(list, o)` (`o?.edition ?? this.lens`); fix `put` so bundled entries are replaced only when source name and edition both match (Task 9 relies on it).
- [ ] **Step 4: Run** this file, `edition-pin`, `precedence`, `scoped`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: registry lens so a character reads its own edition and nothing else by itself`

---

### Task 4: The character's edition, the campaign key and the setting

**Depends on:** 2.

**Files:**
- Modify: `src/core/character.ts` (`Character.edition?: Edition`, `parseCharacter`), `src/content/types/campaign.ts` (`CampaignData.edition?: Edition`), `src/obsidian/settings.ts` (`Settings.defaultEdition: Edition`, `DEFAULT_SETTINGS.defaultEdition = "2014"`, a dropdown "Default rules edition" under Default rules)
- Test: `tests/core/character-edition.test.ts`, `tests/content/campaign-edition.test.ts`, `tests/obsidian/settings-default.test.ts` (extend)

**Interfaces:**
- Produces: `parseNote({ type: "5e-character", edition: 2024, ... })` gives `value.edition === "2024"`; absent leaves `edition` undefined (do not default it, so `writeInto` never adds the key to an old note); an unreadable value adds the error `edition: must be 2014 or 2024` and is treated as undefined. `campaignType.validate({ name, edition: 2024 }).value.edition === "2024"`; a bad value is an error naming the field.

- [ ] **Step 1: Write the failing tests**

```ts
it("a note without edition stays without it through parse and write", () => { const p = parseNote({ type: "5e-character", name: "A" }) as any; expect(p.value.edition).toBeUndefined(); const fm: any = { type: "5e-character", name: "A" }; writeInto(fm, p.value); expect("edition" in fm).toBe(false); });
it("reads text and number editions and writes the text", () => { expect((parseNote({ type: "5e-character", name: "A", edition: 2024 }) as any).value.edition).toBe("2024"); });
it("rejects an unknown edition in plain words", () => { expect((parseNote({ type: "5e-character", name: "A", edition: "3e" }) as any).errors).toContain("edition: must be 2014 or 2024"); });
it("the campaign note may name an edition", () => { expect(campaignType.validate({ name: "C", edition: "2024" }).value!.edition).toBe("2024"); expect(campaignType.validate({ name: "C" }).value!.edition).toBeUndefined(); });
it("the default edition setting is 2014", () => { expect(DEFAULT_SETTINGS.defaultEdition).toBe("2014"); });
```

- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement** the fields; the settings tab dropdown options are `{ "2014": "2014 rules", "2024": "2024 rules" }` and calls `persist()`.
- [ ] **Step 4: Run** the files, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: the character note, the campaign note and the settings can name a rules edition`

---

### Task 5: Wire the lens into the sheet and the builder

**Depends on:** 3, 4.

**Files:**
- Modify: `src/ui/controller.ts` (constructor, `pickers`), `src/ui/builder.ts` (`BuilderHost`, `pickers`, every `this.host.registry` read), `src/core/builder.ts` (`BuildDraft.edition?: Edition`, `baseCharacter`), `src/main.ts` (builder host), `src/obsidian/builder-modal.ts` if it builds the host
- Test: `tests/ui/edition-lens.test.ts`; update `tests/core/builder.test.ts` and `tests/ui/builder.test.ts` where they compare full frontmatter

**Interfaces:**
- Consumes: `Registry.forEdition`, `characterEdition`.
- Produces: `SheetController` wraps its host in the constructor so `ctl.host.registry` is the lens of `characterEdition(value)` for a character and the raw registry for an NPC; the raw registry stays on `ctl.baseRegistry`. No call site changes: every existing `ctl.host.registry.get` is edition-aware. `BuilderHost.defaultEdition(): Edition` and `BuilderHost.campaignEdition?(campaign: string): Edition | undefined`. `BuilderController.edition(): Edition`, `setEdition(e: Edition)` (marks it chosen, drops every pick: race, subrace, background, class, equipment, choices), `defaultEdition(): Edition` (campaign key, else setting, else 2014; a campaign chosen after the player picked does not override the pick). `BuilderController.pickers()` and the controller's own reads use `host.registry.forEdition(edition())`. `baseCharacter` sets `c.edition = d.edition ?? "2014"`, so `characterFrontmatter` writes `edition` for every new character.

- [ ] **Step 1: Write the failing tests** (`for (const layout of LAYOUTS)` for the sheet ones, `sheet(layout, note, extra, { registry })` from `tests/ui/review-helpers.ts`)

```ts
it("a 2024 sheet reads 2024 entries and a 2014 sheet the 2014 ones", () => { expect(ctl24.host.registry.get("spell", "nova")).toBeDefined(); expect(ctl24.host.registry.get("spell", "hush")).toBeUndefined(); expect(ctl14.host.registry.get("spell", "hush")).toBeDefined(); });
it("a note without edition behaves as 2014 and an NPC sheet is unlensed", () => { /* get("spell","nova") undefined for the character, defined for the NPC */ });
it("builder pickers list only the draft's edition plus homebrew", () => { /* setEdition("2024"): pickers().list("class") ids ["warden"]; ready for "race" false until picked */ });
it("the default edition is the campaign's, else the setting, else 2014", () => { /* three hosts */ });
it("choosing the edition after the campaign keeps the player's pick, and changing it drops picks", () => { /* setCampaign after setEdition leaves edition; setEdition("2024") clears draft.race and choices */ });
it("a new character's frontmatter always carries edition", () => { expect(characterFrontmatter(baseCharacter(newDraft(), r)).edition).toBe("2014"); });
it("with no 2024 classes the class list is empty and says why (Review Focus 1)", () => { /* BuilderController.emptyReason("class") === "No 2024 classes were found in your compendium. docs/IMPORTING.md explains how to import them." */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/edition-lens.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as above; `main.ts` supplies `defaultEdition: () => this.data.settings.defaultEdition` and `campaignEdition` read from the campaign note's frontmatter beside `campaignSources`. `emptyReason(type: "class" | "race" | "background"): string | undefined` is only set when the lensed list is empty.
- [ ] **Step 4: Run** this file, `tests/ui/builder.test.ts`, `tests/core/builder.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: sheets and the builder read the character's own edition`

---

### Task 6: The edition table and its callers

**Depends on:** 4 (and 2).

**Files:**
- Modify: `src/core/edition.ts` (the table), `src/core/slots.ts`, `src/core/derive.ts` and `src/core/levelup.ts` (callers of `slotTable`), `src/rules/rests.ts`, `src/rules/module.ts` if `RestCtx` needs nothing new (it already holds `c`), comments in `src/core/levelup.ts` (`XP_THRESHOLDS`, spell-prep note), `src/core/builder.ts` (`POINT_BUY_COST`)
- Test: `tests/core/edition-table.test.ts`, extend `tests/guards.test.ts`

**Interfaces:**
- Produces in `src/core/edition.ts`:
```ts
export interface EditionRules {
  id: Edition; label: string;                              // "2014 rules" / "2024 rules"
  raceWord: "Race" | "Species";
  longRestHitDice: "half" | "all";                         // Hit Dice a long rest gives back
  halfCasterRounding: "down" | "up";                       // each half-caster's share of the multiclass slot level
  halfCasterFromLevel: 1 | 2;                              // class level from which a lone half-caster has slots
  exhaustionHalvesHpAt: number | null;                     // level from which max HP is halved after a rest
  inspiration: { name: string; card: string };            // button name and card text, our own words
}
export const EDITION_RULES: Record<Edition, EditionRules>;
export const editionRules = (e: Edition | undefined): EditionRules;   // undefined is 2014
```
- Values (2014 from today's code: `rests.ts` Hit Dice and `hpMaxAfterExhaustion`, `slots.ts`, `srd/conditions.json`): `raceWord "Race"`, `longRestHitDice "half"`, `halfCasterRounding "down"`, `halfCasterFromLevel 2`, `exhaustionHalvesHpAt 4`, `inspiration.name "Inspiration"` (card: advantage on one d20 roll, one at a time, can be given away).
- Values (2024, read from `/docker/dnd-compendium/5etools-2024/data`, checked 2026-11-10): `raceWord "Species"`; `longRestHitDice "all"` (XPHB variantrule "Long Rest", p370: all spent Hit Point Dice come back); `halfCasterRounding "up"` (XPHB book `book/book-xphb.json`, multiclassing "Spell Slots": half the Paladin and Ranger levels, round up; Fighter and Rogue subclass casters stay one third, round down, so the third-caster rule is unchanged in both); `halfCasterFromLevel 1` (XPHB `class/class-paladin.json` and `class-ranger.json`: the slots column shows 2 first-level slots at class level 1); `exhaustionHalvesHpAt null` (XPHB condition "Exhaustion", p365: the 2024 condition has no max-HP effect; its other numbers belong to Task 9); `inspiration.name "Heroic Inspiration"` (XPHB variantrule "Heroic Inspiration", p368: spend it to reroll any die and keep the new roll; gaining it while holding it wastes it unless given away). Cards are written by the executor in our own words from these facts.
- `slotTable(classes: CasterInput[], rules?: Pick<EditionRules, "halfCasterRounding" | "halfCasterFromLevel">)`; absent means 2014. Single-caster third rule and every full or pact rule unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
it("holds the real values for both editions", () => {
  expect(EDITION_RULES["2014"]).toMatchObject({ raceWord: "Race", longRestHitDice: "half", halfCasterRounding: "down", halfCasterFromLevel: 2, exhaustionHalvesHpAt: 4 });
  expect(EDITION_RULES["2024"]).toMatchObject({ raceWord: "Species", longRestHitDice: "all", halfCasterRounding: "up", halfCasterFromLevel: 1, exhaustionHalvesHpAt: null });
  expect(EDITION_RULES["2024"].inspiration.name).toBe("Heroic Inspiration");
});
it("slots follow the table", () => {
  const r24 = editionRules("2024");
  expect(slotTable([{ level: 3, progression: "half" }, { level: 3, progression: "half" }], r24)).toEqual([{ level: "1", max: 4 }, { level: "2", max: 3 }]);
  expect(slotTable([{ level: 1, progression: "half" }], r24)).toEqual([{ level: "1", max: 2 }]);
  expect(slotTable([{ level: 3, progression: "third" }, { level: 3, progression: "third" }], r24)).toEqual(slotTable([{ level: 3, progression: "third" }, { level: 3, progression: "third" }]));
});
it("a 2024 long rest gives back every Hit Die and always restores full HP; the 2014 one is unchanged", () => { /* 5 dice used: preview "All Hit Dice" vs "Regain 2 Hit Dice"; exhaustion 5 -> 4: hp hpFull (2024) vs floor(hpFull/2) (2014) */ });
// tests/guards.test.ts
it("only the edition table names an edition", () => { /* scan src/**/*.ts except src/core/edition.ts and src/content/edition.ts for /[=!]==?\s*["']20(14|24)["']|case\s+["']20(1[4]|24)["']/ -> no hits */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/core/edition-table.test.ts tests/guards.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** First list every fixed 2014 rule: `grep -rniE "2014|PHB|ceil\(|floor\(total / 2\)|exhaustion" src --include=*.ts` (excluding `srd/`), move into the table only the ones that differ (the four above are known; confirm no more by reading the 2024 data, and stop at what you can pin), and strip "2014" from comments of rules that are the same in both. Callers pass `editionRules(characterEdition(c))`; `rests.ts` reads `longRestHitDice` and `exhaustionHalvesHpAt` instead of the literals.
- [ ] **Step 4: Run** the files, `tests/rules`, `tests/core/slots.test.ts`, `edition-pin`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: one table holds every rule the sheet computes that differs by edition`

---

### Task 7: Words that follow the edition

**Depends on:** 6, 5.

**Files:**
- Modify: `src/content/glossary.ts` (`glossaryEntry(key, excursion = false, edition?: Edition)`, `hitDiceRecharge(total, excursion, edition?)`), `src/ui/components.ts` (Inspiration button, Hit Dice line), `src/ui/identity-cards.ts`, `src/ui/builder-ui.ts`, `src/ui/traits-ui.ts`, `src/ui/levelup-ui.ts` (every visible "race"/"Race"/"Pick a race")
- Test: `tests/ui/edition-words.test.ts`

**Interfaces:**
- Consumes: `editionRules`, `characterEdition`.
- Produces: `raceWord(e: Edition | undefined): string` in `src/core/edition.ts` is not added (read `editionRules(e).raceWord`). The stored field stays `race`.

- [ ] **Step 1: Write the failing tests** (in `for (const layout of LAYOUTS)`)

```ts
it("a 2024 sheet says Heroic Inspiration and Species; a 2014 sheet says Inspiration and Race", () => {
  expect(q('[data-feature="inspiration"] button').textContent).toBe("Heroic Inspiration");
  expect(identityCardText("race")).toContain("Species");
});
it("the Hit Dice line says a long rest gives back all of them for 2024 and half for 2014", () => { /* hitDiceRecharge(6, false, "2024") contains "all"; ("2014") contains "3 (half your total)" */ });
it("the builder says species for a 2024 draft", () => { /* race page hint "Pick a species." vs "Pick a race." */ });
it("the Inspiration card comes from the table", () => { expect(glossaryEntry("inspiration", false, "2024")!.text).toBe(EDITION_RULES["2024"].inspiration.card); });
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/edition-words.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** by replacing the literals with `editionRules(...)` reads; a 2014 sheet's text must not change by one character.
- [ ] **Step 4: Run** this file, `glossary`, `hexploration`, `plain-labels`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: the sheet's words for race, inspiration and hit dice follow the edition`

---

### Task 8: Overlay entries by edition

**Depends on:** 2.

**Files:**
- Modify: `src/content/overlay/index.ts`, `src/core/progression.ts` (the `findOverlay` call at the feature loop; `Src.edition`), `src/content/types/item.ts` (the item overlay call), `src/content/registry.ts` (`add` hands `meta.edition` to validators as `raw.edition` when the note has none)
- Test: `tests/content/overlay-edition.test.ts`

**Interfaces:**
- Produces: a key may end in `@2014` or `@2024` (`feat::tooth@2024`); `findOverlay(kind, owners, name, id?, edition?: Edition)` searches entries limited to `edition` over every candidate first, then general entries; an edition-limited entry never matches another edition or `undefined`. Edition passed by callers: the edition of the entry supplying the feature (`Entry.edition`), else the character's. `useOverlayData(data: { entries: Record<string, unknown> } | undefined): void` (tests only; `undefined` restores the bundled file). A key with another suffix is listed in `overlayProblems()` as `<key>: the edition must be 2014 or 2024`.

- [ ] **Step 1: Write the failing tests**

```ts
afterEach(() => useOverlayData(undefined));
it("an edition-limited entry outranks a general one", () => {
  useOverlayData({ entries: { "feat::tooth": { effects: { modifiers: [{ target: "ac", value: 1 }] } }, "feat::tooth@2024": { effects: { modifiers: [{ target: "ac", value: 2 }] } } } });
  expect(findOverlay("feat", [], "Tooth", undefined, "2024")!.effects.modifiers![0].value).toBe(2);
  expect(findOverlay("feat", [], "Tooth", undefined, "2014")!.effects.modifiers![0].value).toBe(1);
  expect(findOverlay("feat", [], "Tooth")!.effects.modifiers![0].value).toBe(1);
});
it("an entry limited to 2014 is invisible to 2024", () => { /* "feat::claw@2014" only: findOverlay(..., "2024") undefined */ });
it("rejects an unknown edition suffix", () => { useOverlayData({ entries: { "feat::x@2030": { effects: { note: "n" } } } }); expect(overlayProblems()[0]).toContain("the edition must be 2014 or 2024"); });
it("the bundled data is untouched: every existing key still resolves for an edition-less character", () => { /* overlayKeys() unchanged count; tests/content/overlay.test.ts passes */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/content/overlay-edition.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; `idOf` accepts the suffix, `composite` includes it, `build()` reports bad suffixes.
- [ ] **Step 4: Run** this file, `tests/content/overlay*.test.ts`, `tests/core/overlay-*.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: built-in mechanics can be limited to an edition`

---

### Task 9: Audit the overlay and the 15 conditions against the 2024 data

**Depends on:** 3, 8.

**Files:**
- Create: `src/content/srd/conditions-2024.json`, `tests/content/overlay-audit.json`, `tests/content/edition-audit.test.ts`
- Modify: `src/content/srd/index.ts` (`loadSrd` registers the 2024 conditions with `edition: "2024"`), `src/content/registry.ts` (`srdEntry(type, id, edition: Edition = "2014")`), `src/content/vault-loader.ts` (`loadLibrary` merges effects from `srdEntry(type, id, <the note's edition>)`), `src/content/overlay/mechanics.json` (rename keys that only hold for 2014 to `...@2014`, add `@2024` twins)

**Interfaces:**
- Produces: bundled condition entries limited to 2024 so a 2024 character has working conditions without any library (our decision: effects only, no `rules` text, `note` fields in our words). `tests/content/overlay-audit.json`: `{ "<overlay key without suffix>": "both" | "2014" | "twin" }` with one verdict per bundled overlay entry.
- Pinned 2024 values (XPHB condition "Exhaustion", p365, `conditionsdiseases.json`): six levels; level `n` gives `modifiers: [{ target: "check", value: -2n }, { target: "attack", value: -2n }, { target: "save", value: -2n }, { target: "speed", value: -5n }]`; level 6 is death (`{ note: "Death." }`); no max-HP modifier; a long rest removes one level (same as 2014). The other 14 names are the same 15 as the SRD (checked: XPHB lists Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious). Their effects are NOT pinned here: reading each XPHB entry and mapping it to existing effect keys is this task's step.

- [ ] **Step 1: Write the failing tests**

```ts
it("the 2024 conditions are the same 15 names and exhaustion follows the 2024 numbers", () => {
  const r = new Registry(); registerBuiltinTypes(r); loadSrd(r);
  const ex = r.forEdition("2024").get<ConditionData>("condition", "exhaustion")!.data;
  expect(r.forEdition("2024").list("condition")).toHaveLength(15);
  expect(ex.levelEffects![3].modifiers).toEqual([{ target: "check", value: -6 }, { target: "attack", value: -6 }, { target: "save", value: -6 }, { target: "speed", value: -15 }]);
  expect(JSON.stringify(ex.levelEffects)).not.toContain("hpMax");
  expect(r.forEdition("2014").get<ConditionData>("condition", "exhaustion")!.data.levelEffects![4].modifiers).toContainEqual({ target: "hpMax", value: "half" });
});
it("a 2024 library condition takes its effects from the 2024 bundled one", async () => { /* editionRegistry with a 2024 "exhaustion" library note: get via lens 2024 has the 2024 levelEffects */ });
it("every bundled overlay entry has an audit verdict and no verdict is stale", () => {
  const verdicts = audit as Record<string, string>, keys = overlayKeys().map(k => k.replace(/@20\d\d$/, ""));
  for (const k of keys) expect(["both", "2014", "twin"]).toContain(verdicts[k]);
  expect(Object.keys(verdicts).filter(k => !keys.includes(k))).toEqual([]);
});
it("every entry judged 2014 is limited to 2014 and every twin has its @2024 entry", () => { /* from overlayKeys() */ });
it("no bundled data file holds rules wording", () => { /* conditions-2024.json has no "rules" key; no string over 120 chars in it */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/content/edition-audit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Write small scripts under `work/edition-audit/` (outside git) run with `/docker/dnd-compendium/venv/bin/python -I` that print, for each overlay key's owner and feature, whether an XPHB feature of that name exists (`class/*.json`, `feats.json`, `items-base.json`) and what the numbers are; compare to the entry's numbers; record only the verdict. Entries whose feature is unchanged are `both`; absent or changed in 2024 are limited to `@2014` and, when 2024 changed the number, given an `@2024` twin (`twin`). Anything you cannot decide with confidence is `both` plus a one-line note in the commit body. Map the 14 other conditions the same way into `conditions-2024.json`.
- [ ] **Step 4: Run** this file, `tests/content/overlay*.test.ts`, `tests/core/effects*.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: audit built-in mechanics and conditions against the 2024 data so each edition gets its own numbers`

---

### Task 10: Background ability picks

**Depends on:** 5.

**Files:**
- Modify: `src/content/types/origin.ts` (`AbilityPick`, `parseAbilityPick`, `GrantsData.abilityPick`, `backgroundType` accepts `ability` and `abilityPick`), `src/core/ability-increase.ts` (`abilityPickKey`, `pickDelta`, `describePattern`), `src/core/builder.ts` (`originBonus` reads race, subrace and background), `src/core/levelup.ts` (`Step` kind `"pattern"`, `abilityPicks`, `checkStep`), `src/ui/levelup-ui.ts` and `src/ui/builder-ui.ts` (the page), `src/ui/builder.ts` (`stepDone`)
- Test: `tests/core/ability-pick.test.ts`, `tests/ui/ability-pick-ui.test.ts`

**Interfaces:**
- Produces: `interface AbilityPick { from: Abil[]; patterns: number[][] }`; validation messages `abilityPick.from: must be a list of abilities`, `abilityPick.patterns: each pattern must be 1 to 4 whole numbers from 1 to 4, no longer than from`. `abilityPickKey(kind: "race" | "subrace" | "background" | "feat", id: string): string` is `"<kind>:<id>:pick"`. The answer is `{ pattern: number; to: Abil[] }` (`to[i]` receives `patterns[pattern][i]`, all different, all in `from`). `pickDelta(p: AbilityPick, answer: unknown): AbilityDelta | undefined`. `Step` gains `{ kind: "pattern"; key; label; source; from: Abil[]; patterns: number[][]; scores: Record<Abil, number> }` and the builder's `buildCharacter` reports it as open until answered. `describePattern([2, 1])` is "+2 to one ability and +1 to another"; `[1, 1, 1]` is "+1 to each of three abilities".

- [ ] **Step 1: Write the failing tests**

```ts
it("a background may carry ability and a pick, and bad picks are named", () => { /* validate ok; patterns [[5]] -> the plain message; from [] -> the message */ });
it("pickDelta gives each number to a different listed ability", () => { expect(pickDelta(pick, { pattern: 0, to: ["str", "con"] })).toEqual({ str: 2, con: 1 }); expect(pickDelta(pick, { pattern: 0, to: ["str", "str"] })).toBeUndefined(); expect(pickDelta(pick, { pattern: 1, to: ["str", "con", "dex"] })).toEqual({ str: 1, con: 1, dex: 1 }); });
it("originBonus adds the background's fixed ability and the picked pattern", () => { /* invented background { ability: { wis: 1 }, abilityPick: { from: ["str","con","wis"], patterns: [[2,1],[1,1,1]] } } */ });
it("scores stop at 20 and the builder shows the result per ability", () => { /* base 19 + 2 -> 20; the page row text "STR 19 -> 20" */ });
it("the builder is not done until the pattern is answered", () => { expect(buildCharacter(draft, r)).toEqual({ error: expect.stringContaining("still needs an answer") }); });
it("a note without abilityPick builds exactly as before", () => { /* tests/core/builder.test.ts untouched */ });
```

- [ ] **Step 2: Run** the two files — Expected: FAIL.
- [ ] **Step 3: Implement.** The page (in `for (const layout of LAYOUTS)`-independent builder DOM) shows one `choiceButton` per pattern with `describePattern`, then one `select` per number (aria-label "Which ability gets +2") listing `from`, and a result row per ability; `select` and buttons meet 44 px by the existing builder rules.
- [ ] **Step 4: Run** the files, `tests/core/ability-increase.test.ts`, `tests/ui/builder.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: backgrounds can give ability scores as a pick the builder asks in plain words`

---

### Task 11: Feat categories, level gates and the feat op

**Depends on:** 5.

**Files:**
- Modify: `src/content/types/origin.ts` (`FeatData.category?: string`, `minLevel?: number`), `src/content/types/ops.ts` (`OP_NAMES` gains `"feat"`; `Op` gains `{ op: "feat"; feat?: string; categories?: string[] }`; the `asi` op gains `feats?: string[]`), `src/core/progression.ts` (pending choice and granted feats), `src/core/levelup.ts` (`Step` kind `"feat"`, `asi` step carries `feats`, `featOptions`, apply and undo), `src/ui/levelup-ui.ts`
- Test: `tests/content/feat-op.test.ts`, `tests/core/feat-op.test.ts`, `tests/ui/feat-slot.test.ts`

**Interfaces:**
- Produces: `featOptions(reg: Registry, categories: string[] | undefined, c: Character, totalLevel: number): StepOption[]`, offering feats whose `category` is in `categories` (all feats when undefined) and disabling with `Needs level N` when `minLevel` is higher and `Already have` for owned ones. The `feat` op is valid in class and subclass levels and in grants; exactly one of `feat` and `categories` is required (messages `feat op: give feat or categories, not both`). A fixed `feat` op adds the id to `c.feats` when the origin or level is applied (recorded for undo under `+feats`); a `categories` op asks a `{ kind: "feat"; key; label; source; categories: string[]; options: StepOption[] }` step answered with a feat id; the asi step's feat list is `featOptions(reg, op.feats, ...)`, headed in plain words ("This slot offers general feats" from `titleCase(category)`).

- [ ] **Step 1: Write the failing tests**

```ts
it("validates the feat op and the asi feats list", () => { /* ok shapes; both feat and categories -> message; categories [] -> error; asi { feats: ["general"] } kept */ });
it("a feat may carry a category and a minimum level", () => { expect(featType.validate({ name: "F", category: "origin", minLevel: 4, grants: [] }).value).toMatchObject({ category: "origin", minLevel: 4 }); });
it("an asi slot with feats offers only those categories", () => { /* invented class level 4 { op: "asi", feats: ["general"] }: planLevel asi step options ids = general feats only */ });
it("a fixed feat op grants the feat and undo removes it", () => { /* background grants { op: "feat", feat: "keen" }: after applyResolve c.feats includes "keen"; undoLevel/resolve undo removes it */ });
it("a categories op asks for one feat of those categories and respects minLevel", () => {});
it("an asi op without feats still accepts any feat (today)", () => {});
it("the level-up page words the slot in plain words", () => { /* heading "This slot offers general feats" */ });
```

- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement.** `progression.ts` `run` handles the new op beside `asi`; the 2014 library and SRD feats have no category and stay selectable everywhere `feats` is absent.
- [ ] **Step 4: Run** the files, `tests/core/levelup.test.ts`, `tests/ui/leveling.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: feats carry a category and level gate and slots can offer or grant them`

---

### Task 12: Weapon mastery data and picks

**Depends on:** 5.

**Files:**
- Modify: `src/content/types/item.ts` (`WeaponData.mastery?: string`), `src/content/types/ops.ts` (`choose` `what` gains `"mastery"`), `src/content/types/index.ts` (register `masteryType`), `src/content/library.ts` (`libraryBody` case `"mastery"`), `src/content/vault-loader.ts` (no change expected beyond the type registering), `src/core/character.ts` (`Character.mastery?: string[]`), `src/core/levelup.ts` (pick step, apply, undo, summary line)
- Create: `src/content/types/mastery.ts`
- Test: `tests/content/mastery.test.ts`, `tests/core/mastery-pick.test.ts`

**Interfaces:**
- Produces: `interface MasteryData { name: string; rules?: string }`, type id `"mastery"` (`5e-mastery` notes; the body becomes `rules`). `WeaponData.mastery` is a mastery id. `choose` with `what: "mastery"`, `count`, optional `from` (weapon item ids); the pick step's options are `from`, else every item in the lensed registry whose `weapon.mastery` is set, each shown with the property's name. `Character.mastery?: string[]` holds the mastered weapon item ids (parsed and written like `feats`; absent means none). The level log records the picks; undo removes exactly those ids.

- [ ] **Step 1: Write the failing tests**

```ts
it("a mastery note is a library entry with its text as rules", async () => { /* WotC 2024 Masteries/Snag.md invented body -> get("mastery","snag").data.rules */ });
it("an item's weapon may name a mastery and a bad value is an error", () => { expect(itemType.validate({ name: "Tin Blade", kind: "weapon", attunement: false, weight: 2, weapon: { dmg: "1d8", type: "slashing", ab: "str", range: "melee", mastery: "snag" } }).value!.weapon!.mastery).toBe("snag"); });
it("the choose op accepts what: mastery and checks count against from", () => {});
it("the level-up asks for N weapons, lists only weapons with a mastery, and records them", () => { /* c.mastery after apply = picked ids; levelLog choices has them */ });
it("two ops at different levels add up and undo removes only the last ones", () => {});
it("a note without mastery loads and levels as before", () => {});
```

- [ ] **Step 2: Run** the two files — Expected: FAIL.
- [ ] **Step 3: Implement.** `from` weapon ids must exist when asked (a missing id is skipped from the options, never an error). Nothing names a property.
- [ ] **Step 4: Run** the files, `tests/content/library*.test.ts`, `tests/core/levelup.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: weapons name a mastery property and classes grant picks of mastered weapons`

---

### Task 13: Mastery on the attack row and in Edit mode

**Depends on:** 12.

**Files:**
- Modify: `src/core/derive.ts` and `src/core/attack-rows.ts` (`AttackStat.mastery?: { id: string; name: string }`), `src/ui/attacks-ui.ts` (the chip), `src/ui/details.ts` (`case "mastery"` card), `src/core/actions.ts` (`{ type: "mastery"; out: string; in: string }`), `styles.css`
- Test: `tests/ui/mastery-ui.test.ts`, `tests/core/mastery-derive.test.ts`

**Interfaces:**
- Produces: an attack row whose weapon item (or a variant's base) is in `c.mastery` and whose mastery note exists has `mastery`. The row shows a chip `button.fe-mastery-chip` with `data-ref="mastery:<id>"`; its card (hover, tap on touch) shows the name, the note's text, and the edition via `provenanceLine`. Edit mode shows, inside the attacks card, a "Weapon mastery" block listing the mastered weapons with a Change button that picks another weapon from the same options, and the line "You can change these after a long rest." The action `mastery` replaces one id. The effect is never applied to rolls.

- [ ] **Step 1: Write the failing tests** (`for (const layout of LAYOUTS)`)

```ts
it("a mastered weapon's attack row shows the property chip and its card", () => { expect(q(".fe-attack-row .fe-mastery-chip").textContent).toBe("Snag"); /* hover/tap shows the invented note text */ });
it("an unmastered weapon shows no chip and the numbers are identical either way", () => { expect(withMastery.attacks[0].damage).toBe(without.attacks[0].damage); });
it("Edit mode changes one mastery for another and says when", () => { /* click Change, pick, saved.mastery updated; text "You can change these after a long rest." present */ });
it("the chip and Change button are 44 px on touch", () => { /* css rule under .fe-sheet button.fe-mastery-chip, as tests/ui/css.test.ts does for other buttons */ });
```

- [ ] **Step 2: Run** the two files — Expected: FAIL.
- [ ] **Step 3: Implement** with `.fe-sheet button.fe-mastery-chip` and `.fe-sheet button.fe-mastery-change` rules (min-height 44px on touch).
- [ ] **Step 4: Run** the files, `tests/ui/attack-row.test.ts`, `tests/ui/css.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: attack rows show a weapon's mastery property without applying it`

---

### Task 14: Edition-qualified references on the character

**Depends on:** 3, 5.

**Files:**
- Modify: `src/core/progression.ts`, `src/core/levelup.ts` (`levelOptions`, `classOfKey`, subclass and feat lists), `src/core/builder.ts`, `src/core/spells.ts`, `src/core/item-entry.ts`, `src/content/overlay/index.ts` (`overlayOwner` strips a qualifier), `src/ui/builder-ui.ts`, `src/ui/levelup-ui.ts`, `src/ui/components.ts` and every other place `grep -rnE "\.(race|subrace|class|subclass|feats?)\b *(===|!==)|includes\(.*\.id\)|e\.id ===" src` finds a stored reference compared with an entry id or a `data.class` / `data.race`
- Test: `tests/core/qualified-refs.test.ts`

**Interfaces:**
- Consumes: `splitRef`, `canonRef`, `refFor`, qualified `Registry.get`.
- Produces: the storage shape. A thing brought in from the other edition is stored as `<id>@<edition>` wherever the character stores an id: `race`, `subrace`, `background`, `classes[].class`, `classes[].subclass`, `feats[]`, `spells[].id`, `inventory[].id`, `companions[].creature`. No other marker exists; the qualified string is the record, removing the row removes it, and two rows may differ only by the qualifier. Rules: an entry id inside a note (`data.class`, `data.race`) is always plain and compares with `splitRef(ref).id`; a stored ref compares with an entry through `canonRef(ref, own) === canonRef(refFor(entry, own), own)`; `overlayOwner("fighter@2014")` is `overlayOwner("fighter")`.

- [ ] **Step 1: Write the failing tests** (invented editions fixture; character edition 2024)

```ts
it("an old note without qualifiers loads, derives and writes back unchanged", () => {});
it("both editions' version of one spell: both rows resolve, each to its own note, with their own source line (Review Focus 3)", () => { /* spells [glint, glint@2014]: derive lists two rows; detail cards "spell:glint" and "spell:glint@2014" show different provenanceLine */ });
it("a brought-in subclass of the character's class is accepted and keeps its mechanics (Review Focus 2)", () => { /* classes [{class:"warden", subclass:"lantern@2014"}]: no "belongs to" problem; the 2014 subclass feature appears; overlay entry of the 2014 subclass applies */ });
it("a brought-in feat or race keeps its overlay mechanics", () => {});
it("level-up and undo round-trip with a qualified class and feat", () => { /* applyLevel then undoLevel leaves the character equal; level-log keys contain "@" and parse */ });
it("two rows of one item in different editions equip, attune and remove independently", () => { /* inventory [{id:"tin-blade"},{id:"tin-blade@2014"}] */ });
it("a brought-in spell and the same spell of the character's edition both count as known and neither is offered again", () => {});
it("mainPins and uses keyed by a qualified id survive a round trip", () => {});
```

- [ ] **Step 2: Run** `npx vitest run tests/core/qualified-refs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** by fixing each comparison the grep finds; add no new lookup layer (the registry resolves qualifiers). Record the list of sites touched in the commit body.
- [ ] **Step 4: Run** this file, then the whole suite (`npm test`), typecheck, build — Expected: PASS.
- [ ] **Step 5: Commit** `feat: a character can hold a thing from the other edition, even beside its own version`

---

### Task 15: The "Bring in" button, edition chip and provenance card

**Depends on:** 14.

**Files:**
- Create: `src/ui/bring-in.ts`
- Modify: `src/ui/spells-ui.ts` (add-spell panel), `src/ui/additem-ui.ts`, `src/ui/companion-ui.ts`, `src/ui/levelup-ui.ts` (subclass, feat and spell pages), `src/ui/builder-ui.ts` (race, subrace, background, class pages), `src/ui/components.ts` (identity, spell and inventory rows), `src/ui/traits-ui.ts` (feats), `src/ui/details.ts` (every card gets `provenanceLine`), `styles.css`
- Test: `tests/ui/bring-in.test.ts`

**Interfaces:**
- Consumes: `Registry.listEdition`, `refFor`, `provenanceLine`.
- Produces: `bringInButton(from: Edition, click: () => void): HTMLElement` (`button.fe-btn.fe-bring-in`, text `Bring in from the ${from} books`, `data-act="bring-in"`, `type="button"`); `editionChip(ref: string, own: Edition): HTMLElement | null` (`span.fe-chip.fe-edition`, text the qualifier, null for a plain ref); each picker keeps a view flag `other: boolean` (not saved); when set, the list is `reg.listEdition(type, otherEdition(own))` with search first and a "Back to the 2024 list" style link; a pick stores `refFor(entry, own)`. The button is the last child of every picker list. Cards of every entry show `provenanceLine(entry)`; a brought-in row keeps the chip wherever it is shown.

- [ ] **Step 1: Write the failing tests** (`for (const layout of LAYOUTS)` for panels mounted on sheets; a builder DOM test for the builder pages)

```ts
it("every picker ends with the bring-in button for the other edition", () => { /* add spell, add item, add companion, level-up subclass/feat/spells, builder race/class: last child .fe-bring-in, text "Bring in from the 2014 books" on a 2024 sheet and "...2024 books" on a 2014 sheet */ });
it("nothing is brought in by itself: the own list never shows the other edition", () => { /* search "hush" on a 2024 sheet finds nothing until the button is pressed */ });
it("pressing it lists only the other edition, and picking stores a qualified id with a visible chip", () => { /* spells[last].id === "hush@2014"; row shows chip "2014"; its card names book and edition */ });
it("bringing in the same-id spell beside the own one gives two rows (Review Focus 3)", () => { /* glint then glint@2014 */ });
it("a campaign that switched the library off hides it from the bring-in list too (Review Focus 4)", () => { /* scoped({ "Test Press": false }) */ });
it("the button and chips are 44 px on touch and use .fe-sheet button.fe-bring-in", () => { /* css test */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/bring-in.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the shared helper first, then each picker; the builder's bring-in for race, class and background stores the qualified id in the draft and the built note.
- [ ] **Step 4: Run** this file, `tests/ui/pickers-*.test.ts`, `item-add-*`, `spells-*`, `companion-picker`, `leveling`, `builder`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: pickers end with a button that brings one thing in from the other edition`

---

### Task 16: A reference the edition lacks

**Depends on:** 15.

**Files:**
- Modify: `src/ui/components.ts` (identity parts), `src/ui/traits-ui.ts`, `src/ui/spells-ui.ts`, `src/ui/inventory-ui.ts`, `src/ui/companion-ui.ts` (every place `grep -rn "is-missing" src` finds), `src/core/actions.ts` (`{ type: "repoint"; field: ...; to: Edition }`), `src/ui/controller.ts`
- Test: `tests/ui/missing-edition.test.ts`

**Interfaces:**
- Produces: `missingLine(ctl: SheetController, type: string, id: string): HTMLElement | null`: for a missing reference that `Registry.otherEditionHas(type, id)` finds, the existing `is-missing` marker is followed by one line `This is in the 2014 books` and a `bringInButton`. Pressing it re-points that one reference to `id@2014` (our decision: the thing is known, so one tap fixes it; it opens no picker). When no edition has it, only the marker shows. The `repoint` action addresses a reference by `{ field: "race" | "subrace" | "background" } | { field: "class" | "subclass" | "feat" | "spell" | "item" | "companion"; index: number }`.

- [ ] **Step 1: Write the failing tests** (`for (const layout of LAYOUTS)`)

```ts
it("a hand-edited reference only the other books have shows the marker, the plain line and the button", () => { /* race "hush" style id missing from 2024 lens */ });
it("pressing the button re-points just that reference and the sheet resolves it", () => { expect(saved.spells[0].id).toBe("hush@2014"); });
it("an id no edition has shows the marker only and does not throw (Review Focus 1)", () => {});
it("a 2014 sheet whose note names a 2024-only thing says 'This is in the 2024 books'", () => {});
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/missing-edition.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** this file, `tests/obsidian/missing.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: a missing reference says which books have it and offers one tap to bring it in`

---

### Task 17: The edition chip and the what-changed panel (general part)

**Depends on:** 6, 7.

**Files:**
- Create: `src/content/edition-changes.ts`, `src/ui/edition-ui.ts`
- Modify: `src/ui/components.ts` (identity line gets the chip), `src/ui/details.ts` (`case "edition"`), `src/ui/controller.ts` (`Panel` gains `{ kind: "edition-changes" }`), `src/ui/panels.ts`, `src/ui/settings-ui.ts` (a row "Rules edition" with a button), `styles.css`
- Test: `tests/content/edition-changes.test.ts`, `tests/ui/edition-chip.test.ts`

**Interfaces:**
- Consumes: `EDITION_RULES`.
- Produces: `interface ChangeNote { id: string; title: string; 2014: string; 2024: string }` (two plain sentences at most per side, our own words). `generalChanges(rules: Record<Edition, EditionRules> = EDITION_RULES): ChangeNote[]` returns the static notes (ids `ability-source`, `origin-feat`, `weapon-mastery`, `subclass-level`) plus notes built from the table (ids `species-word`, `long-rest-hit-dice`, `multiclass-slots`, `exhaustion`, `inspiration`), so a changed table value changes its sentence. Panel title: `What would change under 2024` for a 2014 character, `What changed from 2014` for a 2024 one. Chip: `span.fe-chip.fe-edition-chip` in the identity line with `data-ref="edition:<id>"`; its card (hover, tap on touch) says in one sentence what the edition means and holds a `button.fe-btn.fe-edition-open` ("What changed") that opens the panel; the Settings card row has the same button.

- [ ] **Step 1: Write the failing tests**

```ts
it("covers the changes the design names", () => { expect(generalChanges().map(c => c.id)).toEqual(expect.arrayContaining(["ability-source", "origin-feat", "weapon-mastery", "subclass-level", "long-rest-hit-dice", "exhaustion", "inspiration", "multiclass-slots", "species-word"])); });
it("each side is at most two sentences, plain words, no digits-as-wording from books", () => { for (const c of generalChanges()) for (const s of [c["2014"], c["2024"]]) expect((s.match(/[.!?](\s|$)/g) ?? []).length).toBeLessThanOrEqual(2); });
it("table-built sentences follow the table", () => { const t = structuredClone(EDITION_RULES); t["2024"].longRestHitDice = "half"; expect(generalChanges(t).find(c => c.id === "long-rest-hit-dice")!["2024"]).not.toBe(generalChanges().find(c => c.id === "long-rest-hit-dice")!["2024"]); });
// UI, for (const layout of LAYOUTS)
it("the identity line shows the chip and its card opens the panel", () => { /* "2024 rules" / "2014 rules"; the card button opens the panel titled per edition */ });
it("the Settings card reaches the same panel and each feature id is still placed once", () => {});
it("the panel lists part one with 2014 and 2024 sentences and its buttons are 44 px", () => {});
```

- [ ] **Step 2: Run** the two files — Expected: FAIL.
- [ ] **Step 3: Implement.** The executor writes the static sentences in our own words from the facts in this plan and the design (ability scores come from the background in 2024; every background gives an origin feat; weapon masteries; subclass at level 3 for every class); no quotes.
- [ ] **Step 4: Run** the files, `settings-card`, `tablet`, `sheet`, `identity-hover`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: an edition chip and a plain-words panel of what differs between the editions`

---

### Task 18: The builder's edition step

**Depends on:** 5, 17.

**Files:**
- Modify: `src/ui/builder.ts` (`BuilderPage` gains `{ id: "edition" }` first in `pages()`, `ready`), `src/ui/builder-ui.ts` (`editionPage`), `styles.css`
- Test: `tests/ui/builder-edition.test.ts`; update the builder tests that assume page 0 is `race`

**Interfaces:**
- Consumes: `generalChanges`, `BuilderController.setEdition/edition/defaultEdition`.
- Produces: page `edition`, heading "Which rules does your table use?", two `choiceButton`s (`data-edition="2014"|"2024"`, text "2014 rules" / "2024 rules") with the default pre-highlighted, and a "What is the difference?" toggle (`ctl.view.about === "edition"`) that shows the general part inline (the builder has no sheet, so it never opens the panel). The page is `ready` once an edition is on. Later pages use the lens; an empty class, race or background list shows `emptyReason`.

- [ ] **Step 1: Write the failing tests**

```ts
it("the first page asks for the rules and starts on the default", () => { expect(c.pages()[0]).toEqual({ id: "edition" }); expect(q('[data-edition="2024"]').getAttribute("aria-pressed")).toBe("true"); /* campaign edition 2024 */ });
it("What is the difference? shows the general changes inline", () => {});
it("choosing the other edition empties the picks and the next page lists that edition's races (Review Focus 1)", () => {});
it("with no 2024 library the class page says nothing was found and points at docs/IMPORTING.md", () => {});
it("the finished note carries edition and the Race / Species word follows", () => {});
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/builder-edition.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Existing builder tests that index pages or compare frontmatter are updated in this commit.
- [ ] **Step 4: Run** this file, `tests/ui/builder.test.ts`, `tests/core/builder*.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: the builder asks which rules the table uses before anything else`

---

### Task 19: The what-changed panel, part two: this character

**Depends on:** 17, 14, 3.

**Files:**
- Create: `src/core/edition-compare.ts`
- Modify: `src/core/level-diff.ts` (`explainChange(before, after, ctx, afterCtx = ctx)`), `src/ui/edition-ui.ts` (part two, "Show all levels", "Read both"), `src/ui/panels.ts`, `src/ui/controller.ts` (panel state)
- Test: `tests/core/edition-compare.test.ts`, `tests/ui/edition-compare-ui.test.ts`

**Interfaces:**
- Consumes: `Entry.replaces`, `Registry.listEdition`, `Registry.hydrate`, `explainChange`, `ChangeGroup`.
- Produces:
```ts
export function counterpartOf(reg: Registry, type: string, entry: Entry, to: Edition): Entry | undefined;   // a note of edition `to` whose replaces includes entry.id, else the one with the same id
export function swapEdition(c: Character, reg: Registry): { value: Character; unmatched: { type: string; ref: string }[] };   // the character as the other edition with counterparts' ids and edition flipped
export function compareCharacter(c: Character, reg: Registry, opts?: { allLevels?: boolean }): { groups: ChangeGroup[]; missingLibrary?: Edition };
```
  `reg` is the unlensed base registry. Class features, hit die, saves, proficiencies, ability bonuses and resource counts come from `explainChange(c, swapped.value, ctxOwn, ctxOther)` with the two lenses; per spell and equipped weapon pair, level, casting time, range, duration and dice differ line by line (only paired notes are hydrated). Unmatched things say `The ${to} books have no version of this ${noun}; your table can keep using the ${from} one`. If `reg.listEdition("class", to)` is empty, `missingLibrary` is set and the panel says the books are not in the compendium yet and names `docs/IMPORTING.md`. "Read both" opens the two notes' text side by side through `registry.bodyOf` and `host.renderMarkdown`. `allLevels` compares every class to level 20.

- [ ] **Step 1: Write the failing tests** (invented 2014 `lantern-keeper` and 2024 `beacon-warden` with `replaces: ["lantern-keeper"]`, plus same-id pairs)

```ts
it("pairs by replaces first and by id second", () => { expect(counterpartOf(r, "class", lantern, "2024")!.id).toBe("beacon-warden"); expect(counterpartOf(r, "spell", hush, "2024")).toBeUndefined(); });
it("says what differs in plain sentences", () => { /* hit die d8 -> d10, a feature moved from level 3 to level 2, a resource 2 -> 3 */ });
it("a thing with no counterpart says so in the spec's words", () => { expect(line).toBe("The 2024 books have no version of this subclass; your table can keep using the 2014 one"); });
it("reads only the notes it pairs (Review Focus 5)", () => { expect(vault.reads.length).toBeLessThanOrEqual(pairedCount); });
it("with no other library it says so and points at docs/IMPORTING.md", () => {});
it("a class with an empty level table or no hit die does not throw", () => {});
it("brought-in rows are paired by their own entry", () => {});
// UI, for (const layout of LAYOUTS)
it("part two sits under part one; Show all levels and Read both work; targets are 44 px", () => {});
```

- [ ] **Step 2: Run** the two files — Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `explainChange`'s old two-context behaviour identical when `afterCtx` is absent (`tests/core/level-diff.test.ts` stays green).
- [ ] **Step 4: Run** the files, `level-diff`, `why-ui`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: the panel compares this character's picks with their counterparts in the other edition`

---

### Task 20: Compendium browser edition filter and "Add to character"

**Depends on:** 14.

**Files:**
- Modify: `src/ui/compendium.ts` (`CompendiumController.edition: "all" | Edition`, `setEdition`, `bySource`, chip per row, `CompendiumHost.targetEdition(): Edition | undefined`), `src/obsidian/compendium-view.ts`, `src/main.ts` (target edition, add with `refFor`), `styles.css`
- Test: `tests/ui/compendium-edition.test.ts`

**Interfaces:**
- Produces: an All / 2014 / 2024 filter row (`button[data-edition]`, 44 px on touch) over `listAll()`; a row chip from `entry.edition` where there is one; type-tab counts follow the filter. Adding an entry whose edition differs from the target sheet's adds `refFor(entry, targetEdition)` and the status says it came from the other edition.

- [ ] **Step 1: Write the failing tests**

```ts
it("shows everything by default and filters by edition", () => { expect(ctl.matches().length).toBe(all); ctl.setEdition("2024"); expect(ctl.matches().every(e => e.edition === "2024")).toBe(true); });
it("each row with an edition has a chip and homebrew has none", () => {});
it("counts follow the filter", () => {});
it("adding a 2014 spell to a 2024 sheet stores a qualified id and says so", () => { /* host.add -> "hush@2014" */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/compendium-edition.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** this file, `tests/ui/compendium.test.ts`, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat: the compendium browser filters and labels entries by edition`

---

### Task 21: Render check with Obsidian's real CSS

**Depends on:** 15, 16, 17, 18, 19, 20.

**Files:** none in git. Work in `work/gallery` (symlink to `/docker/rpg-sheet-work`, outside git).

- [ ] **Step 1: Repoint the harness.** In `work/gallery/build.sh` set `REPO=/docker/rpg-sheet` and `G=/docker/rpg-sheet/work/gallery`; fix the same old-checkout paths in `capture.cjs`, `gen-index.cjs`, `capture-p3.sh` (`grep -rn "homelab-config\|\.claude/jobs" work/gallery --include=*.cjs --include=*.sh`). Run `cd work/gallery && npm i playwright`.
- [ ] **Step 2: Add flows** to `work/gallery/src` for: the builder edition step (default and "What is the difference?" open), the identity chip with its card, a picker with the bring-in button and the other edition's list, a brought-in row with its chip and card, a missing reference with its line, and the panel (parts one and two). Use only invented characters and the invented library of `tests/fixtures/editions.ts` (serialize it; no real notes, no `/docker/dnd-compendium` content).
- [ ] **Step 3: Capture** each flow on desktop, tablet and mobile with `build.sh <layout> <flow>`.
- [ ] **Step 4: Look at every shot** for a button covering the next row, buttons sliding sideways, a chip wrapping badly, a 44 px target under size, text clipped on the phone; fix in `styles.css` (test first where a css test can express it), rebuild, recapture.
- [ ] **Step 5: Publish** with `/docker/homelab-config/scripts/scratch-publish.sh <dir> dnd-sheet/edition-2024-gallery` (the dir holds the shots and an `index.html`; the destination is its own path because publishing rsyncs with `--delete`). Check `curl -sI https://scratch.rt-541.io/dnd-sheet/edition-2024-gallery/ | head -1` shows 200 and report the URL as the deliverable. Commit only the `styles.css` fixes: `fix: <what the render check found>`.

---

### Task 22: Plugin docs

**Depends on:** 18, 19 (and 21 for the final wording).

**Files:**
- Create: `docs/USING.md`, `tests/docs.test.ts`
- Modify: `README.md`, `manifest.json` (`description`), `docs/STATE.md`

**Interfaces:**
- Produces: `docs/USING.md` with headings, in order: `Install`, `Create a character`, `Pick an edition`, `Bring something in from the other edition`, `Read the what-changed panel`, `Common questions`. Text is for players who are not rules-savvy, uses invented examples only and no book text. `manifest.json` description names both editions. `docs/STATE.md` records what shipped, the deploy order (edition-aware build before the 2024 folder is synced), the unmerged branch, and the one owner question still open (existing characters).

- [ ] **Step 1: Write the failing test**

```ts
it("USING.md has the six sections in order and no emoji", () => { /* headings array equals the list; no /\p{Extended_Pictographic}/u */ });
it("the manifest and README say both editions", () => { expect(manifest.description).toMatch(/2014/); expect(manifest.description).toMatch(/2024/); expect(readme).toMatch(/2024/); });
```

- [ ] **Step 2: Run** `npx vitest run tests/docs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write** the four files; "Common questions" covers: why a 2024 character does not see an old spell (use the button), what the chip means, why the edition cannot be changed afterwards, what to do when no 2024 classes show (see `docs/IMPORTING.md`), what "Heroic Inspiration" and "Species" are, why mastery is shown but not applied.
- [ ] **Step 4: Run** this file, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `docs: a guide for players and the readme, manifest and state brought up to date for both editions`

---

### Task 23: `docs/IMPORTING.md`

**Depends on:** the importer plan `docs/superpowers/plans/2026-11-10-edition-2024-importer.md` fully executed (its commands, config file names and the Needs Review page names are copied from that result, not guessed). Also 22 for the shared test file.

**Files:**
- Create: `docs/IMPORTING.md`
- Modify: `tests/docs.test.ts`

**Interfaces:**
- Produces: `docs/IMPORTING.md` for someone who has the books but not this homelab, with headings in order: `What you need`, `Import a book`, `Import the 2014 and 2024 data`, `Refresh`, `Work through the Needs Review list`, `Sync the vault`, `Check it worked`. It names `compendium/5e/WotC` and `compendium/5e/WotC 2024`, the `.dnd-compendium-generated` marker and the `edition` stamp, and says imported content stays private in the vault.

- [ ] **Step 1: Write the failing test** (extend `tests/docs.test.ts`: the seven headings in order, the two folder names, the marker name, no emoji, no line longer than 200 characters of pasted-looking prose).
- [ ] **Step 2: Run** `npx vitest run tests/docs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write** the guide from the executed importer plan.
- [ ] **Step 4: Run** this file, then the three commands — Expected: PASS.
- [ ] **Step 5: Commit** `docs: how to import books and both editions' data into the vault`

---

## Task order and parallelism

| # | Task | Depends on |
|---|---|---|
| 1 | Pin today's behaviour | none |
| 2 | Edition vocabulary and entry stamps | 1 |
| 3 | Registry lens | 2 |
| 4 | Character edition, campaign key, setting | 2 |
| 5 | Wire the lens into sheet and builder | 3, 4 |
| 6 | Edition table and callers | 4 |
| 7 | Words that follow the edition | 5, 6 |
| 8 | Overlay by edition | 2 |
| 9 | Audit overlay and conditions | 3, 8 |
| 10 | Background ability picks | 5 |
| 11 | Feat categories and the feat op | 5 |
| 12 | Weapon mastery data and picks | 5 |
| 13 | Mastery on the row and in Edit mode | 12 |
| 14 | Qualified references | 3, 5 |
| 15 | Bring-in button, chip, provenance | 14 |
| 16 | Missing reference line | 15 |
| 17 | Edition chip and panel part one | 6, 7 |
| 18 | Builder edition step | 5, 17 |
| 19 | Panel part two | 3, 14, 17 |
| 20 | Compendium filter | 14 |
| 21 | Render check | 15 to 20 |
| 22 | Plugin docs | 18, 19 |
| 23 | IMPORTING.md | importer plan, 22 |

After Task 5, tasks 6, 8, 10, 11, 12 and 14 are independent of each other and can go to different people; 9 follows 8; 13 follows 12; 15 to 16 follow 14; 17 to 19 follow 6 and 7.

Independent here means no task needs another's result. Several of them edit the same files (`src/core/levelup.ts`, `src/content/types/ops.ts`, `src/content/registry.ts`), so tasks worked at the same time each get their own git worktree and are merged one at a time with the full suite run after each merge; in one checkout they run in number order.

Fixtures name nothing from the books: every spell, item, feat, class and mastery property in a test is invented (`glint`, `tin-blade`, `keen`, `warden`, `snag`).
