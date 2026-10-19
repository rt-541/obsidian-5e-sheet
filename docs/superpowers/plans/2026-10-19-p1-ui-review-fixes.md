# P1: UI Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix everything section 7 of the play-surface spec lists (the rendered-pass fixes and the full UI review, items 1-16) so the sheet reads cleanly on desktop, tablet and phone before the redesign plans (P2-P5) build on it.

**Architecture:** Mostly small changes to existing renderers in `src/ui`, a few pure helpers in `src/core` (one shared word module, the derived HP maximum for rests, the builder gear list), and `styles.css` rewritten to the "plugin button rules at `.fe-sheet button.x`" convention. Every change is driven by a Vitest test (jsdom for DOM, string checks for CSS); layout order changes update the existing layout tests on purpose.

**Tech Stack:** TypeScript, Obsidian plugin API (only in `src/obsidian`), plain DOM through `h()`, Vitest 3 + jsdom, esbuild.

**Spec:** `docs/superpowers/specs/2026-10-19-play-surface-design.md`, section 7 ("Fixes found by the rendered UI pass", "Full UI review", "Adjustments to the agreed redesign"). Review page with screen ids: https://scratch.rt-541.io/dnd-sheet/ui-review/review.html (screen ids such as `phone/tamsin-tab-gear-full` are quoted in tasks so a reviewer can compare).

## Global Constraints

- Plain DOM via `h()` from `src/ui/h.ts`, never `innerHTML` / `outerHTML` / `insertAdjacentHTML` (guarded by `tests/guards.test.ts`).
- Mount roots use `classList`, never `className` (the root is Obsidian's `.view-content`).
- Every feature at parity on desktop (hover), tablet and phone (tap); 44 px targets on touch.
- Layout parity tests place each feature id exactly once per layout (`placed(l)` equals `CHARACTER_FEATURES` / `NPC_FEATURES`).
- Plugin button rules need `.fe-sheet button.x` specificity (0,2,1) to beat Obsidian's `button:not(.clickable-icon)` and `.is-tablet button:not(.clickable-icon)`.
- Fixtures are INVENTED: never book/SRD prose or published stat blocks (the code is mirrored to a public repo). SRD ids that already exist in `src/content/srd` (cleric, owl, bless) may be referenced by id.
- Plain words for players who are not rules-savvy: no ids, no formula names, no abbreviations the player has to decode.
- Nothing race-, class-, feat- or item-specific in code (no `if (id === "monk")`).
- Existing notes without new fields behave exactly as today; nothing in this plan adds a note field.
- Commit messages conventional (`fix:`, `feat:`, `refactor:`, `test:`), one sentence why, last line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All existing tests keep passing (about 1500). Where a task changes text or order the spec asks to change, it names the existing assertion it updates; no other existing assertion is edited.
- Before every commit: `npm test`, `npm run typecheck` and `npm run build` all succeed.

## Review Focus

- A long rest or Good Rest while exhaustion stays at 4 or more and the character has a max-HP bonus: HP goes to half of the derived maximum (half of 48 is 24), never half of the stored 43. Test added in Task 3.
- An effect formula or scale placeholder the character cannot resolve (a name it does not have, a class missing from the compendium): the text falls back to words ("your plan count"), never throws and never prints `{...}` or `snake_case`. Test added in Task 2.
- A note that tracks a resource by hand under the same name as a derived one (the review's Channel Divinity): the sheet shows one row and the note's own `resources` entry is left exactly as stored. Test added in Task 12.
- Renaming a companion to an empty or blank name: the old name is kept and nothing is saved. Test added in Task 15.
- A cantrip step where every cantrip in the list is already known, or the search matches nothing: a plain sentence, not an empty box, and Next stays disabled with a reason. Test added in Task 6.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/core/words.ts` (new) | Shared plain-word helpers: `titleCase`, `plural`, `optionListLabel`, `formulaWords`. Pure, used by core and ui. | 1, 2 |
| `src/core/builder.ts` | Builder gear list grouped and named (`gearList`). | 5 |
| `src/core/levelup.ts`, `src/core/progression.ts` | Step and pending labels in words; language pick list. | 1, 8 |
| `src/core/derive.ts` | `ActorStats.hpFull` (derived max before halving). | 3 |
| `src/core/actions.ts` | New `renameCompanion` action. | 15 |
| `src/rules/rests.ts` | Rests heal to the derived max; previews only list what applies; rule titles in one vocabulary. | 3, 4 |
| `src/content/glossary.ts` | Hit dice wording in the rest vocabulary. | 4 |
| `src/ui/widgets.ts` | `describeEffects(e, ctx?)`, `actionWords`, `wordsCtx`, `restModeControl`, `playBadge`. | 2, 4, 17 |
| `src/ui/components.ts` | Death saves wording, identity missing marker, resources card dedupe, spell DC card, notes card, rests card. | 4, 12, 13, 17, 18 |
| `src/ui/layouts.ts` | Phone and tablet orders. | 11 |
| `src/ui/sheet.ts` | Tab count variable, toast from `ctl.toastItem`. | 11, 19 |
| `src/ui/controller.ts` | `say()`, `toastItem`, item import draft reset. | 14, 19 |
| `src/ui/panels.ts` | Night's-rest rows, Customize labels and rest choice, conditions search type. | 4, 9, 17 |
| `src/ui/levelup-ui.ts`, `src/ui/builder-ui.ts`, `src/ui/builder.ts` | Wizard frame, spell step rows, class page, builder pitches, language pick. | 6, 7, 8 |
| `src/ui/spells-ui.ts` | Slot rows, caster check, add-spell filter, cast panel. | 12, 13, 14, 16 |
| `src/ui/traits-ui.ts`, `src/ui/features-ui.ts` | Resource matching, words, labels. | 2, 12, 17 |
| `src/ui/combos-ui.ts` | Pool once per card, empty state, typed inputs. | 9, 12, 18 |
| `src/ui/additem-ui.ts`, `src/ui/companion-ui.ts`, `src/ui/creature-form.ts` | Pickers. | 14, 15 |
| `src/ui/compendium.ts` | Stale detail pane, typed search. | 9, 18 |
| `src/obsidian/character-view.ts` | Route `notify` to the sheet toast. | 19 |
| `styles.css` | Button specificity, narrow rows, sticky headers, tab grid, nav bar, toast corner, polish. | 7, 9, 10, 11, 19, 20 |
| `tests/ui/review-helpers.ts` (new) | One sheet setup over `homebrewRegistry` for this plan's DOM tests, all three layouts. | 2 onward |

---

### Task 1: One shared word module

Fixes item 7 ("Sleight Of Hand", "Smith'S Tools") and the plural part of item 14 ("Learn 1 cantrips", "Choose 1 tools", "Spend 1 Ki Points"), and gives choice lists a display name (item 3, "Fighter 1: Choose 1 (fighter-fighting-style)").

**Files:**
- Create: `src/core/words.ts`
- Modify: `src/core/builder.ts:9`, `src/core/levelup.ts:29`, `src/core/derive.ts:185`, `src/content/glossary.ts:72`, `src/ui/widgets.ts:9`, `src/ui/components.ts:32`, `src/ui/spells-ui.ts:197`, `src/ui/companion-ui.ts:58`, `src/core/progression.ts:243-245`, `src/ui/combos-ui.ts:41`
- Test: `tests/core/words.test.ts` (new); update `tests/core/levelup.test.ts:193` and `:247`

**Interfaces:**
- Produces (used by every later task and by P2-P5):
  - `titleCase(s: string): string` — hyphens become spaces; capitalises the first letter of the string and of each word that follows a space; never capitalises after an apostrophe; keeps `of, and, the, a, an, in, on, to, for, with, or, at, by` lower case unless first.
  - `plural(n: number, word: string): string` — `"1 cantrip"`, `"2 cantrips"`; `word` given in either form; for `n === 1` a trailing plural `s` on the last word is dropped (`"Ki Points"` gives `"1 Ki Point"`), words ending in `ss` are left alone; for `n !== 1` an `s` is added unless the last word already ends in `s`.
  - `optionListLabel(list: string, count: number, classId?: string): string` — strips a `<class>:` prefix, a leading `<class>-` part that repeats the class id (from the prefix or `classId`), and a trailing `-<digits>`; returns `"Choose a fighting style"` for count 1 (article `an` before a vowel) and `"Choose 2 fighting styles"` otherwise.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test** `tests/core/words.test.ts`

```ts
import { optionListLabel, plural, titleCase } from "../../src/core/words";
it("title case leaves apostrophes and small words alone", () => {
  expect(titleCase("sleight-of-hand")).toBe("Sleight of Hand");
  expect(titleCase("smith's tools")).toBe("Smith's Tools");
  expect(titleCase("the lay of the land")).toBe("The Lay of the Land");
  expect(titleCase("crossbow-bolt")).toBe("Crossbow Bolt");
});
it("plural counts in plain words", () => {
  expect(plural(1, "cantrips")).toBe("1 cantrip"); expect(plural(2, "cantrip")).toBe("2 cantrips");
  expect(plural(1, "Ki Points")).toBe("1 Ki Point"); expect(plural(3, "Ki Points")).toBe("3 Ki Points");
  expect(plural(1, "class")).toBe("1 class"); expect(plural(1, "tools")).toBe("1 tool");
});
it("option lists get a display name", () => {
  expect(optionListLabel("fighter:fighter-fighting-style", 1)).toBe("Choose a fighting style");
  expect(optionListLabel("fighter-fighting-style", 1, "fighter")).toBe("Choose a fighting style");
  expect(optionListLabel("stances", 2)).toBe("Choose 2 stances");
  expect(optionListLabel("metamagic-1", 1)).toBe("Choose a metamagic");
  expect(optionListLabel("eldritch-invocations", 1)).toBe("Choose an eldritch invocation");
});
```

- [ ] **Step 2: Run** `npx vitest run tests/core/words.test.ts` — Expected: FAIL, cannot resolve `src/core/words`.
- [ ] **Step 3: Implement `src/core/words.ts`** with the three signatures above. Singularising a list name for the label uses `plural(1, name)` minus the count.
- [ ] **Step 4: Replace every local copy.** Delete the `titleCase` / `titled` lambdas at the listed lines and import `titleCase` from `src/core/words` (widgets.ts re-exports it so existing `import { titleCase } from "./widgets"` keeps working). `companion-ui.ts:58` uses `titleCase(s.query.trim())`. In `progression.ts` the pending labels become `` `Learn ${...plural(op.cantrips, "cantrip")... plural(op.count, "spell")}` `` (joined with " and ", zero parts dropped) and `op.what === "option" ? optionListLabel(op.list ?? "", op.count, src.classId) : \`Choose ${plural(op.count, op.what)}\`` (so the Skirmisher fixture's pending list reads "Choose 2 skills", "Choose a stance", "Choose 1 expertise", "Choose a subclass"). In `combos-ui.ts:41` the spend button reads `` `Spend ${plural(r.cost, row.name)}` ``.
- [ ] **Step 5: Update the two assertions the new labels change** — `tests/core/levelup.test.ts:193` expects `/Choose 1 language still needs an answer/`, `:247` expects `/Choose a boon still needs an answer/`. (`progression.test.ts:72` "Choose 2 skills" is unchanged.)
- [ ] **Step 6: Run** `npm test` — Expected: PASS (all).
- [ ] **Step 7: Commit**

```bash
git add src/core/words.ts tests/core/words.test.ts src/core src/content/glossary.ts src/ui tests/core/levelup.test.ts
git commit -m "fix: one shared title-case and plural helper so skills, tools and choice labels read correctly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: No raw tokens or ids in player text

Fixes item 3: `{spark-breath-damage}`, "Speed + unarmored_movement", "Max HP + total", option-list ids. Screens: `desktop/korrin-tab-features`, `desktop/ren-tab-main-scrolled`, `desktop/tamsin-tab-features`.

**Files:**
- Create: `tests/ui/review-helpers.ts`
- Modify: `src/core/words.ts` (add `formulaWords`), `src/ui/widgets.ts` (`describeEffects`, `effectParts`, `effectTag`, `modWords`, `diceWords`; add `wordsCtx`, `actionWords`), `src/ui/traits-ui.ts:17` (`summaryOf`), `src/ui/features-ui.ts:171-179, 211-214`, `src/ui/details.ts:20-24, 96-101`
- Test: `tests/ui/plain-values.test.ts` (new)

**Interfaces:**
- Consumes: `titleCase` (Task 1); `evalFormula`, `fillDice` from `src/core/formula.ts`; `formulaVars(c, scales)` from `src/core/progression.ts`.
- Produces:
  - `formulaWords(f: string): string` in `src/core/words.ts` — `total`/`level` give "your level", `prof` "your proficiency bonus", `str`..`cha` "your Strength modifier" etc., any other single identifier `a_b` gives "your a b"; an expression with operators gives "an amount that grows with your level".
  - `interface WordsCtx { vars?: Record<string, number>; scales?: Record<string, string | number> }` and `wordsCtx(c: Character | undefined, st: ActorStats): WordsCtx` in widgets.ts (`{}` for an NPC).
  - `describeEffects(e: Effects, ctx?: WordsCtx): string`, `effectParts(e: Effects, ctx?: WordsCtx): string[]`, `effectTag(e: Effects, ctx?: WordsCtx): string`, `summaryOf(f: FeatureRow, ctx?: WordsCtx): string` — a formula modifier evaluates to a number when `ctx.vars` resolves it ("Speed +10"), else uses `formulaWords`; `{scale}` dice fill from `ctx.scales`, else read "your plan die".
  - `actionWords(a: NonNullable<FeatureRow["action"]>, st: ActorStats): string[]` — the facts the Actions card and the feature detail card print: `"costs 1 Focus"`, `"attack"`, filled damage dice, `"heals 2d4"`, `"WIS save DC 13"`.
  - `tests/ui/review-helpers.ts`: `export function sheet(layout: LayoutName, note: object, extra?: Record<string, unknown>[], host?: Partial<SheetHost>)` returning `{ ctl, root, q, all, click, type, saved, notices, host }`, built on `homebrewRegistry(extra)` with `rng: seeded(5)`, `body: ""`; and `export const LAYOUTS`. Every later DOM test in this plan uses it.

- [ ] **Step 1: Write the failing tests** `tests/ui/plain-values.test.ts`

```ts
// invented feat: a speed bonus from a scale-backed formula
const swift = { type: "5e-feat", name: "Swift Plans", grants: [{ op: "effect", effects: { modifiers: [{ target: "speed", value: "plan_count" }] } }] };
const note = { type: "5e-character", name: "Pip", classes: [{ class: "skirmisher", level: 3 }], feats: ["swift-plans"], abilities: { str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 8 }, hp: { max: 20, current: 20, temp: 0 } };
const BAD = [/\{[a-z0-9-]+\}/, /\b[a-z]+_[a-z_]+\b/, / \+ total\b/, /\((?:[a-z]+-)+[a-z]+\)/];
for (const layout of LAYOUTS) it(`no raw tokens on any tab (${layout})`, () => {
  const s = sheet(layout, note, [swift]);
  for (const t of s.all(".fe-tab")) { s.click(t); for (const re of BAD) expect(s.root.textContent, String(re)).not.toMatch(re); }
  s.ctl.open({ kind: "details", ref: "feature:class:skirmisher:3:feature-1" });   // Sudden Strike, damage "{plan-die}+2"
  for (const re of BAD) expect(s.q('[data-panel="details"]').textContent).not.toMatch(re);
});
it("formula modifiers evaluate with the character's numbers, else read as words", () => {
  const e = { modifiers: [{ target: "speed", value: "plan_count" }] };
  expect(describeEffects(e, { vars: { plan_count: 4 } })).toBe("Speed +4");
  expect(describeEffects(e)).toBe("Speed + your plan count");
  expect(describeEffects({ modifiers: [{ target: "hpMax", value: "total" }] })).toBe("Max HP + your level");
});
it("the Actions card fills scale dice", () => {
  const s = sheet("desktop", note, [swift]); s.click(s.q('[data-tab="features"]'));
  expect(s.q('[data-action="class:skirmisher:3:feature-1"] .fe-faint').textContent).toContain("costs 1 Focus · attack · 1d4+2");
});
```

(Verified against the current code: Pip's derived max with the invented feat is 48, Sudden Strike's key is `class:skirmisher:3:feature-1` and its raw damage is `{plan-die}+2`.)

- [ ] **Step 2: Run** `npx vitest run tests/ui/plain-values.test.ts` — Expected: FAIL (`{plan-die}+2` and `+ plan_count` in the text; `describeEffects` ignores the second argument).
- [ ] **Step 3: Implement** `formulaWords`, `WordsCtx`, `wordsCtx`, the `ctx` parameters and `actionWords`. Callers pass `wordsCtx(ctl.character, st)`: traits card rows and pinned traits (`traits-ui.ts`), Features card rows and Actions card (`features-ui.ts`), feature detail card (`details.ts` `featureCard`; `effectLines` uses `effectParts` for formula modifiers instead of `` `${m.target} ${m.value}` ``). An evaluation error falls back to words.
- [ ] **Step 4: Add the Review Focus test** to the same file: `describeEffects({ modifiers: [{ target: "speed", value: "no_such_scale" }] }, { vars: {} })` returns `"Speed + your no such scale"` and does not throw; a dice placeholder with no scale (`diceWords("{ghost-die}")` through an `extraDamage` effect) reads "your ghost die".
- [ ] **Step 5: Run** `npm test` — Expected: PASS; `tests/ui/leveling.test.ts:210` ("costs 1 Focus") still passes.
- [ ] **Step 6: Commit** `fix: resolve scale dice and formula names before showing them so players never see ids` (+ attribution line).

---

### Task 3: Rests heal to the derived maximum

Fixes "A Good Rest heals to the note's stored maximum instead of the derived maximum (43 instead of 48)" (also long rest).

**Files:**
- Modify: `src/core/derive.ts:54, 104-107, 266, 288` (add `hpFull`), `src/rules/rests.ts:6, 53, 66`
- Test: `tests/rules/rests-derived-max.test.ts` (new)

**Interfaces:**
- Produces: `ActorStats.hpFull: number` — max HP after every additive bonus, before halving or zeroing effects (characters and creatures). `hp` keeps its exact shape (existing `toEqual` tests on `hp` stay valid).
- Consumes: `RestCtx.stats` (existing).

- [ ] **Step 1: Write the failing test**

```ts
// invented feat: +1 max HP per level
const stout = { type: "5e-feat", name: "Stout Heart", grants: [{ op: "effect", effects: { modifiers: [{ target: "hpMax", value: "total" }] } }] };
const r = homebrewRegistry([stout]);
const c = (o: object) => { const p = parseNote({ ...thalia, feats: ["stout-heart"], ...o }); if (p.kind !== "character") throw new Error(); return p.value; };
const ctx = (ch: Character, rules: Record<string, boolean>) => ({ c: ch, stats: deriveCharacter(ch, { registry: r }), registry: r, rules });
it("long rest heals to the derived maximum", () => {
  const ch = c({ hp: { max: 43, current: 10, temp: 0 } }), L = activeRests({ "rest-standard": true }).find(x => x.id === "long")!;
  expect(ctx(ch, { "rest-standard": true }).stats.hpFull).toBe(48);
  expect(L.preview(ctx(ch, { "rest-standard": true }))).toContain("HP to 48");
  const v = L.apply(ctx(ch, { "rest-standard": true })).value;
  expect(v.hp).toEqual({ max: 43, current: 48, temp: 0 });   // the stored max is untouched
});
it("a Good Rest heals to the derived maximum", () => {
  const ex = { "rest-excursion": true }, n = activeRests(ex).find(x => x.id === "night")!;
  expect(n.apply(ctx(c({ rest: { nightsInPlace: 2 }, hp: { max: 43, current: 5, temp: 0 } }), ex), { samePlace: true }).value.hp.current).toBe(48);
});
it("exhaustion that stays at 4 or more halves the derived maximum", () => {
  const ch = c({ conditions: { exhaustion: 5 }, hp: { max: 43, current: 5, temp: 0 } });
  expect(activeRests({ "rest-standard": true }).find(x => x.id === "long")!.apply(ctx(ch, { "rest-standard": true })).value.hp.current).toBe(24);
});
```

- [ ] **Step 2: Run** — Expected: FAIL (`hpFull` undefined; current 43).
- [ ] **Step 3: Implement** `hpFull` (the `full` value `hpOf` already computes, exposed on both derive paths) and `hpMaxAfterExhaustion(ctx)` from `ctx.stats.hpFull`. `spendHitDie` keeps capping at `stats.hp.max` (the current maximum).
- [ ] **Step 4: Run** `npm test` — Expected: PASS (existing "HP to 43" tests use characters without a bonus).
- [ ] **Step 5: Commit** `fix: rests heal to the derived maximum HP so bonuses like a +1 per level feat count`.

---

### Task 4: One rest vocabulary and one rest-mode control

Fixes item 11 (previews list what comes back and nothing that does not apply; one set of terms; one control; night's-rest panel uses one control type) and the phone rest-mode wrap (`phone/korrin-tab-combat-scrolled`).

**Files:**
- Modify: `src/rules/rests.ts:53, 111-112`, `src/content/glossary.ts:58, 61-62`, `src/ui/widgets.ts` (add `restModeControl`), `src/ui/components.ts:411-420`, `src/ui/panels.ts:224-255`, `styles.css:268-274`
- Test: `tests/ui/rest-words.test.ts` (new); update `tests/ui/rest-switch.test.ts:30`

**Interfaces:**
- Produces:
  - `restModeControl(ctl: SheetController): HTMLElement` in widgets.ts — a `.fe-seg.fe-rest-mode` group of two `button.fe-mode-opt` with `data-rest-mode="standard" | "excursion"`, `aria-pressed`, texts `"Normal"` and `"Hexploration"`, followed by one `.fe-faint[data-rest-hint]` line describing the chosen mode: `"Short and long rests."` or `"A night's rest each night; 3 nights in one place (or a safe haven) is a Good Rest."`. The Hexploration button also carries `data-rule="rest-excursion"`. P2's Settings card renders this same element.
  - Rule titles: `restStandard.title = "Normal rests (short and long)"`, `restExcursion.title = "Hexploration (night's rest and Good Rest)"`.
- Consumes: `ctl.setRule`, `ctl.rules()`.

- [ ] **Step 1: Write the failing test** `tests/ui/rest-words.test.ts`

```ts
for (const layout of LAYOUTS) describe(`rest words (${layout})`, () => {
  it("the Rest card and Customize use the same single two-way control", () => {
    const s = sheet(layout, thalia);
    const opts = s.all('[data-feature="rests"] [data-rest-mode]');
    expect(opts.map(o => o.textContent)).toEqual(["Normal", "Hexploration"]);
    expect(s.q('[data-feature="rests"] [data-rest-hint]').textContent).toBe("Short and long rests.");
    s.ctl.setEditing(true); s.ctl.open({ kind: "customize" });
    const panel = s.q('[data-panel="customize"]');
    expect(panel.querySelectorAll("[data-rest-mode]")).toHaveLength(2);
    expect(panel.querySelector('[data-rule="rest-standard"]')).toBeNull();   // no second, independent switch
    expect(panel.textContent).not.toMatch(/Excursion|Standard rests/);
  });
  it("the night's rest panel uses label-left switch rows for both options", () => {
    const s = sheet(layout, thalia); s.ctl.setRule("rest-excursion", true); s.ctl.open({ kind: "rest", id: "night" });
    const rows = s.all('[data-panel="rest"] .fe-rest-opt');
    expect(rows.map(r => r.firstElementChild!.textContent)).toEqual(["Same place as last night", "Resting in a safe haven (GM decides)"]);
    expect(rows.every(r => r.lastElementChild!.matches("button.fe-switch[role=switch]"))).toBe(true);
    expect(s.q('[data-panel="rest"] input[type="checkbox"]')).toBeNull();
  });
});
it("a long rest preview lists spell slots only for a character who has slots", () => {
  const s = sheet("desktop", { ...tester, classes: [{ class: "brawler", level: 1 }] }, [brawler]);   // invented spell-less class, as in Task 13
  expect(s.ctl.restPreview("long")).not.toContain("All spell slots");
  expect(sheet("desktop", thalia).ctl.restPreview("long")).toContain("All spell slots");
});
```

(`tester` is a minimal invented note and `brawler` an invented class `{ type: "5e-class", name: "Brawler", hitDie: 10, saves: ["str", "con"], levels: { 1: [] } }`, both defined at the top of the test file; `thalia` is `tests/fixtures/notes.ts`.)

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** `bigParts` pushes "All spell slots" only when `ctx.stats.slots.length`. `hitDiceRecharge` and `HIT_DICE_EXCURSION` say "night's rest" and "Good Rest" exactly as above. `customizePanel` skips the `rest-standard` / `rest-excursion` modules in its switch list and shows `restModeControl(ctl)` under a "Resting" title. `restPanel`'s "Same place as last night" becomes a `label.fe-kv.fe-rest-opt` with the text first and a `button.fe-switch[role=switch][data-opt=same-place]` last, like the safe-haven row (which also gets `fe-rest-opt`). CSS: `.fe-rest-mode` no longer wraps (`flex-wrap: nowrap`), buttons share the width (`flex: 1 1 0`).
- [ ] **Step 4: Update** `tests/ui/rest-switch.test.ts:30` to expect `["Normal", "Hexploration"]` (the spec asks for one short choice; the explanation moved to the hint line).
- [ ] **Step 5: Run** `npm test` — Expected: PASS (`tests/ui/sheet.test.ts:119` still clicks `[data-rule="rest-excursion"]`).
- [ ] **Step 6: Commit** `fix: one name and one two-way control for rest mode so Customize and the Rest card agree`.

---

### Task 5: Builder equipment reads as a short list

Fixes "The builder's equipment page lists stacked gear once per piece ('Crossbow Bolt' twenty times)" (`desktop/builder-10`, `desktop/builder-11`).

**Files:**
- Modify: `src/core/builder.ts:147-176`, `src/ui/builder-ui.ts:236-246`
- Test: `tests/core/builder-gear.test.ts` (new)

**Interfaces:**
- Produces: `gearList(ids: string[], r: Registry): string` in `src/core/builder.ts` — counts repeated ids in first-seen order, names each from the registry item name (else `titleCase(id)`), and joins with ", "; repeats read `"Crossbow Bolt x20"`.
- Consumes: `titleCase` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
const r = homebrewRegistry();
it("groups repeated gear and uses item names", () => {
  expect(gearList(["dagger", "bolt-x", "bolt-x", "bolt-x", "smiths-tools-x"], r)).toBe("Dagger, Bolt X x3, Smiths Tools X");
});
it("the builder's option buttons and summary use the grouped list", () => {
  const squire = { type: "5e-class", name: "Squire", hitDie: 10, saves: ["str", "con"], equipment: [["dagger", "pebble", "pebble", "pebble"]], levels: { 1: [] } };
  // drive BuilderController to the equipment page as tests/ui/builder.test.ts does, then:
  // expect(q('[data-equip="0"]').textContent).toContain("Pebble x3");
  // expect(preview.summary).toContain("Equipment: Dagger, Pebble x3");
});
```

(Write the second test fully using the `setup()` pattern of `tests/ui/builder.test.ts`; `pebble` is an invented id with no compendium entry.)

- [ ] **Step 2: Run** — Expected: FAIL (`gearList` missing).
- [ ] **Step 3: Implement** `gearList`; `equipmentPage` and `buildCharacter`'s summary use it. The inventory itself keeps one stacked entry per item (as `addItems` already does).
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `fix: the builder lists starting gear once with a count so twenty bolts are one line`.

---

### Task 6: Spell steps show what can be picked, cantrips first

Fixes "The builder's 'learn cantrips' step lists leveled spells first" and item 4 ("show only cantrips on that step; fix '0 of 0'"; `desktop/builder-09`, `desktop/builder-09-modal-end`, `phone/builder-09`). Applies to level-up too (same page).

**Files:**
- Modify: `src/ui/levelup-ui.ts:127-163`
- Test: `tests/ui/spell-step.test.ts` (new)

**Interfaces:**
- Produces: `spellStepRows(s: Extract<Step, { kind: "spells" }>, query: string): StepOption[]` exported from levelup-ui.ts — when `s.count === 0` only level-0 options; otherwise cantrips first, then by level, then name; options disabled because they need a higher slot (`level > s.maxLevel`) are left out; "Already known" options stay (marked). No row cap when `s.count === 0`.
- Produces: `spellStepHeading(s, nCantrips: number, nSpells: number): string` — `"Learn 3 cantrips: 1 of 3 chosen"`, `"Learn 2 spells: 0 of 2 chosen"`, or both joined with "; " when both are owed; never a "0 of 0" half.

- [ ] **Step 1: Write the failing test**

```ts
const opt = (id: string, level: number, disabled?: string) => ({ id, name: id, level, ...(disabled ? { disabled } : {}) });
const step = (count: number, cantrips: number) => ({ kind: "spells", key: "k", label: "Spells", source: "Test 1", count, cantrips, swap: 0, maxLevel: 1,
  options: [opt("zap", 1), opt("glow", 0), opt("blast", 3, "Needs a level 3 slot"), opt("ash", 0), opt("bolt", 1, "Already known")] }) as const;
it("a cantrip-only step lists only cantrips", () => expect(spellStepRows(step(0, 2), "").map(o => o.id)).toEqual(["ash", "glow"]));
it("a mixed step lists cantrips first and leaves out spells the character cannot cast", () =>
  expect(spellStepRows(step(1, 2), "").map(o => o.id)).toEqual(["ash", "glow", "bolt", "zap"]));
it("the heading never says 0 of 0", () => {
  expect(spellStepHeading(step(0, 2), 1, 0)).toBe("Learn 2 cantrips: 1 of 2 chosen");
  expect(spellStepHeading(step(1, 2), 2, 0)).toBe("Learn 2 cantrips: 2 of 2 chosen; learn 1 spell: 0 of 1 chosen");
});
it("nothing left to learn says so", () => {
  const s = { ...step(0, 1), options: [opt("glow", 0, "Already known")] };
  // render spellsPage through the level-up wizard (pattern of tests/ui/leveling.test.ts) and expect the list text
  // "Every cantrip on this list is already known." and Next disabled.
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both helpers and use them in `spellsPage`; the empty-list sentence is `"Every cantrip on this list is already known."` (or `"No spells match."` when a search is typed). The search input gets `type: "search"`.
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/leveling.test.ts` and `tests/ui/builder.test.ts` pick spells by `data-spell`, unaffected by order).
- [ ] **Step 5: Commit** `fix: spell steps list cantrips first and only castable spells so the right picks are visible`.

---

### Task 7: Wizard frame: footer that covers, Create after Back, steady step counter

Fixes "The level-up and builder bottom bar lets content show through underneath", item 12 "stable step counts" and "Create after Back" (`desktop/flow-level-up-01`, `-02`, `desktop/builder-01`..`-04`, `desktop/builder-11`).

**Files:**
- Modify: `src/ui/levelup-ui.ts:178-202`, `src/ui/builder-ui.ts:248-294`, `styles.css:94`
- Test: `tests/ui/wizard-frame.test.ts` (new)

**Interfaces:**
- Produces: `stepCounter(page: number, total: number, known: boolean): string` in levelup-ui.ts — `"Step 3 of 7"` when `known`, else `""`. The counter is known once the class is picked (level-up) or once a class is picked in the builder; before that the header shows the stage name only.
- Produces: builder name page renders no Create button in its body; the footer `.fe-lu-nav` holds `[data-act="bd-back"]` then `[data-act="bd-create"]` on the last page (Next hidden).

- [ ] **Step 1: Write the failing test**

```ts
it("the level-up counter appears after the class pick and never changes total while paging", () => {
  // tests/ui/leveling.test.ts setup at level 1: open level up
  // expect(q(".fe-levelup .fe-kv .fe-faint").textContent).toBe("")
  // click [data-class="skirmisher"]; const first = counter text; Next through every page collecting counter totals
  // expect(new Set(totals).size).toBe(1)
});
it("the builder keeps Create on the footer after Back", () => {
  // walk tests/ui/builder.test.ts to the name page
  // const nav = q(".fe-lu-nav"); expect([...nav.querySelectorAll("button")].map(b => b.dataset.act)).toEqual(["bd-back", "bd-create"]);
});
it("the sticky footer paints over the panel's bottom padding", () => {
  expect(css).toMatch(/\.fe-lu-nav \{[^}]*position: sticky; bottom: 0;[^}]*z-index: 2;[^}]*box-shadow: 0 18px 0 var\(--fe-surface\)/);
  expect(css).toMatch(/\.fe-builder \{[^}]*--fe-surface: var\(--modal-background, var\(--background-primary\)\)/);
});
```

(Fill the two commented tests in full using the existing `setup()` patterns; `css` is `readFileSync("styles.css", "utf8")`.)

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Builder: total pages before a class is picked are not shown; after the pick, `pages().length` is stable because race/background steps are already known (verify by test). `.fe-sheet { --fe-surface: var(--background-primary) }`, builder modal overrides it; `.fe-lu-nav` background `var(--fe-surface)`, `z-index: 2`, `box-shadow: 0 18px 0 var(--fe-surface)` (18 px is `.fe-panel-body`'s bottom padding).
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/builder.test.ts` clicks `[data-act="bd-create"]` wherever it is).
- [ ] **Step 5: Commit** `fix: wizard footers cover what scrolls under them and the step count stops moving`.

---

### Task 8: Wizard choices a new player can read

Fixes item 12: ineligible multiclass options collapsed with one reason, builder race/class descriptions, language picker (`desktop/flow-level-up-01`, `desktop/builder-01`, `desktop/builder-03`, `desktop/builder-06`).

**Files:**
- Modify: `src/ui/levelup-ui.ts:42-48`, `src/ui/builder-ui.ts:186-234`, `src/ui/builder.ts` (view state), `src/core/levelup.ts:139-154` (languages)
- Create: `src/ui/builder-pitch.ts`
- Test: `tests/ui/wizard-choices.test.ts` (new)

**Interfaces:**
- Produces:
  - Class page: eligible classes as today; ineligible ones inside `details[data-ineligible]` whose `summary` reads `"Other classes (need higher scores)"` followed by the reasons every ineligible class shares (once), and each row shows its own first remaining reason as `.fe-muted` (no `.fe-warn` on the class page).
  - `originPitch(e: Entry<GrantsData>, r: Registry): string` and `classPitch(e: Entry<ClassData>): string` in builder-pitch.ts — one line from data only: race `"Speed 25 ft · Darkvision 60 ft · +2 Constitution"`, class `"Hit die d8 · Saves DEX, INT · 2 skills"`; shown as the choice button's detail line. An "About" button per row (`data-act="about"`, `data-about=<id>`) toggles `entryCard(reg, e)` under it; open id kept in `BuilderController.view.about?: string`.
  - Language steps with no `from` list offer `LANGUAGE_CHOICES` (exported from `src/core/levelup.ts`: Common, Dwarvish, Elvish, Giant, Gnomish, Goblin, Halfling, Orc, Abyssal, Celestial, Draconic, Deep Speech, Infernal, Primordial, Sylvan, Undercommon) as pick buttons with "Already have" disabled, plus one `input[type=text][data-act=other-language]` "Another language" that adds a typed name.

- [ ] **Step 1: Write the failing test**

```ts
it("ineligible classes are collapsed with one reason each and the shared reason once", () => {
  // tests/ui/leveling.test.ts "class page explains multiclass prerequisites" setup
  // const det = q('[data-panel="level-up"] details[data-ineligible]');
  // expect(det.querySelector("summary")!.textContent).toContain("Leaving Skirmisher needs DEX 13 or INT 13");
  // expect(det.contains(q('[data-class="wizard"]'))).toBe(true); expect(q('[data-panel="level-up"] .fe-warn')).toBeNull();
});
it("race and class choices carry a one-line pitch", () => {
  expect(originPitch(reg.get("race", "skink")!, reg)).toBe("Speed 25 ft · Darkvision 60 ft");
  expect(classPitch(reg.get("class", "skirmisher")!)).toBe("Hit die d8 · Saves DEX, INT · 2 skills");
});
it("a free language choice is a pick list, not blank boxes", () => {
  // linguist feat step (tests/ui/leveling.test.ts fixture) with no from: buttons [data-opt="dwarvish"] exist; typing in [data-act="other-language"] adds it
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified. Keep `[data-class=...]` buttons (disabled ones too) so `tests/ui/leveling.test.ts:132-134` passes unchanged.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: wizard choices explain themselves with short pitches, collapsed ineligible classes and a language list`.

---

### Task 9: Obsidian's CSS cannot restyle the plugin's buttons, tabs or inputs

Fixes item 5 (inputs without a `type`) and item 6 (tabs render as filled buttons; small buttons become pills/circles on mobile). Screens: `desktop/flow-combo-form-01`, `desktop/compendium-01`, `desktop/korrin-tab-main` (tabs).

**Files:**
- Modify: `styles.css` (lines 6-12, 21-23, 32-34, 38-43, 71-73), `src/ui/combos-ui.ts:110-111`, `src/ui/companion-ui.ts:45`, `src/ui/panels.ts:201`, `src/ui/levelup-ui.ts:95, 121, 161`, `src/ui/builder-ui.ts:260, 264`, `src/ui/compendium.ts:126`
- Test: `tests/ui/obsidian-css.test.ts` (new), `tests/guards.test.ts` (add one guard)

**Interfaces:**
- Produces (a rule every later plan follows): a style for a plugin button class that sets `background`, `background-color`, `padding`, `border`, `border-radius`, `box-shadow` or `height` uses a selector of specificity at least (0,2,1), normally `.fe-sheet button.fe-x`. Text inputs are `type: "text"`, search boxes `type: "search"`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ui/obsidian-css.test.ts
const css = readFileSync("styles.css", "utf8");
const BUTTON = ["fe-btn", "fe-roll", "fe-tab", "fe-pip", "fe-switch", "fe-chip-add", "fe-mode-opt", "fe-choice", "fe-crow-btn", "fe-trait-head", "fe-effects-head", "fe-effect-head", "fe-qty-btn", "fe-toggle-btn", "fe-crit", "fe-dmg", "fe-menu-btn", "fe-item-menu-btn"];
const CONTESTED = /(^|;)\s*(background(-color)?|padding|border(-radius)?|box-shadow|height)\s*:/;
/** [ids, classes+attributes+pseudo-classes, elements] of one selector. */
function specificity(sel: string): [number, number, number] { /* count #x, .x / [x] / :x (not ::x, :not() counts its argument), and tag names */ }
it("every contested button style outranks Obsidian's button rules", () => {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const sel of m[1].split(",").map(s => s.trim())) {
    const last = sel.split(/\s+/).at(-1)!;
    if (sel.includes("::") || !BUTTON.some(c => new RegExp(`\\.${c}(?![\\w-])`).test(last)) || !CONTESTED.test(m[2])) continue;
    const [a, b, c] = specificity(sel);
    expect(a > 0 || b > 2 || (b === 2 && c >= 1), sel).toBe(true);
  }
});
it("chips that are buttons keep their pill shape", () => expect(css).toMatch(/\.fe-sheet button\.fe-chip \{[^}]*border-radius: 12px/));
it("tabs are underlined text, not filled buttons", () => expect(css).toMatch(/\.fe-sheet button\.fe-tab \{[^}]*background: none;[^}]*box-shadow: none;/));

// tests/guards.test.ts, inside "architecture guards"
it("every text box has a type, so Obsidian styles it", () => {
  for (const f of files("src/ui")) for (const call of readFileSync(f, "utf8").split('h("input"').slice(1))
    expect(call.slice(0, Math.max(0, call.indexOf("on:")) || 300), f).toMatch(/type:/);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/obsidian-css.test.ts tests/guards.test.ts` — Expected: FAIL, naming `.fe-tab`, `.fe-pip`, `.fe-switch`, `.fe-chip-add`, `.fe-roll`, `.fe-btn.is-on`, `.fe-seg .fe-btn` and the untyped inputs.
- [ ] **Step 3: Implement.** Write the specificity helper in the test. Move each flagged declaration to a `.fe-sheet button.<class>` (or `.fe-sheet .fe-seg button.fe-btn`) selector; keep non-contested declarations where they are. Add `type: "text"` / `type: "search"` to the listed inputs.
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/tablet.test.ts` regexes on `.fe-tablet button.fe-btn, ...` and `button.fe-switch { width: 68px; height: 44px;` are unchanged).
- [ ] **Step 5: Commit** `fix: plugin buttons, tabs and text boxes keep their own look under Obsidian's theme CSS`.

---

### Task 10: Narrow rows wrap by word (phone and tablet)

Fixes item 1, P1 (`phone/tamsin-tab-gear-full`, `phone/tamsin-tab-spells-scrolled`, `phone/ren-tab-combos`, `phone/flow-roll-toast-01`). This lands before P3's one-line attack row (spec adjustment).

**Files:**
- Modify: `styles.css:180-189` and the narrow-layout block
- Test: `tests/ui/narrow-rows.test.ts` (new)

**Interfaces:**
- Produces (P3 relies on it): on `.fe-mobile` and `.fe-tablet`, `.fe-inv > .fe-grow`, `.fe-attack > .fe-grow` and `.fe-trait > .fe-grow` take `flex: 1 1 100%` (controls drop to the next line); `.fe-step > .fe-grow` takes `flex: 1 1 10em; min-width: 10em` and `.fe-step-ctl` takes `flex: 1 1 100%`; `.fe-attack > .fe-grow` has `min-width: 7em` on every layout. No rule in styles.css uses `overflow-wrap: anywhere`; text blocks use `overflow-wrap: break-word`.

- [ ] **Step 1: Write the failing test**

```ts
const css = readFileSync("styles.css", "utf8");
it("names never break mid-word", () => {
  expect(css).not.toContain("overflow-wrap: anywhere");
  expect(css).toMatch(/\.fe-inv-name, \.fe-spell-name[^{]*\{[^}]*overflow-wrap: break-word/);
});
it("on phone and tablet the name takes its own line and the buttons sit under it", () => {
  for (const l of ["mobile", "tablet"]) for (const row of ["inv", "attack", "trait"])
    expect(css).toMatch(new RegExp(`\\.fe-${l} \\.fe-${row} > \\.fe-grow[^{]*\\{[^}]*flex: 1 1 100%`));
  expect(css).toMatch(/\.fe-mobile \.fe-step-ctl[^{]*\{[^}]*flex: 1 1 100%/);
  expect(css).toMatch(/\.fe-attack > \.fe-grow \{[^}]*min-width: 7em/);
});
it("rows keep their name element as the first .fe-grow child so the rule applies", () => {
  const s = sheet("mobile", { ...thalia, inventory: [{ id: "warhammer", equipped: true }] });
  s.click(s.q('[data-tab="gear"]'));
  expect(s.q('[data-feature="inventory"] .fe-inv').firstElementChild!.classList.contains("fe-grow")).toBe(true);
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the CSS (one grouped rule per behaviour, selectors in the order the regexes read). Spell rows whose first child is the prepared dot get the dot moved inside `.fe-grow` (`src/ui/spells-ui.ts:102-105`) so the name line starts the row.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `fix: on narrow screens names get their own line instead of breaking mid-word`.

---

### Task 11: Phone and tablet order, sticky headers, a tab strip that fits

Fixes item 2 (phone/tablet Combat order, death saves beside HP, compact sticky phone header), the 390 px tab strip, and from item 15 the tablet sticky header gap and tablet column balance. Screens: `phone/korrin-tab-combat-full`, `tablet/korrin-tab-main`, `tablet/korrin-tab-main-scrolled`.

**Files:**
- Modify: `src/ui/layouts.ts:30-41, 62-74`, `src/ui/sheet.ts:175-176`, `styles.css:15, 21-23, 165`
- Test: `tests/ui/phone-order.test.ts` (new); update `tests/ui/tablet.test.ts:56-60` (Main columns)

**Interfaces:**
- Produces (P2 inserts `attack-options` directly after `attacks` and `settings` directly after `rests` in both lists):
  - `MOBILE` combat column: `["hp-controls", "death-saves", "attacks", "resources", "rations", "toggles", "pinned-spells", "pinned-combos", "spell-dc", "spell-slots", "coins", "traits", "hit-dice", "rests"]`.
  - `TABLET` main columns: `["abilities", "saves", "skills", "passive-perception", "traits"]` and `["hp-controls", "death-saves", "attacks", "resources", "rations", "toggles", "pinned-spells", "pinned-combos", "coins", "hit-dice", "rests", "active-effects"]`.
  - `nav.fe-tabs` carries `style="--fe-tabs: <count>"`.
- Consumes: `placed()`, `CHARACTER_FEATURES`.

- [ ] **Step 1: Write the failing test**

```ts
const css = readFileSync("styles.css", "utf8");
it("phone combat puts HP controls, death saves, attacks and resources first", () =>
  expect(MOBILE.tabs[0].columns[0].slice(0, 4)).toEqual(["hp-controls", "death-saves", "attacks", "resources"]));
it("tablet balances its columns: features under the checks, rest in the fight column", () => {
  const [left, right] = TABLET.tabs[0].columns;
  expect(left.at(-1)).toBe("traits"); expect(right.slice(0, 4)).toEqual(["hp-controls", "death-saves", "attacks", "resources"]);
});
it("the phone header stays put and covers the pane's top padding (tablet too)", () => {
  expect(css).toMatch(/\.fe-mobile \.fe-pinned \{[^}]*position: sticky; top: 0;/);
  expect(css).toMatch(/\.fe-tablet \.fe-pinned, \.fe-mobile \.fe-pinned \{[^}]*box-shadow: 0 -10px 0 var\(--background-primary\)/);
});
it("the phone tab strip is a grid of equal columns, never a sideways scroll", () => {
  expect(css).toMatch(/\.fe-mobile \.fe-tabs \{[^}]*display: grid; grid-template-columns: repeat\(var\(--fe-tabs\), minmax\(0, 1fr\)\);[^}]*overflow-x: visible/);
  const s = sheet("mobile", thalia); expect(s.q("nav.fe-tabs").style.getPropertyValue("--fe-tabs")).toBe(String(s.all(".fe-tab").length));
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the two orders, the `--fe-tabs` style, and the CSS: `.fe-mobile .fe-pinned` sticky (z-index 5, background-primary, compact gap `4px 10px`, identity label one line with ellipsis); the shared box-shadow rule for both layouts (the sheet's padding is 10 px); phone tab buttons `min-width: 0; padding: 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- [ ] **Step 4: Update** `tests/ui/tablet.test.ts:56-60` to the new Main columns (spec item 2 and item 15 change this order). `tests/ui/hexploration.test.ts:35` (rations right after resources) and `tests/ui/inventory-coins.test.ts:12-16` (coins on Main) still hold.
- [ ] **Step 5: Run** `npm test` — PASS (parity tests unchanged: every id still placed once).
- [ ] **Step 6: Commit** `fix: phone and tablet show HP, death saves, attacks and resources first under a header that stays put`.

---

### Task 12: One resource convention

Fixes item 8: "N of M left" plus boxes everywhere (slots included), duplicates removed (Channel Divinity twice), charges counted, the combo pool shown once. Screens: `desktop/tamsin-tab-main`, `desktop/tamsin-tab-spells`, `desktop/korrin-tab-main-scrolled`, `desktop/ren-tab-combos`.

**Files:**
- Modify: `src/ui/components.ts:392-410`, `src/ui/spells-ui.ts:110-113`, `src/ui/traits-ui.ts:64-74`, `src/ui/combos-ui.ts:37-44, 64-75`
- Test: `tests/ui/resource-convention.test.ts` (new)

**Interfaces:**
- Produces: `slotRows(ctl: SheetController, st: ActorStats): HTMLElement[]` in spells-ui.ts — one `div.fe-kv.fe-res-row[data-slot=<level>]` per slot level: `"Level 1 slots: 3 of 4 left"` / `"Pact slots (level 2): 1 of 2 left"` plus pips. Used by the spell-slots card and the Spells tab header (replaces `"1: 3/4  2: 3/3"`).
- Produces: resources card hides a manual `c.resources[i]` whose `slug(name)` equals a derived resource id; charged item rows read `"<Item> charges: 2 of 3 left"`; a trait row finds its resource by `slug(name without a trailing "(...)")` as well as by `slug(name)`.
- Produces: a combo card shows each resource its steps spend once, as `div.fe-combo-pool[data-pool=<id>]` ("Ki: 5 of 5 left" plus pips) under the title; steps keep only the Spend button.

- [ ] **Step 1: Write the failing test**

```ts
for (const layout of LAYOUTS) describe(`resources (${layout})`, () => {
  it("spell slots say how many are left", () => {
    const s = sheet(layout, thalia);
    expect(s.all('[data-feature="spell-slots"] [data-slot]').map(r => r.querySelector(".fe-grow")!.textContent))
      .toEqual(["Level 1 slots: 3 of 4 left", "Level 2 slots: 3 of 3 left", "Level 3 slots: 1 of 2 left"]);
  });
  it("a hand-tracked resource with a derived twin shows once, and the note keeps its entry", () => {
    // invented class feature: { op: "resource", name: "Channel Divinity", max: 1, reset: "short" } on a homebrew class, plus the note's manual Channel Divinity
    // expect rows whose text starts with "Channel Divinity" to have length 1
    // expect(s.ctl.character!.resources).toEqual(note.resources)
  });
  it("charged items count their charges", () => { /* spark-rod style invented item: text "Spark Rod charges: 3 of 3 left" */ });
  it("a feature named with a use count finds its resource", () => {
    // invented class: feature "Burst (1 use)" and resource "Burst": the trait row has [data-resource="burst"]
  });
  it("a combo shows a resource's pool once, not on every step", () => {
    // two steps spending "Focus": one [data-pool="focus"], zero step-level "of ... left" chips
  });
});
```

(Fill the commented tests with invented homebrew classes added through `sheet(layout, note, [extraClass])`.)

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified. Nothing is written to the note when a duplicate is hidden.
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/pins.test.ts:77` "Spark Rod charges" still matches; `tests/ui/resource-use.test.ts:37` "2 of 2 left" still matches).
- [ ] **Step 5: Commit** `fix: every tracker reads "N of M left" with boxes, once, so players can trust the count`.

---

### Task 13: Non-casters get no spell clutter; loose text sits in cards

Fixes item 9 (`desktop/ren-tab-main`, `desktop/korrin-tab-main`, `desktop/ren-tab-spells`).

**Files:**
- Modify: `src/ui/components.ts:389-394`, `src/ui/spells-ui.ts:110-144`, `src/ui/combos-ui.ts:87-93`, `styles.css` (sub-heading margin)
- Test: `tests/ui/non-caster.test.ts` (new)

**Interfaces:**
- Produces: `castsSpells(ctl: SheetController, st: ActorStats): boolean` in spells-ui.ts — true when the character has spellcasting, any own spell, or any spell from an equipped item.
- Produces: `spell-dc` renders as a `card("Spellcasting", ...)`; for a non-caster the `spell-dc`, `spell-slots` and `pinned-spells` elements are present but `hidden` (parity tests count presence). The Spells tab for a non-caster shows one `.fe-faint[data-no-spells]` sentence: `"<Name> does not cast spells. Spells from items or feats will show here."` and keeps "+ Add spell". `pinned-combos` renders inside a `.fe-card` with the "Combos" title.

- [ ] **Step 1: Write the failing test**

```ts
// invented class with no spells at all (the Skirmisher fixture grants a spell at level 1, so it is not used here)
const brawler = { type: "5e-class", name: "Brawler", hitDie: 10, saves: ["str", "con"], levels: { 1: [{ op: "feature", name: "Thick Skin", text: "Shrug it off." }] } };
const fighterish = { type: "5e-character", name: "Brann", classes: [{ class: "brawler", level: 1 }], abilities: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 8 }, hp: { max: 10, current: 10, temp: 0 } };
for (const layout of LAYOUTS) it(`a non-caster sees no spell cards (${layout})`, () => {
  const s = sheet(layout, fighterish, [brawler]);
  for (const f of ["spell-dc", "spell-slots", "pinned-spells"]) expect(s.q(`[data-feature="${f}"]`).hidden, f).toBe(true);
  expect(s.q('[data-feature="spells"] [data-no-spells]').textContent).toBe("Brann does not cast spells. Spells from items or feats will show here.");
  expect(s.root.textContent).not.toContain("No spellcasting");
});
it("the spell DC line sits in a card", () => {
  const s = sheet("desktop", thalia); expect(s.q('[data-feature="spell-dc"]').classList.contains("fe-card")).toBe(true);
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified; `.fe-card-title` that is not the first child gets `margin-top: 10px`.
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/plain-language.test.ts` still finds "Spell save DC" for its wizard).
- [ ] **Step 5: Commit** `fix: characters who do not cast spells no longer see empty spell cards`.

---

### Task 14: Add item searches first; Add spell lists what can be cast

Fixes item 10 for the Add item and Add spell pickers (`desktop/flow-add-item-01`, `-04`, `-10`, `-12`; `desktop/flow-add-spell-01`, `-03`, `-09`). The "+1"/"Owned" label is P5's (spec section 6) and is not changed here.

**Files:**
- Modify: `src/ui/additem-ui.ts:134-168`, `src/ui/controller.ts:237-243`, `src/ui/spells-ui.ts:199-245`
- Test: `tests/ui/pickers-order.test.ts` (new)

**Interfaces:**
- Produces: Add item panel order: search, chips, results, then a `.fe-card-title` "Not in the list? Make your own" and the custom form. Result rows show rarity and attunement only (no vault path). `readItemText` starts from `blankCustomItem()` and keeps only `importing: false` and the parsed fields (quantity back to "1").
- Produces: Add spell lists cantrips and spells up to `maxCastableLevel(st)` (highest slot level, pact level included; 0 for no slots) by default; a chip `button.fe-btn[data-act=higher-levels]` "Show higher levels" toggles the rest in. Known spells keep the disabled "Known" button. The class-list switch label is rebuilt on click (`"Showing all spells"` / `"Showing your class spells (Cleric)"`).
- `maxCastableLevel(st: ActorStats): number` exported from spells-ui.ts.

- [ ] **Step 1: Write the failing test**

```ts
for (const layout of LAYOUTS) describe(`pickers (${layout})`, () => {
  it("Add item puts the search first and shows no file paths", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "compendium" });
    const body = s.q('[data-panel="compendium"] .fe-additem');
    expect(body.firstElementChild!.matches('input[type="search"]')).toBe(true);
    s.type(s.q('[data-keep="item-search"]'), "dag");
    expect(s.q('[data-pane="item-results"]').textContent).not.toMatch(/\.md\b/);
  });
  it("an import after typing a quantity does not inherit it", () => {
    // type qty 2 into [data-field="qty"], open import, paste an invented item block, Read: expect([data-field="qty"] value).toBe("1")
  });
  it("Add spell hides spells above the highest slot until asked", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "add-spell" });
    expect(s.q('[data-pick="banishment"]')).toBeNull(); expect(s.q('[data-pick="spiritual-weapon"]')).not.toBeNull();
    s.click(s.q('[data-act="higher-levels"]')); expect(s.q('[data-pick="banishment"]')).not.toBeNull();
  });
  it("the class-list switch label tells the truth right after the click", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "add-spell" }); s.click(s.q('[data-act="show-all"]'));
    expect(s.q('[data-act="show-all"]').closest("label")!.textContent).toBe("Showing all spells");
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/pickers-sources.test.ts` add-spell rows are level 1 and 2 SRD spells, castable at its levels; check it, and if a row there is above the slot cap, click `[data-act="higher-levels"]` first in that test, noting the spec change).
- [ ] **Step 5: Commit** `fix: pickers search first and list what the character can actually use`.

---

### Task 15: Companion picker and companion edit/remove

Fixes item 10 for companions: filtered by kind, create/import at the top, one name field, placeholders that do not look like values, edit/remove (`desktop/flow-add-companion-01`, `-03`, `-08`, `phone/flow-add-companion-03`).

**Files:**
- Modify: `src/ui/companion-ui.ts:35-85`, `src/ui/creature-form.ts:103-106`, `src/ui/components.ts:422-437`, `src/core/actions.ts:23` (+ its `apply` case), `src/ui/controller.ts` (companion menu state)
- Test: `tests/ui/companions-review.test.ts` (new)

**Interfaces:**
- Produces: action `{ type: "renameCompanion"; index: number; name: string }` — trims; a blank name is an error `"A companion needs a name."` (no save).
- Produces: picker sorts beasts first when kind is familiar, animal companion or steed (stable, then A to Z); `[data-make]` is the first element of the pick body; the name box label is `"Nickname (optional)"`; creature form name label `"Creature name"`; number placeholders read `"e.g. 12"`, `"e.g. 9"`, `"e.g. 2d8+2"`.
- Produces: each companion card has a `button[data-act=companion-menu]` "..." opening `[data-companion-menu]` with a `input[type=text][data-act=companion-rename]` (change dispatches rename) and Remove with the same Yes/No confirm pattern as items; works in Play mode. `SheetController.companionMenu: number | null`.

- [ ] **Step 1: Write the failing test**

```ts
for (const layout of LAYOUTS) describe(`companions (${layout})`, () => {
  it("familiars list beasts first and the make buttons come first", () => {
    const s = sheet(layout, thalia); s.ctl.open({ kind: "add-companion" });
    const first = s.q('[data-panel="add-companion"] [data-creature]').closest(".fe-inv")!;
    expect(first.textContent).toMatch(/beast/);
    expect(s.q('[data-panel="add-companion"] .fe-companion-panel > div:last-child').firstElementChild!.matches("[data-make]")).toBe(true);
  });
  it("rename and remove from the card's menu", () => {
    const s = sheet(layout, thalia); s.click(s.q('[data-tab="companions"], [data-tab="more"], [data-tab="pets"]'));
    s.click(s.q('[data-companion="0"] [data-act="companion-menu"]'));
    s.type(s.q('[data-act="companion-rename"]'), "Moonfeather", "change");
    expect(s.ctl.character!.companions[0].name).toBe("Moonfeather");
  });
  it("a blank rename keeps the old name and saves nothing", () => {
    const s = sheet(layout, thalia), before = s.saved.length;
    // open the menu as above, type "   " with change
    expect(s.ctl.character!.companions[0].name).toBe("Hoot"); expect(s.saved.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified (use `KIND_LABELS`; "beast" is the creature data's `ctype`).
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/companion-picker.test.ts` and `tests/ui/sheet.test.ts:128-132` select `[data-creature="wolf"]`, independent of order).
- [ ] **Step 5: Commit** `feat: companions can be renamed or removed, and the picker shows fitting creatures first`.

---

### Task 16: The cast panel says what is left and warns about unprepared spells

Fixes item 13 (`desktop/flow-spell-menu-03`, `-04`).

**Files:**
- Modify: `src/ui/spells-ui.ts:157-169`
- Test: `tests/ui/cast-panel.test.ts` (new)

**Interfaces:**
- Produces: the cast panel lists every slot level at or above the spell's level as `button[data-slot]` reading `"Level 1 (3 left)"`; empty levels are disabled and read `"Level 2 (none left)"`. For an own spell that is not prepared, a `.fe-warn[data-unprepared]` reads `"<Spell> is not prepared today."` with a `button[data-act=prepare-now]` "Prepare it" (dispatches `prepare`); Cast stays available.

- [ ] **Step 1: Write the failing test**

```ts
for (const layout of LAYOUTS) it(`cast panel counts slots and warns when unprepared (${layout})`, () => {
  const s = sheet(layout, { ...thalia, spellSlots: { "1": { used: 1 }, "2": { used: 3 } }, spells: [{ id: "cure-wounds", prepared: true }, { id: "bless", prepared: false }] });
  s.ctl.open({ kind: "cast", spell: "cure-wounds" });
  expect(s.all('[data-panel="cast"] [data-slot]').map(b => b.textContent)).toEqual(["Level 1 (3 left)", "Level 2 (none left)", "Level 3 (2 left)"]);
  expect((s.q('[data-slot="2"]') as HTMLButtonElement).disabled).toBe(true);
  s.ctl.open({ kind: "cast", spell: "bless" });
  expect(s.q("[data-unprepared]").textContent).toContain("Bless is not prepared today.");
  s.click(s.q('[data-act="prepare-now"]')); expect(s.ctl.character!.spells[1].prepared).toBe(true);
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — PASS (`tests/ui/spells.test.ts` casts with `[data-slot="<n>"]`).
- [ ] **Step 5: Commit** `fix: the cast panel shows slots left and flags spells that are not prepared`.

---

### Task 17: Plain-language labels

Fixes item 14: Class DCs, Scales, "built-in" pills, the "C" chip, "WotC (SRD)" on every row, machine ids in Customize ("Ac", "Xp"), "[[Campaign]]", "S/F" death saves (`desktop/ren-tab-features`, `desktop/tamsin-tab-features`, `desktop/flow-conditions-01`, `desktop/builder-10`, `desktop/flow-customize-01`). "Spend 1 Ki Points" is fixed in Task 1.

**Files:**
- Modify: `src/ui/features-ui.ts:194-214`, `src/ui/spells-ui.ts:31-34`, `src/ui/widgets.ts:8` (add `playBadge`), `src/ui/panels.ts:209, 244-255`, `src/ui/levelup-ui.ts:36, 90, 142`, `src/ui/spells-ui.ts:223`, `src/ui/companion-ui.ts:68`, `src/ui/builder-ui.ts:233, 243, 264`, `src/ui/components.ts:373-376`, `styles.css` (muted `.fe-auto`)
- Test: `tests/ui/plain-labels.test.ts` (new); update `tests/ui/overlay-ui.test.ts:36`, `tests/ui/pickers-sources.test.ts:48, 69, 83, 99`

**Interfaces:**
- Produces: `playBadge(label: string): HTMLElement | null` — `null` for `"WotC (SRD)"` (the built-in default), else `sourceBadge(label)`. Used on rows in play views and pickers; the compendium browser and detail cards keep `sourceBadge`.
- Produces: `SECTION_LABELS: Record<string, string>` and `SECTION_GROUPS: { title: string; ids: string[] }[]` exported from panels.ts, covering every id in `CHARACTER_FEATURES` except `identity` and `play-edit`, grouped as the sheet is laid out (Header, Combat, Resources and rests, Checks, Spells, Combos, Other). Labels such as `ac: "Armor Class"`, `xp: "Experience points (XP)"`, `hp: "Hit points"`, `"hp-controls": "Damage and healing buttons"`, `"spell-dc": "Spell save DC"`, `toggles: "Switches (Rage, stances and the like)"`, `traits: "Features and traits (main page)"`. P2-P5 add an entry for each new feature id (the test below fails otherwise).

- [ ] **Step 1: Write the failing test**

```ts
it("every section has a human label in a group", () => {
  const ids = CHARACTER_FEATURES.filter(f => f !== "identity" && f !== "play-edit");
  expect(Object.keys(SECTION_LABELS).sort()).toEqual([...ids].sort());
  expect(SECTION_GROUPS.flatMap(g => g.ids).sort()).toEqual([...ids].sort());
});
for (const layout of LAYOUTS) it(`play views use plain words (${layout})`, () => {
  const s = sheet(layout, { ...thalia, concentration: "bless", spells: [{ id: "bless", prepared: true }] });
  for (const t of s.all(".fe-tab")) s.click(t);
  const text = s.root.textContent!;
  for (const w of ["Class DCs", "Scales", "built-in", " S ", " F "]) expect(text, w).not.toContain(w);
  expect(s.q('[data-feature="death-saves"]').textContent).toMatch(/Successes.*Failures/);
  expect(s.q('[data-spell="bless"] [data-badge="concentration"]').textContent).toBe("Concentration");
  s.ctl.open({ kind: "conditions" }); expect(s.q('[data-panel="conditions"]').textContent).not.toContain("WotC (SRD)");
  s.ctl.setEditing(true); s.ctl.open({ kind: "customize" });
  for (const raw of ["Ac", "Xp", "Hp", "Spell dc", "Toggles"]) expect(s.all('[data-panel="customize"] .fe-kv > span').map(e => e.textContent)).not.toContain(raw);
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** "Class DCs" becomes "Saving throw DCs"; "Scales" becomes "Grows with level"; the "built-in" chip becomes a muted `span.fe-auto[data-builtin]` "Automatic" (its title unchanged); the "C" chip becomes `span.fe-tag[data-badge=concentration]` "Concentration"; death saves read "Successes" / "Failures" (pips keep `is-s` / `is-f`); the campaign box placeholder reads "Campaign note name (optional)"; class picker detail reads "Hit die d12"; starting gold reads "Starting gold: roll 5d4 × 10 gp" (format from the class's `gold` string).
- [ ] **Step 4: Update** `tests/ui/overlay-ui.test.ts:36` to expect `"Automatic"`, and `tests/ui/pickers-sources.test.ts:48, 69, 83, 99` to expect no `.fe-src` on the SRD rows (`toBeNull()`); line 110 (detail card) is unchanged.
- [ ] **Step 5: Run** `npm test` — PASS.
- [ ] **Step 6: Commit** `fix: plain words for rules labels and Customize, and no WotC tag on every built-in row`.

---

### Task 18: Missing ids, compendium detail, combos empty state, notes card

Fixes "Unknown race/subclass ids show as raw ids with no 'missing' marker", and from item 15 the stale compendium pane, the combos empty state and the "Free" badge, and the notes tab (`desktop/compendium-06`, `desktop/flow-combo-empty-01`, `desktop/ren-tab-notes`).

**Files:**
- Modify: `src/ui/components.ts:333-349, 447`, `src/ui/compendium.ts:88-91, 175`, `src/ui/combos-ui.ts:78-84`, `src/ui/spells-ui.ts:224-226`, `styles.css:152, 277-279`
- Test: `tests/ui/small-fixes.test.ts` (new); update `tests/ui/combos-ui.test.ts:37`

**Interfaces:**
- Produces: an identity part whose race, subrace, subclass or background id is not in the registry renders `span.fe-id-part.is-missing` with text `"<id> (missing from compendium)"`.
- Produces: `CompendiumController.visibleSelection(): Entry | undefined` — the selected entry only while it is in `matches()`; the detail pane shows "Pick an entry to see its card." otherwise.
- Produces: combos empty state: `.fe-muted[data-note=combo-intro]` "A combo is your plan for a turn: what to do first, then next." and a normal `+ Add combo` button (`data-act="add-combo"`, no `fe-combo-empty` class). The spell-list badges use `.fe-tags` / `.fe-tag` (the second `.fe-badge` definition is removed), so the combo `.fe-badge` rule alone styles "Free".
- Produces: `notes` renders `card("Notes", body)`; body is rendered by `host.renderMarkdown` when present, else plain text with `white-space: pre-wrap`. (The real view already passes `renderMarkdown`; the review rig did not, which is why it showed `#`.)

- [ ] **Step 1: Write the failing test**

```ts
it("unknown origin and subclass ids are marked missing", () => {
  const s = sheet("desktop", { ...thalia, race: "sky-kin", classes: [{ class: "cleric", subclass: "lantern-domain", level: 5 }] });
  expect(s.all(".fe-id-part.is-missing").map(e => e.textContent)).toEqual(["lantern-domain (missing from compendium)", "sky-kin (missing from compendium)"]);
});
it("the compendium detail clears when the selection leaves the list", () => {
  // CompendiumController over homebrewRegistry; select the owl creature, setType("item"), setQuery("potion")
  // expect(ctl.visibleSelection()).toBeUndefined(); expect(root.textContent).toContain("Pick an entry to see its card.")
});
it("combos explain themselves when empty", () => {
  const s = sheet("desktop", thalia); s.click(s.q('[data-tab="combos"]'));
  expect(s.q('[data-note="combo-intro"]').textContent).toBe("A combo is your plan for a turn: what to do first, then next.");
});
it("only one .fe-badge rule set exists", () => expect(readFileSync("styles.css", "utf8").match(/^\.fe-badge \{/gm)).toHaveLength(1));
it("notes sit in a Notes card and go through the Markdown renderer", () => {
  const seen: string[] = [];
  const s = sheet("mobile", thalia, [], { body: "# Backstory", renderMarkdown: (md, el) => { seen.push(md); el.append("rendered"); } });
  expect(seen).toEqual(["# Backstory"]); expect(s.q('[data-feature="notes"] .fe-card-title').textContent).toBe("Notes");
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Update** `tests/ui/combos-ui.test.ts:37` to expect `"+ Add combo"` (the spec replaces the big button with an explanation and a normal button).
- [ ] **Step 5: Run** `npm test` — PASS (`tests/ui/sheet.test.ts:93-98` missing-id checks unchanged).
- [ ] **Step 6: Commit** `fix: mark unknown ids, clear stale compendium cards and explain combos when there are none`.

---

### Task 19: One toast corner and a calm Edit-mode header

Fixes from item 15: toasts in one corner not covering HP or header buttons, and the Edit-mode header that wraps and duplicates XP (`desktop/flow-resource-use-04`, `phone/flow-roll-toast-01`, `desktop/flow-edit-main-01`).

**Files:**
- Modify: `src/ui/controller.ts:72-92, 351-353` (`say`, `toastItem`), `src/ui/sheet.ts:200-206`, `src/obsidian/character-view.ts:71-87`, `src/ui/features-ui.ts:142-153`, `src/ui/components.ts:445-446`, `styles.css:75-82`
- Test: `tests/ui/toast-and-edit.test.ts` (new)

**Interfaces:**
- Produces: `SheetController.say(msg: string): void` and `SheetController.toastItem?: { kind: "roll"; roll: RollResult } | { kind: "notice"; text: string }` — `record()` sets a roll item, `say()` a notice item; the sheet's single `.fe-toast[data-feature=roll-result]` shows the latest item. `host.notify` keeps its contract (tests' `notices` arrays unchanged); the Obsidian view routes `notify` to the open sheet's `say`.
- Produces: phone toast sits at the bottom (`left: 12px; right: 12px; bottom: 12px; top: auto`); tablet and desktop bottom right.
- Produces: in Edit mode the XP feature shows the label and a `input.fe-amt.fe-xp-input` (no second read-only value); the play-edit feature adds `div.fe-edit-bar` "Editing: changes save as you type".

- [ ] **Step 1: Write the failing test**

```ts
for (const layout of LAYOUTS) describe(`feedback (${layout})`, () => {
  it("a sheet message shows in the sheet's own toast", () => {
    const s = sheet(layout, thalia); s.ctl.say("Added Rope.");
    expect(s.q(".fe-toast").hidden).toBe(false); expect(s.q(".fe-toast").textContent).toContain("Added Rope.");
    expect(s.notices).toEqual([]);
  });
  it("Edit mode shows XP once and says it is editing", () => {
    const s = sheet(layout, thalia); s.ctl.setEditing(true);
    expect(s.q('[data-feature="xp"]').textContent!.match(/6500/g) ?? []).toHaveLength(0);
    expect((s.q('[data-feature="xp"] input.fe-xp-input') as HTMLInputElement).value).toBe("6500");
    expect(s.q(".fe-edit-bar").textContent).toBe("Editing: changes save as you type");
  });
});
it("the Obsidian view sends sheet messages to the sheet", () =>
  expect(readFileSync("src/obsidian/character-view.ts", "utf8")).toMatch(/notify: m => \(?\w+ \? \w+\.say\(m\) : this\.plugin\.notice\(m\)/));
it("the phone toast sits at the bottom", () => expect(readFileSync("styles.css", "utf8")).toMatch(/\.fe-mobile \.fe-toast \{ left: 12px; right: 12px; top: auto; bottom: 12px; \}/));
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as specified. In character-view, a local `let sheetCtl: SheetController | undefined` is assigned right after `new SheetController(...)`.
- [ ] **Step 4: Run** `npm test` — PASS (existing toast tests read `.fe-toast` after rolls; `lastRoll` is still set).
- [ ] **Step 5: Commit** `fix: sheet messages share one toast corner and Edit mode stops doubling the XP field`.

---

### Task 20: P3 polish while the areas are open

Item 16: fewer dotted underlines, legends for proficiency and prepared dots, form spacing, small wording. (Consistent item rows are left to P5, which rebuilds the inventory row.)

**Files:**
- Modify: `styles.css:88` and panel section titles, `src/ui/components.ts:292-298` (legends), `src/ui/spells-ui.ts:128-132` (legend), `src/ui/additem-ui.ts:93`, `src/core/level-diff.ts` (arrow), `src/rules/rests.ts:52` (arrow), `src/ui/rations-ui.ts`
- Test: `tests/ui/polish.test.ts` (new); update `tests/rules/rests.test.ts:28` (`"Exhaustion 4 → 3"`)

**Interfaces:**
- Produces: dotted underline only on `.fe-card-title[data-ref]` and `.fe-stat-l[data-ref]`; other `[data-ref]` keep `cursor: help` without underline. Saves and Skills cards end with `.fe-faint[data-legend]` "Filled dot: trained (add your proficiency bonus)."; the Spells tab with "Filled dot: prepared today.". `.fe-panel .fe-card-title { margin-top: 12px }` (first child 0). Unread import lines show as muted "Skipped: <line>" (`.fe-muted`, not `.fe-warn`). Summaries use "→" instead of "->". Rations read "4 rations (4 days)".

- [ ] **Step 1: Write the failing test**

```ts
const css = readFileSync("styles.css", "utf8");
it("underlines only mark headings and stat labels", () => {
  expect(css).not.toMatch(/\.fe-sheet \[data-ref\] \{[^}]*underline/);
  expect(css).toMatch(/\.fe-sheet \.fe-card-title\[data-ref\], \.fe-sheet \.fe-stat-l\[data-ref\] \{[^}]*underline dotted/);
});
for (const layout of LAYOUTS) it(`dots have legends (${layout})`, () => {
  const s = sheet(layout, thalia);
  expect(s.q('[data-feature="skills"] [data-legend]').textContent).toBe("Filled dot: trained (add your proficiency bonus).");
});
it("summaries use an arrow character", () => {
  const s = sheet("desktop", { ...thalia, conditions: { exhaustion: 2 } });
  expect(s.ctl.restPreview("long")).toContain("Exhaustion 2 → 1");
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update** `tests/rules/rests.test.ts:28` to `"Exhaustion 4 → 3"` and any other assertion on `->` the arrow change touches (search `tests` for `" -> "` and list them in the commit body).
- [ ] **Step 5: Run** `npm test`, `npm run typecheck`, `npm run build` — all succeed.
- [ ] **Step 6: Commit** `style: quieter underlines, dot legends and spacing so the sheet reads more calmly`.

---

## Self-Review

**Spec coverage (section 7):** Good Rest derived max → T3. Builder stacked gear → T5; title-case → T1. Cantrip step → T6. Wizard bottom bar → T7. Phone tab strip → T11. Unknown ids marker → T18. Review items: 1 → T10; 2 → T11; 3 → T1 (choice labels), T2; 4 → T6; 5 → T9; 6 → T9 (stat tiles as tiles are P2, section 1); 7 → T1; 8 → T12; 9 → T13; 10 → T14, T15; 11 → T4; 12 → T7, T8; 13 → T16; 14 → T1, T17; 15 → T3, T11 (tablet header, balance), T18 (compendium, combos, notes), T19 (toasts, Edit header); 16 → T20. Adjustments: the Settings card placement, the attack-options card, the one-line attack row, the stat tiles and the roll-mode slider are P2/P3; T10 lands the narrow-row fix first as required; T4's `restModeControl` and T11's orders are the hooks P2 uses.

**Not placed in a task (deliberately, with reason):** item 15's "Edit-mode header not wrapping" is covered only partly (XP doubled field, fixed input width, edit bar); whether the desktop header wraps depends on P2's header changes (roll mode leaves it), so the visual check belongs to P2's review. Item 16's "consistent item rows" is left to P5 (the inventory row is rebuilt there). The review's "Inspiration next to HP on every layout" and "one tab vocabulary" are layout-parity findings not listed in section 7 and are not in this plan.

**Type consistency:** `titleCase`, `plural`, `optionListLabel`, `formulaWords` (T1/T2, `src/core/words.ts`); `WordsCtx`, `wordsCtx`, `actionWords`, `restModeControl`, `playBadge` (widgets.ts); `slotRows`, `castsSpells`, `maxCastableLevel` (spells-ui.ts); `spellStepRows`, `spellStepHeading`, `stepCounter` (levelup-ui.ts); `gearList` (core/builder.ts); `ActorStats.hpFull`; `SheetController.say`, `toastItem`, `companionMenu`; `CompendiumController.visibleSelection`; `SECTION_LABELS`, `SECTION_GROUPS` (panels.ts); `renameCompanion` action. Each is defined in exactly one task and only consumed after it.
