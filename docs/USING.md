# Using the 5e character sheet

This guide is for players. You do not need to know the rules: the sheet explains its numbers, and it never spends anything without telling you. The examples use an invented character named Pip and an invented spell called Glint.

## Install

1. Get the three plugin files (`main.js`, `styles.css`, `manifest.json`) from whoever runs your vault.
2. Put them in a folder named `dnd-5e-sheet` inside your vault's `.obsidian/plugins/` folder.
3. In Obsidian, open Settings, then Community plugins, and switch on "5e Character Sheet".
4. Run "Open 5e compendium" from the command list to check it works. If the compendium is empty, the sheet still works: it carries a small free set of rules, and anything else comes from notes in your vault.

## Create a character

1. Run the command to build a new character. A guided builder opens.
2. The first page asks which rules your table uses. Read "Pick an edition" below before you tap.
3. Then choose a species (called a race in 2014), a background and a class, set your ability scores, and pick your spells and gear. Every page says what the choice does in plain words, and every number can be tapped or hovered to see where it came from.
4. Finish, and the builder writes a character note. Open that note and it shows as the sheet.

Pip, for example, might be a halfling rogue with a background that gives a skill and a feat. Nothing here needs you to type a formula.

## Pick an edition

The builder's first page, "Rules", asks whether the character plays by the 2014 rules or the 2024 rules. Pick the ones your table uses. If nobody is sure, ask your game master: the choice matters because the two editions have different classes, spells and numbers.

- The edition decides which compendium notes the sheet reads. A 2024 character sees 2024 classes, species, backgrounds, feats and spells. A 2014 character sees the 2014 ones.
- The edition is part of the character from then on. You cannot change it after the builder is finished (see Common questions).
- If you change your mind while you are still in the builder, tap the other edition. If you have already made picks, the sheet tells you what would be cleared and asks you to tap again. Nothing is thrown away on the first tap.
- Your table's settings can set a default for new characters. Existing characters stay as they are.

Once a character exists, a small chip near the name says which edition it uses. Tap or hover the name next to it to see where that thing comes from.

## Bring something in from the other edition

Sometimes a 2024 character wants one thing that only exists in the 2014 books, such as an old spell called Glint, or the other way round. The sheet does not mix the editions on its own. You ask for it.

1. In a picker (spells, feats, subclasses, items and so on), scroll to the end of the list and tap "Bring in".
2. A list of things from the other edition opens. Pick the one you want. "Back" returns to the normal list.
3. The thing is added, and it shows a small year chip (2014 or 2024) so you can always tell it came from the other edition.

Things you bring in keep working by their own edition's rules. The character keeps both versions side by side if you take both.

If a sheet points at something the current edition does not have, for example a note you copied from a friend, a line under it says which books do have it, with one tap to bring it in. Nothing is changed until you tap.

## Read the what-changed panel

The panel explains how the two editions differ, in plain words.

1. Open it from the edition chip card on the identity line, or from the "What changed" row in the Settings card.
2. Part one is general: the rules that changed for everyone, such as how a long rest works or what the species word is. Your own edition's side is marked so you know which one applies to you.
3. Part two is about this character. It lists what would be different if Pip played the other edition: things that pair up, things that were renamed, and things with no counterpart. Tap "Show all levels" to see the changes for every level, not just the ones you have reached. Tap "Read both" on a pair to see the two versions next to each other (stacked on a phone).

The panel only explains. It never changes the character.

## Common questions

**Why does my 2024 character not show an old spell like Glint?**
The sheet only lists spells from the character's own edition, so the list stays short and correct. If you want an old spell anyway, use the "Bring in" button at the end of the spell picker.

**What does the chip next to a name mean?**
It is a small year, 2014 or 2024. On the identity line it says which rules the character uses. Next to a spell, weapon, feat or other item it says that thing was brought in from the other edition.

**Why can't I change the edition afterwards?**
Classes, species, spell lists and many numbers differ between editions, so a switch would quietly break the character's choices. Start a new character instead. The what-changed panel shows what would differ before you decide.

**No 2024 classes show up. What now?**
Your vault probably has no 2024 data yet. The plugin does not ship any game content. See `docs/IMPORTING.md` for how to bring in the books you own.

**What is Heroic Inspiration?**
In 2024 the Inspiration rule was reworked. It is a single reward from your game master that you can spend to reroll a die. The sheet shows it as a tracker, and its card explains how it works.

**What is a Species?**
It is the 2024 word for what 2014 called a Race. Same idea: where your character comes from. The sheet uses whichever word fits the character's edition.

**Why does the sheet show weapon mastery but not use it?**
Mastery is a 2024 weapon trait. The sheet shows which weapons your character has mastered and what each trait does, but it does not apply the effect to your rolls, so you stay in charge of when it counts. You can change your mastered weapons in Edit mode after a long rest.
