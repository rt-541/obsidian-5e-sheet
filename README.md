# 5e Character Sheet (Obsidian plugin)

Private plugin. 2014 D&D 5e sheet for character, companion and NPC notes; desktop and mobile.

Includes material from the System Reference Document 5.1 by Wizards of the Coast LLC,
licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).
No other published content is included; add your own as notes under `Compendium/`.

## Use

- A note with frontmatter `type: 5e-character` (or `5e-npc` with a `creature:` id) opens as a sheet. See `examples/`.
- Homebrew lives in the compendium folder (default `Compendium/`): notes with `type: 5e-item`, `5e-condition`, `5e-injury`, `5e-creature`, `5e-class`. A DM can send one of these files; copy it in and it appears immediately.
- Link a campaign note (`type: 5e-campaign`) with `campaign: "[[Name]]"` to set rules, hidden sections and weather for the whole party.
- Deploy: `scripts/deploy.sh` (builds and copies to azure-dragon's dnd vault).

## Compendium browser

Run "Open 5e compendium" (or use the book icon in the ribbon) to browse every source in one place: source tabs (All, WotC (SRD), WotC, Critical Role, Roll20, Homebrew, any other folder under the compendium root), type tabs, name search, detail cards, "Open note" and "Add to character" (items, spells and creatures as companions, to the most recently active sheet). A campaign note can switch sources off with `sources: { Roll20: false }`: those sources disappear from the level-up wizard, builder and add pickers, and show dimmed in the browser.

## Built-in mechanics

Most notes (the SRD, the WotC library, most homebrew) describe a feature in words but carry no numbers. The plugin ships a table of built-in mechanics (`src/content/overlay/mechanics.json`) and fills in what a note leaves empty: Unarmored Defense, Rage, Martial Arts, Sneak Attack, fighting styles, Divine Strike, Draconic Resilience, racial resistances, breath weapons, common feats and more. Players never write any of it: it shows up as armor class, attack rows, resources and Start / End buttons, and the feature row carries a small "built-in" badge.

- A note that declares its own effects, switch or action always wins; the built-in entry is skipped.
- Opt out per feature or option with `overlay: false`, or for a whole class, subclass, race, feat or item note with `overlay: false` in its frontmatter.
- The plugin setting "Built-in mechanics" (on by default) turns the whole table off.
- Entries are versioned with the plugin: fixing one fixes every character without touching a note.
