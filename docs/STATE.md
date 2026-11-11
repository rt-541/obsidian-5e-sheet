# State

Last updated 2026-11-10 (edition 2024 branch complete and reviewed).

## Where it stands

- Plugin `main` is c03924f, 2133 tests passing. `main` is pushed; `feat/edition-2024` is local only.
- The dnd vault runs that build (`main.js` 5b0870f0, confirmed on azure-dragon and Rocinante 2026-11-10). Automated tests and renders with Obsidian's real CSS only: Claude has never seen it in the real app, so owner feedback outranks them.
- Compendium re-imported 2026-10-24: WotC 7963 notes with mundane weapons and armor and variant data on 95 of 129 generic items, Kobold Press 948, Necromancer Games 288. Mystic Arts lives on `worktree-dnd-arcane-forge` (PR #30) and was left alone. Importer branch `worktree-dnd-compendium` is at f68f540. Backups: `/docker/dnd-compendium/out.bak-2026-10-24`, `code.bak-2026-10-24`.
- Built so far: play sheet, spells, leveling with a plain changes list, builder, single compendium, combos, tablet layout, inventory with coins, Hexploration rests and rations, glossary and hover cards, companions with stat-block import, UI review fixes, stat tiles, roll-mode slider, Settings card, compact attack rows, 1H/2H, attack options with the 3 s Hit? window, I roll my own dice, per-character Customize, item variants, stat-block cards, Change on an item.

## Now: 2014 and 2024 rules side by side

Started 2026-11-10 on branch `feat/edition-2024`. The owner parked Daggerheart for this ("skip dagger heart for now").

- Design: `docs/superpowers/specs/2026-11-10-edition-2024-design.md` (also https://scratch.rt-541.io/dnd-sheet/edition-2024-design/). Top-level plan: `docs/superpowers/plans/2026-11-10-edition-2024.md`, with one detailed plan each for the plugin and the importer beside it.
- Decided by the owner on 2026-11-10: all the 2024 books go in; the sheet's edition decides which compendium it reads; bringing something in from the other edition is a button; a character can hold both versions of one thing and the hover card names the source; every compendium file gets edition tags.
- 2024 data: `/docker/dnd-compendium/5etools-2024`, the `5etools-mirror-3/5etools-src` mirror pinned at v2.41.0. The importer side is a separate plan (`docs/superpowers/plans/2026-11-10-edition-2024-importer.md`).
- Shipped on `feat/edition-2024` (pushed, unmerged, not deployed): edition on the character, chosen on the builder's first page and fixed afterwards (switching with picks held asks to tap again); the sheet reads one edition's compendium; "Bring in" at the end of pickers; brought-in things show a small year chip; a missing reference says which books have it, with one tap to bring it in; the what-changed panel (part one general, part two this character with Show all levels and Read both) from the identity chip card or the Settings card; the compendium edition filter; the 2024 table (Species, long rest gives back all Hit Dice, Heroic Inspiration, exhaustion, spell slots); background ability picks and feat categories; weapon mastery shown on the attack row and changeable in Edit mode after a long rest, not applied to rolls; overlay twins and the condition audit; a plain "no 2024 classes found" line pointing at `docs/IMPORTING.md`, which now exists. Player guide: `docs/USING.md`. Ledger: `work/ledgers/edition-2024-plugin-ledger.md`.
- Fixes since: 0fd8e11 lets an ability increase carry its own score cap, so feats that raise a score past 20 load and apply (found by the contract check); the plain "New character" command now records the default rules edition like the builder does (it wrote no edition before, so it always made a 2014 character).
- The WotC 2024 library is built in `/docker/dnd-compendium` and not yet synced.
- Branch status (2026-11-10): PR https://github.com/rt-541/obsidian-5e-sheet/pull/1 merged by fast-forward on the owner's word ("do it"); `main` is cd330ae. Deployed to the dnd vault the same day with `scripts/deploy-vault.sh`: `main.js` 5da7d122 confirmed on azure-dragon (the build before it was a78ef6ec, from c03924f, if a rollback is needed). Not yet seen in the real Obsidian app: the owner opens a new 2024 character first.
- Importer: branch `worktree-dnd-compendium` in homelab-config is pushed at 2e68cb1 (its old PR #29 was already merged, so these commits need a new PR to reach `main`). Local output in `/docker/dnd-compendium/out`: `WotC 2024` 2991 notes (Needs Review 215 entries before the review fixes below), and the three existing libraries carry the edition stamp and tag. Backups: `out.bak-2026-11-10` (before the stamp), `out.pre-fix-2026-11-10` (stamped, before the review fixes).
- Review fixes after the build (the owner asked for per-item reviewers): creatures whose armor class or hit points are a rule text now keep their base number (55 of 67 became usable as companions; 12 have no single hit point number); 35 generic items wrongly labelled Armor and 6 any-shield items were fixed in both libraries. So the 2014 library's re-sync carries those 77 changed notes as well as the stamp. Per-item proposals: `/docker/dnd-compendium/verify-2026-11-10/review/proposals.md` (private).
- Rocinante (2026-11-10, the owner said to push the sync there): the same plugin build (5da7d122) was copied into `C:/obsidian/dnd` on `arthu@rocinante.rt-541.io`, then `compendium/5e/WotC 2024` was synced there (2992 files, marker present; `DNDC_VAULT_HOST=arthu@rocinante.rt-541.io`). Its `WotC`, `Kobold Press`, `Necromancer Games` and `Mystic Arts` folders have NO marker and are older copies (WotC 7838 files against 7963 built): Obsidian Sync does not carry the dot-file marker, so the importer's sync refuses to replace them and the plugin treats the unmarked ones other than `WotC` as hand-made sources there. Not re-stamped. azure-dragon has the new plugin but not yet the 2024 folder or the re-stamp.
- azure-dragon (2026-11-10, the owner said "now do azure"): the three existing libraries were re-synced with the edition stamp and the review fixes (WotC 7963, Kobold Press 948, Necromancer Games 288 files, markers present; log `/docker/dnd-compendium/sync-restamp-azure-2026-11-10.log`). `WotC 2024` was NOT importer-synced there: Obsidian Sync had already started carrying it over from Rocinante (772 of 2992 files at the time, every one a path from the build, no marker), and the importer's guard refuses a non-empty folder without the marker.
- Lesson: Obsidian Sync carries the notes between machines but never the dot-file marker, so a library synced on one machine arrives on the others unmarked and the plugin treats it as a hand-made source there. Follow-up worth doing: let the plugin recognise a generated library by something that travels with the notes.
- Rollout 2 (2026-11-10, the owner said "go, all five"): PR https://github.com/rt-541/obsidian-5e-sheet/pull/2 merged by fast-forward; `main` is 1972d46, version 0.2.0. It carries the library root-note marker (a generated library is recognised by `5e Library.md` with `type: 5e-library`, which Obsidian Sync carries), background, lineage and subrace summaries with an About toggle in the builder, the importer in `importer/`, and `docs/INSTALL.md`. Deployed to azure-dragon and Rocinante (`main.js` 5ff94a7d on both; azure-dragon needed three tries). Release 0.2.0 holds the three plugin files and the guide's download command was checked against it.
- Library syncs after rollout 2 (finished 2026-11-10): `WotC`, `WotC 2024`, `Kobold Press` and `Necromancer Games` are importer-synced on both azure-dragon and Rocinante, each with the dot-file and the root note (`vault-count` shows `marker=True library_note=True`, WotC 7963, WotC 2024 2992, Kobold Press 948, Necromancer Games 288 files on both). Obsidian Sync delivered the root notes for two folders by itself and the guard accepted them; for the other two the owner placed the library's root note by hand (an scp of the built `5e Library.md`) so the guarded sync could run, after the file lists were checked against the build. `Mystic Arts` has no root-note marker (built from another branch) and is unmarked on Rocinante.
- The importer's guarded sync with the new PowerShell check ran for real on both machines without error.
- Rollout 3 (2026-11-10, the owner gave the okay in advance): PR https://github.com/rt-541/obsidian-5e-sheet/pull/3 merged by fast-forward; `main` is e3332fa, version 0.3.0. The builder's ability-score step has a Roll method with five ways (4d6 drop the lowest, 3d6, 1d20, 2d20 drop the lowest, four 3d6 and two 1d20); the six totals are assigned like the standard array. Deployed to azure-dragon and Rocinante (`main.js` 5b0870f0 on both). Release 0.3.0 (https://github.com/rt-541/obsidian-5e-sheet/releases/tag/0.3.0) holds this build and is the latest; the install guide's download command was checked against it.
- Rollout 4 (2026-11-10, the owner said go): PR https://github.com/rt-541/obsidian-5e-sheet/pull/4, version 0.4.0. A card's name on a sheet opens the entry's note in a new tab; built-in copies link to the library note of the same id in the character's edition; the hover card stays open while the pointer moves onto it. Deployed to azure-dragon and Rocinante and released as 0.4.0. Not covered: companion stat blocks (no card carries the link), the builder's About cards (a modal), and 33 built-in 2014 entries with no library note under the same id (18 spells, 9 subclasses, 4 subraces, 2 items).
- Azur rebuilt for 2024 (2026-11-10, with the owner): new note `5e-sheet/Characters/Azur (2024).md` in the vault, built by the plugin's own builder and level-up code against the real library; level 6 at the owner's request (45 hit points, the same averages the original recorded). The original `Azur.md` is untouched and still level 7 (its level 7 was a rolled level-up). New hand-made notes in the vault's Homebrew folder: `Classes/Tactician/Tactician (2024).md`, `Classes/Tactician/Subclasses/War Mind (2024).md`, `Backgrounds/Boros Inquisitor.md`. The Roll20 Tactician, its War Mind and the homebrew Savage Attacker were stamped `edition: "2014"` (backups in `C:\obsidian\.rebuild-2024-backup` on Rocinante). Working copies: `/docker/dnd-compendium/rebuild-2024/` (private). Follow-up found: the base 2024 Dragonborn asks for the dragon color twice (the lineage and a built-in ancestry pick).
- Waiting for the owner's words: the public mirror sync and audit; Still open: whether existing characters move to 2024.
- Gallery of the new screens (desktop, tablet, phone): https://scratch.rt-541.io/dnd-sheet/edition-2024-gallery/
- Deploy order: merge and deploy wait for the owner's words. The edition-aware build ships first; only after that is the `compendium/5e/WotC 2024` folder synced to the vault. The reason is the design's "Order of release": same-id entries keep WotC 2014 winning so existing characters are unchanged, but 2024-only entries would appear in every picker with no edition label, and a 2024 entry would stand in wherever the 2014 note is unusable.
- One owner question still open: do existing characters move to 2024? Default until answered: no, only new characters choose.
- Known follow-ups (older): pre-existing "Homebrew" badge on library inventory items (inventory-ui.ts checks `source === "vault"` without `library`); the attack hit-window timer (controller.ts, the 3 s Hit? window) can fire after jsdom teardown and give an unhandled "getComputedStyle is not defined" with every test passing.
- Whole-branch reviewer's non-blocking follow-ups, none required before merge:
  1. On an unlensed registry (NPC sheets, compendium) the SRD fallback in `Registry.winner` can cross editions.
  2. An id inside a brought-in note's ops that its own edition lacks resolves through the character's lens without a marker.
  3. Pre-existing `type="search"` inputs in compendium.ts, additem-ui.ts, levelup-ui.ts (2) and panels.ts; CLAUDE.md wants `type="text"` and `tests/ui/pickers-order.test.ts` selects them.
  4. The mastery picker names a brought-in weapon's property by its id.
  5. The scattered "2014" defaults could be one constant.
  - Importer side: emit a base id for named magic weapons so mastery matches a mastered base weapon; document `DNDC_VAULT_PATH` in the importer README.

- The importer moved into `importer/` on 2026-11-10 from homelab-config `worktree-dnd-compendium` at a15b464, by the owner's decision. The copy there is frozen and will be retired. `docs/INSTALL.md` is the single guide.

## Parked: Daggerheart

The owner plays a Daggerheart one-shot in **November 2026** (said on 2026-10-24: "next month") and wants it working by then. Check the date with them first. They are a player with a character, and may GM it later. Product: Daggerheart Core Set.

This is also the test of the plugin's real goal: someone who knows nothing about a system can learn it from the sheet. Success means a fresh character played without opening the rulebook for anything the sheet should have said. The owner confirmed this as the MVP scope.

### Decided with the owner

- One plugin with a shared core and a module per game, not separate plugins. Each character note says which game it is (`system: 5e`, `daggerheart`, `expanse`).
- Order: pull the shared core out of today's plugin with no behaviour change (the tests are the net; 5e becomes module one), then Daggerheart, then The Expanse RPG (Green Ronin).
- Player-side only for the MVP. Shape the core so a GM view (Fear tracker, adversaries, countdowns) fits later; do not build it now.
- Data comes from Foundryborne/daggerheart `src/packs/*` (the only source with SRD 2.0 and typed mechanics; MIT code; pin a release). The owner said to fork it into a format that works for us and publish it too.

### My calls, not yet confirmed

- Separate public dataset repo, something like `rt-541/daggerheart-srd-data`: typed values, plain text instead of Foundry HTML and links, JSON plus Obsidian notes, playtest and non-SRD material left out, numbers cross-checked against the official SRD 2.0 PDF.
- The plugin stays content-free and an importer brings the data into the vault.

### Still to ask the owner

- Should the phone pack (below) be part of this project or wait? The question was on the table when the session ended.
- I read "lets do 2" as source 2, Foundryborne. Confirm.

### Facts from research (2026-10-24)

- SRD 2.0 released 2026-08-25, adds Hope & Fear: Assassin, Brawler, Warlock, Witch, Dread domain, transformations. https://www.daggerheart.com/srd/ . No official machine-readable version.
- License DPCGL 2.0: https://darringtonpress.com/wp-content/uploads/2026/08/DPCGL_2.0_AUG_26_2026.pdf . §2.1 allows reproducing and sharing Public Game Content; §1.8 private play is not Sharing; §1.9 permitted formats list print, streams and named VTTs and does not mention apps or plugins, so a public plugin must not bundle SRD text. Read the license before publishing the dataset: this is not legal advice and whether a data repo counts as a permitted format is worth a real look.
- Required credit: "This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others." Reword the last sentence, since we modify the format.
- Foundryborne packs: pack LICENSE still cites SRD 1.0 though it holds 2.0 content; images and logos are restricted to Foundry; level-up options are in system code, not data. seansbox/daggerheart-srd is the SRD 1.0 fallback. daggersearch/daggerheart-data has the best schema to copy, but exclude its `the_void` playtest folder.
- Rules shape to design for: 2d12 Hope and Fear dice with doubles as a critical; six traits; Evasion; HP and Stress slots; armor slots; damage thresholds; domain cards; Experiences.

## Phone sync (open design)

Problem: the first sync to a phone of 9214 files, 80 MB, stalls; it even held up the plugin itself. The owner turned on Obsidian's prevent-sleep toggle and the sync was still running on 2026-10-24. Offline does not matter.

Proposal the owner has not yet ruled on: phones exclude the library folders in Obsidian Sync; the desktop plugin writes one compressed pack (measured 18 MB with all text, less without book chapters); phones read the pack when the folders are absent; own notes stay as notes. No server. Cost: no browsing the library as ordinary notes on the phone. Still unanswered: do they open library notes directly on the phone? It belongs in the shared core.

## Other open items

- Public repo `rt-541/obsidian-5e-sheet-public` is at 2bffeb6, behind all five plans. Say go before syncing: port to `/docker/dnd-sheet-export`, run an independent audit, then push. It must still carry no content.
- About-site project page: committed e7e3db9 on homelab-config branch `worktree-dnd-sheet-spec`, at /projects/obsidian-5e-sheet. Needs 2-4 screenshots of invented characters (in `public/obsidian-5e-sheet/`, `shots` array in the page), a PR, and the owner's OK on translations. It still says 5e only; decide whether to update it for the RPG-agnostic direction.
- `nemesis/composed-apps/about-site/scripts/translate-prompt.ts` lists "Azur", "Boros" and "Boros Legionnaire". Asked whether to remove them; no answer yet.
- 105 decisions agents made during the build: https://scratch.rt-541.io/dnd-sheet/rulings/ . The owner has not said they reviewed them. One to raise: on the phone, Level up and Roll log moved to the More tab and tabs got short labels.
- Azur's spider companions (Agathon, Magula, five total): what creature are they? Companions can now be added by search or stat block.
- 48 limited variants are on the Needs Review page; "+1/+2/+3 Weapon (no damage)" is unusable; Armor of Resistance grants no resistance yet. Variants currently keep only bonusAc and bonusWeapon, dropping resist, saving throw and charges.
- 5e backlog: `docs/plans/next-build.md`: prepared casters picking spells daily, the ~50 medium mechanics overlay entries, Wild Shape forms, spell damage riders, plus the smaller builder and wording items. Check it first; P1 fixed some of them.
- Pins resolve to the first row when two rows hold one item; a per-row pin is a follow-up.

## Watch out

- azure-dragon: `ssh azure-dragon` or `azure-dragon-vpn`, often unreachable or dropping scp; it is also planned to move to Linux (see the azure-dragon-linux memory), so the vault path and user may change. `scripts/deploy-vault.sh` has them at the top.
- The owner's local Obsidian app is the real test; a bug in the DOM repeats across all three layouts.
- SDD worked well here: a fresh builder per task, a separate reviewer, then a render check with real Obsidian CSS. The render check found what tests could not (a button covering the next row, buttons sliding sideways), so do it for anything touch-related.
