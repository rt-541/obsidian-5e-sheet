# P4 Customize (per-character feature configuration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Edit mode every feature, trait, option, feat and item row gets a plain-words "Customize" form that can make the row a switch, an attack option or a Use button, and pin it. The changes are saved on the character and layered over the note when the sheet derives the character.

**Architecture:** A per-character `customize` map in the character note (keyed `feature:<feature key>`) and a `customize` field on each inventory entry hold *partial* definitions: only the fields the player changed. `progress()` and `deriveCharacter()` layer them over the note's (or the built-in overlay's) switch, attack option and action at the point where those are read, so the Toggles card, the Attack options card (P3), the Actions card, the resource Use buttons and own-dice mode (P3) all pick up the result unchanged. The note is never written; "Reset to the note" deletes the entry.

**Tech Stack:** TypeScript, plain DOM via `h()`, Vitest + jsdom. `npm test`, `npm run typecheck`, `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-19-play-surface-design.md` (section 5; "My calls" on per-row items; Anti-goals; Constraints).

## Global Constraints

- Plain DOM via `h()`, never `innerHTML`; mount roots use `classList`, never `className`.
- Parity on desktop (hover), tablet and phone (tap) with 44 px touch targets; layout parity tests place each feature id once per layout (this plan adds no feature id; the form is a panel).
- Plugin button rules use `.fe-sheet button.x` specificity to beat Obsidian's `button:not(.clickable-icon)`.
- Fixtures are INVENTED (never book/SRD prose or published stat blocks): the code is mirrored to a public repo.
- Plain words for players who are not rules-savvy; never ask for YAML, effect keywords or formulas.
- Nothing race, class, feat or item specific in code.
- Existing notes without the new fields behave exactly as today (no `customize` key is written to a note that never had one).
- Writing only to the character note: class, race, feat, option, item and library notes are never written; registry data is never mutated.
- Spending is always said in words.
- Commit messages conventional; the last line is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All existing tests keep passing (about 1500); `npm run typecheck` and `npm run build` clean after every task.

## Review Focus

1. **A customization that no longer fits the note** (the note later renames the resource it spends, or a stored value is malformed): the sheet stays writable, the note's own version is used, and the Problems card says `Your changes to <name> could not be used, so the note's version is shown. Open Customize to fix or reset them.` (Task 4 test.)
2. **The note changes after a customization**: fields the player did not touch follow the note, because only changed fields are stored. (Task 6 test: saving after changing only the damage type stores `{ action: { damageType } }`; Task 4 test: a later note dice change shows through.)
3. **Reset or "not a switch any more" while the switch is on**: the `active` entry is removed so nothing is left "on" without having paid its cost; pins are kept. (Task 1 test.)
4. **Two rows of the same item**: customizing one never changes the other, and two customized switches never share an id. (Task 5 test.)
5. **"Grows with level" below its first level**: nothing appears (no broken button, no problem line) until the character reaches that level. (Task 2 and Task 4 tests.)

## Interfaces from earlier plans (P1, P2, P3)

None of the earlier plan files existed when this plan was written. P4 relies only on P3. Before Task 1, open the merged P3 code. Wherever a name below differs, use P3's merged name everywhere this plan uses the assumed one, and keep the behaviour.

- `src/content/types/attack-option.ts` (P3, assumed):
  `export interface AttackOptionDef { id: string; toHit?: string; onHit?: string; reroll?: true; cost?: { resource: string; amount?: Formula }; oncePerTurn?: true }` and
  `export function validateAttackOption(v: unknown, at: string, name: string, e: Errs): AttackOptionDef | undefined` (the id defaults to `slug(name)`; dice accept `{scale-id}` placeholders).
- `FeatureRow.attackOption?: AttackOptionDef`, `ItemData.attackOption?: AttackOptionDef`. Progression's local `feature(...)` helper receives the attack option alongside `toggle` and `action`.
- `ActorStats.attackOptions` is built in `deriveCharacter` from `prog.features[].attackOption` and from the `items` list derive already builds (`items.map(({ e, it }) => ...)`). If P3 reads item data from the registry instead, Task 5 switches it to the `items` list.
- Own-dice mode (reconciled with P2/P3): the rule key `OWN_DICE = "own-dice"` in `src/rules/index.ts`, read with `SheetController.ownDice(): boolean` (P2 Task 3; P3's `ownDiceOn()` in `src/core/own-dice.ts` for pure code), set through P2's Settings card. There is no `Character.ownDice` field. When it is on, `useAction` gives an instruction instead of rolling.

Hand-off to P5 (runs after this plan): item customizations live on the inventory entry (`InventoryEntry.customize`). The Customize panel addresses an item by index (`{ kind: "item"; index }`). When P5 adds stable row ids it may switch that address to the row id. Nothing else changes.

## File Structure

- Create `src/core/customize.ts`: the stored shape (`Customization`, `CustomDice`), the structural reader, level dice, the layering function, fresh switch ids. Pure; no UI.
- Create `src/ui/customize-form.ts`: the form state (`CustomizeForm`) and the pure conversions form ⇄ customization, with plain-words problems. No DOM.
- Create `src/ui/customize-ui.ts`: the panel body and the `Customize` entry button.
- Modify `src/core/character.ts`: `Character.customize`, `InventoryEntry.customize`, parse.
- Modify `src/core/actions.ts`: `customize` and `customizeItem` actions.
- Modify `src/content/types/ops.ts`: `ActionDef.damageType`, `ActionDef.cost` charges, `save.dc` from the spell DC or a fixed number.
- Modify `src/core/progression.ts`: layer the customization in `feature(...)`, mark the row, widen the cross-checks.
- Modify `src/core/effects.ts`: `itemToggle()` used by `collectEffects`.
- Modify `src/core/derive.ts`: customized items, `itemActions`, `actionDc()`.
- Modify `src/ui/controller.ts`: `useAction` widened, Customize draft and its commands, panel kind.
- Modify `src/ui/panels.ts`, `src/ui/traits-ui.ts`, `src/ui/features-ui.ts`, `src/ui/inventory-ui.ts`, `src/ui/components.ts`, `styles.css`.
- Tests: `tests/core/customize-data.test.ts`, `tests/core/customize-layer.test.ts`, `tests/core/action-fields.test.ts`, `tests/core/customize-derive.test.ts`, `tests/core/customize-items.test.ts`, `tests/ui/customize-form.test.ts`, `tests/ui/customize-ui.test.ts`. Use `tests/fixtures/mechanics.ts` (`mechanicsRegistry`, `makeChar`, `derive`, `act`, `tester`). The invented `tester` class has the keys `class:tester:1:fury`, `class:tester:1:stance-high` and so on. Add any further fixture as an invented vault feat (as `carrier()` does).

---

### Task 1: The stored shape, parse and reducer

**Files:**
- Create: `src/core/customize.ts`
- Modify: `src/core/character.ts` (`InventoryEntry`, `Character`, `newCharacter`, `parseCharacter`)
- Modify: `src/core/actions.ts` (`Action` union, `apply` switch)
- Test: `tests/core/customize-data.test.ts`

**Interfaces:**
- Produces (in `src/core/customize.ts`):
  - `export type CustomDice = string | { byLevel: Record<number, string> }`
  - `export type CustomToggle = Partial<ToggleDef>`
  - `export type CustomAttackOption = Omit<Partial<AttackOptionDef>, "toHit" | "onHit"> & { toHit?: CustomDice; onHit?: CustomDice }`
  - `export type CustomAction = Omit<Partial<ActionDef>, "damage" | "heal"> & { damage?: CustomDice; heal?: CustomDice }`
  - `export interface Customization { toggle?: CustomToggle | false; attackOption?: CustomAttackOption | false; action?: CustomAction | false }`. `false` means "not a switch / not an attack option / no Use button", even when the note says otherwise. An absent field means "as the note says".
  - `export const customizeKey = (featureKey: string) => \`feature:${featureKey}\``
  - `export function readCustomization(v: unknown, at: string, errors: string[]): Customization | undefined`. This is a structural check only: a mapping whose only keys are `toggle`, `attackOption` and `action`, each a mapping or `false`. Field contents are checked at derive (Task 2), so a bad inner value never makes the sheet read-only.
- Produces: `Character.customize: Record<string, Customization>` (default `{}`), `InventoryEntry.customize?: Customization`.
- Produces (actions): `{ type: "customize"; key: string; value?: Customization }` and `{ type: "customizeItem"; index: number; value?: Customization }`. `value` undefined or `{}` removes the entry (Reset).

- [ ] **Step 1: Write the failing tests**

```ts
it("a note without customize parses to {} and writes nothing back", () => {
  const c = makeChar(); expect(c.customize).toEqual({});
  const fm: Record<string, unknown> = { ...tester }; writeInto(fm, c); expect("customize" in fm).toBe(false);
});
it("reads the map and inventory customizations", () => {
  const p = parseNote({ ...tester, customize: { "feature:class:tester:1:fury": { toggle: false, action: { name: "Roar", damage: { byLevel: { 1: "1d4", 5: "2d4" } } } } },
    inventory: [{ name: "Odd Charm", qty: 1, customize: { action: { name: "Zap", damage: "1d6", damageType: "lightning" } } }] });
  expect(p.kind === "character" && p.errors).toEqual([]);
  expect((p as any).value.customize["feature:class:tester:1:fury"].toggle).toBe(false);
  expect((p as any).value.inventory[0].customize.action.damageType).toBe("lightning");
});
it("structural mistakes are reported in words", () => {
  const p = parseNote({ ...tester, customize: { "feature:x": { colour: "red" }, "feature:y": 3 } }) as any;
  expect(p.errors).toEqual(['customize.feature:x: unknown part "colour" (use toggle, attackOption or action)', "customize.feature:y: must be a mapping"]);
});
it("customize sets, and an empty or missing value resets", () => {
  let c = act(makeChar(), { type: "customize", key: "feature:class:tester:1:fury", value: { toggle: { group: "rage" } } }, R).value;
  expect(c.customize["feature:class:tester:1:fury"]).toEqual({ toggle: { group: "rage" } });
  c = act(c, { type: "customize", key: "feature:class:tester:1:fury" }, R).value;
  expect(c.customize).toEqual({});
});
it("making an active switch not a switch clears its on state and keeps its pin", () => {
  const c0 = makeChar({ active: { fury: true }, mainPins: ["feature:class:tester:1:fury"] });
  const c = act(c0, { type: "customize", key: "feature:class:tester:1:fury", value: { toggle: false } }, R).value;
  expect(c.active.fury).toBeUndefined(); expect(c.mainPins).toEqual(["feature:class:tester:1:fury"]);
});
it("customizeItem changes one inventory row only", () => {
  const c0 = makeChar({ inventory: [{ id: "longsword", qty: 1, equipped: true }, { id: "longsword", qty: 1, equipped: false }] });
  const c = act(c0, { type: "customizeItem", index: 1, value: { action: { name: "Glow" } } }, R).value;
  expect(c.inventory[0].customize).toBeUndefined(); expect(c.inventory[1].customize).toEqual({ action: { name: "Glow" } });
});
```

(`R = mechanicsRegistry()`. The fifth test needs Task 4's layering to remove the switch, so mark it `it.todo` here and turn it on in Task 4 Step 4.)

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/core/customize-data.test.ts`. Expected: FAIL (`customize` undefined; unknown action type).

- [ ] **Step 3: Implement.** Add the types and `readCustomization` in `src/core/customize.ts`. Add a `customize` field to `newCharacter` (`{}`) and read it in `parseCharacter` (keys kept as written). Read `inventory[i].customize` with the same reader. `writeInto` needs no change: it already skips defaults the note did not have. In `apply`, `customize` sets or deletes `c.customize[a.key]`. After the change, when `lim.derive` exists, it deletes `c.active[t.id]` for every `lim.self.toggles` row with `t.ref === a.key` whose id is missing from `lim.derive(c).toggles`. `customizeItem` does the same for `c.inventory[a.index].customize` and for toggle rows with `t.itemIndex === a.index`. Store a `structuredClone` of the value.

- [ ] **Step 4: Run them to see them pass (except the todo).** Run: `npx vitest run tests/core/customize-data.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/customize.ts src/core/character.ts src/core/actions.ts tests/core/customize-data.test.ts
git commit -m "feat: store per-character customizations so feature and item behaviour can change without editing notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Layering engine

**Files:**
- Modify: `src/core/customize.ts`
- Test: `tests/core/customize-layer.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `validateToggle` (`src/content/types/toggle.ts`), `validateAction` (`src/content/types/ops.ts`), P3 `validateAttackOption`.
- Produces:
  - `export interface RowDefs { toggle?: ToggleDef; attackOption?: AttackOptionDef; action?: ActionDef }`
  - `export function levelDice(v: CustomDice, level: number): string | undefined`. A string is returned as it is. A table returns the value at the highest level key that is `<= level`, or `undefined` below the first one.
  - `export function layerRow(name: string, note: RowDefs, mine: Customization | undefined, level: number, problem: (msg: string) => void): RowDefs & { custom?: true }`
  - `export function freshToggleId(name: string, taken: readonly string[]): string`. Returns `slug(name)`, else `slug(name)-2`, `-3` and so on.

`layerRow` works per part (`toggle`, `attackOption`, `action`). If `mine[part]` is absent, it keeps `note[part]`. If it is `false`, it drops the part. Otherwise it resolves `CustomDice` fields with `levelDice`. When a table yields `undefined`, the part is dropped quietly ("not yet at this level"). It then shallow-merges `{ ...note[part], ...mine[part] }` and validates the merge with the part's validator (the toggle and attack option use `name` for the default id). If validation fails, it keeps `note[part]` and calls `problem(\`Your changes to ${name} could not be used, so the note's version is shown. Open Customize to fix or reset them.\`)` once per row. `custom: true` is set when `mine` has at least one part. The note objects are never mutated.

- [ ] **Step 1: Write the failing tests** (the attack option shape below is P3's, as assumed)

```ts
const note = { toggle: { id: "fury", endsOn: "long" as const, cost: { resource: "Fury" } } };
it("absent keeps the note, false removes, a partial merges", () => {
  expect(layerRow("Fury", note, undefined, 1, fail)).toEqual(note);
  expect(layerRow("Fury", note, { toggle: false }, 1, fail).toggle).toBeUndefined();
  expect(layerRow("Fury", note, { toggle: { group: "rage" } }, 1, fail).toggle).toEqual({ id: "fury", endsOn: "long", cost: { resource: "Fury" }, group: "rage" });
});
it("a new Use button from nothing", () => {
  expect(layerRow("Spark", {}, { action: { name: "Spark", damage: "2d6", damageType: "fire" } }, 1, fail).action).toEqual({ name: "Spark", damage: "2d6", damageType: "fire" });
});
it("grows with level: nothing below the first level, then the highest step reached", () => {
  const mine = { attackOption: { onHit: { byLevel: { 3: "1d4", 7: "2d4" } }, cost: { resource: "Fury" } } };
  expect(layerRow("Edge", {}, mine, 2, fail).attackOption).toBeUndefined();
  expect(layerRow("Edge", {}, mine, 8, fail).attackOption?.onHit).toBe("2d4");
});
it("an invalid merge keeps the note and says so once", () => {
  const msgs: string[] = [];
  expect(layerRow("Fury", note, { toggle: { endsOn: "tomorrow" as never } }, 1, m => msgs.push(m)).toggle).toEqual(note.toggle);
  expect(msgs).toEqual(["Your changes to Fury could not be used, so the note's version is shown. Open Customize to fix or reset them."]);
});
it("never mutates the note", () => { const n = structuredClone(note); layerRow("Fury", note, { toggle: { group: "x" } }, 1, fail); expect(note).toEqual(n); });
it("fresh switch ids do not collide", () => expect(freshToggleId("Long Sword", ["long-sword", "long-sword-2"])).toBe("long-sword-3"));
```

(`fail = (m: string) => { throw new Error(m); }`)

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/core/customize-layer.test.ts`. Expected: FAIL (`layerRow` not exported).
- [ ] **Step 3: Implement** `levelDice`, `layerRow` and `freshToggleId` in `src/core/customize.ts`.
- [ ] **Step 4: Run them to see them pass.** Run the same command plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: layer a character's customization over a note's switch, attack option and action` (with the Co-Authored-By line).

### Task 3: Use action fields: damage type, DC source, charges, manual resources

**Files:**
- Modify: `src/content/types/ops.ts` (`ActionDef`, `validateAction`)
- Modify: `src/core/derive.ts` (export `actionDc`)
- Modify: `src/core/progression.ts` (the cross-check loop at the end of `progress`)
- Modify: `src/ui/features-ui.ts` (`actionRow` wording)
- Modify: `src/ui/controller.ts` (`useAction`)
- Test: `tests/core/action-fields.test.ts`

**Interfaces:**
- Produces: `ActionDef.damageType?: string`. `ActionDef.cost` gains `| { charges: number }` (items only). `ActionDef.save.dc` is a class DC name or id, the word `spell`, or a whole number; YAML numbers are read as text, so `dc: 15` becomes `"15"`.
- Produces: `export function actionDc(st: ActorStats, dc: string): { dc: number; label: string } | undefined` in `src/core/derive.ts`. A number gives `{ dc: n, label: "DC n" }`. `spell` gives the first caster's spell save DC, `label: "spell save DC"`, or `undefined` when there is none. Anything else is a class DC by name or by `slug` (`label: "<Name> save DC"`).
- Produces: `useAction(f: { action?: ActionDef }, itemIndex?: number)`. Existing `useAction(featureRow)` calls compile unchanged.

`useAction` changes:
- The cost resource is found as the toggle reducer finds it: a derived id, or a manual resource whose name has the same slug. A manual resource is spent with the `resource` action.
- `charges` spends `itemIndex`'s charges through the `charges` action. With no `itemIndex` it says "This only works on an item."
- The DC comes from `actionDc`, so the record reads `DEX save DC 14`.
- Damage records are titled `<name> damage (<type>)` when there is a type.
- In own-dice mode (P3), the instruction contains the dice and the type ("2d10 lightning").

The progression cross-check accepts a manual resource name, `spell` and digits. It adds the problem `<name>: only items have charges` for a charges cost on a feature.

- [ ] **Step 1: Write the failing tests**

```ts
it("validates the new fields", () => {
  const e: string[] = [];
  expect(validateAction({ name: "Zap", damage: "2d10", damageType: "lightning", save: { abil: "dex", dc: 15 }, cost: { charges: 1 } }, "a", e))
    .toEqual({ name: "Zap", damage: "2d10", damageType: "lightning", save: { abil: "dex", dc: "15" }, cost: { charges: 1 } });
  expect(e).toEqual([]);
  validateAction({ name: "X", damageType: 4, cost: { charges: 0 } }, "a", e);
  expect(e).toEqual(["a.damageType: must be text", "a.cost.charges: must be a whole number from 1"]);
});
it("actionDc reads a fixed number, the spell DC and class DCs", () => {
  const st = derive(makeChar(), R);
  expect(actionDc(st, "13")).toEqual({ dc: 13, label: "DC 13" });
  expect(actionDc(st, "spell")).toBeUndefined();          // the tester class casts no spells
});
// UI (jsdom, setup as in tests/ui/toggles-ui.test.ts) with an invented feat "Static Burst": action { name: "Burst", damage: "2d10", damageType: "lightning", save: { abil: "dex", dc: "12" }, cost: { resource: "Charge Jar" } } and a manual resource "Charge Jar" (max 2):
it("Use spends a manual resource, names the DC and the damage type", () => {
  s.ctl.useAction(burstRow);
  expect((s.ctl.value as Character).resources[0].used).toBe(1);
  expect(s.ctl.host.log.map(r => r.title)).toEqual(["Burst damage (lightning)", "Burst used"]);   // newest first
  expect(s.ctl.host.log[1].detail).toBe("Charge Jar -1 · DEX save DC 12");
});
it("the Actions row says the damage type", () => expect(s.q('[data-action$="burst"]').textContent).toContain("2d10 lightning"));
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/core/action-fields.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the validator fields, `actionDc`, the cross-check changes, the `actionRow` wording (`<dice> <type>`) and `useAction`. In `actionRow`, replace the local DC lookup with `actionDc`.
- [ ] **Step 4: Run them to see them pass,** then `npm test` (the existing action and combo tests must still pass). Expected: PASS.
- [ ] **Step 5: Commit** `feat: Use actions can name a damage type, use the spell or a fixed DC, and spend item charges or hand-made resources` (with the Co-Authored-By line).

### Task 4: Apply customizations to features, options and feats at derive

**Files:**
- Modify: `src/core/progression.ts` (`FeatureRow`, the local `feature(...)` helper)
- Test: `tests/core/customize-derive.test.ts`; enable the todo in `tests/core/customize-data.test.ts`

**Interfaces:**
- Consumes: `layerRow`, `customizeKey` (Tasks 1–2).
- Produces: `FeatureRow.custom?: true` and `FeatureRow.noteDefs?: RowDefs`. `noteDefs` holds the note's (or the built-in overlay's) switch, attack option and action before layering, and is set only when `custom`. Task 6 builds the form from it.

Inside `feature(src, key, ...)`, before the row is pushed:

```
const mine = c.customize[customizeKey(key)]
layered = layerRow(name, { toggle, attackOption, action }, mine, src.classLevel, problem)
```

Then use `layered.*` for the pushed row, for the `out.toggles` registration and for `gatedByToggle`. This way a feature made into a switch has its effects count only while it is on, and a switch removed with `false` lets its effects count always. `src.classLevel` is already the total level for race, background and feat sources. Overlay-filled values count as "the note".

- [ ] **Step 1: Write the failing tests**

```ts
const K = "feature:class:tester:1:";
it("a plain feature becomes a switch whose effects count only while on", () => {
  // invented feat "Iron Hide": feature with effects { modifiers: [{ target: "ac", value: 1 }] }
  const off = derive(makeChar({ feats: ["iron-hide"], customize: { "feature:feat:iron-hide:hide": { toggle: { id: "iron-hide", endsOn: "short" } } } }), R);
  expect(off.toggles.find(t => t.id === "iron-hide")).toMatchObject({ on: false, ref: "feature:feat:iron-hide:hide" });
  const on = derive(makeChar({ feats: ["iron-hide"], active: { "iron-hide": true }, customize: { /* same */ } }), R);
  expect(on.ac.value).toBe(off.ac.value + 1);
});
it("a note switch removed with false: its effects always count", () => {
  const st = derive(makeChar({ customize: { [K + "stance-high"]: { toggle: false } } }), R);
  expect(st.toggles.some(t => t.id === "high-stance")).toBe(false); expect(st.ac.value).toBe(derive(makeChar(), R).ac.value + 1);
});
it("a feature gains a Use button and an attack option (P3 card lists it)", () => {
  const st = derive(makeChar({ customize: { [K + "fury"]: { action: { name: "Roar", heal: "1d6" }, attackOption: { onHit: { byLevel: { 1: "1d4" } }, cost: { resource: "Fury" } } } } }), R);
  const f = st.progress.features.find(x => x.key === "class:tester:1:fury")!;
  expect(f.action).toEqual({ name: "Roar", heal: "1d6" }); expect(f.attackOption?.onHit).toBe("1d4"); expect(f.custom).toBe(true);
  expect(f.noteDefs?.toggle?.id).toBe("fury");
  expect(st.attackOptions.some(o => o.name === "Fury")).toBe(true);
});
it("grows with level: nothing until the first level", () => {
  const st = derive(makeChar({ customize: { [K + "fury"]: { attackOption: { onHit: { byLevel: { 3: "1d4" } } } } } }), R);
  expect(st.progress.features.find(x => x.key === "class:tester:1:fury")!.attackOption).toBeUndefined(); expect(st.progress.problems).toEqual([]);
});
it("a bad customization keeps the note version, stays writable and is listed in words", () => {
  const p = parseNote({ ...tester, customize: { [K + "fury"]: { toggle: { endsOn: "tomorrow" } } } }) as any;
  expect(p.writable).toBe(true);
  const st = derive(p.value, R);
  expect(st.toggles.find(t => t.id === "fury")!.def.endsOn).toBe("long");
  expect(st.progress.problems).toContain("Your changes to Fury could not be used, so the note's version is shown. Open Customize to fix or reset them.");
});
it("a later note change shows through fields the player did not touch", () => {
  // invented feat "Shock Palm" v1 action { name: "Palm", damage: "1d6" }; customize { action: { damageType: "lightning" } }; re-add the feat as v2 with damage "1d8"
  expect(f2.action).toEqual({ name: "Palm", damage: "1d8", damageType: "lightning" });
});
it("derive never mutates registry data", () => {
  const before = structuredClone(R.get("class", "tester")!.data);
  derive(makeChar({ customize: { [K + "fury"]: { toggle: { group: "g" } } } }), R);
  expect(R.get("class", "tester")!.data).toEqual(before);
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/core/customize-derive.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the layering in `feature(...)`, plus `custom` and `noteDefs` on the row.
- [ ] **Step 4: Turn the Task 1 `it.todo` into `it`.** Run: `npx vitest run tests/core/customize-derive.test.ts tests/core/customize-data.test.ts && npm test`. Expected: PASS, all existing tests included.
- [ ] **Step 5: Commit** `feat: apply customizations when the sheet derives a character, over the note and the built-in mechanics` (with the Co-Authored-By line).

### Task 5: Item customizations (per inventory row)

**Files:**
- Modify: `src/core/effects.ts` (`collectEffects`, new `itemToggle`)
- Modify: `src/core/derive.ts` (the `items` list, item toggle rows, `ActorStats.itemActions`)
- Modify: `src/ui/controller.ts` (`useAction(..., itemIndex)` already accepts it from Task 3; nothing new)
- Test: `tests/core/customize-items.test.ts`

**Interfaces:**
- Produces: `export function itemToggle(it: ItemData, e: InventoryEntry): ToggleDef | undefined` in `effects.ts`. It is the item's switch after the entry's customization: `layerRow(it.name, { toggle: it.toggle }, e.customize, 0, () => {}).toggle`. `collectEffects` gates item effects with it.
- Produces: in `deriveCharacter`, `items` becomes `{ e, it }` where `it` is the registry data with `toggle` and `attackOption` replaced by `layerRow(it.name, { toggle: it.toggle, attackOption: it.attackOption }, e.customize, level, problem)` (a shallow copy, never the registry object). P3's attack options and the item toggle rows read this list.
- Produces: `ActorStats.itemActions: { index: number; name: string; action: ActionDef }[]`. It holds each entry whose layered `action` exists and that works: a compendium item that passes `itemWorks`, or a custom (name-only) item with `qty > 0`. A custom item gets a Use action and a pin only; it has no effects to switch.

- [ ] **Step 1: Write the failing tests** (invented compendium item "Humming Stone", wondrous, effects `{ modifiers: [{ target: "speed", value: 5 }] }`, no switch)

```ts
it("one row made a switch; the other copy is untouched", () => {
  const inv = [{ id: "humming-stone", qty: 1, equipped: true }, { id: "humming-stone", qty: 1, equipped: true, customize: { toggle: { id: "humming-stone-2" } } }];
  const st = derive(makeChar({ inventory: inv }), R);
  expect(st.toggles.filter(t => t.ref.startsWith("item:")).map(t => [t.id, t.itemIndex])).toEqual([["humming-stone-2", 1]]);
  expect(st.speed.value).toBe(35);                              // row 0 still counts, row 1 is off
});
it("an item Use action spends its own charges", () => {
  // invented "Tingle Wand": charges { max: 3, reset: "dawn" }; row customize { action: { name: "Tingle", damage: "1d6", damageType: "lightning", cost: { charges: 1 } } }
  expect(st.itemActions).toEqual([{ index: 0, name: "Tingle Wand", action: { name: "Tingle", damage: "1d6", damageType: "lightning", cost: { charges: 1 } } }]);
  ctl.useAction(st.itemActions[0], 0); expect((ctl.value as Character).inventory[0].charges).toEqual({ used: 1 });
});
it("a custom item can get a Use action", () => {
  const st = derive(makeChar({ inventory: [{ name: "Odd Charm", qty: 1, customize: { action: { name: "Zap", heal: "1d4" } } }] }), R);
  expect(st.itemActions.map(a => a.action.name)).toEqual(["Zap"]);
});
it("an unequipped or unattuned item offers no Use action", () => { /* same wand, equipped: false */ expect(st.itemActions).toEqual([]); });
it("registry item data is never changed", () => { /* deep-equal before/after as in Task 4 */ });
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/core/customize-items.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `itemToggle`, the layered `items` list (the item toggle rows use the layered toggle; drop the old `it.toggle` reads) and `itemActions`. If P3's attack-option builder reads the registry for items, point it at `items`.
- [ ] **Step 4: Run them to see them pass,** then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: customize each inventory row on its own, including Use buttons on items` (with the Co-Authored-By line).

### Task 6: The form model and controller commands

**Files:**
- Create: `src/ui/customize-form.ts`
- Modify: `src/ui/controller.ts` (`Panel`, draft state, commands; `setEditing` closes the panel like `customize`)
- Test: `tests/ui/customize-form.test.ts`

**Interfaces:**
- Produces (in `customize-form.ts`):
  - `export interface DiceField { mode: "dice" | "scale" | "levels"; dice: string; scale: string; levels: { level: string; dice: string }[] }`
  - `export interface CustomizeForm { pin: boolean; isSwitch: boolean; switchCost: "free" | "resource" | "slot" | "charges"; switchResource: string; switchAmount: string; switchSlot: string; switchCharges: string; group: string; endsOn: "short" | "long" | "never"; isOption: boolean; toHit: boolean; toHitDice: DiceField; onHit: boolean; onHitDice: DiceField; reroll: boolean; optionResource: string; oncePerTurn: boolean; hasUse: boolean; useName: string; useEffect: "none" | "damage" | "heal"; useDice: DiceField; damageType: string; saveAbil: "" | Abil; dcFrom: string; dcFixed: string; useCost: "free" | "resource" | "charges"; useResource: string; useAmount: string; useCharges: string }`. `dcFrom` is `"spell"`, `"fixed"` or a class DC name.
  - `export function formFrom(effective: RowDefs, mine: Customization | undefined, pinned: boolean, name: string): CustomizeForm`. It is prefilled from the effective values. A "Grows with level" table is read back from `mine`. A `{scale}` dice value opens in `scale` mode.
  - `export function formProblem(f: CustomizeForm, scales: string[]): string | undefined`. The exact plain words, checked in this order:
    - `Pick the resource it spends.`
    - `Dice must look like 1d4 or 2d6+1.`
    - `Pick a scale.`
    - `Give at least one level and its dice.`
    - `Pick what the attack option does.`
    - `A fixed DC must be a whole number, such as 13.`
    - `Give the Use button a name.`
  - `export function customizationFrom(f: CustomizeForm, note: RowDefs, name: string, takenToggleIds: string[]): Customization`. It keeps, per part, only the fields that differ from `note` (JSON compare). A part switched off that the note has becomes `false`. A part switched on that the note lacks gets the full definition (a new switch's id is `freshToggleId(name, takenToggleIds)`). Equal parts are omitted. `{}` means "nothing to keep".
- Produces (controller):
  - `export type CustomizeTarget = { kind: "feature"; key: string; name: string; pinRef: string } | { kind: "item"; index: number }`
  - Panel kind `{ kind: "customize-row" }`.
  - `customizeDraft: { target: CustomizeTarget; form: CustomizeForm; error?: string } | null`
  - `startCustomize(t: CustomizeTarget): void`. It guards and opens the panel. For a feature, the note values are `row.noteDefs ?? row`. For an item, they are the registry data's `toggle` and `attackOption` with no action.
  - `touchCustomize(mut: (f: CustomizeForm) => void): void` redraws. Typing into text fields writes `draft.form` directly without a redraw, as the combo form does.
  - `saveCustomize(): boolean`. It runs `formProblem`, then dispatches `customize` or `customizeItem` (with `{}` meaning reset), then dispatches `pin` when `pin` changed. For an item the pin ref is `itemPinRef(entry)`. It closes the panel and notifies `Saved your changes to <name>.`
  - `resetCustomize(): boolean`. It dispatches with no value, closes the panel and notifies `<name> is back to what its note says.`
  - `cancelCustomize(): void`.

- [ ] **Step 1: Write the failing tests** (pure tests plus a controller built as in `tests/ui/toggles-ui.test.ts`; a `host` whose `saveItem`, `saveCreature`, `saveSpell` and `updateSpell` are `vi.fn()`)

```ts
it("changing only the damage type stores only that", () => {
  const note = { action: { name: "Palm", damage: "1d6" } };
  const f = formFrom(note, undefined, false, "Shock Palm"); f.damageType = "lightning";
  expect(customizationFrom(f, note, "Shock Palm", [])).toEqual({ action: { damageType: "lightning" } });
});
it("a new switch gets a fresh id; switching off a note switch stores false", () => {
  const f = formFrom({}, undefined, false, "Fury"); f.isSwitch = true;
  expect(customizationFrom(f, {}, "Fury", ["fury"]).toggle).toEqual({ id: "fury-2", endsOn: "long" });
  const g = formFrom({ toggle: { id: "fury", endsOn: "long" } }, undefined, false, "Fury"); g.isSwitch = false;
  expect(customizationFrom(g, { toggle: { id: "fury", endsOn: "long" } }, "Fury", [])).toEqual({ toggle: false });
});
it("grows with level round-trips", () => {
  const mine = { attackOption: { onHit: { byLevel: { 3: "1d4", 7: "2d4" } } } };
  expect(formFrom({ attackOption: { id: "x", onHit: "1d4" } }, mine, false, "X").onHitDice).toEqual({ mode: "levels", dice: "", scale: "", levels: [{ level: "3", dice: "1d4" }, { level: "7", dice: "2d4" }] });
});
it("plain-words problems", () => {
  const f = formFrom({}, undefined, false, "X"); f.hasUse = true; f.useEffect = "damage"; f.useDice = { ...f.useDice, dice: "a lot" };
  expect(formProblem(f, [])).toBe("Dice must look like 1d4 or 2d6+1.");
});
it("save writes only the character note, then Reset removes it", () => {
  s.ctl.setEditing(true); s.ctl.startCustomize({ kind: "feature", key: "class:tester:1:fury", name: "Fury", pinRef: "feature:class:tester:1:fury" });
  s.ctl.touchCustomize(f => { f.group = "rage"; f.pin = true });
  expect(s.ctl.saveCustomize()).toBe(true);
  const c = s.saved.at(-1) as Character;
  expect(c.customize).toEqual({ "feature:class:tester:1:fury": { toggle: { group: "rage" } } }); expect(c.mainPins).toContain("feature:class:tester:1:fury");
  for (const fn of [s.host.saveItem, s.host.saveCreature, s.host.saveSpell, s.host.updateSpell]) expect(fn).not.toHaveBeenCalled();
  s.ctl.startCustomize(/* same */); expect(s.ctl.resetCustomize()).toBe(true);
  expect((s.ctl.value as Character).customize).toEqual({}); expect((s.ctl.value as Character).mainPins).toContain("feature:class:tester:1:fury");
  expect(s.notices.at(-1)).toBe("Fury is back to what its note says.");
});
it("a read-only note cannot be customized", () => { /* parse errors -> startCustomize leaves panel null and notifies the existing read-only words */ });
it("leaving Edit mode closes the form without saving", () => { /* startCustomize, setEditing(false) -> panel null, customizeDraft null, no save */ });
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/ui/customize-form.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `customize-form.ts` and the controller commands. Dice-mode details:
  - `scale` mode writes `{<scale id>}`.
  - `levels` mode writes `{ byLevel }`, with level rows that are not whole numbers from 1 to 20 left out.
  - `switchCost` `slot` and `charges` map to the `ToggleCost` variants.
  - `useCost` `charges` is only offered for items.
- [ ] **Step 4: Run them to see them pass,** then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a Customize form model that stores only what the player changed, with Reset to the note` (with the Co-Authored-By line).

### Task 7: The Customize panel, entry points and item Use buttons on every layout

**Files:**
- Create: `src/ui/customize-ui.ts`
- Modify: `src/ui/panels.ts` (`TITLES["customize-row"] = "Customize"`, `renderPanel` branch, Close calls `cancelCustomize`)
- Modify: `src/ui/traits-ui.ts` (`traitRow`: a Customize button; feat rows target their first row's key, `pinRef: "feat:<id>"`)
- Modify: `src/ui/features-ui.ts` (`featureRow`: a Customize button; a `fe-chip` "changed" chip when `f.custom`)
- Modify: `src/ui/inventory-ui.ts` (`itemMenu`: "Customize" in Edit mode; a row Use button per `st.itemActions` entry for that index)
- Modify: `src/ui/components.ts` (`pinnedItems`: the same Use button)
- Modify: `styles.css`
- Test: `tests/ui/customize-ui.test.ts`

**Interfaces:**
- Consumes: Task 6 controller commands; `resourceChoices` and `dcChoices` from `src/core/combos.ts`; `DAMAGE_TYPES` from `src/content/creature-note.ts`; `st.progress.scales`.
- Produces:
  - `export function customizeButton(ctl: SheetController, t: CustomizeTarget): HTMLElement | null`. It returns `null` unless `ctl.editing && ctl.character && ctl.writable`. The button is `data-act="customize"`, text `Customize`, with `aria-label` `Customize <name>`.
  - `export function customizePanel(ctl: SheetController, st: ActorStats): HTMLElement`.
  - Item Use buttons are `data-act="use-item-action"` with text `Use <action name>`, greyed out with the title `No charges left` when the charges are spent.

Panel content (plain words, in this order; every control has `data-cz="<form field>"`):
- **Switch**: `Make it a switch (Start / End)`; `Starting it costs` (Nothing / One of my resources / A spell slot / Item charges); `Only one switch in this group can be on at a time` (group text, placeholder "group name, optional"); `Turns off after` (a short rest / a long rest / never).
- **Attack option**: `Make it an attack option`; `Adds dice to every attack roll`; `Adds damage dice when the attack hits`; `Roll weapon damage twice, keep the higher`; `Spends one` (Free / resource list); `Once per turn (switches itself off after one use)`.
- **Use button**: `Give it a Use button`; `Name`; `What it does` (Nothing to roll / Deals damage / Heals); dice field; `Damage type`; `Target makes a save` (None / Strength … Charisma); `Save DC from` (My spell save DC, shown only with spellcasting / each class DC as "<Name> save DC" / A fixed number); `Using it costs` (Nothing / One of my resources / Item charges for items).
- Dice field: segmented `Dice` / `From one of my scales` (only when the character has scales; scale names in sentence case, never ids) / `Grows with level` (rows `From level` + `Dice`, `+ Add a level`).
- **Pin**: `Pin to Resources and charges`.
- Footer: `Save` (`mod-cta`), `Cancel`, and, when a customization exists, `Reset to the note` with the hint `Removes your changes. The class, race, feat or item note is never changed.` The draft's `error` is shown in a `fe-warn` line above the footer.
- A custom (name-only) item shows only Use button and Pin. Text inputs have `type="text"`; number inputs have `type="number"`.

CSS: `.fe-sheet button.fe-cz-seg` segment buttons; `.fe-cz-section` spacing; `.fe-tablet .fe-sheet button.fe-btn[data-act="customize"], .fe-mobile ...` `min-height: 44px`. Use theme variables only (the CSS test forbids hex).

- [ ] **Step 1: Write the failing tests** (`for (const layout of ["desktop", "tablet", "mobile"] as const)`; setup as in `tests/ui/combos-ui.test.ts`)

```ts
it("Customize appears only in Edit mode on trait, feature and item rows", () => {
  expect(s.root.querySelectorAll('[data-act="customize"]').length).toBe(0);
  s.ctl.setEditing(true);
  expect(s.q('[data-trait="feature:class:tester:1:fury"] [data-act="customize"]')).toBeTruthy();
  s.ctl.tab = layout === "desktop" ? "inventory" : "gear"; s.ctl.toggleItemMenu(0);
  expect(s.q('[data-menu="0"] [data-act="customize"]')).toBeTruthy();
});
it("making Fury cost-free in a group from the form updates its switch card", () => {
  s.ctl.setEditing(true); s.click('[data-trait="feature:class:tester:1:fury"] [data-act="customize"]');
  expect(s.q('[data-panel="customize-row"] .fe-panel-head').textContent).toContain("Customize");
  s.click('[data-cz="switchCost"] [data-value="free"]'); s.click('[data-act="cz-save"]');
  expect(s.q('[data-toggle-card="fury"]').textContent).toContain("Free to start.");
});
it("a bad dice entry is refused in words and nothing is saved", () => {
  /* hasUse on, Deals damage, type "lots" in the dice input, Save */
  expect(s.q('[data-panel="customize-row"] .fe-warn').textContent).toBe("Dice must look like 1d4 or 2d6+1.");
  expect(s.saved).toHaveLength(0);
});
it("an item Use button appears on the row and on its pinned copy", () => {
  // the Tingle Wand row from Task 5, equipped and pinned
  expect(s.q('[data-item="0"] [data-act="use-item-action"]').textContent).toBe("Use Tingle");
  expect(s.q('[data-pinned-item="item:tingle-wand"] [data-act="use-item-action"]')).toBeTruthy();
});
it("no machine ids are shown: scale and DC choices are worded", () => {
  expect(s.q('[data-panel="customize-row"]').textContent).not.toMatch(/[a-z]+-[a-z]+-[a-z]+/);
});
it("Play mode or Close leaves no draft behind", () => { /* open, click Close -> ctl.customizeDraft === null */ });
```

Add to `tests/ui/css.test.ts`: `.fe-sheet button.fe-cz-seg` exists, and the tablet and mobile `[data-act="customize"]` rule has `min-height: 44px`.

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/ui/customize-ui.test.ts tests/ui/css.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `customize-ui.ts`, the entry buttons, the item Use buttons, the panel registration and the CSS.
- [ ] **Step 4: Run all checks.** Run: `npm test && npm run typecheck && npm run build`. Expected: all PASS (the layout parity tests unchanged), build writes `main.js`.
- [ ] **Step 5: Commit** `feat: Customize form on every feature, trait, option, feat and item row in Edit mode, on all three layouts` (with the Co-Authored-By line).

---

## Self-review

- **Spec coverage (section 5):**
  - Customize on every feature, trait, option, feat and item row, in Edit mode: Task 7.
  - Switch with cost, group and "ends on rest": Tasks 2, 6 and 7.
  - Attack option with kind, resource, dice or level scale, and once per turn: P3's shape, Tasks 2, 4, 6 and 7.
  - Use action: damage or heal dice or a scale (Task 6), damage type (Task 3), save ability and DC source (Task 3), resource cost (Task 3).
  - Pin: Tasks 6 and 7.
  - Stored on the character, keyed by ref; items per inventory entry: Task 1.
  - Applied at derive over the note: Tasks 4 and 5.
  - Reset to the note: Tasks 1, 6 and 7.
  - Never writes notes: Task 6 test, plus the registry-unchanged tests in Tasks 4 and 5.
  - Nothing named in code: all fixtures are invented and the code is generic.
  - The built-in overlay's default attack-option definitions and note-declared attack options are P3's; P4 layers over them (Task 4 overlay rule).
- **Placeholders:** none. Each step names its file, its signature, its exact words and its command.
- **Types:**
  - `Customization`, `RowDefs`, `layerRow`, `customizeKey` and `freshToggleId` are used with the same names in Tasks 1–7.
  - `useAction(f, itemIndex?)` is defined in Task 3 and used in Tasks 5 and 7.
  - `CustomizeTarget` is defined in Task 6 and used in Task 7.
  - P3 names are flagged once, in "Interfaces from earlier plans".
- **Proportion:** seven tasks with test assertions and signatures, and no implementation bodies beyond the layering order.
