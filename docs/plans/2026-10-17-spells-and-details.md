# Spells tab, item-granted spells, and detail cards: implementation plan

> For agentic workers: implement task by task, test first (write the listed tests, see them fail, implement, see them pass), commit per task. Read the existing code before changing it; this plan names the interfaces, the existing code decides the style.

**Goal:** a Spells tab on desktop and mobile listing the character's own spells and the spells granted by working (equipped, attuned-if-required) items, with casting that spends slots, charges or daily uses; plus a detail card (hover on desktop, tap on mobile) for items, spells, conditions, companion traits and effect sources.

**Approved design:** chat of 2026-10-17 (user said yes). Parent spec: `docs/superpowers/specs/2026-10-17-obsidian-5e-sheet-design.md` in rt-541/homelab-config, sections 4 and 8.

**Branch:** `feat/spells-details` (already created; it contains the two fixes from `fix/auto-open-restored-tabs`). Push after each task. Never push to main.

## Global constraints (unchanged from milestone 1)

- `src/core`, `src/content`, `src/rules` never import `obsidian`; no Node APIs under `src/`; no `innerHTML`/`outerHTML`/`insertAdjacentHTML` in `src/ui` or `src/obsidian` (tests/guards.test.ts enforces this). Build all DOM with `h()`.
- Notes store choices and counters only; derived numbers are never written. Unknown keys on entries are preserved (see the review fix in `src/core/character.ts`).
- Desktop and mobile layouts must place every feature exactly once; the parity test must keep passing and must cover the new features.
- Bundled content is SRD 5.1 only. Spell data comes from 5e-bits/5e-database (MIT) `src/2014/en/5e-SRD-Spells.json`, SRD text CC-BY 4.0 (README already attributes it).
- Commit messages: conventional prefix, one sentence on why, last line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review focus (inputs most likely to bite at the table)

1. A granted spell from an item that is equipped but not attuned (attunement required) must not be castable or listed; unattuning removes it immediately.
2. Casting with no slot of the chosen level, or with fewer charges than the cost, is refused with a notice and changes nothing.
3. Homebrew spell or item notes with junk (`level: "x"`, `grants: {spells: "fireball"}`, unknown spell id in grants) become compendium problems or "missing from compendium" rows, never a crash.
4. Hover cards must never render note text as HTML, must close on mouseleave/scroll, and must not appear on touch devices (tap opens the details panel instead).
5. Concentration: casting a second concentration spell replaces the first and says so; the chip can be cleared; it persists in the note.

---

### Task 1: `spell` content type and the SRD spell list

**Files:** create `src/content/types/spell.ts`, `scripts/build-srd-spells.mjs`, `src/content/srd/spells.json` (generated, committed); modify `src/content/types/index.ts`, `src/content/srd/index.ts`; tests `tests/content/spells.test.ts`.

```ts
export interface SpellData {
  name: string; level: number;              // 0 = cantrip .. 9
  school: string; castingTime: string; range: string; components: string[]; material?: string;
  duration: string; concentration: boolean; ritual: boolean; classes: string[];
  attack?: "melee" | "ranged";
  save?: { abil: Abil; onSuccess: "half" | "none" };
  damage?: { type: string; bySlot?: Record<string, string>; byCharLevel?: Record<string, string> };
  heal?: { bySlot: Record<string, string> };   // dice may contain the token MOD (spellcasting modifier)
  higherLevel?: string; rules?: string;
}
```

- Validator rules: `level` integer 0-9; `components` subset of V/S/M; `save.abil` an ability; every dice string must pass `parseDice` after replacing `MOD` with `0` and removing spaces around `+`; errors use the `field: message` style of the other validators. The note body becomes `rules` (registry already does this).
- `scripts/build-srd-spells.mjs` (Node script, not bundled): reads a path argument to the downloaded JSON and writes `src/content/srd/spells.json` in SpellData shape: `desc` paragraphs joined with blank lines -> `rules`; `higher_level` joined -> `higherLevel`; `dc.dc_type.index` + `dc.dc_success` -> `save`; `attack_type` -> `attack`; `damage.damage_type.index` + `damage_at_slot_level` / `damage_at_character_level` -> `damage`; `heal_at_slot_level` -> `heal.bySlot`; `classes[].index` -> `classes`; `school.name` -> `school`. Normalise dice like `"1d8 + MOD"` to `"1d8+MOD"`. Drop a damage/heal entry (keep the text) if any of its dice fail to parse, and print a count of dropped entries. Usage note at the top of the script: `gh api -H "Accept: application/vnd.github.raw" repos/5e-bits/5e-database/contents/src/2014/en/5e-SRD-Spells.json > /tmp/spells.json && node scripts/build-srd-spells.mjs /tmp/spells.json`.
- `loadSrd` loads spells too; `srdCounts()` gains `spell`.

Tests (minimum): all bundled spells validate (`loadSrd` returns no problems) and there are 319; `burning-hands` is level 1, Dex save half, `damage.bySlot["1"] === "3d6"` and `["3"] === "5d6"`; `fire-bolt` is a ranged attack with `byCharLevel["5"] === "2d10"`; `cure-wounds` heal `bySlot["1"] === "1d8+MOD"`; `bless` has concentration true; a homebrew `type: 5e-spell` note with `level: "x"` gives problem `level: must be a whole number from 0 to 9`; one with damage `"lots"` gives `damage.bySlot.1: bad dice: lots`.

### Task 2: items grant spells; character concentration and daily uses

**Files:** modify `src/content/types/item.ts`, `src/core/character.ts`; tests `tests/content/grants.test.ts`, `tests/core/character-spells.test.ts`.

- Item frontmatter: `grants: { spells: [{ id: string, charges?: number, perDay?: number, atWill?: boolean, level?: number, dc?: number, attack?: number }] }`. Exactly one of `charges`, `perDay`, `atWill` per entry (default `atWill: true` if none). `charges` is the cost per cast and requires the item to have `charges`. Validation errors: `grants.spells: must be a list`, `grants.spells[i].id: must be text`, `grants.spells[i]: charges needs the item to have charges`.
- `ItemData.grants?: { spells: GrantedSpell[] }` with `GrantedSpell = { id: string; cost: { kind: "charges"; amount: number } | { kind: "perDay"; uses: number } | { kind: "atWill" }; level?: number; dc?: number; attack?: number }`.
- Character gains `concentration?: string` (spell id) and inventory entries gain `spellUses?: Record<string, number>` (used count per granted spell id for perDay). Both parsed with the Reader (wrong types are errors, read-only), written back by `writeInto`, absent by default (no new keys written for untouched notes).

Tests: grants validate and normalise as above; a string `grants.spells` is a problem; parse/write round-trip of `concentration` and `spellUses`; `concentration: 5` is an error.

### Task 3: spell list derivation and casting

**Files:** create `src/core/spells.ts`; modify `src/core/actions.ts`, `src/rules/rests.ts`; tests `tests/core/spells.test.ts`.

```ts
export interface SpellRow {
  id: string; name: string; level: number; known: boolean;     // false only for missing ids
  source: { kind: "own"; prepared: boolean } | { kind: "item"; itemIndex: number; itemName: string; cost: GrantedSpell["cost"]; usesLeft?: number; chargesLeft?: number };
  castLevel: number;                       // item level override or spell level
  attack?: number; dc?: number;            // item overrides, else character spellcasting
  damage?: string; heal?: string;          // dice at castLevel (cantrips: by character level), MOD replaced
  concentration: boolean; data?: SpellData;
}
export function spellRows(c: Character, stats: ActorStats, ctx: EffectContext): { own: SpellRow[]; fromItems: SpellRow[] };
export function diceAt(table: Record<string, string> | undefined, level: number): string | undefined;   // highest key <= level
```

- `fromItems` lists grants of items for which `itemWorks` is true (equipped, attuned if required), in inventory order. Unknown spell ids produce a row with `known: false` and the id as name.
- New action `{ type: "cast"; spell: string; level?: number; item?: number }` in `apply`:
  - own spell, level >= 1: spends one slot of `level ?? spell level` (must be >= spell level and have a free slot, else error `No level N slots left` / `Can't cast below the spell's level`). Cantrips cost nothing.
  - item spell: charges cost spends the item's charges (`Not enough charges`); perDay increments `spellUses[id]` (`No uses left today`); atWill costs nothing.
  - if the spell has concentration: sets `concentration` and returns a `note` string `Concentration on X ends` when it replaced another. Extend the `apply` result type with optional `note`.
- New action `{ type: "endConcentration" }`.
- Rests: long rest and Good Rest clear `spellUses` on items whose grant resets at dawn when holy-days is off (perDay always resets on a long rest); both clear nothing about concentration (a rest does not end it by rule, but damage prompts are out of scope).

Tests: own cast spends a slot at the right level; upcast to 3 spends a level-3 slot and damage uses `bySlot["3"]`; fire bolt damage at character level 5 is `2d10`; cure wounds heal shows `1d8+3` for WIS 17; item spell not listed when unattuned and listed after attune; charges spent and refused when short; perDay refused after uses run out and restored by a long rest; concentration replaced with note; unknown spell id row has `known: false`.

### Task 4: Spells tab, cast panel, add-spell panel

**Files:** modify `src/ui/layouts.ts`, `src/ui/components.ts`, `src/ui/panels.ts`, `src/ui/controller.ts`, `styles.css`; tests extend `tests/ui/sheet.test.ts` (or a new `tests/ui/spells.test.ts`).

- New features: `spells` (the list) and `concentration` (chip next to conditions, with clear button). Desktop: new tab `Spells` after Main; mobile: tab `Spells` between Checks and Gear. `concentration` goes beside `conditions` in both layouts' pinned/main areas. Update `CHARACTER_FEATURES` and the parity test.
- Spells tab content: header with spell DC / attack / ability; slots summary; "Your spells" grouped by level (Cantrips, Level 1..9) with prepared toggle (levels >= 1), name (detail ref `spell:<id>`), roll buttons for attack/damage/heal and a DC label, and Cast; "From items" grouped by item with cost label (`3 charges`, `1/day (0 used)`, `at will`) and Cast. Edit mode: "Add spell" opens a searchable panel of the spell compendium (search by name, filter by the character's classes by default with a "show all" switch); remove buttons on own spells.
- Cast panel for leveled own spells: choose slot level (only levels with free slots >= spell level), Apply. Item and cantrip casts happen immediately. After a cast the toast shows `Cast <name> (level N, slot spent)` and the concentration note if any.

Tests: both layouts include `spells` and `concentration`; casting Burning Hands from the panel at level 2 spends a level-2 slot; attuning a homebrew item with `grants: { spells: [{ id: burning-hands, charges: 1 }] }` makes it appear under From items and casting it spends one charge; unattuning removes it.

### Task 5: detail cards (hover on desktop, tap on mobile) and the CSS test

**Files:** create `src/ui/details.ts`; modify `src/ui/components.ts`, `src/ui/panels.ts`, `src/ui/sheet.ts`, `src/ui/controller.ts`, `styles.css`; tests `tests/ui/details.test.ts`, `tests/ui/css.test.ts`.

- `detailCard(ref: string, ctl): HTMLElement | null` where `ref` is `item:<id>`, `spell:<id>`, `condition:<id>`, `trait:<creature>:<index>` or `effect:<source name>`. Content: title, subtitle (rarity/level/school), a mechanical summary (items: armor AC, weapon damage with bonus and extra damage, `describeEffects`, charges, granted spells with cost; spells: casting time, range, components, duration, concentration/ritual, attack or save, damage/heal at base level; conditions: `describeEffects` or the active level's effects), then the rules text as plain text (`white-space: pre-line`), then `Source note: <path>` for homebrew.
- Every name element that has a card gets `data-ref`. `mountSheet` installs delegated listeners on the root: on desktop (not `fe-mobile`) `mouseover` on a `[data-ref]` shows a fixed-position popover after 250 ms next to the element (kept inside the viewport), `mouseout`/`scroll`/re-render hides it; on mobile, `click` on a `[data-ref]` opens a `details` panel (new `Panel` kind) with the same card. On desktop a click on the name also opens the panel (useful for long text).
- `tests/ui/css.test.ts`: load `styles.css` into the jsdom document and assert that `getComputedStyle` of a `.fe-sheet .fe-pane[hidden]` element is `display: none`; if jsdom cannot compute it, fall back to asserting the rule `.fe-sheet [hidden] { display: none !important; }` is present. Also assert no hard-coded hex colors in styles.css.

Tests: hovering an item name (desktop) shows a popover containing its rules text and `+1 AC`; it disappears on mouseout; a homebrew item named `<b>x</b>` shows the literal text and no `<b>` element; on mobile, tapping the name opens the `details` panel; spell card for Burning Hands shows `Dex save` and `3d6 fire`.

### Task 6: docs and deploy

- Update `docs/manual-test.md` with spells and detail-card checks, and `examples/Compendium/Items/Emberheart Warhammer.md` to grant `burning-hands` for 1 charge. Run `npm test && npm run typecheck && npm run build`; push. Do not deploy (the coordinator does that).
