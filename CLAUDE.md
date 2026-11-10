# RPG sheet: Obsidian character sheet plugin

A custom Obsidian plugin: a full character sheet that lives in a note, for desktop, tablet and phone, built for players who are NOT rules-savvy. It started as a 2014 D&D 5e sheet and is becoming RPG-agnostic (Daggerheart next, The Expanse RPG later). Read `docs/STATE.md` before starting, then keep it current: it is how long sessions get replaced by short ones.

Repo: private `rt-541/obsidian-5e-sheet`, default branch `main`. Scratch work lives in `work/` (symlink to `/docker/rpg-sheet-work`, not in git).

## Hard rules

- No book text in git, ever, and none on scratch or the about-site. The owner owns the books; the library is for personal use. Test fixtures are INVENTED, numbers included: a renamed or reworded published stat block is still a copy.
- This repo is mirrored by hand to the public `rt-541/obsidian-5e-sheet-public`, which ships NO game content. Never edit the mirror from here. The sync is sanitized, audited by a separate agent, and pushed only after that audit passes. Staging tree: `/docker/dnd-sheet-export`. `importer/` is never part of the mirror.
- Never write under the generated library folders in the vault (`compendium/5e/WotC`, `Kobold Press`, `Necromancer Games`, `Mystic Arts`) or `campaigns/`, and never edit `.obsidian/graph.json`. Only the importer's marker-guarded sync replaces generated folders.
- The sheet writes only the character note and the owner's Homebrew folders, never class, race, feat, item or library notes. Per-character changes go in the character note.
- Nothing in code names a specific race, class, feat or item. Everything is data and works for any homebrew.
- Players never type YAML, keywords or formulas. Plain words; every number explains itself; nothing is spent silently; destructive actions confirm.
- Parity on desktop (hover), tablet and phone (tap), with 44 px touch targets. Layout tests place each feature id once per layout.
- Plain DOM via `h()`, never innerHTML. Mount roots use `classList`, never `className`: the root is Obsidian's `.view-content`, and losing that class kills scrolling. Plugin button rules need `.fe-sheet button.x` specificity to beat Obsidian's `button:not(.clickable-icon)`. Every text input has `type="text"`.
- Test first. Keep `npm test`, `npm run typecheck` and `npm run build` green. Commits are conventional, one sentence on why.
- Generated review pages go to `https://scratch.rt-541.io/` with `/docker/homelab-config/scripts/scratch-publish.sh <dir> dnd-sheet/<name>`, never claude.ai artifacts. Publishing rsyncs with `--delete`, so use a separate dest path per page set. The file path is not a deliverable; the owner works over SSH.
- Never run in or edit a `-public` checkout. No emojis. Use they/them for people unless told otherwise.

## How it is built

- `src/core`, `src/content`, `src/rules`: pure logic, no Obsidian import. `src/ui`: controller, components, panels, layouts. `src/obsidian`: store, views, settings.
- Character note frontmatter stores choices and counters only; everything else is derived. Folder = source: `compendium/5e/<Source>/...`. Precedence: user sources, then library, then bundled SRD.
- `tests/ui/sheet.test.ts` "roll log keeps the last 50" can time out under load; a rerun of that file alone settles it.

## Deploy

`scripts/deploy-vault.sh` builds the current tree and copies `main.js`, `styles.css` and `manifest.json` into the dnd vault plugin folder, then prints the hash. Run it from a clean checkout of main. azure-dragon's SSH is flaky and it may not stay Windows (see `docs/STATE.md`). Merge and deploy are done by Claude for this project when the owner says so; pushing to main needs the owner's words.

## Where things are

- `docs/STATE.md`: current state, open decisions, next steps.
- `docs/superpowers/specs/`, `docs/superpowers/plans/`: approved design and the five executed plans.
- `docs/plans/next-build.md`: 5e backlog.
- `work/ledgers/`: execution ledgers; `rulings.md` is every decision agents made (also https://scratch.rt-541.io/dnd-sheet/rulings/).
- `work/gallery/`: render harness that mounts the real plugin with Obsidian's real `app.css` and screenshots every page with Playwright. Its paths still point at the old checkout; repoint them here. Run `npm i playwright` there first.
- Importer: `importer/` in this repo. The live copy jobs run from is `/docker/dnd-compendium/code` (refresh it with `rsync -a --delete --exclude __pycache__ importer/ /docker/dnd-compendium/code/` after backing it up). Data and output stay in `/docker/dnd-compendium/` (private, mode 700).
