# Build 1 after the mechanics audit: engine fixes, toggles, new effects, overlay, combos, tablet, level-up explanations

> For agentic workers: shared context. Read this file, `docs/plans/2026-10-18-audit-synthesis.json` (the audit synthesizer's design: newEffects, toggles, overlay, overlayEntries, engineBugs, deferred), and the "Who owns what" section of `docs/plans/2026-10-17-compendium.md` (never write under generated library folders `compendium/5e/WotC`, `Kobold Press`, `Necromancer Games`, `Mystic Arts`, or under `campaigns/`; never commit book text; never edit `.obsidian/graph.json`). Branch `feat/mechanics` (from `feat/followup`). Test first, commit per task, push after each. Never push to main.

## Who this is for (user, 2026-10-18): players who are NOT rules-savvy

Every task below must follow these principles; the reviewer checks them.
1. Mechanics are automatic. Players never type YAML, effect keywords or formulas; everything is buttons, forms and pickers.
2. Plain language: "Start Rage" / "End Rage", "Bonus action" (never "BA"), short sentences; the full rules text is one tap away (detail cards).
3. Every number explains itself: tapping/hovering AC, an attack bonus, a damage roll, a save, a skill, speed, HP max, a DC shows a breakdown in words ("AC 17 = 10 + Dex 4 + Wis 3 (Unarmored Defense)").
4. Toggled states are big, obvious buttons on the main page (Main / Combat), and while active they show what changes ("Raging: +2 melee damage, resist bludgeoning/piercing/slashing, advantage on Strength checks and saves"). Spending the cost happens automatically on start; if nothing is left, say so in words.
5. Level-up explains itself: the summary page is a before/after diff in plain language (see task 8).
6. Combos are coaching: "When to use it" + ordered steps with action-type badges, editable through a form.
7. Expert controls (customize, raw fields, overrides) only in Edit mode.
8. Safe defaults: nothing a tap does corrupts a note; destructive actions confirm or can be undone.

## Tasks

**Stage A, engine bugs and core extensions** (synthesis `engineBugs` + `newEffects` "modifiers (extended)" and "while"):
1. Modifiers: Formula values, `on` roll-tag scope (AND with `+`), numeric hpMax and carry (Tough, Dwarven Toughness, Aid), `double`, passive targets; check modifiers also apply to raw ability checks and initiative so the number and the roll agree.
2. `while` gates on effects blocks (armor none/worn/light/medium/heavy, shield none/worn, wield dual, toggle:<id>), evaluated in derive against equipped items and active toggles.
3. Crits: rolls flag a crit at the derived crit range (Champion, War Mind Battle Brilliance when applicable via `on`), not only natural 20.
4. Rests: Warlock pact slots return on a short rest; resources and item charges with reset `dawn` recharge on a long rest when the holy-days rule is off (and on the holy day when it is on).
5. Spells op `from: "*"` (any class list) for Magical Secrets; school restrictions only apply where the op says so (Eldritch Knight / Arcane Trickster free picks).
6. Weapon proficiency: add the proficiency bonus only for weapons the character is proficient with (class/race/feat proficiencies incl. "Simple Weapons"/"Martial Weapons" and specific weapons); show "not proficient" in the attack breakdown.
7. Damage types: the HP damage control takes an optional type; resist halves, immune zeroes, vulnerable doubles, with the breakdown shown; dropping to 0 HP adds Unconscious and, if concentrating, shows a plain prompt "Make a Constitution save to keep concentrating (DC N)" with a roll button.
8. Diseases can be applied again (shown in a separate "Diseases" group in the conditions panel); condition immunities stop a condition from being added (with a message).

**Stage B, toggles and the new effect keywords** (synthesis `toggles` + `newEffects`): `toggle` on features, options and items with state in `character.active`, cost on start, groups (one active per group), `endsOn`, value label; effects ride a toggle via `while: [toggle:<id>]`. Keywords: acFormula, armorDexMax, weaponRule (+ built-in Unarmed Strike row and off-hand row), weapons, extraDamage, critDice, spellDamage, halfProf, d20Rule, senses, speeds, attacks (count shown as "Attacks per action: 2"), conditionImmune, abilityBonus, plus the roll tags (concentration, weapon:*). All validated like existing effects; the effects description in cards uses plain words for each.

**Stage C, built-in mechanics overlay**: `src/content/overlay/mechanics.json` with the synthesis `overlayEntries` of priority **high** (51), keyed `<kind>:<owner>:<feature>` as the synthesis describes; applied when the note's own feature/option/item has no effects (note effects win; a note can opt out with `overlay: false`). Tests: one per overlay entry asserting the derived numbers on a minimal character (e.g. SRD Monk 5 Dex 18 Wis 16 no armor: AC 17, Unarmed Strike +7 1d6+4, speed 40; Barbarian 5 raging: +2 melee Str damage, resistances; Fighter Defense style in chain mail: AC 17; Bard 2 Jack of All Trades: +1 to non-proficient checks and initiative), using both the SRD notes and the WotC library shape (copy library frontmatter shapes only, invented bodies).

**Stage D, player-facing UI**:
1. **Combos tab** (desktop, tablet, mobile; parity): combos stored in the character note `combos: [{ name, when, steps: [{ action, who?, use?, text }], notes? }]` (see the approved design in this file's history and the mockup `https://scratch.rt-541.io/dnd-sheet/devices/`, source `/home/aschneider/.claude/jobs/e6629327/tmp/mock3/entry.ts`); cards with a ready line ("Ready" / "Partly: needs 3 ki (1 left)"), action badges, live buttons (attack to-hit/damage, cast, use resource with pips, DC), red when unavailable, detail cards on tap; pin a combo to the main page; add/edit/reorder/delete via a form in Edit mode with pickers for `use` (features, attacks, spells, items, resources, companions and their attacks).
2. **Tablet layout**: picked automatically on tablets (`Platform.isTablet`) and for panes 700-1100 px wide; sticky header (identity, HP, AC, initiative, speed, conditions, toggles, roll mode, rests, level up, roll log), tabs Main (two columns: checks | HP controls, toggles, attacks, pinned spells, pinned combos, traits, resources, hit dice, death saves, effects) / Combos / Spells / Gear / Features / More, 44 px targets; setting `layout: auto|desktop|tablet|mobile`.
3. **Why-this-number breakdowns** (principle 3) on AC, attacks, damage, saves, skills, initiative, speed, HP max, spell DC/attack, class DCs, passive perception, carry.
4. **Toggle buttons** on Main/Combat (principle 4).
5. **Level-up explainer**: the wizard's summary computes the derived character before and after the level and lists every change in plain language: new features (with one-line summaries), optional features taken, scale changes ("Martial Arts die d6 -> d8: your unarmed strikes and Flurry of Blows now roll d8+4"), resources (new, max or recharge changes), proficiency bonus and every number it moves (attacks, saves, skills, DCs), HP gained (roll or average + Con), spell slots and spells known, attacks per action, AC, speed, crit range, resistances, senses, ability increases and their ripple. Undo shows the same list reversed.
6. **Right-click new character**: file-explorer folder menu "New 5e character here" opens the builder and saves into that folder; a campaign note's menu "New character in this campaign" pre-links the campaign.
7. Plain-language pass over existing labels and messages (principle 2).

**Stage E, content**:
1. Repo example: `examples/Ren Ashfall.md` (invented human Way of the Open Hand Monk 5, SRD only) with the four mockup combos (Stun Lock, Open Hand Topple, Hit and Fade, Turtle Up) in the new `combos:` format.
2. Azur starter combos in his vault note `C:/obsidian/dnd/5e-sheet/Characters/Azur.md` (read it first; he is now Tactician 7 War Mind, Chromatic Dragonborn lightning, Embercladding + Stormweave Voidblade): Opening Analysis (Analyze bonus action, attack twice with the Voidblade, crit 19-20 vs the analyzed target, plan die for Combat Analysis damage, Guiding Guile for an ally), Breath and Blade (breath weapon replaces one attack, Draconic Charge, next turn Storm Bolt), Burning Bulwark (Flame Aura on, step into the enemy line, Protection reaction; note: the aura burns adjacent allies too and Burning Hunger costs 1d4), Hold the Line (defensive round, Protection, keep plan dice for allies' saves). Validate with the plugin parser before upload; do not change any other field.

## Review focus

1. Monk 5 shows AC 17 and an Unarmed Strike row with Dex and the martial arts die on desktop, tablet and phone; Barbarian rage works start-to-end (cost, effects, end).
2. Non-savvy player test: every new control is labeled in plain words, every number has a breakdown, nothing requires typing rules syntax.
3. The level-up explainer lists every change for Monk 10 -> 11 (martial arts d6->d8 at 11, ki 10->11, Tranquility) and Barbarian 4 -> 5 (Extra Attack, Fast Movement, prof +2 -> +3 ripple).
4. No regression: all existing tests pass; legacy notes (Thalia) and Azur unchanged except the added combos.
5. Nothing written under generated folders or campaigns; no book text committed.
