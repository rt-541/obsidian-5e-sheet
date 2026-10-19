# P3: Attack Options and "I Roll My Own Dice" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Features that change an attack (an extra to-hit die, extra damage dice on a hit, a reroll that keeps the higher damage) become switches in an "Attack options" card that spend and switch themselves off automatically, and a per-character "I roll my own dice" setting turns every roll button into plain instructions while the sheet still keeps the books.

**Architecture:** A new validated `attackOption:` field (sibling of `toggle:`) on feature ops, option defs, items and built-in overlay entries is collected by `progress()` and `deriveCharacter()` into `ActorStats.attackOptions`, together with one default-on switch per `extraDamage` source. Two new actions (`attackOption`, `attackOptionsUsed`) store the switches in two optional character fields and do the spending. `SheetController.roll()` adds to-hit options to every own attack roll. New `attackDamage()` adds on-hit options to attack-row damage. The hit window is a 3-second controller state. Own-dice mode is a branch in the same controller methods. It records instruction entries (pure word builders in `src/core/own-dice.ts`) and asks for a required total, through one `ownRoll` box, before applying anything that changes the sheet.

**Tech Stack:** TypeScript, Obsidian plugin API, plain DOM via `h()`, Vitest + jsdom (`npm test`, `npm run typecheck`, `npm run build`).

**Spec:** `docs/superpowers/specs/2026-10-19-play-surface-design.md`, sections 3 and 4, plus "Answered by the user" items 1 and 2 and the "Attack options can be declared in notes too" call.

## Global Constraints

- Plain DOM via `h()` (`src/ui/h.ts`), never `innerHTML`. Mount roots use `classList`, never `className`.
- Parity on desktop (hover), tablet and phone (tap). Touch targets are at least 44px. Layout parity tests place each feature id exactly once per layout (`placed()` in `src/ui/layouts.ts`).
- Plugin button rules need `.fe-sheet button.x` specificity to beat Obsidian's `button:not(.clickable-icon)`.
- Every text input gets an explicit `type` (`type="number"` for totals).
- Fixtures are INVENTED ("Test Focus", "Focus Dice", "Test Ember"). Never use book or SRD prose or published stat blocks, because the code is mirrored to a public repo. `mechanics.json` holds numbers and switches only, no rules text.
- Use plain words for players who are not rules-savvy. No YAML, effect keywords, formulas or ids may show up in player-facing text.
- Nothing in code may name a specific race, class, feat or item. The one exception is overlay data in `src/content/overlay/mechanics.json`, which is keyed data, not code.
- Existing notes without the new fields behave exactly as today. In particular, `extraDamage` switches start ON, and no key is written to a note that never touched them.
- Never write to class, race, feat, item or library notes. Only the character note changes.
- No resource may be spent silently. Every spend appears in that roll's detail, and every automatic switch-off is said in words.
- Commits are conventional (`feat:`, `fix:`, `test:` ...) and the last line is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All existing tests keep passing (about 1500). Run `npm test && npm run typecheck` before every commit and `npm run build` before the last one.
- Execution order is P1 ui-review-fixes, then P2 layout, then **P3 (this plan)**, then P4 customize, then P5 items. Each plan is merged to main before the next one starts. Do not re-do P1 or P2 work.
- The half-built `perAttack` toggle work (outside the repo) is superseded. Do not add `perAttack` to `ToggleDef`.

## Review Focus

1. **Several options draw on one resource that has fewer dice left than options.** Expected: options apply in card order while dice remain, the rest are skipped, and every option on that resource switches off with one "No Focus Dice left" message. No resource ever goes negative. *(Test: Task 6, "two to-hit options share the last die".)*
2. **A once-per-turn on-hit option and a missed attack (the hit window expires).** Expected: the option stays on and nothing is spent, because only a hit uses it up. *(Test: Task 6, "a miss leaves once-per-turn options on".)*
3. **The note changes while a hit window is open** (Obsidian Sync reload, the weapon is unequipped, so the attack index is gone or points at another row). Expected: the window closes and pressing a stale button does nothing. No throw and no spend on the wrong weapon. *(Test: Task 6, "reload closes the hit window".)*
4. **The typed total is blank, has a decimal or sign, or falls outside the die's range** ("", "7.5", "abc", "9" on a d8). Expected: a plain-words message in the box, nothing applied, and the box stays open. *(Test: Task 10, "bad totals are refused in words".)*
5. **An option needs a resource the character does not have** (the feat was added without its resource, or a homebrew typo). Expected: the row says "needs Focus Dice, which this character doesn't have", its switch cannot turn on, and rolls ignore it. *(Test: Task 2, "missing resource"; Task 4, "cannot switch on".)*

---

## Interfaces relied on from earlier plans

P1 and P2 plan files did not exist when this plan was written. The names below are **assumptions**. Before starting, check the merged code and adjust only selectors and names, not behaviour.

- **P1 (ui-review-fixes):** on MOBILE the Combat column order begins `hp-controls, attacks, resources` (spec section 7, item 2), with nothing between `attacks` and `resources`. Resources read "N of M left". If P1 left other features between `attacks` and `resources` on MOBILE, Task 7 moves `attack-options` and `resources` up so the order is `attacks, attack-options, resources`.
- **P2 (layout):**
  - There is a Settings card feature with id `settings`, rendered by `settingsFeature(ctl: SheetController): HTMLElement` (assumed in `src/ui/settings-ui.ts`), with one row per setting marked `data-setting="<id>"`. If P2 already rendered an "I roll my own dice" row wired to `ctl.setRule("own-dice", on)`, Task 9 only adds its tests.
  - The one-line attack row keeps class `.fe-attack` inside `[data-feature="attacks"]` and has a to-hit button, a damage button and a small crit button. Task 7 adds `data-act="to-hit" | "damage" | "crit"` to them if P2 did not.
  - Versatile grip: an `AttackStat` field marking two-handed use (assumed `grip?: "one" | "two"`). Own-dice damage words add "(two hands)" when it is `"two"`. If P2 named it differently, use P2's name.
  - The roll-mode slider still sets `ctl.mode` through `ctl.setMode(m)`, and `roll()` still snaps it back to `"normal"`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/content/types/attack-option.ts` (new) | `AttackOptionDef` and `validateAttackOption`: the `attackOption:` field. |
| `src/content/types/ops.ts`, `src/content/types/item.ts`, `src/content/types/index.ts`, `src/content/overlay/index.ts`, `src/content/library.ts` | Carry the new field (feature op, option def, item, overlay entry, library item frontmatter). |
| `src/content/overlay/mechanics.json` | Default definition `feat::savage-attacker`. |
| `src/core/progression.ts` | `Progress.attackOptions: DeclaredAttackOption[]`. The overlay fills in the field when the note leaves it empty. |
| `src/core/character.ts` | Optional `optionsOn?` and `optionsOff?` string lists on `Character`. |
| `src/core/attack-options.ts` (new) | `AttackOptionRow`, `attackOptionRows()`, `resourceByName()`, `toHitOptions()`, `onHitOptions()`, `affordable()`, `spendWords()`. |
| `src/core/attack-rows.ts` | `AttackInputs.extraOff`: skip extra damage from switched-off sources. |
| `src/core/derive.ts` | `ActorStats.attackOptions`. |
| `src/core/actions.ts` | Actions `attackOption` and `attackOptionsUsed`. |
| `src/core/dice.ts` | `rollKeepHigher()`. |
| `src/core/own-dice.ts` (new) | `OWN_DICE`, `ownDiceOn()`, `spaced()`, `d20Words()`, `damageWords()`, `saveWords()`. |
| `src/core/types.ts` | `RollResult.own?`. |
| `src/rules/module.ts` | `spendHitDie(..., total?)`. |
| `src/ui/controller.ts` | Options in `roll()`, plus `attackRoll`, `attackDamage`, the hit window, `setAttackOption`, `ownDice`, `ownRoll`, `askTotal`/`submitTotal`/`rollItForMe`, `answerHit`, `logOwnTotal`, `rollDeathSave`. |
| `src/ui/attack-options-ui.ts` (new) | `attackOptionsFeature()` card and `optionWords()`. |
| `src/ui/own-dice-ui.ts` (new) | `ownRollBox()`: instruction, optional or required total, Hit/Miss/Crit, Roll it for me. |
| `src/ui/components.ts`, `src/ui/layouts.ts`, `src/ui/sheet.ts`, `src/ui/combos-ui.ts`, `src/ui/spells-ui.ts`, `src/ui/panels.ts`, `src/ui/settings-ui.ts` (P2) | Wiring. |
| `styles.css` | Option switch, hit-window button and own-roll box, with 44px targets on touch. |
| `tests/fixtures/attack-options.ts` (new) | Invented registry, character and a mounted sheet helper shared by Tasks 2-11. |

---

### Task 1: The `attackOption:` field

**Files:**
- Create: `src/content/types/attack-option.ts`
- Modify: `src/content/types/index.ts`, `src/content/types/ops.ts` (`OptionDef`, feature `Op`, `validateOptions`, `validateOp` case `"feature"`), `src/content/types/item.ts` (`ItemData`, validator near the `raw.toggle` line, overlay fill), `src/content/overlay/index.ts` (`OverlayEntry`, `build()`), `src/content/library.ts` (`libraryMeta` item case, carried keys)
- Test: `tests/content/attack-option.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AttackOptionDef {
    id: string;
    /** Dice added to every matching attack roll while on; spends on the roll. */ toHit?: string;
    /** Dice added to damage when the attack hits; may hold {scale} placeholders. */ onHit?: string;
    /** On-hit dice by level of the owner (class level for class features, total level otherwise); exclusive with onHit. */ scale?: Record<number, string>;
    /** Weapon damage dice rolled twice, higher total kept. */ reroll?: boolean;
    /** Each use spends 1 of this resource; the switch turns off when none is left. */ resource?: string;
    /** Applies to the next qualifying roll, then switches itself off. */ oncePerTurn?: boolean;
    /** Roll tag it applies to; default "attack". */ on?: string;
  }
  export function validateAttackOption(v: unknown, at: string, name: string, e: Errs): AttackOptionDef | undefined;
  ```
  - `OptionDef.attackOption?`, feature op `attackOption?`, `ItemData.attackOption?` and `OverlayEntry.attackOption?` all have type `AttackOptionDef`.
  - `AttackOptionDef` is re-exported from `src/content/types/index.ts`.

- [ ] **Step 1: Write the failing tests** in `tests/content/attack-option.test.ts`:
  ```ts
  const e: string[] = [];
  expect(validateAttackOption({ toHit: "1d4", resource: "Focus Dice" }, "attackOption", "Test Focus", e))
    .toEqual({ id: "test-focus", toHit: "1d4", resource: "Focus Dice" });
  expect(validateAttackOption({ scale: { 1: "1d4", 5: "2d4" }, oncePerTurn: true }, "a", "X", [])).toEqual({ id: "x", scale: { 1: "1d4", 5: "2d4" }, oncePerTurn: true });
  expect(validateAttackOption({ onHit: "{test-scale}" }, "a", "X", [])).toEqual({ id: "x", onHit: "{test-scale}" });
  // each bad field is named in plain words
  const bad = (v: unknown) => { const x: string[] = []; validateAttackOption(v, "attackOption", "X", x); return x.join(" | "); };
  expect(bad({})).toContain("attackOption: needs toHit, onHit, scale or reroll");
  expect(bad({ toHit: "a lot" })).toContain("attackOption.toHit: must be dice like 1d4");
  expect(bad({ onHit: "1d4", scale: { 1: "1d4" } })).toContain("attackOption: use onHit or scale, not both");
  expect(bad({ scale: { 0: "1d4" } })).toContain("attackOption.scale: must map levels 1 to 20 to dice like 2d4");
  expect(bad({ reroll: "yes" })).toContain("attackOption.reroll: must be true or false");
  expect(bad({ reroll: true, on: "attack:sideways" })).toContain("attackOption.on: unknown roll tag attack:sideways");
  expect(bad({ reroll: true, resource: "" })).toContain("attackOption.resource: must be text");
  ```
  In the same file, test that the field gets through to every place that declares it:
  - A feature op `{ op: "feature", name: "Test Focus", attackOption: { toHit: "1d4" } }` validated through `validateOps` keeps `attackOption.id === "test-focus"`.
  - An option def in `validateOptions` does the same.
  - The item validator (`r.add("vault", "item", { name: "Test Hunting Blade", kind: "weapon", weapon: {...}, attackOption: { onHit: "1d6", oncePerTurn: true } })`) gives `registry.get("item","test-hunting-blade").data.attackOption.onHit === "1d6"`.
  - `libraryMeta("item", { name: "X", item_type: "Weapon", attackOption: { reroll: true } }).raw.attackOption` equals `{ reroll: true }`.
  - `overlayProblems()` is still `[]`.

- [ ] **Step 2: Run** `npx vitest run tests/content/attack-option.test.ts`. Expected: FAIL, because `validateAttackOption` does not exist yet.

- [ ] **Step 3: Implement `validateAttackOption(v, at, name, e)`.** Model it on `validateToggle`:
  - `id` defaults to `slug(name)` and uses the same id pattern and message as toggles.
  - Dice go through `checkDice` (`src/core/dice.ts`). Tags go through `validRollTarget` (`src/core/roll-tags.ts`).
  - `scale` keys are whole levels 1-20 and its values pass `checkDice`.
  - Return `undefined` when any message was added.

  Wire the field next to each existing `validateToggle` call:
  - `validateOps` feature case and `validateOptions` (`ops.ts`).
  - The item validator (`item.ts`). The overlay fill condition becomes `!Object.keys(out.effects ?? {}).length && !out.toggle && !out.attackOption`, and it copies `hit.attackOption`.
  - `build()` in `overlay/index.ts`. Add `!attackOption` to the "changes nothing" check.
  - `libraryMeta` (`library.ts`): add `"attackOption"` to the `for (const k of ["weapon", "armor", "effects", "charges"] ...)` list.

- [ ] **Step 4: Run** `npx vitest run tests/content/attack-option.test.ts`, then `npm test && npm run typecheck`. Expected: PASS, and the existing suite is green.

- [ ] **Step 5: Commit.** Message: `feat: attackOption field on features, options, items and built-in entries so dice-spending features can be declared in notes`, with the Co-Authored-By line.

---

### Task 2: Declared options reach the character (progression, derive, character fields)

**Files:**
- Create: `src/core/attack-options.ts`, `tests/fixtures/attack-options.ts`
- Modify: `src/core/progression.ts` (`Progress`, `emptyProgress`, `feature()`, `withOverlay()`, the two `withOverlay(...)` call sites at the feature op and the option pick), `src/core/derive.ts` (`ActorStats`, `deriveCharacter`, `deriveCreature`), `src/core/character.ts` (`Character`, `parseCharacter`), `src/content/overlay/mechanics.json`
- Test: `tests/core/attack-options.test.ts`

**Interfaces:**
- Consumes: `AttackOptionDef` (Task 1).
- Produces:
  ```ts
  // progression.ts
  export interface DeclaredAttackOption { id: string; name: string; source: string; /** feature row key */ key: string; /** owner level the scale reads */ level: number; def: AttackOptionDef; }
  // Progress gains: attackOptions: DeclaredAttackOption[]
  // character.ts, Character gains (both optional, set only when non-empty):
  optionsOn?: string[];   // declared options switched on
  optionsOff?: string[];  // extra-damage switches switched off
  // attack-options.ts
  export interface AttackOptionRow {
    id: string; name: string; /** feature:<key> | item:<id> | "" */ ref: string;
    kind: "declared" | "extra"; on: boolean;
    toHit?: string; onHit?: string; reroll?: boolean; oncePerTurn?: boolean; /** roll tag */ tag: string;
    resource?: { id: string; name: string; left: number; max: number; unlimited: boolean };
    /** set when the option cannot work: plain words */ problem?: string;
    /** extra rows: the dice and type added, e.g. "1d6 fire"; perTurn from per: "turn" */ adds?: string; perTurn?: boolean;
  }
  export function resourceByName(rows: ResourceRow[], name: string): ResourceRow | undefined;
  export function attackOptionRows(c: Character, declared: DeclaredAttackOption[], items: { e: InventoryEntry; it: ItemData | undefined }[],
    fx: SourcedEffects[], resources: ResourceRow[], scales: Record<string, string | number>, totalLevel: number): AttackOptionRow[];
  // derive.ts, ActorStats gains: attackOptions: AttackOptionRow[]   (deriveCreature: [])
  ```
  In this task `attackOptionRows` returns declared rows only. Task 3 adds the extra rows.
- Fixture `tests/fixtures/attack-options.ts` exports:
  - `optionsRegistry(): Registry`. This is `mechanicsRegistry()` plus these invented feats and items:
    - `test-focus`: resource "Focus Dice" max 3 long, plus feature "Test Focus" with `attackOption: { toHit: "1d4", resource: "Focus Dice" }`.
    - `test-steady`: feature "Test Steady" with `attackOption: { toHit: "1", resource: "Focus Dice" }`.
    - `test-analysis`: resource "Insight Dice" max 2 long, plus feature "Test Analysis" with `attackOption: { scale: { 1: "1d4", 5: "2d4" }, resource: "Insight Dice", on: "attack:weapon" }`.
    - `test-savage`: feature "Test Savage" with `attackOption: { reroll: true, oncePerTurn: true, on: "attack:weapon" }`.
    - `test-lost`: feature "Test Lost" with `attackOption: { toHit: "1d4", resource: "Missing Dice" }`.
    - `test-ember`: feature "Test Ember" with `effects: { extraDamage: [{ dice: "1d6", type: "fire", on: "attack:weapon" }] }`.
    - Item `test-hunting-blade`: weapon 1d6 slashing, str, melee, martial, with `attackOption: { onHit: "1d6", oncePerTurn: true }`.
    - Item `test-tonic`: consumable, heal "2d4+2".
    - `test-blood-price`: feature "Test Blood Price" with `action: { name: "Blood Price", cost: { selfDamage: "1d6" }, damage: "2d6" }`.
  - `optChar(o?: object): Character`. This is `makeChar` with `inventory: [{ id: "longsword", equipped: true }]` merged.
  - `seq(...xs: number[]): Rng`. Returns `xs[i++ % xs.length]`.

- [ ] **Step 1: Write the failing tests** in `tests/core/attack-options.test.ts`:
  ```ts
  const r = optionsRegistry(), st = derive(optChar({ feats: ["test-focus"] }), r);
  expect(st.attackOptions).toEqual([expect.objectContaining({ id: "test-focus", name: "Test Focus", kind: "declared", on: false, toHit: "1d4", tag: "attack",
    resource: { id: "focus-dice", name: "Focus Dice", left: 3, max: 3, unlimited: false } })]);
  expect(derive(optChar({ feats: ["test-focus"], optionsOn: ["test-focus"], uses: { "focus-dice": 1 } }), r).attackOptions[0]).toMatchObject({ on: true, resource: { left: 2 } });
  // inline scale reads the owner level (feats: total level)
  expect(derive(optChar({ feats: ["test-analysis"] }), r).attackOptions[0].onHit).toBe("1d4");
  expect(derive(optChar({ feats: ["test-analysis"], classes: [{ class: "tester", level: 5 }] }), r).attackOptions[0].onHit).toBe("2d4");
  // an item option counts only while the item works
  expect(derive(optChar({ inventory: [{ id: "test-hunting-blade", equipped: true }] }), r).attackOptions[0]).toMatchObject({ id: "test-hunting-blade", ref: "item:test-hunting-blade", onHit: "1d6", oncePerTurn: true });
  expect(derive(optChar({ inventory: [{ id: "test-hunting-blade", equipped: false }] }), r).attackOptions).toEqual([]);
  // missing resource
  expect(derive(optChar({ feats: ["test-lost"] }), r).attackOptions[0].problem).toBe("needs Missing Dice, which this character doesn't have");
  // built-in default: a feat called Savage Attacker with no mechanics of its own
  r.add("vault", "feat", { name: "Savage Attacker", grants: [{ op: "feature", name: "Savage Attacker" }] }, { path: "sa.md" });
  expect(derive(optChar({ feats: ["savage-attacker"] }), r).attackOptions[0]).toMatchObject({ reroll: true, oncePerTurn: true, tag: "attack:weapon" });
  // character fields: read, and never written when absent
  expect(parseNote({ ...tester, optionsOn: ["a"], optionsOff: ["extra:b"] })).toMatchObject({ value: { optionsOn: ["a"], optionsOff: ["extra:b"] }, errors: [] });
  const fm: Record<string, unknown> = {}; writeInto(fm, makeChar()); expect("optionsOn" in fm || "optionsOff" in fm).toBe(false);
  expect(parseNote({ ...tester, optionsOn: "a" }).kind === "character" && (parseNote({ ...tester, optionsOn: "a" }) as { errors: string[] }).errors).toContain("optionsOn: must be a list");
  ```

- [ ] **Step 2: Run** `npx vitest run tests/core/attack-options.test.ts`. Expected: FAIL, because `attackOptions` is undefined.

- [ ] **Step 3: Implement.**
  - `progression.ts`:
    - `feature()` takes `attackOption?: AttackOptionDef` as a new last parameter. When it is set, it pushes `{ id: def.id, name, source: src.label, key, level: src.classLevel, def }`. If the id is already taken, it calls `problem(\`${name}: another attack option is already called "${id}"\`)`.
    - `withOverlay()` takes and returns `attackOption`. `wantsMech` also counts `!!entry.attackOption`. The note's own field wins.
  - `character.ts`: read the two fields with `r.strs`, and set each one only when the list is non-empty.
  - `attack-options.ts`:
    - `resourceByName` uses the same match as `toggle()` in `actions.ts`: `x.id === slug(name) || (!x.derived && slug(x.name) === slug(name))`.
    - For a row's dice, `scale` takes the highest key less than or equal to `level`. Otherwise `fillDice(def.onHit, scales)`. `toHit` goes through `fillDice`.
    - A declared row whose dice resolve to nothing and that has no `reroll` is left out.
    - `on` is `c.optionsOn?.includes(id) ?? false`.
    - Item rows use `itemWorks(e, it)` and level `totalLevel`.
  - `derive.ts`: call it after `resources` is built.
  - `mechanics.json`: add `"feat::savage-attacker": { "attackOption": { "reroll": true, "oncePerTurn": true, "on": "attack:weapon" } }`.

- [ ] **Step 4: Run** `npx vitest run tests/core/attack-options.test.ts`, then `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: derive attack options from features, items and built-in defaults so the sheet can list and spend them`.

---

### Task 3: Existing extra damage becomes default-on switches

**Files:**
- Modify: `src/core/attack-options.ts` (`attackOptionRows`), `src/core/attack-rows.ts` (`AttackInputs`, the `extraDamage` loop in `buildAttacks`), `src/core/derive.ts` (pass `extraOff`)
- Test: `tests/core/attack-options.test.ts`

**Interfaces:**
- Produces:
  - `AttackInputs.extraOff?: ReadonlySet<string>`.
  - Extra row ids are `` `extra:${slug(source)}` ``. One row per `SourcedEffects.source` that has `extraDamage` in the gated effects list.
  - Extra rows have: `kind: "extra"`, `on = !c.optionsOff?.includes(id)`, `adds` set to the first entry's dice (after the scale is filled in) and type (the type is "weapon" when `type === "weapon"`), `perTurn` true when any entry of that source has `per: "turn"`, and `tag = x.on ?? "attack"`.

- [ ] **Step 1: Write the failing tests:**
  ```ts
  const on = derive(optChar({ feats: ["test-ember"] }), r);
  expect(on.attackOptions).toEqual([expect.objectContaining({ id: "extra:test-ember", kind: "extra", on: true, adds: "1d6 fire", tag: "attack:weapon" })]);
  expect(on.attacks.find(a => a.name === "Longsword")!.damage).toContain("1d6 fire");
  const off = derive(optChar({ feats: ["test-ember"], optionsOff: ["extra:test-ember"] }), r);
  expect(off.attackOptions[0].on).toBe(false);
  expect(off.attacks.find(a => a.name === "Longsword")!.damage).not.toContain("fire");
  ```
  The existing `extraDamage` tests in `tests/core/effects-weapons.test.ts` must stay unchanged and green. That proves the default.

- [ ] **Step 2: Run** the file. Expected: FAIL, because no extra row exists yet.

- [ ] **Step 3: Implement.** In `buildAttacks`, skip a source when `i.extraOff?.has(\`extra:${slug(s.source)}\`)`, and drop its `per`/`note` notes as well. `deriveCharacter` passes `new Set(c.optionsOff ?? [])`.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: extra damage from features shows as a switch that starts on, so players can leave it out`.

---

### Task 4: Actions that switch and spend

**Files:**
- Modify: `src/core/actions.ts` (`Action` union, `apply()`)
- Test: `tests/core/attack-option-actions.test.ts`

**Interfaces:**
- Consumes: `ActorStats.attackOptions` and `AttackOptionRow` (Tasks 2-3).
- Produces:
  ```ts
  | { type: "attackOption"; id: string; on: boolean }
  /** One roll used these options: spend 1 of each one's resource (not unlimited), switch off once-per-turn ones and any whose resource is now empty. */
  | { type: "attackOptionsUsed"; ids: string[] }
  ```
  `Applied.note` is set **only** when a resource ran out. Text: `No ${resource} left: ${names joined " and "} ${"is"|"are"} off.` It names every declared option on that resource that was on.

- [ ] **Step 1: Write the failing tests.** Use `act()` from `tests/fixtures/mechanics.ts` with `optionsRegistry()`.
  - `attackOption` on for `test-focus`: `value.optionsOn` equals `["test-focus"]`. Switching it off leaves `value.optionsOn` undefined.
  - `attackOption` off for `extra:test-ember`: `value.optionsOff` equals `["extra:test-ember"]`. Switching it back on leaves it undefined.
  - With `uses: { "focus-dice": 3 }`, switching on gives `error` containing `"No Focus Dice left"` and `optionsOn` stays unset.
  - For `test-lost`, switching on gives `error === "Test Lost needs Missing Dice, which this character doesn't have."`
  - Unknown id: `error === "That attack option isn't on this character."`
  - `attackOptionsUsed ["test-focus"]` with the option on: `uses["focus-dice"] === 1`, still on, no note.
  - With `uses["focus-dice"] = 2` and both `test-focus` and `test-steady` on: `attackOptionsUsed ["test-focus"]` gives `uses === 3`, `optionsOn` undefined, and `note === "No Focus Dice left: Test Focus and Test Steady are off."`
  - `attackOptionsUsed ["test-savage"]` removes it from `optionsOn` and sets no note.
  - Never more than the max is spent. `attackOptionsUsed ["test-focus","test-steady"]` with 1 left: uses `3`, not `4`. *(Review Focus 1 at the action level.)*

- [ ] **Step 2: Run** `npx vitest run tests/core/attack-option-actions.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** both cases in `apply()`. Spend derived resources through `c.uses[id]` and manual ones through `c.resources[i].used`, the same way `toggle()` does. Keep empty lists out of the note (`delete c.optionsOn`).

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: actions to switch attack options and spend them per roll, saying in words when a resource runs out`.

---

### Task 5: Roll helpers (keep-higher, which options apply, spend words)

**Files:**
- Modify: `src/core/dice.ts`, `src/core/attack-options.ts`
- Test: `tests/core/dice.test.ts` (append), `tests/core/attack-options.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  // dice.ts
  /** Roll `expr` twice and keep the higher total. */
  export function rollKeepHigher(title: string, expr: string, rng?: Rng): RollResult;
  // attack-options.ts
  export function toHitOptions(rows: AttackOptionRow[], t: RollTarget): AttackOptionRow[];   // declared, on, toHit, tag matches, no problem
  export function onHitOptions(rows: AttackOptionRow[], t: RollTarget): AttackOptionRow[];   // declared, on, onHit or reroll, tag matches, no problem
  /** Keep options in order while their resource has dice left this roll (unlimited or none: always). */
  export function affordable(opts: AttackOptionRow[]): AttackOptionRow[];
  /** "1 Focus Dice spent, 2 of 3 left" for an option that spends; undefined otherwise. Counts earlier options in `opts` on the same resource. */
  export function spendWords(opts: AttackOptionRow[], index: number): string | undefined;
  ```

- [ ] **Step 1: Write the failing tests:**
  ```ts
  const k = rollKeepHigher("x", "1d8+3 slashing", seq(0.125, 0.75));
  expect(k.total).toBe(10); expect(k.dice).toEqual([2, 7]);
  expect(k.detail.startsWith("rolled twice: 5 and 10, kept 10")).toBe(true);
  // which options apply
  const rows = derive(optChar({ feats: ["test-focus", "test-analysis", "test-steady"], optionsOn: ["test-focus", "test-analysis", "test-steady"], uses: { "focus-dice": 2 } }), r).attackOptions;
  const melee = { kind: "attack", range: "melee", tags: ["longsword"] } as const, spell = { kind: "attack" } as const;
  expect(toHitOptions(rows, melee).map(o => o.id)).toEqual(["test-focus", "test-steady"]);
  expect(onHitOptions(rows, spell).map(o => o.id)).toEqual([]);          // attack:weapon needs a weapon row
  expect(affordable(toHitOptions(rows, melee)).map(o => o.id)).toEqual(["test-focus"]);   // 1 left
  expect(spendWords(toHitOptions(rows, melee), 0)).toBe("1 Focus Dice spent, 0 of 3 left");
  ```

- [ ] **Step 2: Run** both files. Expected: FAIL.

- [ ] **Step 3: Implement.** `rollKeepHigher` calls `rollDice` twice and returns the higher total with both sets of dice. The detail is `` `rolled twice: ${a.total} and ${b.total}, kept ${max} (${a.detail} / ${b.detail})` ``. Option filters use `matchesTag(row.tag, t)`.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: helpers for keep-higher damage and for which attack options a roll can afford`.

---

### Task 6: Controller: options on rolls, damage that counts as a hit, the 3-second hit window

**Files:**
- Modify: `src/ui/controller.ts`, `tests/fixtures/attack-options.ts` (add `sheetWith`)
- Test: `tests/ui/attack-options.test.ts`

**Interfaces:**
- Consumes: Tasks 2-5.
- Produces (on `SheetController`):
  ```ts
  export const HIT_WINDOW_MS = 3000;
  hitWindow: { ai: number; name: string; crit: boolean } | null;
  setAttackOption(id: string, on: boolean): boolean;       // dispatches attackOption; error is notified
  /** Roll attack row `ai` to hit (own attacks only); opens the hit window unless it failed. */
  attackRoll(ai: number, ev?: Mods): RollResult | undefined;
  /** Roll attack row `ai`'s damage; always counts as a hit (spends on-hit options); `crit` uses critDamage and doubles option dice. Closes the hit window. */
  attackDamage(ai: number, crit?: boolean): RollResult | undefined;
  ```
  - `roll()` is unchanged in signature. When `who === undefined && target.kind === "attack"` and the total is not `"fail"`, it applies `affordable(toHitOptions(...))`: it rolls each option's dice with `rollDice`, adds them to `total`, and appends `` ` + ${name} ${dice} (${sum})` `` to `detail`. It dispatches `attackOptionsUsed`, then appends the tail `` `; ${left} of ${max} ${resource} left` `` once per resource it spent, and `` `; ${name} is off (once per turn)` `` for once-per-turn options. Run-out notes go to `host.notify`.
  - `attackDamage` builds the expression from `crit ? a.critDamage : a.damage`. With a reroll option, the first `" + "` term goes through `rollKeepHigher` and the rest through `rollDice`. On-hit dice are rolled per option (`critDamageOf(dice)` on a crit) and appended in the same `+ Name dice (sum)` form. The extra rows that are on and match are listed as `` `; applied: ${names}` ``. The spend tail and notes are the same as for `roll()`. The title is `` `${a.name} damage` `` or `` `${a.name} critical damage` ``.
  - `reload()` and any `attackDamage` or `attackRoll` whose `ai` no longer names the same attack (`st.attacks[ai]?.name !== hitWindow.name`) clear `hitWindow`. A stale call returns `undefined`.
- Fixture `sheetWith(layout: LayoutName, note?: object, rng?: Rng)` returns `{ ctl, root, host, notices, q, click, row(name: string): HTMLElement, left(id: string): ResourceRow }`. It mounts `mountSheet(root, ctl, layout)` with `optionsRegistry()`. This is the WIP test's `setup()`, generalised.

- [ ] **Step 1: Write the failing tests.** Wrap them in `for (const layout of ["desktop", "tablet", "mobile"] as const)` and use `vi.useFakeTimers()` in `beforeEach`:
  ```ts
  // to-hit: spends on the roll, adds the die, says so
  const s = sheetWith(layout, { feats: ["test-focus"], optionsOn: ["test-focus"] }, seq(0.5));
  const ai = s.ctl.stats()!.attacks.findIndex(a => a.name === "Longsword"), a = s.ctl.stats()!.attacks[ai];
  const r = s.ctl.attackRoll(ai)!;
  expect(r.total).toBe(11 + a.toHit! + 3);
  expect(r.detail).toContain("+ Test Focus 1d4 (3)"); expect(r.detail).toContain("; 2 of 3 Focus Dice left");
  expect(s.left("focus-dice").used).toBe(1);
  // two to-hit options share the last die (Review Focus 1)
  // feats test-focus + test-steady both on, uses focus-dice 2 -> attackRoll: used 3, detail has "Test Focus" and not "Test Steady",
  // both off, notices.at(-1) === "No Focus Dice left: Test Focus and Test Steady are off."
  // on-hit: only damage spends; damage button counts as a hit
  const d = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
  d.ctl.attackRoll(ai); expect(d.left("insight-dice").used).toBe(0);
  expect(d.ctl.attackDamage(ai)!.detail).toContain("+ Test Analysis 1d4 (3)"); expect(d.left("insight-dice").used).toBe(1);
  expect(d.ctl.attackDamage(ai, true)!.detail).toContain("+ Test Analysis 2d4 (");
  // the hit window: 3 s, then a miss spends nothing
  d.ctl.attackRoll(ai); expect(d.ctl.hitWindow).toMatchObject({ ai, name: "Longsword" });
  vi.advanceTimersByTime(HIT_WINDOW_MS); expect(d.ctl.hitWindow).toBeNull(); expect(d.left("insight-dice").used).toBe(2);
  // a miss leaves once-per-turn options on (Review Focus 2)
  const m = sheetWith(layout, { feats: ["test-savage"], optionsOn: ["test-savage"] }, seq(0.5));
  m.ctl.attackRoll(ai); vi.advanceTimersByTime(HIT_WINDOW_MS);
  expect(m.ctl.stats()!.attackOptions[0].on).toBe(true);
  const hit = m.ctl.attackDamage(ai)!; expect(hit.detail).toContain("rolled twice"); expect(hit.detail).toContain("Test Savage is off (once per turn)");
  expect(m.ctl.stats()!.attackOptions[0].on).toBe(false);
  // extra switches listed; off means left out
  const e = sheetWith(layout, { feats: ["test-ember"] }, seq(0.5));
  expect(e.ctl.attackDamage(ai)!.detail).toContain("; applied: Test Ember");
  e.ctl.setAttackOption("extra:test-ember", false); expect(e.ctl.attackDamage(ai)!.detail).not.toContain("Test Ember");
  // reload closes the hit window (Review Focus 3)
  d.ctl.attackRoll(ai); d.ctl.reload(parseNote({ ...tester, feats: ["test-analysis"] }) as never);
  expect(d.ctl.hitWindow).toBeNull(); expect(d.ctl.attackDamage(99)).toBeUndefined();
  ```

- [ ] **Step 2: Run** `npx vitest run tests/ui/attack-options.test.ts`. Expected: FAIL, because `attackRoll` is not a function.

- [ ] **Step 3: Implement** the methods listed in Interfaces. Clear and restart a single timer in `attackRoll`: `setTimeout(() => { this.hitWindow = null; this.emit(); }, HIT_WINDOW_MS)`. A new roll replaces the window.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: attack options apply to rolls, damage counts as a hit, and a 3-second hit window spends on-hit dice only on a hit`.

---

### Task 7: The Attack options card, row buttons and layouts

**Files:**
- Create: `src/ui/attack-options-ui.ts`
- Modify: `src/ui/components.ts` (`RENDER["attack-options"]`, the own-attack row: `data-act`s, to-hit → `ctl.attackRoll(ai, e)`, damage → `ctl.attackDamage(ai)`, crit → `ctl.attackDamage(ai, true)`, and the hit-window button; companion rows keep `ctl.roll`/`ctl.damage`), `src/ui/layouts.ts` (`CHARACTER_FEATURES`, `DESKTOP`, `TABLET`, `MOBILE`), `src/ui/combos-ui.ts` (own attack steps), `styles.css`
- Test: `tests/ui/attack-options-ui.test.ts`

**Interfaces:**
- Consumes: Task 6 controller API.
- Produces:
  - `attackOptionsFeature(ctl: SheetController, st: ActorStats): HTMLElement`. This is a card titled "Attack options", hidden when there are no rows. Each row is `[data-attack-option="<id>"]` and holds:
    - a `button.fe-opt-switch` with `aria-pressed`, `aria-label` `Switch ${name} on`/`off`, `data-act="attack-option"`;
    - the name (`data-ref` = row.ref when set);
    - a words line. For a row with a problem, the words line is the problem, and the switch is `disabled`.
  - `optionWords(row: AttackOptionRow): string`. The parts below are joined by ", ":
    - toHit: `+${toHit} to each attack roll`
    - onHit: `+${onHit} damage when you hit`
    - reroll: `weapon damage rolled twice, higher kept`
    - oncePerTurn: `once per turn`
    - resource: `${left} of ${max} ${name} left` (unlimited: `${name} unlimited`)
    - extra rows: `+${adds} damage on ${tagWords(tag)}` plus `, once per turn` when `perTurn`, then `, added by itself while on`
  - Hit window: a `button.fe-hit-window` with `data-act="hit-window"`, inside the row whose index is `ctl.hitWindow.ai`. Its text is "Hit? Roll damage", or "Crit! Roll damage" when `crit`. It calls `ctl.attackDamage(ai, crit)`.
  - Feature id `"attack-options"`:
    - Added to `CHARACTER_FEATURES` right after `"attacks"`.
    - Placed directly before `"resources"` in DESKTOP (main, third column), TABLET (main, right column) and MOBILE (combat).
    - On MOBILE, `attacks`, `attack-options` and `resources` are adjacent (see the Interfaces note on P1).
    - NPC layouts do not get it.

- [ ] **Step 1: Write the failing tests.** Loop over the three layouts with `sheetWith`:
  ```ts
  for (const l of [DESKTOP, TABLET, MOBILE]) {
    expect(placed(l).filter(f => f === "attack-options")).toHaveLength(1);
    const col = l.tabs.flatMap(t => t.columns).find(c => c.includes("attack-options"))!;
    expect(col[col.indexOf("attack-options") + 1]).toBe("resources");
  }
  const mob = MOBILE.tabs.flatMap(t => t.columns).find(c => c.includes("attack-options"))!;
  expect(mob[mob.indexOf("attack-options") - 1]).toBe("attacks");
  // card words and switch, per layout
  const s = sheetWith(layout, { feats: ["test-focus", "test-ember", "test-lost"] });
  expect(s.q('[data-attack-option="test-focus"]').textContent).toContain("Test Focus: +1d4 to each attack roll, 3 of 3 Focus Dice left");
  expect(s.q('[data-attack-option="extra:test-ember"]').textContent).toContain("+1d6 fire damage on weapon attacks, added by itself while on");
  expect(s.q('[data-attack-option="test-lost"] button').hasAttribute("disabled")).toBe(true);
  s.click(s.q('[data-attack-option="test-focus"] [data-act="attack-option"]'));
  expect(s.ctl.character!.optionsOn).toEqual(["test-focus"]);
  expect(s.q('[data-attack-option="test-focus"] [data-act="attack-option"]').getAttribute("aria-pressed")).toBe("true");
  // empty card hidden
  expect(sheetWith(layout).q('[data-feature="attack-options"]').hidden).toBe(true);
  // row buttons and the hit window, by tap/click
  const h = sheetWith(layout, { feats: ["test-analysis"], optionsOn: ["test-analysis"] }, seq(0.5));
  h.click(h.row("Longsword").querySelector('[data-act="to-hit"]'));
  expect(h.row("Longsword").querySelector('[data-act="hit-window"]')!.textContent).toBe("Hit? Roll damage");
  h.click(h.row("Longsword").querySelector('[data-act="hit-window"]'));
  expect(h.host.log[0].title).toBe("Longsword damage"); expect(h.row("Longsword").querySelector('[data-act="hit-window"]')).toBeNull();
  vi.useFakeTimers(); h.click(h.row("Longsword").querySelector('[data-act="to-hit"]')); vi.advanceTimersByTime(HIT_WINDOW_MS);
  expect(h.row("Longsword").querySelector('[data-act="hit-window"]')).toBeNull();
  // combo damage step goes through attackDamage
  // a combo { name: "Strike", when: "", steps: [{ action: "Action", text: "", use: { attack: "Longsword" } }] } on the Combos tab:
  // clicking its damage button with test-analysis on raises insight-dice used by 1
  // styles
  expect(css).toMatch(/\.fe-sheet button\.fe-opt-switch \{/);
  expect(css).toMatch(/\.fe-tablet \.fe-sheet button\.fe-opt-switch, \.fe-mobile button\.fe-opt-switch[^{]*\{[^}]*min-height: 44px/);   // adjust selector to the file's touch-target convention
  expect(css).toMatch(/\.fe-sheet button\.fe-hit-window \{[^}]*animation:/);
  ```
  If `tests/ui/tablet.test.ts` compares `placed(TABLET)` with `CHARACTER_FEATURES`, it stays green because both gain the id.

- [ ] **Step 2: Run** `npx vitest run tests/ui/attack-options-ui.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Build the card with `card()`, `h()` and `tagWords()` (`src/ui/widgets.ts`). The switch calls `ctl.setAttackOption(id, !on)`. The CSS adds a keyframes fade of the hit-window button over 3 s (opacity 1 to 0.4) and 44px targets on tablet and phone, using whatever touch-target selector convention `styles.css` already uses for `.fe-tablet`/`.fe-mobile`.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS, including every existing layout parity test.

- [ ] **Step 5: Commit.** Message: `feat: Attack options card above Resources on every layout, with a hit-window button on the attack row`.

---

### Task 8: Own-dice words (pure)

**Files:**
- Create: `src/core/own-dice.ts`
- Modify: `src/core/types.ts` (`RollResult.own?: { total?: number }`)
- Test: `tests/core/own-dice.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const OWN_DICE = "own-dice";
  /** Layers in resolveRules order (plugin defaults, campaign, character); the last one that sets it wins; default off. */
  export function ownDiceOn(layers: (Record<string, boolean> | undefined)[]): boolean;
  /** "1d8+3 slashing + 1d6 fire" -> "1d8 + 3 slashing + 1d6 fire". */
  export function spaced(expr: string): string;
  export interface Extra { dice: string; name: string; spent?: string }   // spent: spendWords output
  export function d20Words(o: { mod: number; mode: RollMode | "cancel"; extras?: Extra[]; fail?: string[]; reroll?: number; min?: number; critRange?: number }): string;
  export function damageWords(o: { expr: string; extras?: Extra[]; reroll?: string; weaponNote?: string }): string;
  export function saveWords(abil: Abil, dc: number): string;
  ```

- [ ] **Step 1: Write the failing tests** with these exact strings:
  ```ts
  expect(ownDiceOn([{ "own-dice": true }, undefined, { "own-dice": false }])).toBe(false);
  expect(ownDiceOn([{}, { "own-dice": true }, {}])).toBe(true); expect(ownDiceOn([])).toBe(false);
  expect(d20Words({ mod: 5, mode: "normal" })).toBe("Roll 1d20 + 5");
  expect(d20Words({ mod: -1, mode: "normal" })).toBe("Roll 1d20 - 1");
  expect(d20Words({ mod: 0, mode: "normal" })).toBe("Roll 1d20");
  expect(d20Words({ mod: 5, mode: "adv" })).toBe("Roll 2d20, keep the higher, + 5");
  expect(d20Words({ mod: 5, mode: "dis" })).toBe("Roll 2d20, keep the lower, + 5");
  expect(d20Words({ mod: 5, mode: "cancel" })).toBe("Roll 1d20 + 5 (advantage and disadvantage cancel)");
  expect(d20Words({ mod: 5, mode: "normal", extras: [{ dice: "1d4", name: "Test Focus", spent: "1 Focus Dice spent, 2 of 3 left" }] }))
    .toBe("Roll 1d20 + 5, plus 1d4 for Test Focus (1 Focus Dice spent, 2 of 3 left)");
  expect(d20Words({ mod: 2, mode: "normal", fail: ["Test Hold"] })).toBe("Automatic failure (Test Hold): nothing to roll.");
  expect(d20Words({ mod: 2, mode: "normal", reroll: 1, min: 10, critRange: 19 }))
    .toBe("Roll 1d20 + 2. If the d20 shows 1 or lower, roll it again once and keep the new roll. A d20 below 10 counts as 10. You crit on 19-20.");
  expect(damageWords({ expr: "1d10+3 slashing", weaponNote: "two hands", extras: [{ dice: "2d4", name: "Test Analysis", spent: "1 Insight Dice spent, 1 of 2 left" }] }))
    .toBe("Roll 1d10 + 3 slashing (two hands) + 2d4 for Test Analysis (1 Insight Dice spent, 1 of 2 left)");
  expect(damageWords({ expr: "1d8+3 slashing + 1d6 fire", reroll: "Test Savage" }))
    .toBe("Roll 1d8 + 3 slashing twice and keep the higher total (Test Savage), then add 1d6 fire");
  expect(saveWords("dex", 14)).toBe("They roll a DEX save against DC 14");
  ```

- [ ] **Step 2: Run** the file. Expected: FAIL.

- [ ] **Step 3: Implement** to the strings above. Add no other wording.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: plain-words dice instructions for players who roll their own dice`.

---

### Task 9: Own-dice mode for plain rolls: the setting, instructions, optional total, Hit/Miss/Crit

**Files:**
- Create: `src/ui/own-dice-ui.ts`
- Modify: `src/ui/controller.ts` (`ownDice()`, `ownRoll`, branches in `roll()`, `damage()`, `attackRoll()`, `attackDamage()`, `useAction()`; `setRule` closes the box), `src/ui/sheet.ts` (append `ownRollBox` after the toast and hide the toast for `own` entries), `src/ui/panels.ts` (`logPanel`: show `r.own ? (r.own.total ?? "") : r.total`), `src/ui/spells-ui.ts` (`rolls()`: pass the save to `ctl.damage`), `src/ui/settings-ui.ts` (P2: the dice row), `styles.css`
- Test: `tests/ui/own-dice.test.ts`

**Interfaces:**
- Consumes: Task 8 words, Task 6 options, and P2's `settingsFeature`.
- Produces (on `SheetController`):
  ```ts
  ownDice(): boolean;   // ownDiceOn([host.ruleDefaults, host.campaign?.rules, value.rules])
  ownRoll: OwnRoll | null;
  export type OwnRoll =
    | { kind: "say"; entry: RollResult; error?: string }
    | { kind: "attack"; entry: RollResult; ai: number; crit: boolean; error?: string }
    | { kind: "total"; title: string; say: string; min?: number; max?: number; error?: string; roll(): number; apply(total: number): void };   // used by Task 10
  damage(title: string, expr: string, ctx?: { save?: { abil: Abil; dc: number; half: boolean } }): RollResult;
  answerHit(outcome: "hit" | "miss" | "crit"): void;   // hit/crit -> attackDamage(ai, outcome === "crit"); miss -> close, nothing spent
  logOwnTotal(text: string): boolean;                  // whole number -> entry.own.total = n, close; else error "Type the total you rolled, a whole number."
  closeOwnRoll(): void;
  ```
  - In own-dice mode, `roll()` and `damage()` roll nothing. They record `{ title, total: 0, dice: [], detail: <words>, crit: false, fumble: false, sources, own: {} }` and set `ownRoll` to `"say"`. Spending (to-hit options) happens exactly as in sheet mode, and its words come from `spendWords`.
  - `attackRoll()` sets `ownRoll` to `"attack"` instead of opening a hit window.
  - `damage()` with `ctx.save` produces `` `${saveWords(...)}; you roll ${spaced(expr)}${half ? ", half on a save" : ""}` ``.
  - In own-dice mode, `useAction()` spends its cost as today and records ONE entry. Its words join, with "; ", the attack `d20Words`, the `saveWords`, `you roll ${damage}` and `Roll ${heal} healing`. The self-damage part is Task 10.
  - `ownRollBox(ctl): HTMLElement | null` is `.fe-own-roll` with `role="dialog"`. It holds:
    - the title and the instruction text;
    - for "say" and "attack": an optional `input[type="number"][data-keep="own-total"]` and a button `data-act="own-log"` ("Add to log");
    - for "attack": the buttons `data-act="own-hit"` ("Hit"), `"own-miss"` ("Miss") and `"own-crit"` ("Crit");
    - `data-act="own-close"` ("Close");
    - the error line.
  - Settings row: `[data-setting="own-dice"]` with label "I roll my own dice", the current option "Off"/"On", and a `button` with `aria-pressed` that calls `ctl.setRule(OWN_DICE, !on)`.

- [ ] **Step 1: Write the failing tests.** Loop over the three layouts:
  ```ts
  const s = sheetWith(layout, { feats: ["test-focus", "test-analysis"], optionsOn: ["test-focus", "test-analysis"], rules: { "own-dice": true } });
  const rngSpy = vi.fn(() => 0.5); s.host.rng = rngSpy;
  const ai = s.ctl.stats()!.attacks.findIndex(a => a.name === "Longsword"), a = s.ctl.stats()!.attacks[ai];
  s.click(s.row("Longsword").querySelector('[data-act="to-hit"]'));
  expect(rngSpy).not.toHaveBeenCalled();
  expect(s.q(".fe-own-roll").textContent).toContain(`Roll 1d20 ${a.toHit! < 0 ? "-" : "+"} ${Math.abs(a.toHit!)}, plus 1d4 for Test Focus (1 Focus Dice spent, 2 of 3 left)`);
  expect(s.left("focus-dice").used).toBe(1);
  s.click(s.q('[data-act="own-miss"]')); expect(s.left("insight-dice").used).toBe(0); expect(s.q(".fe-own-roll")).toBeNull();
  s.click(s.row("Longsword").querySelector('[data-act="to-hit"]')); s.click(s.q('[data-act="own-crit"]'));
  expect(s.q(".fe-own-roll").textContent).toContain("+ 2d4 for Test Analysis (1 Insight Dice spent, 1 of 2 left)");   // crit doubles 1d4
  expect(s.q(".fe-own-roll").textContent).toContain("Roll 2d8 + 3 slashing");
  // optional total: logged, skipping changes nothing
  (s.q('[data-keep="own-total"]') as HTMLInputElement).value = "17"; s.click(s.q('[data-act="own-log"]'));
  expect(s.host.log[0].own).toEqual({ total: 17 });
  // checks and saves: instruction only, mode snaps back
  s.ctl.setMode("adv"); s.click(s.q('[data-feature="saves"] .fe-roll'));
  expect(s.q(".fe-own-roll").textContent).toContain("Roll 2d20, keep the higher,"); expect(s.ctl.mode).toBe("normal");
  // spell with a save says half on a save (a spell fixture with save { abil: dex, onSuccess: half } and damage)
  // the log shows no "0" for an own entry without a total
  s.ctl.open({ kind: "log" }); expect(s.q(".fe-log b").textContent).toBe("");
  // the setting: on every layout, stored on the character
  const t = sheetWith(layout); t.click(t.q('[data-setting="own-dice"] button'));
  expect(t.ctl.ownDice()).toBe(true); expect(t.ctl.character!.rules["own-dice"]).toBe(true);
  expect(t.q('[data-setting="own-dice"]').textContent).toContain("On");
  // switching it off closes an open box
  t.click(t.q('[data-feature="saves"] .fe-roll')); t.click(t.q('[data-setting="own-dice"] button')); expect(t.q(".fe-own-roll")).toBeNull();
  // campaign default respected, character overrides
  // host.campaign = { ...rules: { "own-dice": true } } -> ownDice() true; note rules { "own-dice": false } -> false
  ```

- [ ] **Step 2: Run** `npx vitest run tests/ui/own-dice.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `roll()`, work out the effective mode once and reuse it for both branches. The words get `"cancel"` when advantage and disadvantage both apply, and `fail` from `rollSources`. `reroll`/`min` come from `d20Rules`, and `critRange` from `critInfo`.
  - The box needs CSS: `.fe-sheet .fe-own-roll` is fixed at the bottom with a z-index above `.fe-panel`, and `.fe-sheet .fe-own-roll button` gets 44px targets on touch.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: I roll my own dice: every roll button says what to roll and still spends, with Hit, Miss and Crit for attacks`.

---

### Task 10: Rolls that change the sheet ask for the total first

**Files:**
- Modify: `src/ui/controller.ts` (`askTotal`, `submitTotal`, `rollItForMe`; own-dice branches in `spendHitDie`, `useItem`, `rollLevelHp`, `rollConcentration`, `forage`, and the self-damage cost in `useAction`), `src/rules/module.ts` (`spendHitDie`), `src/ui/own-dice-ui.ts` (the `"total"` kind)
- Test: `tests/ui/own-dice-totals.test.ts`, `tests/rules/rests.test.ts` (append)

**Interfaces:**
- Consumes: `OwnRoll` kind `"total"` (Task 9).
- Produces:
  ```ts
  // rules/module.ts
  export function spendHitDie(ctx: RestCtx, die: string, rng?: Rng, total?: number): { value: Character; roll?: RollResult; error?: string };
  // given `total`: no dice rolled; heal = max(1, total); roll.detail = `you rolled ${total}`
  // controller
  askTotal(p: Omit<Extract<OwnRoll, { kind: "total" }>, "kind" | "error">): void;
  submitTotal(text: string): boolean;   // validates, then apply(n) and close; on a bad value sets error and keeps the box
  rollItForMe(): void;                  // apply(roll()) and close
  ```
  - Validation messages: not a whole number gives `"Type the total you rolled, a whole number."`. With `min` and `max`, out of range gives `` `Type a number from ${min} to ${max}.` ``.
  - Box for `"total"`: a required `input[type="number"][data-keep="own-total"]`, `data-act="own-apply"` ("Apply"), `data-act="own-roll-for-me"` ("Roll it for me") and `data-act="own-close"` ("Cancel"). Cancel changes nothing.
  - What each flow says and applies (these refactor the sheet-mode bodies into `...With(total)` private helpers that both modes call):

    | Flow | `say` | min/max | apply(n) |
    |---|---|---|---|
    | Hit Die (card and rest panel) | `damageWords({ expr: \`1${die}${sgn(con)}\` })` | none | `spendHitDie(ctx, die, rng, n)` |
    | Item healing (`useItem`) | `damageWords({ expr: it.heal })` | none | one used, heal `n` |
    | Level-up HP (`rollLevelHp`) | `` `Roll 1d${die}` `` | 1 / die | `setLevelUp({ hp: { method: "roll", roll: n } })` |
    | Concentration | `` `${d20Words(...)} (Constitution save, DC ${dc})` `` | none | keep if `n >= dc`, else end, same notices as today |
    | Forage | `d20Words` with `"dis"` for a quick forage, plus ` (Wisdom, Survival)` | none | same result text as today, from `foodDays(n)` |
    | Self damage (`useAction`) | `` `Roll ${spaced(selfDamage)} for the damage to you` `` + (rest of the action's words, `. Then: ...`) | none | `dispatch({ type: "damage", amount: n })` |

- [ ] **Step 1: Write the failing tests.** Loop over the three layouts with `rules: { "own-dice": true }`:
  ```ts
  // hit die: nothing changes until a total is given
  const s = sheetWith(layout, { rules: { "own-dice": true }, hp: { max: 20, current: 10, temp: 0 } });
  s.click(s.q('[data-feature="hit-dice"] button'));
  expect(s.q(".fe-own-roll").textContent).toContain("Roll 1d8 + 2");
  expect(s.ctl.stats()!.hitDice[0].used).toBe(0); expect(s.ctl.stats()!.hp.current).toBe(10);
  (s.q('[data-keep="own-total"]') as HTMLInputElement).value = "7"; s.click(s.q('[data-act="own-apply"]'));
  expect(s.ctl.stats()!.hitDice[0].used).toBe(1); expect(s.ctl.stats()!.hp.current).toBe(17);
  // roll it for me
  s.click(s.q('[data-feature="hit-dice"] button')); s.click(s.q('[data-act="own-roll-for-me"]'));
  expect(s.ctl.stats()!.hitDice[0].used).toBe(1 + 1); expect(s.host.log[0].title).toBe("Hit Die d8");
  // bad totals are refused in words (Review Focus 4)
  for (const bad of ["", "7.5", "abc", "-"]) { s.ctl.rollLevelHp(8); expect(s.ctl.submitTotal(bad)).toBe(false);
    expect(s.q(".fe-own-roll").textContent).toContain("Type the total you rolled, a whole number."); s.ctl.closeOwnRoll(); }
  s.ctl.startLevelUp(); s.ctl.rollLevelHp(8); expect(s.ctl.submitTotal("9")).toBe(false);
  expect(s.q(".fe-own-roll").textContent).toContain("Type a number from 1 to 8."); expect(s.ctl.levelUp!.hp).toBeUndefined();
  expect(s.ctl.submitTotal("5")).toBe(true); expect(s.ctl.levelUp!.hp).toEqual({ method: "roll", roll: 5 });
  // item healing: cancel keeps the item
  // inventory [{ id: "test-tonic", qty: 2 }]: Use one -> box "Roll 2d4 + 2"; Cancel -> qty 2; Use one, Apply "6" -> qty 1, hp +6
  // concentration: concentrationCheck { dc: 10, spell } -> "Roll it" -> box contains "(Constitution save, DC 10)"; "9" -> concentration ended, notices.at(-1) starts "Concentration lost"
  // forage quick: box contains "Roll 2d20, keep the lower"; "15" -> notices.at(-1) starts "Found food for 2 days"
  // self damage: feats ["test-blood-price"]; Use -> box contains "Roll 1d6 for the damage to you"; "4" -> hp.current - 4
  ```
  In `tests/rules/rests.test.ts`: `spendHitDie(ctx, "d8", undefined, 0).value.hp.current` heals exactly 1, and `roll.detail === "you rolled 0"`.

- [ ] **Step 2: Run** both files. Expected: FAIL.

- [ ] **Step 3: Implement** as in the table. Sheet mode keeps today's behaviour byte for byte: the existing tests for these flows stay unchanged and green.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat: in own-dice mode, rolls that change the sheet ask for the total first, with a Roll it for me button`.

---

### Task 11: Death saves can be rolled (both modes)

**Files:**
- Modify: `src/ui/controller.ts` (`rollDeathSave`), `src/ui/components.ts` (`RENDER["death-saves"]`)
- Test: `tests/ui/death-save-roll.test.ts`

**Interfaces:**
- Produces:
  - `rollDeathSave(ev?: Mods): void`. In sheet mode, it rolls through `roll("Death save", 0, { kind: "death-save" }, ev)`, so advantage and disadvantage sources apply. It uses the natural roll `n`:
    - 20: heal 1.
    - 1: failures +2.
    - 10 or more: successes +1.
    - Anything else: failures +1, capped at 3.
  - Notices:
    - Third success: `"Three successes: you are stable."`
    - Third failure: `"Three failed death saves: your character dies."`
    - Natural 20: `"Natural 20: you are back up with 1 hit point."`
  - In own-dice mode, it calls `askTotal({ title: "Death save", say: \`${d20Words({ mod: 0, mode })}. Type the number on the die you keep.\`, min: 1, max: 20, ... })`. `apply` runs the same rules.
  - Button `button[data-act="death-save-roll"]` ("Roll death save") inside `[data-feature="death-saves"]`, shown only when `st.hp.current === 0`.

- [ ] **Step 1: Write the failing tests.** Loop over the three layouts with `hp: { max: 20, current: 0, temp: 0 }`:
  - With `seq(0.5)`, clicking gives `deathSaves.successes === 1`.
  - With `seq(0)`, `failures === 2`.
  - With `seq(0.99)`, `hp.current === 1`, `deathSaves` equals `{ successes: 0, failures: 0 }`, and the notice is the natural-20 text.
  - With `deathSaves: { successes: 2, failures: 0 }` and `seq(0.5)`, the notice is `"Three successes: you are stable."`
  - The button is absent at `current: 5`.
  - Own-dice: the box `say` contains `"Roll 1d20"`; `submitTotal("21")` is refused with `"Type a number from 1 to 20."`; `"20"` gives `hp.current === 1`.

- [ ] **Step 2: Run** the file. Expected: FAIL.

- [ ] **Step 3: Implement** with a shared `deathSaveWith(n: number)` helper.

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, and the build succeeds.

- [ ] **Step 5: Commit.** Message: `feat: roll death saves from the sheet, or type your own die, so own-dice mode covers them too`.

---

## Self-review

- **Spec coverage (sections 3 and 4):**
  - Card above Resources on all layouts, under Attacks on phone: Task 7.
  - Words for what each option does and costs: Task 7 (`optionWords`).
  - To-hit dice: Tasks 2, 5, 6.
  - On-hit dice with level scales (inline `scale` or `{scale}` placeholder): Tasks 1, 2, 6.
  - Reroll keep higher: Tasks 5, 6.
  - Once per turn: Tasks 4, 6.
  - Resource spend and automatic switch-off with words: Tasks 4, 6.
  - 3-second hit window, miss spends nothing: Tasks 6, 7.
  - The damage button counts as a hit: Task 6.
  - Detail lists what applied: Task 6.
  - `extraDamage` sources become switches that start on and apply automatically: Task 3.
  - `attackOption:` declared in notes (feature, option, item, overlay, library item adapter) and validated: Task 1.
  - Built-in default (`feat::savage-attacker`): Task 2.
  - Own dice:
    - Setting in the Settings card, campaign and character order: Tasks 8, 9.
    - Attack, check, save, Use, spell and breath-style instructions, Hit/Miss/Crit, crit doubling, optional total box: Task 9.
    - Required totals with Roll it for me for hit dice, item healing, level-up HP, concentration, foraging, self damage and rests (hit dice from the rest panel use `spendHitDie`): Task 10.
    - Death saves: Task 11.
- **Type consistency:** `AttackOptionRow`, `attackOptions`, `optionsOn`/`optionsOff`, `attackRoll`/`attackDamage(ai, crit)`, `hitWindow { ai, name, crit }`, `ownRoll`/`OwnRoll`, `askTotal`/`submitTotal`/`rollItForMe` and `HIT_WINDOW_MS` are spelled the same way in every task that uses them.
- **Decisions the spec left to the builder:**
  - Options live in two optional lists, not in `active`, so ids never clash with toggles.
  - To-hit options apply to every own attack roll (attack rows, spell attacks, Use-action attacks), because spec section 3 says "every attack roll".
  - On-hit options, reroll and the hit window apply to attack rows and combo attack steps only. A spell or Use damage button is not known to be an attack hit.
  - Run-out messages are notified. Once-per-turn switch-offs are only listed in the roll detail.
  - The window is shown as a fading button.

## Pending manual checks before merge

- **Obsidian rendering of Task 7 controls (not closable from jsdom).** The Attack options switches (`.fe-opt-switch`) and the hit-window button are only checked structurally in tests. Deploy the build to the vault and look at them on desktop, tablet and phone widths, confirming that Obsidian's `button:not(.clickable-icon)` styling does not override the plugin rules (`.fe-sheet button.fe-opt-switch`, hit-window button), that targets are 44px on tablet and phone, and that on/off states are visibly distinct. Record the result here or attach a screenshot.
