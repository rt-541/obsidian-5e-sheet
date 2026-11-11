# 5e Character Sheet (Obsidian plugin)

An unofficial D&D 5e sheet for character, companion and NPC notes under the 2014 or the 2024 rules; desktop and mobile. Players: read `docs/USING.md`. Importing books: `docs/IMPORTING.md`.

Each character picks an edition on the builder's first page and keeps it. The sheet reads only that edition's compendium; anything from the other edition is brought in with a button and shows a small year chip. A what-changed panel explains the differences in plain words. The bundled SRD is 2014.

## Licence and credits

The code is under the MIT licence (see `LICENSE`).

The bundled reference content in `src/content/srd/` is material from the System Reference Document 5.1
by Wizards of the Coast LLC, licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).
That licence, not MIT, covers it. No other published text is included; add your own as notes in your vault.

This project is unofficial and is not affiliated with, endorsed or sponsored by Wizards of the Coast or any
other publisher. Dungeons & Dragons and D&D are trademarks of Wizards of the Coast LLC. The built-in mechanics
data refers to classes, subclasses, species, feats and other features by name so the sheet can apply their
numbers to notes you supply. Those names and the features they describe belong to their authors and
publishers, among them Wizards of the Coast and, for the Blood Hunter class, Matthew Mercer and Critical Role.
Nothing here claims to have created them.

## Install

See `docs/INSTALL.md`: the plugin, the importer and the source books, on a new machine.

## Repo layout

- `src/`, `tests/`: the plugin (TypeScript).
- `importer/`: the Python importer that builds the private game library (its own tests; no book text).
- `scripts/`: `install-plugin.sh`, `deploy-vault.sh` and helpers.
- `docs/`: `INSTALL.md`, `IMPORTING.md`, `USING.md`, `STATE.md`, specs and plans.

## Use

- A note with frontmatter `type: 5e-character` (or `5e-npc` with a `creature:` id) opens as a sheet. See `examples/`.
- Homebrew lives in the compendium folder (default `Compendium/`): notes with `type: 5e-item`, `5e-condition`, `5e-injury`, `5e-creature`, `5e-class`. A DM can send one of these files; copy it in and it appears immediately.
- Link a campaign note (`type: 5e-campaign`) with `campaign: "[[Name]]"` to set rules, hidden sections and weather for the whole party.
- Deploy to another machine over SSH: `scripts/deploy-vault.sh <host>` (see `docs/INSTALL.md`).

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
## Spells: add, manage, create, import

The **Spells** tab always has a **+ Add spell** button, in Play mode too. The panel searches as you type (and keeps your cursor in the box when you add one), lists your class's spells by default (switch on **Show all spells** for the rest), shows level, school and class badges, and says **Known** on spells you already have. Each spell row has a **...** button: **Prepared** and **Always prepared** switches (for level 1 and up; an always-prepared spell counts as prepared and is saved as `always: true` in the note's `spells` list), **Remove** (asks "Remove X? Yes / No"), and:

- **Edit spell** on spells in your own notes (any vault spell that is not a generated library note): the form opens filled in and saving rewrites only the spell fields of that note; its id, other properties and body stay. If you change the description, the note body is replaced.
- **Make my own copy** on bundled and library spells: the form opens with the mechanics (not the book text) and saves a new Homebrew note.
- **Open note** for spells that come from a note.
- A spell granted by an attuned item cannot be removed or edited; its menu says so.

**Create a spell** (in the add panel, or **Create 'name' as a new spell** when a search finds nothing) is a form in plain words: name, level, school, casting time, range, duration, Verbal / Somatic / Material switches, concentration, ritual, classes, description, optional damage dice and type, healing dice, spell attack, and a saving throw that uses your spell save DC. It is written to `<compendium>/Homebrew/Spells/<Name>.md` (never overwriting: a taken name becomes "Name (2)") and added to the character at once.

**Import a spell** reads a spell pasted in the usual 2014 layout and fills the same form for you to check; lines it could not read are listed. **Copy template** copies a blank block:

````markdown
```5e-spell
Spell Name
1st-level evocation
Casting Time: 1 action
Range: 60 feet
Components: V, S, M (a pinch of ash)
Duration: Concentration, up to 1 minute
Say what the spell does. Write damage and saving throws the way the books do, like 2d6 fire damage and a Dexterity saving throw, and the sheet fills in the dice for you.

At Higher Levels. Say what changes when it is cast with a higher level slot.

Classes: Wizard, Sorcerer
```
````

Use "Evocation cantrip" for a cantrip and add "(ritual)" after the school line for a ritual. Bold, italics, bullets and blank lines are fine. A fenced `5e-spell` block in any note shows as a spell card with an **Add to compendium** button that saves it to `Homebrew/Spells`.

## Built-in mechanics

Most notes (the SRD, the WotC library, most homebrew) describe a feature in words but carry no numbers. The plugin ships a table of built-in mechanics (`src/content/overlay/mechanics.json`) and fills in what a note leaves empty: Unarmored Defense, Rage, Martial Arts, Sneak Attack, fighting styles, Divine Strike, Draconic Resilience, racial resistances, breath weapons, common feats and more. Players never write any of it: it shows up as armor class, attack rows, resources and Start / End buttons, and the feature row carries a small "built-in" badge.

- A note that declares its own effects, switch or action always wins; the built-in entry is skipped.
- Opt out per feature or option with `overlay: false`, or for a whole class, subclass, race, feat or item note with `overlay: false` in its frontmatter.
- The plugin setting "Built-in mechanics" (on by default) turns the whole table off.
- Entries are versioned with the plugin: fixing one fixes every character without touching a note.
