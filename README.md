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

## Companions and custom creatures

On a sheet, press "Add companion" and type in the **Search creatures** box: the list narrows as you type (names that start with your words come first). Pick one with **Add**. Give it a name of its own in "Companion's name (optional)" and choose what it is (Familiar, Animal companion, Steed, Summon, Sidekick).

If the creature is not in the list, two buttons appear under the list (and when nothing matches):

- **Add custom creature**: fill in the form (name, size, type, Armor Class, Hit Points, speeds, the six ability scores, attacks and traits) and press Save. The creature is written to `<compendium>/Homebrew/Creatures/<Name>.md` and added as the companion. An existing note is never overwritten; a name that is taken becomes "Name (2)".
- **Import from stat block**: paste a stat block (copied from D&D Beyond, 5e.tools or a PDF, in the standard 2014 layout, or a `5e-statblock` block from a note) and press Read. The form opens filled in, with a list of any lines that could not be read, so you can check it and press Save. **Copy template** copies a blank block to fill in elsewhere.

### The 5e-statblock block

Put a fenced block with the language `5e-statblock` in any note and it shows as a stat block card with an **Add to compendium** button, which saves it as a Homebrew creature and tells you where it went. Blank template (the Copy template button copies exactly this):

````markdown
```5e-statblock
Creature Name
Medium beast, unaligned
Armor Class 12 (natural armor)
Hit Points 9 (2d8)
Speed 30 ft., climb 20 ft.

STR DEX CON INT WIS CHA
10 (+0) 12 (+1) 10 (+0) 2 (-4) 10 (+0) 4 (-3)

Skills Perception +2, Stealth +4
Senses darkvision 60 ft., passive Perception 12
Languages --
Challenge 1/4 (50 XP)

Trait Name. Say what the trait does.

Actions
Bite. Melee Weapon Attack: +3 to hit, reach 5 ft., one creature. Hit: 4 (1d6 + 1) piercing damage.
```
````

Reactions and Legendary Actions are kept as traits. Extra blank lines, bullets, markdown bold and the unicode minus sign are fine.

## Inventory, coins and items

- **+ Add item** (top of the Inventory card) opens the Add item panel. Type two letters or pick a kind (Potions and scrolls, Weapons, Armor, Gear, Magic items) to see matches; names that start with what you typed come first. An item you already carry shows **+1**.
- Every stackable row has **-**, the count and **+**, in Play mode too. The **...** button on a row opens its options: **Consumable** (used up when used), an exact **Quantity**, and **Remove** (which asks Yes or No and takes the item's pin with it).
- **Use one** on a healing potion rolls its healing dice and heals; the item card shows "Healing: <dice>".
- Equipping a second suit of armor or shield puts the first away.
- **Coins** are five number boxes on the Main page and at the top of the Inventory card; both always agree. When you carry more than your capacity the weight line becomes a plain "too heavy" warning.
- **Custom item** form: Name, Quantity, Weight (lb) and "Used up when used". **More details** adds kind, rarity, attunement, charges, attack/damage/AC bonus, healing dice and a short description; **Save to compendium and add** writes it as a Homebrew item note.
- **Import an item**: paste an item (from D&D Beyond, 5e.tools, a PDF, or a `5e-item` block from a note) and press **Read item**. The form opens filled in, with a list of any lines that could not be read; check it and press Save. **Copy template** copies a blank block. The note is written to `<compendium>/Homebrew/Items/<Name>.md`; an existing note is never overwritten (a taken name becomes "Name (2)").

### The 5e-item block

Put a fenced block with the language `5e-item` in any note and it shows as an item card with an **Add to compendium** button. Blank template (the Copy template button copies exactly this):

````markdown
```5e-item
Item Name
Wondrous item, rare (requires attunement)
Weight: 1 lb.
Cost: 500 gp

Say what the item does here.

The item has 3 charges. It regains 1d3 expended charges daily at dawn.
```
````

The second line is the type: `Wondrous item`, `Weapon (longsword)`, `Armor (plate)`, `Armor (shield)`, `Potion`, `Scroll`, `Ring`, `Rod`, `Staff`, `Wand`, `Ammunition` or `Adventuring gear`, then a comma and the rarity (`common` to `artifact`), then `(requires attunement by a wizard)` if it needs it. The reader also understands `Weight: 3 lb.`, `Cost: 50 gp`, "has 3 charges" with "regains ... at dawn / after a short rest / after a long rest", "a +1 bonus to attack and damage rolls" (or just attack, or just damage), "a +1 bonus to AC" and "You regain 2d4+2 hit points" (a potion's healing). A weapon or armor with a base takes its dice or armor class from that ordinary item when the compendium has it; otherwise it becomes a magic item that still keeps its bonuses. Markdown bold and italics, bullets, extra blank lines and the unicode minus sign are fine; lines of the form `Label: text` that are not understood are listed as unread.

### Hexploration (optional rule)

Turn on **Hexploration: rations and foraging** in Customize to show a Rations card next to Resources. Rations are an ordinary inventory entry; the card counts them (with - and +), and **Forage (4 hours)** or **Quick forage (2 hours, with disadvantage)** rolls Wisdom (Survival). A total of 10 or more finds 1 day of food, plus 1 more day for every 5 above 10: the first day feeds tonight, the rest go into the rations. A night's rest (or long rest) eats the foraged meal first, else one ration, else "No rations left: you go hungry tonight"; the rest panel previews it.

## Built-in mechanics

Most notes (the SRD, the WotC library, most homebrew) describe a feature in words but carry no numbers. The plugin ships a table of built-in mechanics (`src/content/overlay/mechanics.json`) and fills in what a note leaves empty: Unarmored Defense, Rage, Martial Arts, Sneak Attack, fighting styles, Divine Strike, Draconic Resilience, racial resistances, breath weapons, common feats and more. Players never write any of it: it shows up as armor class, attack rows, resources and Start / End buttons, and the feature row carries a small "built-in" badge.

- A note that declares its own effects, switch or action always wins; the built-in entry is skipped.
- Opt out per feature or option with `overlay: false`, or for a whole class, subclass, race, feat or item note with `overlay: false` in its frontmatter.
- The plugin setting "Built-in mechanics" (on by default) turns the whole table off.
- Entries are versioned with the plugin: fixing one fixes every character without touching a note.
