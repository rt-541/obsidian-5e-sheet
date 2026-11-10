# dnd-compendium

This code came from `scripts/dnd-compendium/` on the `worktree-dnd-compendium` branch of homelab-config (commit a15b464) and now lives here as `importer/`.

Builds a private Obsidian compendium of the user's own 5e books in the `dnd`
vault on azure-dragon, one generated folder per source under `compendium/5e/`:

| Folder | Built from | Code |
|---|---|---|
| `WotC/` | the 5e.tools 2014 data (all 52 books + 80 adventures) | `dndc/fivetools.py`, `dndc/ft_notes.py` |
| `WotC 2024/` | the 5e.tools 2024 data, only the books listed in `sources-2024.json` | `dndc/ft24/`, `dndc/ft_notes.py`, `dndc/libraries.py` |
| `Kobold Press/` | PDFs: Tome of Beasts 1 and 2, Strongholds & Followers | OCR route below |
| `Necromancer Games/` | PDF: Fifth Edition Foes | OCR route below |
| `Mystic Arts/` | built on another branch; this code only counts it (`vault-count`) | not built here |

Book text never enters git: the data clone, work files and output live in
`/docker/dnd-compendium/` (mode 700), and nothing is published to scratch or the
about-site. The other folders under `compendium/5e/` (Critical Role, Roll20,
Homebrew) are hand-made by the sheet-plugin session and never touched.

## WotC from 5e.tools

```
git clone --depth 1 https://github.com/5etools-mirror-3/5etools-2014-src.git /docker/dnd-compendium/5etools-2014
git -C /docker/dnd-compendium/5etools-2014 pull --ff-only      # later updates
```

No OCR, no model: creatures, spells, items and conditions arrive as fields.
`fivetools.py` resolves `_copy` inheritance (with `_mod` operations and race
templates such as "Mountain Dwarf" or "Reduced Threat") and renders 5e.tools
markup to Markdown, turning every `{@spell ...}`, `{@creature ...}`, `{@item ...}`
and `{@book ...}` reference into an exact wikilink. `ft_notes.py` writes the same
frontmatter and tags as before, so the vault and the sheet plugin see no format
change. Same-name entities from different sources: the first in the library's
priority list keeps the plain name, later ones get `Name (SRC)` and `id: name-src`.
The lists live in `dndc/libraries.py`: `PRIORITY_2014` for `WotC/`, and for
`WotC 2024/` the enabled books then adventures of `sources-2024.json` in published
order (`WOTC_2024.priority`). Classes, races, feats and backgrounds carry the sheet
plugin's op format.

## The two WotC libraries

A `Library` value (`dndc/libraries.py`) names a folder, an edition, a data clone, the
source ids it takes and its marker text; `build` writes each one into its own folder.
Each WotC library links only inside its own folder; only the publisher libraries (`Kobold Press`,
`Necromancer Games`) take the 2014 `WotC` link seed. `WotC/` is the 2014 data (`5etools-2014`, every source), `WotC 2024/`
is the 2024 data (`5etools-2024`, only the ids in `sources-2024.json`). The 2014 output
does not change except for the edition stamp.

`sources-2024.json` holds `published_from` (the cutoff, `2024-09-17`) and one entry per
source: `id`, `kind` (`book` or `adventure`), `published` and `enabled`. No titles. To add a
later title, add one entry (its id as in the clone's `books.json` or `adventures.json`) and
rebuild; a title listed with `enabled: false` (announced, not out) is skipped until the flag
is flipped. The build warns when the file and the clone disagree (an enabled id missing from the
clone, or a clone entry published on or after the cutoff that the file does not list).

Edition stamp: every generated note in `WotC/`, `Kobold Press/`, `Necromancer Games/` and
`WotC 2024/` has `edition: "2014"` or `edition: "2024"` (quoted) and the tag
`5e/edition/<year>`; index pages get a minimal front matter with the same two. `Mystic Arts/`
is unstamped here (built elsewhere).

New fields on 2024 notes (the contract with the plugin; never rename or reshape):

- `replaces`: ids of the 2014 notes this note stands in for, read from the data's
  `reprintedAs` and checked against the built 2014 library.
- background: `abilityPick: {from, patterns}` (the ability choice, no `ability` block) and a
  `feat` op, `feat: <id>` for a fixed feat or `categories: [...]` to pick one.
- feat: `category` (slug) and `minLevel`; a feat variant is a separate feat, named
  `<Feat> (<Variant>)`.
- species: no ability scores; may grant a `feat` op. Lineages are `5e-subrace` notes under
  `Races/<Species>/Subraces/` carrying only what differs from the species.
- class: `asi` op `feats`, 2024 classes write `["general", "origin", "epic-boon"]` (fighting
  style is left out: the sheet does not check a feature prerequisite); `feat` ops;
  `choose` with `what: mastery`, one op per increase and no `from` (the contract
  makes `from` optional, weapon item ids, and leaving it out means every weapon with a mastery; the
  importer writes none, homebrew may list weapon ids); `resource` `refill: {on: short, amount: 1}` for a
  feature that regains one use on a short rest (the contract also allows an optional `oncePer: long`).
- weapons: `weapon.mastery` (id of a `5e-mastery` note); `Masteries/` holds those notes.
- 2024 rule notes, creatures and items carry `needs_review` when a check failed.

Known gaps of the 2024 build: creature `_versions` are not expanded (counted in the build
log); limited-use features without a table column are listed as a problem; class mastery
restrictions are prose; innate, chosen and by-level spells stay in the text; alternative
spell lists stay in the text (only shared spells are granted); a third-caster class is
assumed to use the wizard list; the 2024 data has no multiclass requirements; class starting
gold is omitted (the sheet takes dice, the data gives a fixed amount); feat grants the op
format cannot express (expertise, senses, immunities, saves) stay in the text with a review
line; half casters with `casterProgression: artificer` get no level-1 slots in the current
plugin (plugin side); a nested class feature's text is not repeated in the class note body.
2014 keeps a known nested-link defect (32 lines) so its output stays byte-identical; it is
fixed only in 2024.

## Commands and checks

```
PY=/docker/dnd-compendium/venv/bin/python; IMP=<checkout>/importer
$PY -I $IMP/compendium.py build --libs "WotC,WotC 2024"
$PY -I $IMP/compendium.py sync --dry-run --libs "WotC 2024"  # what would be sent
$PY -I $IMP/compendium.py sync --libs "WotC 2024"
$PY -I $IMP/compendium.py vault-count --libs "WotC 2024"     # read-only; an absent folder prints absent=True
/usr/bin/python3 -I $IMP/verify.py stamp-diff OLD NEW --libs "WotC,Kobold Press,Necromancer Games"
/usr/bin/python3 -I $IMP/verify.py 2024 --out OUT --data CLONE --sources $IMP/sources-2024.json \
    --legacy OUT/compendium/5e/WotC --report REPORT
```

`stamp-diff` proves the edition stamp is the only difference between two builds of the old
libraries; `verify.py 2024` runs the scripted checks (counts, class tables, formulas, links,
`replaces`, YAML) and needs PyYAML, hence system python. Scratch build that touches nothing
live: make `V=/docker/dnd-compendium/verify-<date>` holding symlinks `5etools-2014`,
`5etools-2024`, `work` to the real ones and its own `out/`, then
`DNDC_ROOT=$V $PY -I $IMP/compendium.py build --libs "WotC"` and prove the 2014 output with
`verify.py stamp-diff /docker/dnd-compendium/out $V/out --libs "WotC"` while the live `out` is unstamped; a plain
`diff -rq` of the two `WotC` folders is valid only once the live `out` is stamped. Name the libraries with `--libs`; it
keeps a scratch run to the folders under test.

Defaults when `--libs` is left out: `sync` sends only `WotC`, `Kobold Press` and `Necromancer Games`
(`WotC 2024` always needs `--libs "WotC 2024"`, by design, after the plugin is deployed); `build` and
`run-bg.sh finish` build the 2024 library too; `vault-count` counts `WotC 2024` and `Mystic Arts` as well.

Order of release: the plugin's edition-aware build goes out before `WotC 2024/` is synced.
Restamped existing libraries (`WotC`, `Kobold Press`, `Necromancer Games`) may sync first.

## Run

```
importer/run-bg.sh extract            # PDF -> lines (deterministic, ~2 min)
importer/run-bg.sh repair --workers 4 # model OCR word repair (~2 h, cached)
importer/run-bg.sh finish             # wait for repair, build, sync (retries until azure-dragon is awake)
tail -f /docker/dnd-compendium/finish.log
```

Single stages in the foreground: `/docker/dnd-compendium/venv/bin/python -I
importer/compendium.py {extract,repair,report,build,sync}`.
`report` prints entity counts and validation issues per book; `--books mm,phb`
limits any stage.

## Pipeline

1. **extract** (`dndc/extract.py`, `dndc/ocrfix.py`): PyMuPDF lines with font,
   size and position; two-column reading order split into bands at full-width
   lines; headings by size ratio to body text. The WotC PDFs are scans with an
   OCR layer, so digits are repaired deterministically in numeric contexts
   (dice, to-hit, DC, XP, feet, ability scores). The OCR reads `S` as 5 in some
   books and 8 in others: each book picks the reading that makes more
   `HP (XdY + Z)` lines add up, and a stat block that still fails is re-parsed
   with the other reading.
2. **repair** (`dndc/llm.py`): only lines that look damaged (rare words across
   all books, stray symbols, split letters; ~17%) go to qwen3-14b on devastator
   (`DNDC_LLM_URL`), 60 numbered lines per call. The model may only fix words
   inside a line; a returned line must keep its digits (a digit may only
   replace a letter OCR confuses with one) and stay 80% similar, or the
   original is kept. Proposals are cached in `work/<book>/repair.json`, so a
   changed acceptance rule needs no new model calls.
3. **build** (`dndc/parse.py`, `dndc/render.py`): structure is parsed
   deterministically, never by the model (tested: the model moved immunities to
   resistances and invented traits). Stat blocks by their printed labels
   (plus the Fifth Edition Foes layout), spells by level/school line + Casting
   Time, items by type/rarity line, PHB conditions. Each stat block is checked:
   HP vs hit dice, hit point bonus vs Con, XP vs CR, six ability scores,
   name/type present. Failures are listed in `Index/Needs Review` and in the
   note's `needs_review` property, with the book page.
4. **sync**: the tar goes over with scp to `C:/obsidian/.dnd-library.tar`, is
   unpacked into `C:/obsidian/.dnd-library-staging` (outside the vault, so
   Obsidian Sync never sees a half-written tree), checked for tar's exit code
   and the file count, then swapped in for `C:/obsidian/dnd/compendium/5e/WotC` (the
   vault keeps one folder per source under `compendium/5e/`; other folders (including `Mystic Arts/`) are left alone); a failed swap puts the old one
   back. A non-empty target is replaced only when it carries one of the build's two markers: the
   `.dnd-compendium-generated` dot-file, or a `5e Library.md` whose front matter has `type: "5e-library"`
   (the library's root note, which Obsidian Sync carries to the other machines; dot-files it does not).
   Otherwise it is refused, so keep hand-written notes outside `compendium/5e/WotC`.
   Nothing else in the vault is touched. `DNDC_VAULT_HOST` takes a comma list tried in order (e.g. `azure-dragon,arthu@<vpn ip>`). Obsidian
   Sync carries it to the other devices.

A stat block whose name the OCR lost gets a name inferred from its own text and
a provisional note name, `Name (unverified, BOOK p. N)`, so a guess never takes
the real creature's note or its links. Armor Class lines that could not be read
as a stat block are listed at the end of `Index/Needs Review`.

## Output

```
compendium/5e/WotC/
  5e Library.md                 start page; front matter type: 5e-library marks the folder as generated
  Creatures/ Spells/ Items/ Conditions/   type: 5e-creature | 5e-spell | 5e-item | 5e-condition
  Books/<Title>/NN <Chapter>.md  book text by PDF bookmark chapter, entities embedded
  Index/                         by CR, by spell level, by rarity, Needs Review
```

Frontmatter follows the dnd-5e-sheet plugin spec (`type: 5e-<type>`, `schema: 1`,
`id` from the name). Links: italic spell/item names, bold creature names,
NPC descriptions like "(LN male human commoner)", "the statistics of a
gladiator", and the first mention of each condition per note.

Tags (`dndc/tags.py`) are nested under `5e/` for the tag pane; exact values stay
properties for Bases (`cr_value` is numeric so CR sorts):

- creatures: `5e/cr/1-4`, `5e/tier/1`..`4` (CR 0-4, 5-10, 11-16, 17+),
  `5e/type/humanoid/elf` (base type snapped to the 14 official types; a subtype
  only if the books use its words elsewhere), `5e/size/large`,
  `5e/align/lawful-evil`, `5e/moves/fly`, `5e/has/legendary` / `lair` /
  `spellcasting` / `magic-resistance` ..., `5e/immune/fire`, `5e/resist/cold`,
  `5e/vulnerable/radiant`, `5e/immune/poisoned`
- spells: `5e/spell/level/3` or `5e/spell/cantrip`, `5e/school/evocation`,
  `5e/class/wizard` (from the PHB and Xanathar's class lists; also a `classes`
  property), `5e/spell/ritual`, `5e/spell/concentration`, `5e/cast/bonus-action`,
  `5e/save/dex`, `5e/spell/attack`, `5e/damage/fire`, `5e/spell/healing`,
  `5e/inflicts/frightened`
- items: `5e/item/wondrous-item`, `5e/rarity/very-rare`, `5e/attunement`,
  `5e/attunement/wizard`
- everything: `5e/source/mm`, and `5e/review` when a check failed

**Contract with the dnd-5e-sheet plugin.** The plugin reads these notes through an
adapter from Obsidian's metadata cache: `type: 5e-*`, `id`, `name`, `schema: 1`, the
snake_case fields (`casting_time`, `item_type`, `components` as a string, ...) and the
`5e/save/*` and `5e/damage/*` tags. Changing any of those needs a matching change in
the plugin (repo `rt-541/obsidian-5e-sheet`), so tell that side first.

Duplicates: the first book in `books.json` order owns a note; a later book with
the same stat block adds an "Also in" line, a different one gets `Name (ABBR)`.

## Known gaps

- Three PDFs have no text layer and are skipped (`books.json` `skip`): the
  Descent into Avernus Miscellany, the Curse of Strahd introductory adventure,
  Prepared 2!. They need a real OCR pass (Tesseract in a container).
- OCR dropped some stat-block names and type lines; names are then inferred
  from the block's own text ("the aarakocra can...") and flagged.
- Tables whose cells the PDF does not space apart come out as one line.
- Images and maps are not extracted.
