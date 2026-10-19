# Next build backlog

Collected requests for the build after build 1 (mechanics) and the companion picker. Same principles as `2026-10-18-mechanics.md` ("Who this is for": players who are NOT rules-savvy).

## Character builder: see what you are picking (user, 2026-10-18)

When creating a new character, hovering over (desktop) or tapping an info button next to (tablet, phone) any option shows its summary and perks before the player commits to it:
- **Race / subrace:** ability score increases, size, speed, senses, languages, proficiencies, and each trait with a one-line summary (e.g. "Darkvision: see in dim light within 60 ft as if bright").
- **Class:** hit die, primary abilities, saving throws, armor and weapon proficiencies, skill choices, and what you get at level 1 (and when you pick a subclass), each feature with a one-line summary.
- **Subclass:** its features by level, one line each.
- **Background:** skills, tools, languages, equipment, and its feature summary.
- **Feats:** prerequisite in plain words, what it gives (numbers in words), one line each.
- **Spells (if the class picks any at level 1):** the same detail card the Spells tab uses.

Use the existing detail cards and hover popover (`src/ui/details.ts`, the sheet's `[data-ref]` hover/tap behaviour) so the builder and the sheet show the same text. Parity on desktop, tablet and phone; the card must stay inside the window and never cover the button the player is about to press on touch.

## Carried over

- Prepared casters (clerics, druids, paladins, wizards): full class list, "Prepared today N / M", a daily picker, domain/oath spells always prepared, long-rest prompt; migrate Thalia.
- The ~50 medium-priority built-in mechanics overlay entries from `2026-10-18-audit-synthesis.json`.
- Wild Shape forms; spell damage riders.
- Builder minors from the build 1 UX review: campaign picker instead of typing a wiki link, language picker instead of free text, starting gear equipped, multiclass warning on the class step.
- Effects wording: no raw formula names ("rage_damage") in descriptions; Rage's "Ends after a long rest" reads as lasting all day.
- Combo form picker should list all features with an action (Flurry of Blows, Stunning Strike, Patient Defense), not only toggles.
- Breakdowns: HP max by level and Con, named Jack of All Trades, explained speed asterisk; ability-check breakdown reachable on touch.
