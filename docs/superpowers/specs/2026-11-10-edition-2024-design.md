# 2014 and 2024 rules side by side

Date: 2026-11-10. Status: the owner answered the draft on 2026-11-10 (all the books, the sheet's edition decides the compendium, a button to bring things in, tags on every compendium file); those answers are folded in below. One question stays open at its default (existing characters).

## Intent and why

The sheet is a 2014 D&D 5e sheet. The owner wants a character to be built and played under either the 2014 or the 2024 rules, with the right numbers for the edition it uses, and a plain way to see how the two differ. The 2024 books are imported into the private library next to the 2014 ones, and both the plugin and the import get a written guide.

The players are not rules-savvy. They should never have to know which book a rule came from: the sheet knows the character's edition and reads the right notes. (My guess at the why, not the owner's words: a table is moving to, or trying, the 2024 rules while older characters stay on 2014.)

Three deliverables:

1. **Plugin**: edition-aware content and rules, an edition choice in the builder, and a "what changed" panel.
2. **Compendium**: the 2024 books imported through the existing importer into their own library folder, and the vault synced.
3. **Docs**: `docs/USING.md` and `docs/IMPORTING.md`, plus `README.md`, `docs/STATE.md` and the manifest description brought up to date.

## What exists today (facts from the code and data, 2026-11-10)

- The plugin has no edition concept. The character note has no edition field. The registry keeps every entry of a `type/id` and picks one by source precedence (user sources, then generated libraries with `WotC` first, then the bundled SRD), so a second library with the same ids would be shadowed.
- Rules fixed in code: rest recovery (`src/rules/rests.ts`: Hit Dice back, exhaustion down), multiclass slot rounding (`src/core/slots.ts`), spells known per class (`src/core/levelup.ts`). The builder takes ability bonuses from race and subrace only (`src/core/builder.ts` `originBonus`); the background type has no ability field and the ability parser rejects weighted choices; items have no mastery field; feats have no category.
- The built-in mechanics overlay (`src/content/overlay/mechanics.json`) is keyed `<kind>:<owner>:<feature>` with no edition. The bundled SRD is the 2014 one.
- The importer (`/docker/homelab-config` branch `worktree-dnd-compendium`, live copy `/docker/dnd-compendium/code`, both at f68f540) builds one WotC library from `/docker/dnd-compendium/5etools-2014` into `compendium/5e/WotC`. The data path, the library folder and the class converter all assume 2014. Library notes link to each other by full vault path.
- The 2024 data is now in `/docker/dnd-compendium/5etools-2024`: `5etools-mirror-3/5etools-src` pinned at v2.41.0 (the sibling of the 2014 mirror; confirmed as the source by the owner). It holds both editions in one tree. What marks 2024 content: the book it comes from (18 books published since 2024-09-17) and, on classes, species, backgrounds and base items, `edition: "one"`. Shapes that differ from 2014:
  - backgrounds carry the ability scores, as alternatives (two points and one point, or one point on each of three, among three listed abilities), and name a feat;
  - species carry no ability scores;
  - feats have a category (origin, general, fighting style, epic boon);
  - base weapons name a mastery property, there are eight mastery entries, and classes carry how many masteries they get by level;
  - classes carry a feat progression and a primary ability.
- The vault has an empty `compendium/5e2024/` folder the owner made on 2026-10-17. Nothing reads or writes it.

## Decided by the owner

- The edition is a field in the character note frontmatter: a choice, not derived.
- The library keeps one folder per source and edition. 2014 and 2024 content never mix and nothing generated is overwritten. Folder = source still holds.
- Rules differences live in data, not code. No code names a race, class, feat or item.
- A plain-words "what changed in 2024" panel for players who are not rules-savvy. It must cover species and background ability scores, weapon mastery, origin feats and class changes.
- 2024 data comes from the 5etools 2024 mirror (2026-11-10).
- Daggerheart is parked for now (2026-11-10).
- **All of the 2024 books go in** (2026-11-10), not only the three core ones.
- **The edition of the character sheet decides the compendium it reads** (2026-11-10). A 2024 sheet reads the 2024 compendium, a 2014 sheet the 2014 one.
- **Bringing something in from the other edition is a button the player clicks** (2026-11-10), never something that happens by itself.
- **Every compendium file carries edition tags** (2026-11-10: "use a sed job to add tags to all the compendium files"), the existing libraries included.

## Goals

### 1. A character has an edition

- `edition: "2014"` or `"2024"` in the character note. A note without the field is 2014, so every existing character behaves exactly as today.
- The builder asks first: "Which rules does your table use?" with two choices and a short "What is the difference?" card. The default is the campaign's edition when the campaign note sets one, else the plugin setting "Default rules edition", else 2014.
- The identity line shows a small chip ("2014 rules" or "2024 rules") with a hover or tap card that says what it means and opens the what-changed panel.
- The word for the race slot follows the edition: "Race" under 2014, "Species" under 2024. The stored field stays `race`.

### 2. Content knows its edition, and a character reads its own

- A content entry has an optional edition. The importer stamps `edition` on every generated note. A generated library note without the stamp is 2014 (every library generated so far is). The bundled SRD is 2014. Hand-made notes (Homebrew and the owner's other source folders) have no edition and count for both.
- **A character reads its own edition's compendium, and nothing else by itself.** Looking something up for a character uses entries of the character's edition or of no edition, in today's source order. So a 2024 character's `fighter`, `fireball` or `longsword` is the 2024 one, a 2014 character's is the 2014 one, and homebrew still wins over both. There is no silent fall-back to the other edition.
- **Pickers (builder, level-up, add spell, add item, companions) list only the character's edition**, plus homebrew.
- **"Bring in from the 2014 books" (or "from the 2024 books") is a button at the end of every picker.** It opens the other edition's list for that picker, search first. What the player picks is added with an edition chip ("2014") that stays visible wherever it is shown, and the character note records that it was brought in, so that exact entry is used even when the character's own edition has one of the same name. Taking it off the character removes the record. This is how a 2024 character takes a subclass, species, feat, spell, item or creature that was never reprinted, including everything in the 2014-era third-party libraries.
- **Each thing links to its own version, and a character can hold both.** A 2024 character's Fireball opens the 2024 note. If the player also brings in the 2014 Fireball, the character has two rows; each links to its own note, and the hover card (tap on tablet and phone) names its source: the book and the edition. The same goes for anything else held twice. So an entry on the character records which edition it was brought in from, and two rows may share an id. (Owner, 2026-11-10: "fireball should link to its version but if you added both you can see its source when you hover over it".)
- If a character note points at something its own edition does not have (a hand-edited note, a library that changed), the sheet shows the existing "missing" marker with one plain line, "This is in the 2014 books", and the same button.
- The compendium browser, which has no character, shows everything, with an edition filter (All, 2014, 2024) and a chip on each row that has an edition.
- Campaign source switches keep working on top: a table that wants no 2014 content switches the `WotC` source off in the campaign note.

### 3. Rules that differ by edition live in one data table

A small typed table in the plugin, one row per edition, holds every rule the sheet computes that differs. Code reads the table; nothing branches on an edition name outside it. From what the sheet computes today, the rows are:

- how many Hit Dice a long rest gives back;
- how half-caster levels round when working out multiclass spell slots;
- what a level of exhaustion does to rolls and speed, and how a rest lowers it;
- what the Inspiration button is called and what its card says;
- the word for the race slot.

The plan's first task is to list every place a 2014 rule is fixed in code and move each one that differs into the table. Rules that are the same in both (experience table, point buy, proficiency bonus, working out each class's spells as if single-classed) stay where they are and lose the "2014" in their comments.

**Where the 2024 values come from.** Each 2024 value in the table is read from the downloaded 2024 data in `/docker/dnd-compendium/5etools-2024` (its rules glossary and class data) and checked there by the person writing the row, never filled in from memory. A rule's number is a fact, not book text; the row records which book and section it came from, with no quoted wording. Tests assert the table's real values for both editions. Character and content fixtures stay invented.

### 4. New data shapes the 2024 content needs

All generic: they work for any homebrew and name nothing.

- **Background ability scores.** A background may carry an ability increase, including "choose one of these patterns" (two points and one point, or one point each on three, among the listed abilities). The builder asks in plain words, shows the result per ability, and stops at 20.
- **A feat from the background.** A background can grant a named feat or a pick from a category. The feat's own choices are asked in the builder like any other.
- **Feat categories and level gates.** A feat may carry a category and a minimum level. Feat pickers show what the slot allows (an ability score improvement slot offers general feats, a fighting style slot offers fighting style feats, and so on), in plain words.
- **Weapon mastery.** A weapon may name a mastery property. A mastery property is a library note (name plus text), like a condition. A class can grant a number of mastery picks that grows by level. The player picks which kinds of weapon they have mastered (in the builder and at level-up, changeable from Edit mode with the line "You can change these after a long rest"). An attack row whose weapon is mastered shows the property as a chip with its card. The sheet does not apply the effect; it tells the player what it does.
- **Prepared-spell counts from the class data.** The level-up already takes the number of spells a class has from the class note; nothing there is fixed per edition. The 2024 class data gives a number of prepared spells per level, and the importer writes it the way it writes spells known for 2014 (see the contract), so a 2024 character is asked for the right number of spells with the machinery that exists. Choosing again each day for the classes that may (the daily picker in `docs/plans/next-build.md`) stays on the backlog for both editions.

What already fits and needs no new shape (checked in the code): a class says at which level its subclass is picked, an ability score improvement slot can already take a feat, and an origin note without ability scores is valid.
- **Overlay entries by edition.** A built-in mechanics entry may be limited to an edition, and an edition-specific entry outranks a general one. Every existing entry is checked against the 2024 library: kept for both, limited to 2014, or given a 2024 twin.

### 5. The what-changed panel

Reached from the edition chip, from the Settings card, and from the builder's edition step. Same content on desktop (hover and click), tablet and phone (tap), 44 px targets, placed once per layout.

- **Part one, the general changes.** A short list from the edition table and a small data file: one title and two plain sentences per change ("2014: ...", "2024: ..."), in our own words, never book text. It covers at least: where ability score bonuses come from (species or background), the feat every background gives, weapon mastery, subclass at level 3 for every class, and each rule from goal 3.
- **Part two, this character.** Worked out at run time from the two libraries in the vault, so no game text enters the repo. For the character's classes and subclass (up to their level, with "Show all levels"), species, background, feats, spells and equipped weapons, it finds the counterpart in the other edition and says what differs. The counterpart is the entry the importer names, else the one with the same id: the 2024 data records, on each older entry, what it was reprinted as (13 classes, 80 subclasses, 389 spells, 787 creatures, and the species, feats and items), so the 2024 build stamps each note with the ids it replaces (`replaces`, ids only). No alias list is kept by hand. The panel then says what differs in plain sentences: features gained, lost or moved to another level, hit die, saving throws, proficiencies, ability bonuses, resource counts, and for spells the level, casting time, range, duration and dice. "Read both" opens the two notes' text side by side, read from the vault. Where there is no counterpart it says so ("The 2024 books have no version of this subclass; your table can keep using the 2014 one").
- For a 2014 character the panel reads "What would change under 2024"; for a 2024 character, "What changed from 2014".
- When the other edition's library is not in the vault, part two says so in plain words and points at `docs/IMPORTING.md`.

### 6. The 2024 library

- The importer builds a second WotC library from `5etools-2024` into `compendium/5e/WotC 2024/`, with its own marker file, Index and Needs Review page. The 2014 build keeps reading `5etools-2014` and writing `compendium/5e/WotC`.
- All 2024 books go in: every book and adventure in the 2024 data published on or after 2024-09-17 (18 books and 24 adventures in v2.41.0), kept as a list in the importer's config so a later title is one line. Everything from older books in the 2024 data is ignored: it already comes from the 2014 clone.
- Every generated note is stamped with its edition: a frontmatter field and a `5e/edition/2014` or `5e/edition/2024` tag. The existing libraries (`WotC`, `Kobold Press`, `Necromancer Games`) get the stamp in this job: the importer adds it, the libraries are rebuilt from the same code and data that made them on 2026-10-24, a diff against the previous output shows the stamp is the only change, and the marker-guarded sync replaces the folders. `Mystic Arts` is built from another branch and is left as it is; the plugin treats an unstamped library note as 2014.
- Converters learn the 2024 shapes in goal 4, plus the 2024 class, species, feat, spell, item, creature and condition layouts. Links stay inside the 2024 library and use full vault paths.
- The build logs counts per type and lists what it could not convert cleanly on the 2024 Needs Review page. I check the output myself against the source data (counts, a sample of each type, every class table); a local model may draft the list of suspect notes, but its output is a draft, not evidence.
- Sync adds the new folder to the marker-guarded sync. `compendium/5e2024/`, `campaigns/`, the owner's source folders and `.obsidian/graph.json` are not touched.

### 7. Docs

- `docs/USING.md`: install, create a character, pick an edition, read the what-changed panel, common questions.
- `docs/IMPORTING.md`: how someone who has the books but not this homelab imports a book or the 2014 and 2024 data, refreshes, works through the Needs Review list and re-syncs the vault.
- `README.md`, `docs/STATE.md` and the manifest description say both editions.

## Non-goals

- Changing the edition of an existing character in place. The level log's picks belong to one edition's class features, so a live switch would lose them silently. (See "Open for the owner" for the copy route.)
- Applying weapon mastery effects automatically.
- Bundling the 2024 SRD in the plugin. Without a 2024 library the builder says no 2024 classes were found and points at the import guide.
- Reading a pasted stat block or spell in the 2024 layout. Library creatures and spells arrive through the importer.
- Changing `.obsidian/graph.json` colors for the new folder.
- The shared-core extraction and Daggerheart. The edition field is shaped to sit beside the future `system` field (`system: 5e`, `edition: 2024`).

## Anti-goals (failure even if it works)

- Any existing character showing a different number after the 2024 library lands or the new plugin build is deployed.
- A 2024 entry silently standing in for a 2014 one, or the reverse, without an edition chip.
- Code that branches on an edition name outside the edition table, or names a race, class, feat, item or mastery property.
- Book text in this repo, on scratch or the about-site. Fixtures are invented, numbers included. Imported content lives only in the vault and `/docker/dnd-compendium`.
- A player typing YAML to set or fix an edition.

## Constraints

- Everything in `CLAUDE.md`'s hard rules: plain DOM via `h()`, `classList` on mount roots, `.fe-sheet button.x` specificity, `type="text"` on inputs, parity on three layouts with each feature id placed once, test first, `npm test`, `npm run typecheck` and `npm run build` green, conventional commits.
- Existing notes stay readable: a note without the new fields behaves as today.
- **Order of release.** The deployed plugin does not know editions. Read from today's code (`Registry.winner` and `list`): for an id both libraries have, `WotC` outranks any other generated library, so existing characters keep their 2014 entries and pickers show one row per id. But anything that exists only in the 2024 library (new feats, backgrounds, subclasses, spells) would appear in every picker with no edition label, and a 2024 entry would stand in wherever the 2014 note is unusable. So the edition-aware build is deployed before the 2024 folder is synced to the vault. The re-sync of the existing libraries with their stamp does not wait: a test shows today's build reads a stamped note exactly as it reads an unstamped one. A test with an invented second library pins the first half of this (existing characters unchanged) for both the old and the new lookup. Deploy and merge to `main` wait for the owner's words.
- Importer work happens on the `worktree-dnd-compendium` branch (fast-forwarded to f68f540 first), never in this repo. The owner's uncommitted edits in the main homelab-config checkout are never stashed or overwritten.
- The public mirror gets none of this until the sanitized sync and its separate audit. The general-changes text in goal 5 is our own wording, like the glossary; the audit decides whether it ships.

## Known costs

- **Short links in the owner's own notes.** Two notes named `Fireball` will exist in the vault. Library notes link by full path and are unaffected, but a hand-written `[[Fireball]]` in a campaign note becomes ambiguous and Obsidian picks one. This comes with keeping both editions in one vault, whichever folder is used.
- **Phone sync.** The first sync to a phone already stalls at 9214 files. The 2024 library adds a few thousand more.

## My calls (the owner can override)

- **Folder**: `compendium/5e/WotC 2024/`, inside the existing root. The plugin already reads any folder there as a source, and Homebrew and the third-party libraries stay shared by both editions. The alternative, `compendium/5e2024/WotC`, needs a second root in the plugin and hides homebrew from 2024 characters unless both roots load.
- **Edition is chosen in the builder and then fixed** (see non-goals).
- **The panel has two parts**, general and per character, as in goal 5.
- **Weapon mastery is shown, not applied.**
- **What the button does** was my reading of "if we want to import things we can click a button": it brings one thing from the other edition's compendium onto this character, as in goal 2. The owner's follow-up about holding both versions of Fireball fits that reading.
- **The tags are added by the importer and a re-sync, not by a sed run inside the vault.** The repo's rule is that only the marker-guarded sync writes the generated library folders, and the next sync would wipe an in-vault edit anyway. The result is the one asked for: every compendium file tagged. A literal in-vault sed needs the owner to lift that rule in words.
- **Two titles dated 2026-11-17 are held back** (a setting book and its adventure, not on sale yet). The library is for books the owner has; they are one line each to add on release.
- **The campaign's edition** is an optional `edition` key the sheet only reads from the campaign note, beside the `rules` and `sources` keys the GM already keeps there by hand. The sheet never writes campaign notes. Players are not asked to add it; without it the plugin setting decides the builder's default.
- **If "unstamped means 2014" ever proves wrong** for a library, the fix is a rebuild of that library with the stamp, and that waits for the owner's go like any re-import.
- **The plugin carries the 2024 condition effects** as data (which rolls a condition changes, no rules text), beside the 2014 ones it already carries. Library condition notes hold only text and take their sheet effects from the bundled entry of the same name, so without this a 2024 character's conditions would do nothing. This is the one piece of 2024 data the plugin ships; classes, species, feats, spells and items still come only from the library.
- **A brought-in thing is stored as its id with the edition after it** (`<id>@2014`) wherever the character note holds an id. Existing notes need no change, and two rows that differ only by that ending are the two versions of one thing.
- **Branch**: `feat/edition-2024`, cut from `project-home` so it carries `CLAUDE.md` and `docs/STATE.md`; one PR against `main`.

## Open for the owner

1. **Existing characters.** Is 2024 for new characters only, or should a character such as Azur or Thalia move? My default: new characters only in this build. If they should move, the safe route is "Start a 2024 copy": the builder opens filled in with the name, scores and every pick that exists in 2024, writes a new note, and leaves the original alone. That is extra work on top of this design.

## Left to the builder

- Exact data shapes: the edition table, the ability-increase alternatives, the feat category and grant, the mastery field and note type, the overlay's edition key.
- How the registry carries the edition through lookups and lists without every caller passing it by hand.
- Where the panel sits in each layout, within the parity rule; a gallery render with Obsidian's real CSS goes to scratch for the owner before the UI is called done.
- How the per-character comparison words a difference, reusing the level-up changes list where it fits.
- The importer's module layout for the second library and its book allow-list.
- The order of work, as long as each part ships tested.

## Contract between the importer and the plugin

Two repos build against this, so it is fixed here rather than left to either builder. Everything not listed keeps the format in the dnd-compendium skill's `references/note-format.md`.

**Every generated note**

- `edition: "2014"` or `edition: "2024"` in frontmatter, written as a quoted string. The plugin also accepts the bare numbers.
- A tag `5e/edition/2014` or `5e/edition/2024`.
- The plugin's reading: a generated library note without `edition` is 2014; a bundled SRD entry is 2014; a hand-made note without `edition` belongs to both; a hand-made note with `edition` belongs to that one.

**The 2024 library**

- Folder `compendium/5e/WotC 2024/`, with the `.dnd-compendium-generated` marker. `source` stays the book abbreviation.
- Ids are the slug of the name, as today, so a 2024 entry and the 2014 entry it supersedes usually share an id.
- `replaces: [<id>, ...]` on a 2024 note: the ids of the same type that the 2014 data says were reprinted as this entry. Ids only. Left out when there are none or when the only one equals the note's own id.
- Types and their fields are the 2014 ones, with these additions.

**Additions to the op format**

- Background (and, for homebrew, race, subrace or feat): `abilityPick: { from: [<abil>, ...], patterns: [[2, 1], [1, 1, 1]] }`. The player picks one pattern and gives each number to a different ability in `from`. The existing `ability` field keeps its meaning (everything listed adds up).
- A new op `feat`: `{ op: feat, id, feat: <feat id> }` grants that feat; `{ op: feat, id, categories: [<category>, ...] }` lets the player pick one feat whose category is in the list. Valid in class and subclass levels and in grants.
- The `asi` op may carry `feats: [<category>, ...]`: the feat categories that slot accepts. Left out, any feat is accepted, as today.
- Feat: `category` (a slug such as `origin`, `general`, `fighting-style`, `epic-boon`; the plugin treats it as an opaque label) and `minLevel` (a whole number).
- The `choose` op gains `what: mastery`: pick `count` weapons to have mastered; `from` may list the weapon item ids allowed, and left out it means every weapon the library gives a mastery property. A class whose number grows by level carries one such op per increase.
- Prepared spells: the 2024 class data gives a number of prepared spells per level. The importer writes it the way the 2014 library writes spells known: as `spells` ops whose counts are the increase at each level, so the level-up asks for the right number with no new mechanism. A class that learns spells into a spellbook keeps its spellbook counts.
- Lineages of a 2024 species are written as `5e-subrace` notes under `Races/<Species>/Subraces/`, and a feat's named variants as separate feats.

**New and changed note types**

- `5e-mastery`: `id`, `name`, the common fields, and the rules text as the body. Folder `Masteries/`.
- `5e-item`: the plugin-native `weapon` mapping may carry `mastery: <mastery id>`.
- `5e-race` stays the type for a 2024 species; the plugin only changes the word it shows.
