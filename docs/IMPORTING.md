# Importing your books into the vault

The sheet works with the built-in basic rules alone. If you own the books, a separate importer turns
them into notes in your Obsidian vault so the sheet can offer their creatures, spells, items,
classes, races, feats and backgrounds. This guide covers that importer from your side: what to run,
in what order, and how to check the result.

Everything imported stays private. It lives in your vault and nowhere else. Never commit imported
notes to git and never publish them. This plugin ships no book content, and neither should you.

The importer is a separate tool (it lives in the `dnd-compendium` scripts of the owner's homelab
repo), not part of this plugin. Commands below use placeholders in angle brackets: replace them with
your own paths and host.

## What you need

- The books. Either you own them as PDFs, or you own the WotC books and use the public 5e.tools data
  mirror as the source of the same text. Only import what you own, for your own use.
- A Python environment for the importer, written below as `<python>`, and the importer folder,
  written as `<importer>` (the `scripts/dnd-compendium` folder of its checkout). Run every importer
  command as `<python> -I <importer>/compendium.py ...`.
- A data folder for clones, work files and output, written as `<data-dir>`. Keep it private (mode
  700). Nothing in it goes into git. Set `DNDC_ROOT=<data-dir>` for every importer command. The
  clones sit at `<data-dir>/5etools-2014` and `<data-dir>/5etools-2024`, and work files at
  `<data-dir>/work`.
- For the WotC books: `git`, to clone the two 5e.tools data mirrors (2014 and 2024).
- For PDFs from other publishers: PDFs with a text layer. Image-only PDFs are skipped until they get
  a real OCR pass.
- An Obsidian vault with this plugin installed. The importer writes into `compendium/5e/` in that vault.
- To sync into the vault: the vault on a Windows machine that the importer can reach with `scp` and
  `ssh` (OpenSSH and PowerShell on that machine). `sync` always copies with `scp` and then runs a
  PowerShell swap over `ssh`; there is no local mode. Set `DNDC_VAULT_HOST` (required; a comma list
  of hosts tries each in order; its default is the owner's host). Set the vault path too: the
  importer reads `DNDC_VAULT_PATH`, and its default is the owner's path.
- Optional: a local language model to repair OCR words in third-party PDFs, named by
  `DNDC_LLM_URL` (its default is a private host). Skip it if you only import WotC data.

The importer writes one generated folder per source under `compendium/5e/`:

| Folder | Built from |
|---|---|
| `compendium/5e/WotC` | the 2014 data, every book and adventure |
| `compendium/5e/WotC 2024` | the 2024 data, only the books listed in `sources-2024.json` |
| `compendium/5e/Kobold Press`, `compendium/5e/Necromancer Games` | third-party PDFs |

Other folders under `compendium/5e/` (your Homebrew and any other folders you made) are yours. The
importer never touches them.

## Import a book

A WotC book needs no code change. Pull the data, build, sync, and check the counts. Every book and
adventure in the 2014 data is built: creatures, spells, items, conditions, classes and subclasses,
races, feats, backgrounds, and the book text as chapter notes.

A book from another publisher comes from its PDF:

1. Check the PDF has a text layer.
2. Add it to `<importer>/books.json` with `slug`, `abbr`, `kind` (bestiary, rules, adventure or
  setting), `title`, `file`, `publisher`. A new publisher also needs a folder entry in the
  importer's `PUBLISHER_LIBS`.
3. `<python> -I <importer>/compendium.py extract --books <slug>` reads the lines, fixes digits, and
  prints how it read the letter S.
4. Optional: `<python> -I <importer>/compendium.py repair --books <slug>` uses a local model to fix
  damaged words. Proposals are cached.
5. `<python> -I <importer>/compendium.py report --books <slug>` prints entity counts and problems. A
  publisher whose stat blocks look different needs a new parser in the importer.
6. `<python> -I <importer>/compendium.py build`, then work through the Needs Review list below, then sync.

## Import the 2014 and 2024 data

The two editions are separate clones built into separate folders, so they never mix.

```
git clone --depth 1 https://github.com/5etools-mirror-3/5etools-2014-src.git <data-dir>/5etools-2014
```

The 2024 data is a second clone at `<data-dir>/5etools-2024`. The importer docs do not name its
repository; it sits in the same mirror organisation as the 2014 one, so clone it the same way from there.
Then build both:

```
<python> -I <importer>/compendium.py build --libs "WotC,WotC 2024"
```

Every generated note carries an `edition` stamp, `edition: "2014"` or `edition: "2024"` (quoted),
and the tag `5e/edition/<year>`. The sheet reads that stamp to show each character the right
edition's content. A note you write yourself may carry `edition` to limit it to one edition; without
it the note belongs to both.

`WotC 2024` takes only the sources listed in `<importer>/sources-2024.json`: `published_from` (the
cutoff, 2024-09-17) and one entry per source with `id`, `kind` (`book` or `adventure`), `published`
and `enabled`. To add a later title, add one entry with its id from the clone's `books.json` or
`adventures.json` and rebuild. An entry with `enabled: false` (announced, not out) is skipped until
you flip the flag. The build warns if the file and the clone disagree.

## Refresh

To pick up corrections in the data, pull both clones, then rebuild:

```
git -C <data-dir>/5etools-2014 pull --ff-only
git -C <data-dir>/5etools-2024 pull --ff-only
<python> -I <importer>/compendium.py build --libs "WotC,WotC 2024"
```

Name the libraries with `--libs`. Without it, `build` builds the 2024 library too, but `sync` sends
only `WotC`, `Kobold Press` and `Necromancer Games`.

## Work through the Needs Review list

Every build checks each stat block (hit points against hit dice, the Con bonus, challenge rating
against XP, ability scores, name and type present). A block that fails is listed in
`Index/Needs Review` inside its library folder, with the book page, and its note carries a `needs_review`
property and the tag `5e/review`. In 2024 the same property marks rule notes and items whose check
failed. A clean build leaves the page at 0 lines.

For the PDF route, the corrections loop is:

1. `<python> -I <importer>/compendium.py review-prep --batches 16` cuts page images and work items.
2. Check each item against the page image yourself (or hand batches to an assistant and spot-check
  what it returns).
3. Hand fixes go in `<data-dir>/work/review/out/manual/*.json`.
4. `<python> -I <importer>/compendium.py review-merge`, then `build`, then look at the list again.

Corrections are data and are checked again on every build, so a wrong correction stays flagged. WotC
data from 5e.tools has no OCR, so its list is usually short.

## Sync the vault

Sync is guarded. It copies the build to a staging folder outside the vault, checks the file count,
then swaps one generated folder into `compendium/5e/`. A failed swap puts the old folder back. A
target folder that is not empty and does not hold the `.dnd-compendium-generated` marker is never
replaced, and nothing else in the vault is touched: the marker is what tells the importer a folder
is its own. Keep hand-written notes outside the generated folders.

A generated library also carries a root note, `5e Library.md`, whose frontmatter says
`type: "5e-library"`. This note is what lets a library that reached another device through Obsidian
Sync be recognised there as generated, because Obsidian Sync does not carry dot-files and the
`.dnd-compendium-generated` marker alone never arrives. The plugin accepts either one.

Release order matters. The plugin has to read the `edition` stamp and the 2024 fields before it
sees 2024 notes. The restamped older libraries may sync first: preview, then sync.

```
<python> -I <importer>/compendium.py sync --dry-run
<python> -I <importer>/compendium.py sync
```

`sync` with no `--libs` sends only `WotC`, `Kobold Press` and `Necromancer Games`. Then install a
plugin build that knows editions, and only then sync `compendium/5e/WotC 2024`, which always needs
`--libs`:

```
<python> -I <importer>/compendium.py sync --dry-run --libs "WotC 2024"
<python> -I <importer>/compendium.py sync --libs "WotC 2024"
```

If Obsidian Sync is on, it carries the new folders to your other devices. Imported notes stay in the
vault; do not add the vault's `compendium/` folder to a git repository or publish it anywhere.

## Check it worked

- The build log gives counts per library. `Index/Needs Review` should be empty or known.
- After syncing, count what landed. This is read-only, and a folder not in the vault prints `absent=True`:

```
<python> -I <importer>/compendium.py vault-count --libs "WotC 2024"
```

- In the vault, each generated folder holds a `.dnd-compendium-generated` file. Your own folders
  have none and should be unchanged.
- Open a note from each folder: `compendium/5e/WotC` notes show `edition: "2014"`,
  `compendium/5e/WotC 2024` notes show `edition: "2024"`.
- In the sheet, make a character for each edition and open the compendium: it should show that
  edition's content, and bringing something across (see [USING.md](USING.md)) should work.
- A very small share of links in the generated notes point at nothing; that is expected.
