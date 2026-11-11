# Using the 5e character sheet

This guide is for players. You do not need to know the rules: the sheet explains its numbers, and it never spends anything without telling you. The examples use an invented character named Pip and an invented spell called Glint.

## Install

1. Get the three plugin files (`main.js`, `styles.css`, `manifest.json`) from whoever runs your vault.
2. Put them in a folder named `dnd-5e-sheet` inside your vault's `.obsidian/plugins/` folder.
3. In Obsidian, open Settings, then Community plugins, and switch on "5e Character Sheet".
4. Run "Open 5e compendium" from the command list to check it works. If the compendium is empty, the sheet still works: it carries a small free set of rules, and anything else comes from notes in your vault.

## Create a character

1. Run the command "New character (builder)". A guided builder opens. (The plain "New character" command makes a blank sheet instead, using the default edition.)
2. The first page asks which rules your table uses. Read "Pick an edition" below before you tap.
3. Then choose a species (called a race in 2014), a background, your ability scores and a class, work through the steps your class asks for (spells, a subclass and so on), and pick your gear and a name. Every page says what the choice does in plain words, and every number can be tapped or hovered to see where it came from.
4. Finish, and the builder writes a character note. Open that note and it shows as the sheet.

On the ability scores page you can also pick "Roll" and let the builder roll the dice for you. Choose one of five ways: four 6-sided dice six times dropping the lowest die of each, three 6-sided dice six times, one 20-sided die six times, two 20-sided dice six times dropping the lower of each, or three 6-sided dice four times plus one 20-sided die twice. Every roll is listed with its dice, and you give each number to one ability; picking a number another ability has swaps the two. Rolling again asks for a second tap, because it throws the numbers away. If you rolled real dice at the table, choose Manual and type them.

Pip, for example, might be a "lantern-keeper" with a "wanderer" background that gives a skill and a feat. Nothing here needs you to type a formula.

## Pick an edition

The builder's first page, "Rules", asks whether the character plays by the 2014 rules or the 2024 rules. Pick the ones your table uses. If nobody is sure, ask your game master: the choice matters because the two editions have different classes, spells and numbers.

- The edition decides which compendium notes the sheet reads. A 2024 character sees 2024 classes, species, backgrounds, feats and spells. A 2014 character sees the 2014 ones.
- The edition is part of the character from then on. You cannot change it after the builder is finished (see Common questions).
- If you change your mind while you are still in the builder, tap the other edition. If you have already made picks, the sheet tells you what would be cleared and asks you to tap again. Nothing is thrown away on the first tap.
- The plugin setting "Default rules edition" picks which edition is highlighted for a new character. A campaign note that names an edition wins over that setting, and the player can still pick the other edition on the Rules page. Existing characters stay as they are.

Once a character exists, a small chip on the identity line says which edition it uses, "2014 rules" or "2024 rules". The chip itself is the target: tap or hover the chip to see what that edition means, with a button to the what-changed panel.

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
On the identity line the chip reads "2014 rules" or "2024 rules" and says which rules the character uses. On a brought-in row (a spell, weapon, feat or other item) the chip is the bare year, 2014 or 2024, and says that thing came from the other edition.

**How do I read the full note for a class, item or spell?**
On a card, the entry's name is a link: click or tap it and the note opens in a new tab. It appears whenever your vault has a note for that entry, and not for entries that exist only inside the plugin. On a computer, move the pointer onto the card to click the link.

**Why can't I change the edition afterwards?**
Classes, species, spell lists and many numbers differ between editions, so a switch would quietly break the character's choices. Start a new character instead. The what-changed panel shows what would differ before you decide.

**No 2024 classes show up. What now?**
Your vault probably has no 2024 data yet. The plugin does not ship any 2024 content (the small free rules it carries are 2014). In the compendium, the "All editions / 2014 rules / 2024 rules" buttons filter the list to one edition. See `docs/IMPORTING.md` for how to bring in the books you own.

**What is Heroic Inspiration?**
In 2024 the Inspiration rule was reworked. It is a single reward that you can spend to reroll a die. The sheet shows it as a button that lights up when you hold it, and its card explains how it works.

**What is a Species?**
It is the 2024 word for what 2014 called a Race. Same idea: where your character comes from. The sheet uses whichever word fits the character's edition.

**Why does the sheet show weapon mastery but not use it?**
Mastery is a 2024 weapon trait. The sheet shows which weapons your character has mastered and what each trait does, but it does not apply the effect to your rolls, so you stay in charge of when it counts. You can change your mastered weapons in Edit mode after a long rest.
