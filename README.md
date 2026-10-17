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
