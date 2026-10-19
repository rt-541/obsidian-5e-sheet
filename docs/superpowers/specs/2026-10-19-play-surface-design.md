# Play surface, attack options, items and per-character configuration

Date: 2026-10-19. Status: draft for the user's approval.

## Intent and why

The sheet is used live at the table by players who are not rules-savvy. Three things keep pulling people out of the game:

1. **Features that change a roll are invisible.** Perfect Plan (spend a die, add 1d4 to an attack), Combat Analysis (spend a die on a hit for extra damage) and Savage Attacker (reroll weapon damage, keep the higher) live as text or as a bare Use button, so players forget them or spend them by hand and lose track.
2. **Changing how a feature behaves means editing a class or race note in YAML.** Players will not do that, and the user wants every behaviour configurable from the sheet's Edit page, for any race, class, feat or item, never hard-coded to one character.
3. **Weapons and armor are clumsy.** Adding "+1 Armor" gave a nameless +1 with no base armor; owned armor stacks as x2; equipping is a separate trip; versatile weapons have no one-hand/two-hand choice; there is no way to see or change what an item is.

The user also wants to choose, easily and at any moment, between the sheet rolling dice and rolling their own physical dice, with the sheet telling them exactly what to roll and still doing the bookkeeping.

## Goals

### 1. Main page layout (desktop; tablet and phone follow the same order)

- **Middle column top: one row of four stat tiles** `[AC] [Init] [Speed] [PP]` that fills the column width (phone: two by two). Each tile keeps its glossary label and why-this-number breakdown.
- **Roll mode is a three-position slider placed directly above the Attacks card**: `Disadvantage (o| | ) Advantage`; the knob position shows the current mode (left = disadvantage, middle = normal, right = advantage). It replaces the three roll-mode buttons and is removed from the header.
- **Under the Skills card, a small "Settings" card of rarely-touched global switches**, each showing its current option:
  - **Rest mode**: Normal (short and long) | Hexploration (night's rest). This is the existing `rest-excursion` rule (moved here from the Rest card).
  - **Hex / Trad**: Hexploration rations and foraging on | off. This is the existing `hexploration` rule module.
  - **I roll my own dice**: off | on (see 4).
  All three are per character, saved in the note, and respect the existing campaign-default and override order (`ctl.setRule` / `resolveRules`); the dice switch is a new character setting.

### 2. Attack rows

- **One compact line per weapon**: `Longsword  +5 Atk / 1d8+3`. "+5 Atk" is the to-hit button, "1d8+3" is the damage button; crit and notes stay available (crit as a small button, notes on hover or tap).
- **Versatile weapons** (any weapon with the versatile property, including homebrew and imported ones) get a small `1H | 2H` switch on their row; 2H uses the versatile die. The choice is remembered per inventory entry in the note.
- **Shield tracking**: while a shield is equipped, 2H is greyed out with the hint "Put away your shield to use two hands"; equipping a shield while a weapon is set to 2H flips it to 1H and says so. Switching to 2H while a shield is equipped offers a one-tap "Put away shield".

### 3. Attack options (dice-spending and roll-changing features)

- An **"Attack options" card placed directly above Resources and charges** (user, 2026-10-19), one switch per feature, feat, option or item marked as an attack option (Perfect Plan, Savage Attacker, Combat Analysis...). On tablet and phone it sits in the same order, just before Resources. Each switch shows what it does and what it costs ("Perfect Plan: +1d4 to each attack, 3 dice left").
- Three kinds, any of which a definition can combine:
  - **To-hit die**: every attack roll while on spends 1 of a resource and adds dice to the to-hit (Perfect Plan: 1d4).
  - **On-hit damage dice**: only when the attack hits (see the hit window) spends 1 of a resource and adds dice to that damage roll; the dice may come from a level scale (Combat Analysis: 1d4 / 2d4 / 3d4 / 4d4).
  - **Damage reroll, keep higher**: the weapon damage dice are rolled twice and the higher kept (Savage Attacker).
- **Limits**: an option can be "once per turn": it applies to the next qualifying roll and then switches itself off (the sheet cannot see turns); the player switches it on again. When a resource runs out the switch turns itself off and says "No Perfect Plan dice left".
- **The hit window**: after a to-hit roll the sheet shows "Hit? Roll damage" next to that attack for 3 seconds. Pressing it counts as a hit: damage rolls and on-hit options apply and spend. No press within 3 seconds counts as a miss: nothing on-hit is spent, the prompt fades. The damage button on every attack row stays available at all times and pressing it also counts as a hit.
- **Nothing is spent silently**: every roll's detail lists what applied, e.g. "Longsword damage 11 = 1d8+4 (6) + Combat Analysis 2d4 (5); 1 Perfect Plan die left".
- This replaces the half-built Perfect Plan `perAttack` toggle (work in progress saved outside the repo).

### 4. Rolling your own dice

- With "I roll my own dice" on, nothing is rolled by the sheet; every roll button shows **what to roll** and still does the bookkeeping (spending resources, slots, uses, ammunition is out of scope):
  - Attack: "Roll 1d20 + 5, plus 1d4 for Perfect Plan (die spent, 3 left)"; advantage reads "Roll 2d20, keep the higher, + 5 ...". Then **Hit / Miss / Crit** buttons: Hit shows the damage to roll ("Roll 1d10 + 3 (two hands) + 2d4 for Combat Analysis (die spent)"), Crit doubles the dice in that instruction, Miss spends nothing on-hit.
  - Checks, saves, Use buttons, spells and breath-style actions give the same kind of instruction ("They roll a DEX save against DC 14; you roll 2d10 lightning, half on a save").
  - An optional box takes the player's total so it shows in the roll log; skipping it changes nothing else.
- Both modes work for everything the sheet can roll today, from the same data.

### 5. Edit-page feature configuration (per character)

- In Edit mode every feature, trait, option, feat and item row gets **"Customize"**, opening a plain-words form that can:
  - make it a **switch** (with cost, group, ends on rest), or an **attack option** (kind, resource it spends, dice or a level scale, once per turn);
  - give it a **Use action**: damage or healing dice (or a scale), damage type, save ability and which DC it uses, resource cost;
  - **pin** it to Resources and charges.
- Saving stores the configuration **on the character** (a new `customize` map in the character note, keyed by the feature/option/item ref). It is applied when the sheet derives the character and layers over what the class, race, feat or item note says (note values still apply where the customization is silent). The class, race, feat and item notes are never written. A "Reset to the note" button removes it.
- Nothing in code names a specific class, race, feat or item; the built-in mechanics overlay may ship default attack-option definitions for well-known features in the same shape.

### 6. Items

- **Generic magic items need a base**: library items that apply to "any armor", "any weapon" or "any sword" (+1/+2/+3 Armor and Weapon, Flame Tongue-style items, Armor of Resistance-style items) ask **"Which armor?"** (or weapon) when added, with the matching base items listed, and show the result before adding ("+1 Chain Mail: AC 17 (16 + 1), Str 13, Stealth disadvantage, 55 lb"). The entry stores the base and the variant; name, armor class, damage and bonuses come from both.
- **Item stat-block card**: a small box in stat-block style (name, type line with rarity and attunement, AC or attack/damage line, properties, charges, weight and cost, description) shown in the Add item panel when an item is selected, as the item's detail card, and as a live preview in the custom item and import forms.
- **Edit an item in the inventory**: the item's "..." menu gets "Change", opening the same form with the card preview: rename, change base (chain mail to plate), bonus, charges, notes. Stored on the inventory entry; the library note is never written.
- **Adding gear**: armor, shields and weapons you already own show "Owned"; adding again creates a separate row, never a stacked count ("+1" stays for potions, ammunition, rations and other stackables). Adding armor, a shield or a weapon offers **"Equip now"** with a preview of the change ("AC 15 -> 17, Leather armor put away" / "Adds Longsword to Attacks: +5, 1d8+3"), "Equip and attune" when attunement is needed (showing 2 of 3), or "Just add it".
- **Importer**: the 5e.tools importer records the variant information (what base it needs and what it adds) so generic items work; its unfilled template text ("You have a armor bonus") is fixed. The vault is re-imported only with the user's go-ahead.

### 7. Fixes found by the rendered UI pass

- A Good Rest heals to the note's stored maximum instead of the derived maximum (43 instead of 48 with a hit point bonus).
- The builder's equipment page lists stacked gear once per piece ("Crossbow Bolt" twenty times) and title-cases tool names badly ("Smith'S Tools").
- The builder's "learn cantrips" step lists leveled spells first; cantrips must come first (or only cantrips).
- The level-up and builder bottom bar lets content show through underneath.
- On a 390 px phone the tab strip scrolls sideways and cuts off "More".
- Unknown race/subclass ids show as raw ids with no "missing" marker.

**Full UI review (2026-10-19, rendered with Obsidian 1.14.4's real CSS; review page https://scratch.rt-541.io/dnd-sheet/ui-review/review.html, gallery at the same path).** In scope, in this priority order:

1. **P1, narrow rows on phone/tablet**: names break mid-word (inventory, spells, combo steps) because `overflow-wrap: anywhere` meets 44 px button groups that never shrink. Names get their own line on narrow layouts and wrap at word boundaries.
2. **P1, phone/tablet Combat order**: HP and HP controls, Attacks, Attack options, Resources first; death saves beside HP; stance/toggle cards after. Phone header made compact (and sticky like tablet's). Height budget: the pinned phone block stays under 25% of an 844 px viewport (about 210 px, like tablet); Level up and Roll log live at the top of More, not in the pinned block. Phone tab labels are short (Fight, Combo, Check, Spell, Gear, Pets, More) so seven equal columns fit at 390 px.
3. **P1, raw tokens and ids shown to players**: unresolved scale placeholders (`{...-damage}`), formula names ("+ unarmored_movement", "+ total"), option-list ids ("fighter-fighting-style"). Every player-facing value is resolved or worded.
4. **P1, builder cantrip step**: show only cantrips on that step; fix "0 of 0".
5. **Inputs without a `type`** render as raw boxes under Obsidian's CSS: every text input gets `type="text"` (combo, companion, searches, builder, level-up, compendium).
6. **Tabs render as filled buttons** (Obsidian's button rule outranks `.fe-tab`); small buttons become pills/circles on mobile: plugin selectors at `.fe-sheet button.x` specificity, stat tiles not buttons.
7. **Title-case bug** ("Sleight Of Hand", "Smith'S Tools"): one shared helper that leaves apostrophes and small words alone.
8. **One resource convention**: "N of M left" plus boxes everywhere (slots included), duplicates removed (Channel Divinity twice), charges counted, repeated "5 of 5 left" in combo steps reduced.
9. **Non-casters** get no spell cards or "No spellcasting" line; all loose text sits in cards (spell DC line, Combos heading).
10. **Pickers search-first and filtered**: Add item search above the custom form, no draft state leaking between attempts, no vault paths; Add spell filtered to castable levels with known spells marked and a truthful switch label; companion picker filtered by kind, create/import at the top, one name field, placeholders that do not look like values, and edit/remove for companions.
11. **Rests**: previews list everything that comes back (Ki and other resources), nothing that does not apply (spell slots for a monk); one set of terms (Hexploration / night's rest / good rest), one control (see the Settings card note below); the night's-rest panel uses one control type with matching labels.
12. **Wizards**: stable step counts, ineligible multiclass options collapsed with one reason, builder race/class descriptions (this is also the builder hover-summary item in next-build.md), language picker, Create after Back.
13. **Casting**: slot buttons show what is left; casting an unprepared spell warns.
14. **Plain-language pass**: Class DCs, Scales, "built-in" pills, the "C" chip, "WotC (SRD)" on every row, machine ids in Customize ("Ac", "Xp"), "[[Campaign]]", "Spend 1 Ki Points", "S/F" death saves.
15. **Smaller fixes**: Good Rest to the derived maximum (above), compendium detail pane going stale, combos empty state explained and the "Free" badge readable (duplicate `.fe-badge`), tablet sticky header letting content show above it, tablet column balance, notes tab rendering Markdown, toasts in one corner not covering HP or header buttons, Edit-mode header not wrapping or duplicating XP.
16. **P3 polish** (do when touching the area): fewer dotted underlines, consistent item rows, form spacing, legends for proficiency/prepared dots, small wording.

**Adjustments to the agreed redesign from the review (my calls):**
- On tablet and phone, Skills live on a separate Checks tab, so the **Settings card goes in the same tab as the Rest card** there (desktop keeps it under Skills, next to the Rest card's column).
- On phone the **Attack options card sits directly under Attacks** (above Resources, as on desktop), with its one-line hints kept.
- The **one-line attack row** lands only after the narrow-row fix (item 1).
- The **four stat tiles** are tiles, not buttons (so mobile CSS cannot turn Initiative into a circle); on phone HP keeps its own row.
- The **roll-mode slider** replaces the header copy on every layout.

## Non-goals

- Tracking turns, initiative order or targets (enemy AC); the hit window and "once per turn" are the player's call.
- Sharing state between characters (party rations, foraged surplus going to another sheet).
- Ammunition counting on attacks.

## Anti-goals (failure even if it works)

- Anything that requires the player to type YAML, effect keywords or formulas.
- Code that special-cases a named race, class, feat or item.
- Spending a resource without saying so in words.
- Writing to class, race, feat, item or library notes from the sheet (only the character note and the user's own Homebrew folders).
- Book text in the repo or on any published page; fixtures stay invented because the code is mirrored to a public repo.

## Constraints

- Plain DOM via `h()`, never innerHTML; mount roots use `classList`, never `className`.
- Every feature at parity on desktop (hover), tablet and phone (tap), 44 px targets on touch; layout parity tests place each feature once per layout.
- Test first; all existing tests keep passing (1499 at the time of writing).
- Existing data stays readable: notes without the new fields behave exactly as today.

## Decided by the user

- Attack options are switches in their own card directly above Resources and charges; on-hit options spend only on a hit; the hit is signalled by rolling damage within 3 seconds, otherwise it is a miss; the manual damage button stays and also counts as a hit.
- Both dice modes, easy to switch, with the sheet saying what dice to roll.
- Attack line format `Longsword +5 Atk / 1d8`; versatile 1H/2H switch; shield tracked.
- Roll mode as the three-position slider above weapons; the Settings card under Skills with Rest mode, Hex/Trad and I roll my own dice; the four stat tiles across the middle column.
- Everything race/class agnostic and configurable from the Edit page.

## My calls (the user can override)

- The roll-mode slider snaps back to the middle after one advantage or disadvantage roll, as roll mode does today.
- "Once per turn" options switch themselves off after one use.
- The 1H/2H choice and item changes are stored per inventory entry; customizations per character.
- Stat tiles wrap two by two on the phone.
- A to-hit option spends on the roll (before the hit is known), as the rule intends.
- **Scope of section 7**: the full UI review's findings are appended to section 7 before planning; the plan treats that list as final.
- **Importer and generic items**: the importer change is in scope as a separate hand-off to the private compendium pipeline (its own branch, never the plugin repo, never mirrored publicly); it records variant data and fixes the template text, and the homebrew templates learn the same fields. The plugin does **not** wait for a re-import: it recognises generic items in today's notes from the name and type line ("+1 Armor", "+2 Weapon", "Armor (any armor)", "Weapon (any sword)") and asks "Which armor?" from that, preferring explicit variant data when present.
- **Items are per row**: inventory entries get a stable row id; "Change", the 1H/2H choice and an item's Customize (attack option, Use action) live on that entry, so two Longswords can differ. Feature, option and feat customizations stay in the per-character `customize` map keyed by ref.
- **Existing stacks are left alone**: armor or weapons already stored with qty 2 or more keep loading as before; their "..." menu offers "Split into separate rows". New adds never stack armor, shields or weapons.
- **Attack options can be declared in notes too**: class, race, feat, option and item notes get a validated attack-option field (like `toggle:` today), the library adapter and the compendium op format/templates carry it, and the Edit-page customization layers over it.

## Answered by the user (2026-10-19)

1. **Own dice and rolls that change the sheet** (spending a Hit Die, potion or item healing, rolled hit points at level-up, concentration checks, death saves, foraging, rests that heal by dice): yes, the sheet shows the dice and **asks for the total before applying anything**, with a **"Roll it for me"** button beside the box. Plain attack and damage rolls keep the optional total box.
2. **Existing automatic extra damage** (`extraDamage`, including `per: "turn"` Divine Strike-style and homebrew Sneak Attack-style effects): each becomes a **switch in the Attack options card**; **while the switch is on it applies automatically** to damage as it does today (no turn-off after use for these); switched off, it is left out. My call: these switches start **on**, so characters who never touch them keep today's numbers.

## Left to the builder

- Exact data shapes (`customize` map, attack option definition, item variant fields), file layout, and how the 3-second window is shown (a countdown ring or a fading button).
- How the built-in overlay supplies default attack-option definitions.
- The order of work, as long as each part ships tested on all three layouts.
