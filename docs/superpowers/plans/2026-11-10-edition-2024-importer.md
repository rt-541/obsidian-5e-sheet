# 2024 Library in the Compendium Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The private importer builds a second WotC library, `compendium/5e/WotC 2024/`, from the 2024 data, stamps every generated note in every library it builds with its edition, and proves the existing libraries changed by nothing else.

**Architecture:** A `Library` value (folder, edition, data clone, allowed source ids) replaces the hard-coded `FIVETOOLS`/`LIB` pair; `ft_notes.build` takes one. The 2024 shapes get their own converter package `dndc/ft24/` behind a seam, so the 2014 converters (and their known flaws) stay byte-for-byte as built on 2026-10-24. The edition stamp is one post-pass over each built tree. Verification is scripts first (`verify.py`); a local model only drafts second looks.

**Tech Stack:** Python 3 (venv `/docker/dnd-compendium/venv`, PyMuPDF only), `unittest`, stdlib; PyYAML exists only in system `/usr/bin/python3` and is used by `verify.py` alone.

**Spec:** `/docker/rpg-sheet/docs/superpowers/specs/2026-11-10-edition-2024-design.md` (goal 6 and the importer half of "Contract between the importer and the plugin"). Read it and the code in `scripts/dnd-compendium/` before starting. The plugin is planned against the contract in parallel (`2026-11-10-edition-2024.md`): field names and shapes below are fixed.

## Conventions used in every task

```
WT=/docker/homelab-config/.claude/worktrees/dnd-compendium     # the only place code is edited
IMP=$WT/scripts/dnd-compendium                                  # all plan paths are relative to this
PY=/docker/dnd-compendium/venv/bin/python
D=$(date +%F)                                                   # the day of the production build
V=/docker/dnd-compendium/verify-$D                              # scratch DNDC_ROOT (Task 1)
TRAILER='Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>'
TEST="cd $IMP && $PY -m unittest discover -s tests -t ."        # no -I: -I drops the cwd and the imports break
ONE="cd $IMP && $PY -m unittest tests.<module> -v"
COMMIT: git -C $WT add <files> && git -C $WT commit -m "<type>: <one sentence on why>" -m "$TRAILER"
```

Baseline: 20 tests, all in `tests/test_ft_items.py`, all passing. Every task ends with `$TEST` green. Tests that need PyYAML run with `/usr/bin/python3 -m unittest` (they skip under the venv).

## Global Constraints

- Private data never enters git: code, tests and docs only. Fixtures are invented, names and numbers included (a renamed published stat block is still a copy). Plan, commits and docs may name JSON keys, counts and book ids, never rules wording, descriptions or stat lines.
- All edits are in `$WT` on branch `worktree-dnd-compendium`. Never push, never touch the draft PR. `/docker/homelab-config` (main checkout) has the owner's uncommitted edits: never stash, reset, checkout or write there. Never read or write `/docker/dnd-sheet-export` or any path containing `-public`.
- No network: no `git fetch/pull`, no `pip install`, no clone refresh.
- The 2014 build is unchanged except the stamp: it reads `5etools-2014`, writes `compendium/5e/WotC`. The 2024 build reads `5etools-2024` (v2.41.0) and writes `compendium/5e/WotC 2024`, with its own `.dnd-compendium-generated` marker, `Index/` and `Index/Needs Review`.
- The 2024 library takes entries only from the ids in `sources-2024.json`: every book and adventure published on or after `2024-09-17` (18 books, 24 adventures), with `WoW` and `ICC` listed but `enabled: false` until their 2026-11-17 release. Entries from older books in the 2024 clone are ignored (but may be `_copy` bases).
- Every generated note in every library the branch builds (`WotC`, `Kobold Press`, `Necromancer Games`, `WotC 2024`) gets `edition: "2014"` or `edition: "2024"` (quoted string) and the tag `5e/edition/2014` or `5e/edition/2024`. `Mystic Arts` is built from another branch: out of scope, stays unstamped, is never built or synced here.
- Contract additions (fixed): `replaces: [<id>, ...]` on 2024 notes (ids of the same type the 2014 data says were reprinted as this entry; ids only; left out when none or when the only one equals the note's own id); background (homebrew race, subrace, feat too) `abilityPick: { from: [<abil>, ...], patterns: [[2, 1], [1, 1, 1]] }`; op `{ op: feat, id, feat: <feat id> }` or `{ op: feat, id, categories: [<category>, ...] }` (class and subclass levels and grants); `asi` may carry `feats: [<category>, ...]`; feat `category` (slug) and `minLevel` (whole number); `choose` with `what: mastery`, `count`, optional `from` (one op per increase); weapon mapping `mastery: <mastery id>`; new type `5e-mastery` (`id`, `name`, common fields, rules text as body, folder `Masteries/`); `5e-race` stays the type for a 2024 species; spells known/prepared numbers go in the existing class op mechanism (see Task 5). Types and fields otherwise as in `references/note-format.md`.
- Links written by the 2024 library stay inside it and use full vault paths (`compendium/5e/WotC 2024/...`).
- Sync never touches `compendium/5e2024/`, `campaigns/`, the owner's own source folders or `.obsidian/graph.json`. Do not run the `graph` command. Vault hosts: `DNDC_VAULT_HOST=azure-dragon,azure-dragon-vpn`.
- Before any build that replaces `/docker/dnd-compendium/out`: back it up to `out.bak-$D` and the live code to `code.bak-$D`, then refresh `/docker/dnd-compendium/code` from the branch (Task 12). Existing backups are never overwritten.
- Test first in every task. Conventional commits, one sentence on why, trailer `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. No emojis anywhere.
- A local model may draft a list of suspect notes (Task 13); its output is a draft to be checked against the data, never evidence, and never copied into docs.

## Review Focus

Failure modes the spec implies that no single feature test covers; each has its test in the named task.

1. A source id in `sources-2024.json` that the clone does not have (typo, or a title a later pull dropped), or a title in the clone dated on or after the cutoff that the file lacks: the build warns by id and still runs; it never silently builds an empty or partial library. (Task 2)
2. The stamp must touch only the front matter: a body line that reads `tags:` or `edition:` stays as it is, a second run changes nothing, an index page with no front matter gets a minimal one. (Task 4)
3. A rules entry missing a piece (background with no `feats`, species with no size, a class feature reference that resolves to nothing, a subclass whose class is outside the library): the converter records a problem line on that note and the Needs Review page; it neither raises nor drops the note silently. (Tasks 5, 6)
4. A feat variant a background names (`"<feat>; <variant>|<src>"`) resolves to a feat note that exists, and a background naming a feat the library lacks yields a problem line, never a dangling `feat` id. (Task 6)
5. `replaces` ids are real: each exists, with the same type, in the freshly built 2014 library; a `reprintedAs` that points outside the library's books, or at an older entry the 2014 library does not have, is skipped and counted, not an error. (Task 9)

---

## File structure

Create: `dndc/libraries.py` (the `Library` values, the sources file loader, sync-target validation), `sources-2024.json`, `dndc/ft24/{__init__,common,classes,origins,replaces}.py`, `dndc/verify.py`, `verify.py` (entry, runs under system python), `tests/minidata.py` (invented mini clone writer), one `tests/test_*.py` per task. Modify: `compendium.py`, `dndc/render.py` (stamp, index text, folder table, count script), `dndc/fivetools.py` (additive: `masteries` key, `itemMastery` tag, `expand_versions`), `dndc/ft_notes.py` (library parameter, 2024 dispatch, mastery notes, item/creature/spell additions), `README.md`. Plugin side: `$WT/plugins/dnd/` (skill docs, templates, manifest).

Dependency map (tasks with no arrow between them may run at the same time, one person each, each on its own commit; T5-T8 touch disjoint functions or files):

```
T1 -> T2 -> T3 -> T5 -> T9 -> T11 (docs)
 T2 -> T3 -> T6 -> T9
 T2 -> T4 -----------------> T11, T12
 T2 -> T7 -> T9;  T2 -> T8 -> T9
 T2 -> T10 ----------------> T11, T12
 T5..T10 -> T12 (production build) -> T13 (second look) -> T15 (GATED b)
 T4 + T12 -> T14 (GATED a)
```

---

### Task 1: Worktree and baseline

**Depends on:** none.

**Files:** none edited. Creates `/docker/dnd-compendium/verify-$D/` (scratch root, outside git).

**Interfaces:** Produces `$V=/docker/dnd-compendium/verify-$D`, a scratch `DNDC_ROOT` with symlinks `5etools-2014`, `5etools-2024`, `work` to the real ones and its own `out/`; every later "scratch build" is `DNDC_ROOT=$V $PY -I $IMP/compendium.py build`.

- [ ] **Step 1: Fast-forward the worktree**

Run: `git -C $WT merge --ff-only origin/worktree-dnd-compendium && git -C $WT rev-parse --short HEAD && git -C $WT status --short`
Expected: HEAD `f68f540`, no status lines.

- [ ] **Step 2: Confirm it equals the live copy**

Run: `diff -r -x __pycache__ $IMP /docker/dnd-compendium/code`
Expected: no output. Any difference: stop and report.

- [ ] **Step 3: Baseline tests**

Run: `$TEST 2>&1 | tail -3`
Expected: `Ran 20 tests` and `OK`.

- [ ] **Step 4: Scratch root and unmodified build**

```
V=/docker/dnd-compendium/verify-$D; mkdir -p $V && cd $V
ln -s /docker/dnd-compendium/5etools-2014 .; ln -s /docker/dnd-compendium/5etools-2024 .; ln -s /docker/dnd-compendium/work .
touch .stamp; DNDC_ROOT=$V $PY -I $IMP/compendium.py build > baseline-build.log 2>&1
```
Expected: log ends after `build compendium/5e/Necromancer Games: ...`.

- [ ] **Step 5: The unmodified code reproduces the 2026-10-24 output**

Run: `diff -rq $V/out/compendium/5e /docker/dnd-compendium/out/compendium/5e`
Expected: the only line is `Only in /docker/dnd-compendium/out/compendium/5e: Mystic Arts`. Also `find /docker/dnd-compendium/work -newer $V/.stamp` prints nothing (the build only reads `work/`). Any other difference means the clone, code or work files drifted since 2026-10-24 and the stamp proof would be polluted: stop and report what differs.

- [ ] **Step 6: Record per-library file counts** to `$V/baseline-counts.txt`: `for l in WotC "Kobold Press" "Necromancer Games"; do echo "$l $(find "$V/out/compendium/5e/$l" -type f | wc -l)"; done` (the marker counts as a file; the numbers must equal `find` on the real `out`, e.g. 7964 for `WotC`). No commit.

---

### Task 2: Library values, source list, CLI plumbing

**Depends on:** Task 1.

**Files:**
- Create: `dndc/libraries.py`, `sources-2024.json`, `tests/minidata.py`, `tests/test_libraries.py`
- Modify: `compendium.py` (lines 214-261: `FIVETOOLS`, `cmd_build`, `cmd_sync`; `main` options), `dndc/ft_notes.py` (`build`, `rule_entities`, `rule_note`, `PRIORITY` use), `dndc/render.py` (`write_indexes` intro text, `count_script`)

**Interfaces:**
- Produces in `dndc/libraries.py`:
  - `@dataclass(frozen=True) class Library: folder: str; edition: str; data_dir: str; sources: frozenset[str] | None; priority: tuple[str, ...]; marker_text: str; review_intro: str | None`
  - `WOTC_2014: Library` (`folder == render.LIB`, `data_dir "5etools-2014"`, `sources None`, `priority == tuple(ft_notes.PRIORITY)` moved here as `PRIORITY_2014`), `WOTC_2024: Library`
  - `load_sources(path: str = SOURCES_2024) -> list[dict]` (entries `{id, kind, published, enabled}`); `SOURCES_2024 = <dndc dir>/../sources-2024.json`
  - `EDITIONS: dict[str, str]` folder -> edition for all four built folders; `BUILT: list[Library] = [WOTC_2014, WOTC_2024]`
  - `SYNC_DEFAULT: list[str]` = the three existing folders; `sync_targets(names: list[str] | None) -> list[str]` (names are folders under `compendium/5e/`, e.g. `"WotC 2024"`; returns full folders; `None` returns `SYNC_DEFAULT`; raises `SystemExit` for any name not in `EDITIONS`)
  - `source_warnings(lib: Library, books: list[dict], adventures: list[dict], cutoff: str = "2024-09-17") -> list[str]`
- Produces in `ft_notes`: `build(data_root: str, out_root: str, problems: list | None = None, lib: Library = WOTC_2014, legacy_ids: dict | None = None) -> tuple[dict, list]`; `rules_module(lib) -> module` (Task 3 fills the 2024 side).
- Produces in `render`: `count_script(path: str) -> str` (PowerShell: `(Get-ChildItem -LiteralPath '<path>' -Recurse -File -Force).Count` plus `Test-Path` of the marker, printing `files=<n> marker=<True|False>`).
- Produces in `compendium.py`: `build --libs <folders>`, `sync --libs <folders> [--dry-run]`, `vault-count [--libs ...]` (read-only, base64 `-EncodedCommand` over ssh, tries `render.VAULT_HOSTS`).

- [ ] **Step 1: Write `tests/minidata.py` and the failing tests**

`minidata.write_clone(root, *, extra=None)` writes an invented, loader-complete 5e.tools-shaped tree under `root/data`: `books.json` (book `NEWB` published 2024-10-01, book `OFFB` 2026-11-17, book `OLDB` 2014-05-01), `adventures.json` (adventure `NEWA` 2025-01-01), `bestiary/bestiary-newb.json` (+ `fluff-bestiary-newb.json`, `legendarygroups.json`, `template.json`), `spells/spells-newb.json`, `generated/gendata-spell-source-lookup.json`, `items.json`, `items-base.json`, `magicvariants.json`, `conditionsdiseases.json`, `class/class-zed.json`, `races.json`, `feats.json`, `backgrounds.json`, `optionalfeatures.json`, `book/book-newb.json`, `adventure/adventure-newa.json`. One invented entity per type in `NEWB`, one in `OFFB`, one in `OLDB`, and one `NEWB` creature that `_copy`s the `OLDB` one. `extra` is a dict of file -> mutator so later tasks add their shapes. Names like "Quillbeast", "Thornflare", "Ashen Zed".

`tests/test_libraries.py`:
- `test_sources_file_shape`: `load_sources()` has 42 entries, unique ids, `published >= "2024-09-17"`, `kind` in `{"book","adventure"}`, 18 books and 24 adventures, enabled ids are 40, disabled ids are exactly `{"WoW","ICC"}`.
- `test_library_values`: `WOTC_2014.folder == "compendium/5e/WotC"`, `.data_dir == "5etools-2014"`, `.sources is None`, `.edition == "2014"`; `WOTC_2024.folder == "compendium/5e/WotC 2024"`, `.data_dir == "5etools-2024"`, `.sources == frozenset(enabled ids)`, `.edition == "2024"`, `.priority` is the enabled book ids by published date, then the enabled adventure ids: it has no `WoW`/`ICC` and `priority.index("XPHB") < priority.index("XMM")`.
- `test_build_2014_layout_unchanged`: `ft_notes.build` on the mini clone with `WOTC_2014` writes `Creatures/ Spells/ Items/ Conditions/ Classes/ Races/ Feats/ Backgrounds/ Books/ Index/` under `compendium/5e/WotC` and the marker with the old text.
- `test_build_2024_filters_by_source`: with an invented library whose `sources == frozenset({"NEWB","NEWA"})` and `folder == "compendium/5e/WotC 2024"`: `NEWB`/`NEWA` entities written, the `OFFB` and `OLDB` ones not; the `_copy` creature of the `OLDB` base is written with its inherited stat line; counts dict equals `{"creature": 2, "spell": 1, ...}` for the fixture.
- `test_links_stay_inside_the_library`: a `NEWB` note whose text has `{@spell thornflare|NEWB}` (in library) and `{@spell oldflare|OLDB}` (outside): first renders `[[compendium/5e/WotC 2024/Spells/Thornflare|Thornflare]]`, second renders the plain display text. No `[[` target in the tree lacks the `compendium/5e/WotC 2024/` prefix.
- `test_marker_and_indexes_per_library`: `.dnd-compendium-generated` exists in `WotC 2024` with `marker_text`; `Index/Needs Review.md`, `Index/Creatures by CR.md`, `5e Library.md` exist under it; the Needs Review intro equals `review_intro`; the 2014 page keeps the old OCR sentence.
- `test_source_warnings`: a listed id absent from the clone gives `"listed in sources-2024.json but not in the clone: ZZZ"`; a clone book published `2025-01-01` and not listed gives `"in the clone, published on or after 2024-09-17, not in sources-2024.json: QQQ"`; clean input gives `[]`.
- `test_sync_targets`: `sync_targets(None) == ["compendium/5e/WotC", "compendium/5e/Kobold Press", "compendium/5e/Necromancer Games"]`; `sync_targets(["WotC 2024"]) == ["compendium/5e/WotC 2024"]`; each of `"Mystic Arts"`, `"5e2024"`, `"campaigns"`, `"Homebrew"`, `"../x"`, `"WotC/.."` raises `SystemExit`.
- `test_count_script`: `count_script(r"C:\obsidian\dnd\compendium\5e\WotC 2024")` contains `-LiteralPath 'C:\obsidian\dnd\compendium\5e\WotC 2024'`, `-Recurse -File -Force`, `.dnd-compendium-generated` and `files=`.

- [ ] **Step 2: Run to verify they fail**

Run: `ONE` with `tests.test_libraries`. Expected: errors (`dndc.libraries` missing).

- [ ] **Step 3: Generate `sources-2024.json`**

Write it once from the clone with a throwaway command (not committed): for every entry of `5etools-2024/data/books.json` (`book`) and `adventures.json` (`adventure`) with `published >= "2024-09-17"` emit `{"id", "kind", "published", "enabled"}` ordered by `published` then `id`, top level `{"edition": "2024", "published_from": "2024-09-17", "sources": [...]}`; set `enabled: false` for `WoW` and `ICC`. No titles. Check the counts (42, 40 enabled) before committing.

- [ ] **Step 4: Implement `dndc/libraries.py`, then thread `lib` through `ft_notes`**

`ft_notes.build` replaces every `LIB` with `lib.folder`, `PRIORITY` with `lib.priority` (`order = list(lib.priority) + book ids + adventure ids`), the marker text with `lib.marker_text`, and, when `lib.sources` is not None, filters after `resolve_copies` and variant expansion: monsters, spells, items (items.json, base items, magic variants by `inherits.source`), conditions/status/diseases, books, adventures, and (via `rules_module(lib).load(root, lib.sources)`) classes, subclasses (parent class must be a library entity), races, feats, backgrounds, optional features. `titles` keep every book. `write_indexes(out_root, ents, unparsed, lib_folder, review_intro=None)` gets the optional intro (default keeps today's OCR sentence so 2014 is unchanged). `rules_module(lib)` returns `ft_classes` for `"2014"`. No `ft24` yet (Task 3 adds it).

- [ ] **Step 5: CLI**

`compendium.py`: remove `FIVETOOLS`; `cmd_build(libs: list[str] | None = None)` builds `libraries.BUILT` in order (2014, then 2024, then the PDF libraries), skipping a library whose clone is absent with a log line, logging `source_warnings` first, building into `OUT + ".tmp"`, swapping each built library in as today; `--libs` restricts which are built. `cmd_sync(libs, dry_run)` uses `libraries.sync_targets(libs)`; `--dry-run` prints per folder the source dir, file count and vault target and sends nothing. `cmd_vault_count(libs)` runs `render.count_script` for each target (default: `sync_targets(None)` plus `WotC 2024` and, count only, `Mystic Arts`, which it never syncs) and prints `<folder> files=<n> marker=<bool>`.

- [ ] **Step 6: Run the new tests and the whole suite**

Run: `ONE` (`tests.test_libraries`), then `$TEST`. Expected: PASS, more than 20 tests run, OK.

- [ ] **Step 7: Scratch build proves 2014 still builds**

Run: `DNDC_ROOT=$V $PY -I $IMP/compendium.py build --libs "WotC" 2>&1 | tail -3 && diff -rq "$V/out/compendium/5e/WotC" "/docker/dnd-compendium/out/compendium/5e/WotC"`
Expected: build log, then no diff output.

- [ ] **Step 8: Commit** `feat: parameterize the importer by library so a second WotC library can be built beside the first`

---

### Task 3: Converter seam and shared 2024 helpers

**Depends on:** Task 2.

**Files:**
- Create: `dndc/ft24/__init__.py`, `dndc/ft24/common.py`, `dndc/ft24/classes.py`, `dndc/ft24/origins.py`, `tests/test_ft24_common.py`
- Modify: `dndc/ft_notes.py` (`rules_module`, `rule_note` pops `_problems`, writes `needs_review`)

**Interfaces:**
- Produces `dndc.ft24` with the same names the 2014 converter module has: `load(root, sources=None)`, `class_doc(data, cls)`, `subclass_doc(data, sub, cls, class_id)`, `race_doc(r)`, `feat_doc(f)`, `background_doc(b)`, `class_feature`, `subclass_feature`. `classes.py` and `origins.py` start as thin re-exports of the `ft_classes` versions; Tasks 5 and 6 replace them, each editing only its own file.
- A converter doc may carry a `_problems: list[str]` key; `rule_note` pops it into `needs_review` frontmatter and the entity's index `issues` (2014 converters never set it, so 2014 output is unchanged).
- `common.FEAT_CATEGORIES: dict[str, str] = {"G": "general", "O": "origin", "FS": "fighting-style", "FS:P": "fighting-style-paladin", "FS:R": "fighting-style-ranger", "EB": "epic-boon", "D": "dragonmark", "DG": "dark-gift"}` (codes and meanings from `js/parser.js` `FEAT_CATEGORY_TO_FULL` in the 2024 clone).
- `common.category_slug(code: str) -> str`: the table value, else the code lower-cased with runs of non-alphanumerics as `-`.
- `common.spell_slugs(spec) -> list[str]`: a list of `"name|src#c"` strings to id slugs (suffixes after `|` and `#` dropped); dict members (`{"choose": ...}`) are skipped.
- `common.additional_spell_ops(blocks: list[dict], used: set[str]) -> tuple[dict[str, list[dict]], list[str]]`: from an entry's `additionalSpells` returns `({level: [grant ops]}, problems)`. Reads `prepared`, `known` and `expanded` (level-keyed, or `"_"` meaning level 1) into `{op: grant, spells: [...]}`; `innate` and choose-objects are not expressible as op strings, so they produce one problem line per entry: `"innate or chosen spells kept in the text only"`.
- `common.title_name(s: str) -> str`: capitalizes each word without the apostrophe bug (`"navigator's tools"` -> `"Navigator's Tools"`).
- `common.outside_copy_problem(e: dict, lib) -> str | None`: for an entity with `_copy` whose base `source` is not in `lib.sources`: `"inherits from <name> (<SRC>), a book outside this library"`, else `None`.

- [ ] **Step 1: Write the failing tests** in `tests/test_ft24_common.py`:
  - `category_slug("FS:R") == "fighting-style-ranger"`, `("EB") == "epic-boon"`, `("XX:Y z") == "xx-y-z"`.
  - `spell_slugs(["thornflare|xphb#c", "Ashen Veil|NEWB", {"choose": "level=1"}]) == ["thornflare", "ashen-veil"]`.
  - `additional_spell_ops([{"prepared": {"3": ["a|x"], "5": ["b|x"]}, "known": {"_": ["c|x#c"]}, "expanded": {"2": ["d|x"]}}], set())` returns levels `"1"` (c), `"2"` (d), `"3"` (a), `"5"` (b) as `grant` ops with unique ids and no problems; a block with `innate` returns exactly one problem string.
  - `title_name("navigator's tools") == "Navigator's Tools"`, `title_name("dice set") == "Dice Set"`.
  - `outside_copy_problem` returns the sentence for a copy of an `OLDB` base with `sources={"NEWB"}`, `None` for an in-library base and for an entity with no `_copy`.
  - Seam: `ft_notes.rules_module(libraries.WOTC_2024)` has all eight names; `rules_module(WOTC_2014)` is `ft_classes`; a rule note built with a converter returning `{"_problems": ["x"]}` has `needs_review: ["x"]` and the key `_problems` is not in the frontmatter.

- [ ] **Step 2: Run to verify failure** (`ONE` with `tests.test_ft24_common`): import errors.
- [ ] **Step 3: Implement** the package and `rules_module`/`rule_note` change as listed.
- [ ] **Step 4: `$TEST`** green; scratch 2014 build (Task 2 Step 7 command) still diffs clean.
- [ ] **Step 5: Commit** `feat: add the 2024 converter seam and its shared helpers so the 2014 converters stay untouched`

---

### Task 4: Edition stamp on every library

**Depends on:** Task 2.

**Files:**
- Modify: `dndc/render.py` (new functions near `write`), `compendium.py` (`cmd_build`: stamp each built tree before the swap)
- Create: `dndc/verify.py` (`stamp_diff` only here), `verify.py`, `tests/test_stamp.py`, `tests/test_stamp_diff.py`

**Interfaces:**
- Produces `render.stamp_edition(text: str, edition: str) -> str` and `render.stamp_tree(root: str, edition: str) -> int` (number of `.md` files changed; non-`.md` files such as the marker are skipped). Stamp = a line `edition: "<year>"` placed immediately before the `tags:` line, and `  - "5e/edition/<year>"` appended after the last tag item (the shape `render.frontmatter` writes: `tags: ` then `  - "..."` lines).
- Produces `dndc.verify.stamp_diff(old_root: str, new_root: str, libs: list[str]) -> list[str]` (problem lines; empty means the stamp is the only change) and the CLI `/usr/bin/python3 -I $IMP/verify.py stamp-diff OLD NEW --libs "WotC,Kobold Press,Necromancer Games"` (OLD and NEW are `.../out` roots; exit 1 on any line). Normalization: remove the two stamp lines inside the first front matter block; a file that had no front matter must equal `frontmatter({"edition": E, "tags": ["5e/edition/E"]}) + "\n\n" + old`; a non-`.md` file must be identical; the file sets must be equal.

- [ ] **Step 1: Write the failing tests**
  `tests/test_stamp.py`:
  - `test_adds_edition_before_tags_and_tag_last`: input `---\ntype: "5e-spell"\nid: "x"\ntags: \n  - "5e/spell"\n  - "5e/source/phb"\n---\n\n# X\n` -> output lines `edition: "2014"` directly above `tags: ` and `  - "5e/edition/2014"` directly under the last tag; everything after the closing `---` byte-identical.
  - `test_body_lines_are_not_front_matter`: a body containing `tags:` and `edition: "9"` lines is unchanged below the closing `---`.
  - `test_no_front_matter_gets_a_minimal_block`: `"# Needs Review\n"` -> `frontmatter({"edition": "2024", "tags": ["5e/edition/2024"]}) + "\n\n# Needs Review\n"`.
  - `test_front_matter_without_tags_gets_a_tags_block`.
  - `test_idempotent`: `stamp_edition(stamp_edition(t, "2014"), "2014") == stamp_edition(t, "2014")`; a note already carrying `edition: "2014"` is returned unchanged.
  - `test_stamp_tree_counts_and_skips_marker`: three notes and a marker file -> returns 3, marker bytes unchanged.
  - `test_cmd_build_stamps_every_library`: with `render.PUBLISHER_LIBS` patched to `{}` and a temp `DNDC_ROOT` holding the Task 2 mini clones for both editions, after `cmd_build()` every `.md` under `WotC` has `edition: "2014"` and `5e/edition/2014`, every one under `WotC 2024` has `"2024"`/`5e/edition/2024`, and the marker files have no stamp.
  `tests/test_stamp_diff.py` (two tiny trees built in a temp dir): stamped-only differences -> `[]`; one changed body character -> a line naming the file; a file only in NEW and a file only in OLD -> a line each; a changed non-md file -> a line.
- [ ] **Step 2: Run to verify failure** (`ONE` for both modules).
- [ ] **Step 3: Implement** `stamp_edition`, `stamp_tree`, the `cmd_build` call (`render.stamp_tree(new, libraries.EDITIONS[lib])` after a library is built into the tmp tree, before the swap), `stamp_diff` and `verify.py` (puts its own dir on `sys.path`, imports only `dndc.verify`; stdlib only here).
- [ ] **Step 4: `$TEST`** green.
- [ ] **Step 5: Early proof on the real 2014 data (scratch, read-only):**
  Run: `DNDC_ROOT=$V $PY -I $IMP/compendium.py build --libs "WotC" && /usr/bin/python3 -I $IMP/verify.py stamp-diff /docker/dnd-compendium/out $V/out --libs "WotC"`
  Expected: `files compared: 7964, stamped: <n>, other differences: 0`, exit 0. (Kobold Press and Necromancer Games are proven in Task 12.)
- [ ] **Step 6: Commit** `feat: stamp every generated note with its edition and tag so the plugin can tell the libraries apart`

---

### Task 5: 2024 classes and subclasses

**Depends on:** Task 3.

**Files:** Modify `dndc/ft24/classes.py`. Test: `tests/test_ft24_classes.py`. Uses `tests/minidata.py` (extend `extra` with an invented class `Ashen Zed`, its subclasses and features; no real names).

**Interfaces:**
- Consumes `common.category_slug`, `common.additional_spell_ops`, `common.title_name`; `ft_classes.op`, `slug`, `plain`, `prof_list`, `skills_choice`, `requires`, `progression_steps`, `class_feature`, `subclass_feature`, `PROGRESSION`.
- Produces `load(root: str, sources: frozenset[str] | None = None) -> dict` (same keys as `ft_classes.load`; `optional` filtered to `sources`), `class_doc(data, cls) -> tuple[str, dict]`, `subclass_doc(data, sub, cls, class_id) -> dict`, `walk_refs(entries: list) -> Iterator[dict]` (every `refClassFeature`/`refSubclassFeature` at any depth through `entries` and `items`), `RESOURCES_2024: dict[str, tuple[str, str | int, str]]`, `ASI_FEATS: list[str]` (the categories an ability score improvement slot accepts: the slugs of the category codes the class's own `featProgression` entry for that feature lists; `["general"]` when it lists none).

Real shapes found in `5etools-2024` v2.41.0 (class files `class/class-*.json`): classes carry `edition: "one"`, `primaryAbility`, `featProgression` (list of `{name, category: [codes], progression: {"<level>": n}}`), `itemMasteries` (bool) and `itemMasteriesProgression` (`{"<level>": <total>}`), `preparedSpellsProgression` (list of 20 totals; replaces `spellsKnownProgression`), `cantripProgression`, `casterProgression` (`"full"`, `"artificer"` for the half casters), `spellcastingAbility`, `preparedSpellsChange`, `additionalSpells`, `classTableGroups` whose spell columns are labelled `{@filter Cantrips|...}` and `{@filter Prepared Spells|...}`, and whose cells are strings (`"2"`, `"—"`), `{type: dice, toRoll}`, `{type: bonus, value}`, `{type: bonusSpeed, value}`. Class features nest `refClassFeature` inside `entries` wrappers 1 and 2 deep (23 times in XPHB and EFA). A subclass may carry `spellcastingAbility` with no `casterProgression` (it is only a DC), and `additionalSpells` blocks use `prepared`, `known`, `innate`, `expanded`.

- [ ] **Step 1: Write the failing tests** (invented data; assertions are the spec's values):
  - `test_scale_values_are_numbers_or_dice`: columns of a plain count (`"2"`), a bonus dict, a bonusSpeed dict, a dice dict (`1d6`, `1d8` at levels) -> every scale value is `int` or matches `^\d+d\d+( \+ \d+d\d+)*$`; none is a string like `"+2"` or `"+10 ft."`; `"—"` cells are skipped.
  - `test_spell_columns_are_not_scales`: labels `{@filter Cantrips|spells|level=0|class=Zed}` and `{@filter Prepared Spells|...}` and `Spell Slots` produce no scale op; a `Weapon Mastery` column does.
  - `test_prepared_progression_becomes_spells_ops`: `preparedSpellsProgression [2,3,3,4,4,4,5]`, `cantripProgression [2,2,2,3,3,3,3]` -> `spells` ops `{count: 2, from: "ashen-zed", cantrips: 2}` at level 1, `{count: 1}` at 2, `{count: 1, cantrips: 1}` at 4, `{count: 1}` at 7; none at levels where both are flat. The count is the increase, like the 2014 `spellsKnownProgression` handling (this is how the spec's "prepared number into the known column" is carried: the class doc has no spellcasting table, so the level-up reads these ops).
  - `test_fixed_spellbook_wins_over_prepared`: a class with `spellsKnownProgressionFixed [6,2,2]` and `preparedSpellsProgression` keeps the 2014 rule (spellbook count from the fixed list) and adds a problem line `"prepared spell counts not written: this class learns spells into a spellbook"`.
  - `test_subclass_spellcasting_needs_a_caster_progression`: `spellcastingAbility: "int"` alone -> no `spellcasting` op and no `spells` ops; with `casterProgression: "1/3"` -> exactly one `{op: spellcasting, abil: "int", progression: "third", list: "wizard"}` at the subclass's first level plus `spells` ops from its `cantripProgression`/`preparedSpellsProgression`, and the problem line `"spell list assumed to be wizard"`.
  - `test_nested_features_are_found`: a class feature whose `entries` hold an `entries` wrapper holding a `refClassFeature` two levels down -> the nested feature's `feature` op is emitted at its own level; a subclass feature whose `options` wrapper holds `refSubclassFeature` entries -> found; `walk_refs` returns both.
  - `test_missing_feature_reference_is_a_problem`: a `classFeatures` ref that resolves to nothing -> `_problems` has `"class feature <name> not found"`; the class doc still returns.
  - `test_additional_spells_all_blocks`: a subclass with `prepared`, `known`, `expanded` and `innate` -> grant ops at the right levels (via `common.additional_spell_ops`) and the innate problem line.
  - `test_asi_takes_the_listed_categories`: a feature named `Ability Score Improvement` whose `featProgression` entry lists `["G"]` -> `{op: asi, feats: ["general"]}`; one listing `["G", "O"]` -> `feats: ["general", "origin"]`; no entry -> `["general"]`.
  - `test_feat_progression_ops`: `featProgression` with `FS` at `"1"`, `EB` at `"19"`, and `["FS", "FS:R"]` at `"2"` -> `{op: feat, categories: ["fighting-style"]}` at level 1, `["epic-boon"]` at 19, `["fighting-style", "fighting-style-ranger"]` at 2; the feat op follows the class's own feature op of the same name at that level.
  - `test_mastery_ops_one_per_increase`: `itemMasteriesProgression {"1": 3, "4": 4, "10": 5}` -> `{op: choose, what: mastery, count: 3}` at 1, `count: 1` at 4 and at 10, none with `from`; `itemMasteries` absent -> none.
  - `test_class_doc_contract`: `subclassLevel` equals the level of the `gainSubclassFeature` ref and a `{op: subclass}` is in that level; `levels` has a key for every level at which the raw class lists a feature; `hitDie`, `saves`, `proficiencies` (armor, weapons, tools named with `title_name`), `skills`, `multiclass`, `gold` as in 2014.
  - `test_resources_read_table_scales`: for each feature name in `RESOURCES_2024` that has a same-named class table column, `max` is that scale's slug with `_` for `-` and `reset` is the table's value; a feature with no table column has no `resource` op; `RESOURCES_2024` names no number that is not read from the table or a formula over `level`, `prof` or an ability.
- [ ] **Step 2: Run to verify failure** (`ONE`, `tests.test_ft24_classes`).
- [ ] **Step 3: Implement** in `ft24/classes.py`, copying nothing from `ft_classes` that has a listed flaw. `RESOURCES_2024` is filled by reading each named feature's text and class table in `/docker/dnd-compendium/5etools-2024` (the limited-use class features that have a class table column): never from memory, and the entry holds only names, scale slugs and reset words, not rules text. Limited-use features with no table column and no entry are listed in one `_problems` line per class (`"limited-use features without a resource op: <names>"`). The `edition: "one"` filter is not used; `lib.sources` decides. Before the commit, check in the clone whether that slot also takes origin feats (the feature's own entry in the class file, and the rulings book `XSAC`): if the data's category list is narrower than the rule, add the missing slug in `ASI_FEATS` handling and say which entry decided it in the commit body, so players are not wrongly refused a feat.
- [ ] **Step 4: `$TEST`** green, then a read-only smoke run against the real clone in a scratch script (not committed): load, convert every XPHB and EFA class and every active subclass, print counts of ops per type and the `_problems` lines. Expected: no exception; 13 classes; 76 subclasses; the problem lines are the intended ones.
- [ ] **Step 5: Commit** `feat: convert 2024 classes and subclasses with numeric scales, mastery, feat and prepared-spell ops, and no invented casters`

---

### Task 6: 2024 species, feats and backgrounds

**Depends on:** Task 3.

**Files:** Modify `dndc/ft24/origins.py`, `dndc/fivetools.py` (additive `expand_versions`), `dndc/ft_notes.py` (`rule_entities`: when `lib.edition == "2024"`, add the expanded variants). Test: `tests/test_ft24_origins.py`.

**Interfaces:**
- Consumes `common.*` (Task 3), `ft_classes.op`, `slug`, `plain`, `language_ops`, `skill_ops`, `ability_text`, `named_feature_ops`, `DESCRIPTIVE`, `F._apply_mod`.
- Produces `race_doc(r) -> dict`, `feat_doc(f) -> dict`, `background_doc(b) -> dict` (each may carry `_problems`), `tool_ops(tools, used)` (the 2024 version honoring `from`), `fivetools.expand_versions(e: dict, problems: list | None = None) -> list[dict]`: the base entity's `_versions` resolved into full entities named `"<Base> (<Variant>)"` (a version named `"Base; Variant"`) by applying each version's `_mod` with `_apply_mod`, plus, for an `_abstract` with `_implementations`, one entity per implementation with every `{{var}}` in the abstract replaced from `_variables` and the implementation's own fields merged. `ft_notes.rule_entities` adds expanded species as `subrace` entities (`_parent` the species; folder `Races/<Species>/Subraces/`; `race: <species id>`) and expanded feats as extra `feat` entities.

Real shapes (2024 clone): backgrounds carry `ability` as a list of `{choose: {weighted: {from: [abils], weights: [2, 1]}}}` (two alternatives with the same `from`: weights `[2, 1]` and `[1, 1, 1]`), `feats` as a list of dicts keyed `"<feat name>|<src>": true` (variants keyed `"magic initiate; cleric|xphb"`) or `{"anyFromCategory": {"category": ["DG"], "count"?: n}}`; one background (a `FRHoF` one) has no `feats`. Species carry no `ability`; they carry `size` (list of codes, absent on 5 copies), `speed` (int, or `{walk: 35, climb: true}`), `darkvision`, `resist`, `skillProficiencies` (`[{"any": 1}]`), `toolProficiencies`, `feats` (`anyFromCategory` with `count`), `additionalSpells` (`known`, `innate`), `_copy` of 2014-era entries (`MPMM`), and `_versions` on 9 (lineages as `name` + `_mod`, or one `_abstract` + `_implementations`). Feats carry `category` (`G O FS FS:P FS:R EB D DG`), `prerequisite` (`level` is an int; also `feature`, `otherSummary`, `campaign`), `repeatable`, `_versions` (Magic Initiate: three).

- [ ] **Step 1: Write the failing tests** (invented data):
  - `test_background_ability_pick`: the two weighted alternatives over `["int","wis","cha"]` -> `doc["abilityPick"] == {"from": ["int","wis","cha"], "patterns": [[2,1],[1,1,1]]}` and no `ability` key; alternatives whose `from` differ -> first `from` kept and a `_problems` line; a plain `ability: [{"str": 1}]` (older form) still gives `ability` and no pick.
  - `test_background_feat_ops`: `feats: [{"quill gift|newb": true}]` -> grant op `{op: feat, feat: "quill-gift"}`; `"quill gift; ember|newb"` -> `feat: "quill-gift-ember"`; `{"anyFromCategory": {"category": ["DG"]}}` -> `{op: feat, categories: ["dark-gift"]}`; `count: 2` -> two ops; no `feats` -> `_problems` has `"grants no feat"`.
  - `test_background_feat_must_exist`: `background_doc(b, feat_ids=set(...))` (optional second argument, the library's feat ids) with a feat id not in the set -> `_problems` has `"feat <id> is not in this library"`.
  - `test_background_proficiencies`: tool names via `title_name` (`"navigator's tools"` -> `"Navigator's Tools"`); a `choose` among tools with `from` of 3 and `count: 1` -> one `choose` op `what: tools` with `from` slugs, and NOT three named tools; skills and languages as in 2014.
  - `test_species_grants`: `size ["S","M"]` -> `size: ["Small","Medium"]`; `speed {"walk": 35, "climb": true}` -> grant `speed: 35` and `speeds: {"climb": "walk"}`; `speed: {"walk": 30, "fly": 50}` -> `speeds: {"fly": 50}`; plain int speed -> `speed`; `darkvision`; armor, tool and weapon proficiencies reach `grant.proficiencies` (`"Light Armor"`, `"Smith's Tools"`); `skillProficiencies [{"any": 1}]` -> `choose` skills count 1; `feats` `anyFromCategory O` -> `{op: feat, categories: ["origin"]}`; `resist ["cold","fire"]` -> `{op: effect, effects: {resist: ["cold","fire"]}}`; `additionalSpells known` -> grant spells; entries with names -> `feature` ops, skipping `DESCRIPTIVE`; no `ability` key at all; no size -> `_problems` `"no size"`.
  - `test_feat_doc_category_and_gate`: `category "O"` -> `category: "origin"`; `prerequisite [{"level": 4}]` -> `minLevel: 4`; `[{"feature": ["Fighting Style"]}]` -> prerequisite text includes the feature name; `ability` and `grants` as in 2014; unknown category `"QQ"` -> slug `"qq"` plus `_problems` `"unmapped feat category QQ"`.
  - `test_expand_versions_feat`: a feat with `_versions [{name: "Gamma; One", source, _mod: {entries: {mode: replaceArr, replace: "Pick", items: {...}}}}]` -> `[{"name": "Gamma (One)", ...}]` with the replaced entry; base unchanged.
  - `test_expand_versions_abstract`: `_abstract {name: "Drake ({{color}})", ...}` with implementations `[{_variables: {color: "Red"}, resist: ["fire"]}, {_variables: {color: "Blue"}, resist: ["cold"]}]` -> two entities `"Drake (Red)"`, `"Drake (Blue)"` with those `resist` values and no `{{` left anywhere.
  - `test_build_makes_subraces_and_feat_variants`: through `ft_notes.build` on the mini clone with a species with two lineages and a feat with one variant: notes at `Races/<Species>/Subraces/<Species> (<Lineage>)`, frontmatter `type: "5e-subrace"`, `race: "<species id>"`; the variant feat note has id `gamma-one`; a background naming `"gamma; one|newb"` has `feat: "gamma-one"` and `needs_review` absent.
  - `test_species_copy_from_outside_is_flagged`: a species `_copy` of an `OLDB` species -> `needs_review` has the `outside_copy_problem` sentence.
- [ ] **Step 2: Run to verify failure** (`ONE`, `tests.test_ft24_origins`).
- [ ] **Step 3: Implement.** `expand_versions` reuses `_apply_mod` (modes already handled there: `replaceArr`, `removeArr`, `appendArr`...) and records an unhandled mode as a problem like `resolve_copies` does; version names `"Base; Variant"` become `"Base (Variant)"`. `rule_entities` calls the library's `common.outside_copy_problem` for species.
- [ ] **Step 4: `$TEST`** green, then a read-only smoke run on the real clone (not committed): every active background gets an `abilityPick` and, except the one with no `feats`, a feat op whose id is a feat the library builds; every active species has a size; print the `_problems`. Expected: no exception.
- [ ] **Step 5: Commit** `feat: convert 2024 species, feats and backgrounds with ability picks, feat grants, categories and lineages`

---

### Task 7: Weapon mastery, mastery notes and 2024 item types

**Depends on:** Task 2.

**Files:** Modify `dndc/fivetools.py` (`load`: add `"masteries": base.get("itemMastery", [])`; `TAG_KIND["itemMastery"] = ("mastery", "XPHB")`), `dndc/render.py` (`FOLDERS["mastery"] = "Masteries"`), `dndc/ft_notes.py` (`item_native`, `ITEM_TYPES` use, new `mastery_note`, `build` kinds list, build log). Test: `tests/test_ft_masteries.py`.

**Interfaces:**
- Produces `ft_notes.mastery_note(m: dict, ctx: dict) -> str` (note path `<lib>/Masteries/<Name>`, `type: "5e-mastery"`, `schema: 1`, `id: slug(name)`, `name`, `source`, `page`, tags `["5e/mastery", "5e/source/<slug>"]`, body = rendered `entries`, then the source line); `item_native` writes `weapon.mastery = slug(<name part of the first mastery entry>)` when the item, or the base item it takes its stats from, has a `mastery` list; `ft_notes.unmapped_item_types(items: list[dict]) -> collections.Counter` (type codes, split on `|`, missing from `F.ITEM_TYPES`), logged by `cmd_build`.
- Real shapes: `items-base.json` has `itemMastery` (8 entries: `name`, `source`, `page`, `entries`) and `baseitem`; a weapon's `mastery` is a list of one `"Name|SRC"` string (48 base items; 2 of them, the staffs, have no `weapon: true`); 71 entries in `items.json` carry `mastery` too; type codes carry a source suffix (`"M|XPHB"`); 2024 adds codes `$G`, `$A` (treasure) and `TB` (3 items, unknown).

- [ ] **Step 1: Write the failing tests** (invented items):
  - `test_base_weapon_note_carries_mastery`: base item `{name: "Zorblat Blade", type: "M|XPHB", dmg1: "1d8", dmgType: "S", weaponCategory: "martial", mastery: ["Quill|XPHB"]}` -> frontmatter `weapon.mastery == "quill"` beside the usual `dmg`, `type`, `ab`.
  - `test_magic_weapon_takes_mastery_from_its_base`: a magic item with `baseItem: "zorblat blade|newb"` and no `mastery` of its own -> `weapon.mastery == "quill"`; with its own `mastery` -> its own.
  - `test_no_mastery_no_field`: an item without any `mastery` -> `"mastery" not in note["weapon"]`; a staff-like item (`type: "M|XPHB"`, `dmg1`, `mastery`, no `weapon` flag) still gets it.
  - `test_mastery_note`: `mastery_note` output parses to `type "5e-mastery"`, `id "quill"`, `name "Quill"`, tags above, path `compendium/5e/WotC 2024/Masteries/Quill`; the build counts include `"mastery": 1`; a 2014 mini clone (no `itemMastery`) writes no `Masteries/` folder and `counts` has no `mastery` key.
  - `test_mastery_tag_links`: text `{@itemMastery Quill|XPHB}` in a 2024 note renders `[[compendium/5e/WotC 2024/Masteries/Quill|Quill]]`; with no mastery notes it renders `Quill`.
  - `test_item_type_codes`: `item_meta` of `{type: "$G|XDMG"}` and `{type: "$A|XDMG"}` has kind `"Treasure"` (add both to `F.ITEM_TYPES`); `unmapped_item_types([{type: "TB|XDMG"}, {type: "TB|XDMG"}, {type: "M|XPHB"}]) == Counter({"TB": 2})`.
  - `test_2014_item_note_unchanged`: the Task 2 mini 2014 item notes are byte-identical to the notes written before the change (golden text kept in the test).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Masteries are placed through the generic `kinds` loop in `build` (so ids, `(SRC)` suffixes and links work) only when `data["masteries"]` is non-empty. Class restrictions on which weapons a class may master are prose in the data, so `choose` ops carry no `from` (Task 5).
- [ ] **Step 4: `$TEST`** green; scratch 2014 diff clean (Task 2 Step 7).
- [ ] **Step 5: Commit** `feat: write weapon mastery on weapons and as notes so the sheet can show what each property does`

---

### Task 8: 2024 creature, spell and condition layouts

**Depends on:** Task 2.

**Files:** Modify `dndc/ft_notes.py` (`cr_of`, `creature_note`, `range_text`, new `initiative_bonus`, `gear_text`, `creature_checks`). Test: `tests/test_ft_layout24.py`.

**Interfaces:**
- Produces `ft_notes.cr_of(m) -> tuple[cr, xp, lair_cr_or_none]` unchanged in shape; new `ft_notes.lair_xp(m) -> int | None` (reads `cr.xpLair`, else the XP of `cr.lair`); `initiative_bonus(m: dict) -> int | None` (`{"proficiency": n}`: ability modifier of dex plus `n` times the proficiency bonus of its CR; an int: itself; else `None`); `gear_text(m: dict, links, me) -> str`; `creature_checks(m: dict) -> list[str]` (problem lines, used only when `lib.edition == "2024"`).
- Real shapes: `cr` is a string or `{cr, xpLair}` (62) or `{cr, xp}` (7), never `lair`; `initiative` is `{"proficiency": 1|2}` on 290 of 746; `gear` is a list of `"item|src"` strings (some `{item, quantity}`); `treasure` lists; spell `range.type` includes `emanation` (26 spells); `status` conditions (3: Bloodied, Concentration, Surprised) sit beside the 15 conditions.

- [ ] **Step 1: Write the failing tests** (invented stat blocks, invented numbers):
  - `test_lair_xp_from_xpLair`: `cr: {"cr": "3", "xpLair": 1250}` -> body contains `or 1,250 XP in its lair`; the 2014 form `{"cr": "5", "lair": "6"}` still prints the lair XP of CR 6.
  - `test_initiative`: dex 14, `cr "1/4"`, `initiative {"proficiency": 1}` -> frontmatter `initiative: 4` and body `**Initiative** +4 (14)`; `{"proficiency": 2}` -> `+6 (16)`; no `initiative` -> no field and no line.
  - `test_gear_line`: `gear: ["wand|newb"]` with a library item `Wand` -> `**Gear** [[compendium/5e/WotC 2024/Items/Wand|Wand]]`; `{"item": "wand|newb", "quantity": 2}` -> `Wand (2)`; an item not in the library -> plain name.
  - `test_emanation_range`: `range {type: "emanation", distance: {type: "feet", amount: 30}}` -> `Self (30-foot emanation)`; the existing cone case unchanged.
  - `test_creature_checks`: `hp {average: 27, formula: "5d8 + 5"}` passes (`floor(5*4.5)+5 = 27`); `average: 30` gives `"hit points 30 do not match 5d8 + 5"`; `cr "1"` with `xp: 100` gives `"XP 100 does not match CR 1"`; a missing ability score gives `"missing ability score"`. Checks are appended to the note's `needs_review` and Needs Review page for `WOTC_2024` and are NOT run for `WOTC_2014` (golden: the 2014 mini note is unchanged).
  - `test_copy_outside_library_flagged`: a creature copying an `OLDB` base gets `common.outside_copy_problem`'s sentence in `needs_review`; `copied_from` stays.
  - `test_status_conditions_written`: the mini clone's `status` entry is written as `type: "5e-condition"`, `condition_kind: "condition"` (characterization of existing behaviour).
  - `test_versions_not_expanded_counted`: creatures with `_versions` are written once, and the build log dict has `creature_versions_skipped: <n>` (2024 only).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Additions are additive branches: a 2014 creature has no `xpLair`, `initiative` or `gear`, so its note does not change; confirm with the golden test and the scratch 2014 diff.
- [ ] **Step 4: `$TEST`** green; scratch 2014 diff clean.
- [ ] **Step 5: Commit** `feat: read the 2024 stat block, range and condition layouts and check creature arithmetic`

---

### Task 9: `replaces` from `reprintedAs`

**Depends on:** Tasks 3, 5, 6, 7, 8 (it edits the same note writers).

**Files:** Create `dndc/ft24/replaces.py`, `tests/test_ft24_replaces.py`. Modify `dndc/ft_notes.py` (`build` computes `e["_replaces"]`; `creature_note`, `spell_note`, `item_note`, `condition_note`, `rule_note`, `mastery_note` add `replaces`), `compendium.py` (`cmd_build` builds the 2014 library first and passes `legacy_ids`).

**Interfaces:**
- Produces `replaces.legacy_index(lib_root: str) -> dict[tuple[str, str, str, str], str]`: scans a built library's notes' frontmatter and maps `(kind, name.lower(), source.lower(), parent)` to the note `id` (`kind` is `type` without `5e-`; `parent` is `class` for a subclass, `race` for a subrace, else `""`).
- `replaces.reprints(data: dict) -> Iterator[tuple[str, str, str, str, list[str]]]`: every entry in the 2024 clone (all sources) with `reprintedAs`, as `(kind, name, source, parent_name, targets)`; targets are the entries' strings `"Name|SRC"`, the dict form `{"uid": "Name|SRC", "tag": ...}`, or the subclass form `"Name|Class|ClassSrc|Src"`; kinds covered: creature, spell, item (items.json and base items), class, subclass, race, feat, background.
- `replaces.assign(entities: list[tuple[str, dict]], reprints, legacy: dict | None, lib) -> dict` sets `e["_replaces"]` (sorted, de-duplicated list of 2014 ids) on each library entity, and returns `{"assigned": n, "outside": n, "absent": n}` (targets outside `lib.sources`; older entries the 2014 library lacks). A single id equal to the note's own id, or an empty list, leaves `_replaces` unset. With `legacy=None` nothing is assigned and the log says `replaces skipped: no 2014 library to read ids from`.
- `cmd_build` order: 2014, then 2024 with `legacy_ids=legacy_index(<tmp or live 2014 tree>)` (the tmp tree when 2014 was built in this run, else the live `OUT` one), then the PDF libraries.

Real shapes: `reprintedAs` exists on 13 classes, 80 subclasses, 389 spells, 787 creatures, 50 feats, 51 species, 13 backgrounds, 695 items and 106 base items in the clone; most targets are `"Name|XPHB"` or `"Name|XMM"`; a few creature targets are `MPMM` or `PaBTSO` (outside the library), items and base items sometimes use the dict form, subclass targets are `"Name|Class|ClassSrc|Src"`.

- [ ] **Step 1: Write the failing tests** (invented entries and a tiny legacy tree):
  - `test_string_dict_and_subclass_forms`: three olds reprinted as `"Quillbeast|NEWB"`, `{"uid": "Thornflare|NEWB", "tag": "spell"}`, `"Ember Path|Ashen Zed|NEWB|NEWB"` -> the three 2024 entities get `_replaces` of the olds' 2014 ids.
  - `test_ids_come_from_the_2014_library`: an old creature whose 2014 note id is `quillbeast-oldb` (a collision suffix) -> `replaces: ["quillbeast-oldb"]`, not `["quillbeast"]`.
  - `test_same_id_is_omitted_and_lists_are_sorted`: old id equals the new id -> no `replaces` key; two olds -> sorted, unique.
  - `test_targets_outside_the_library_are_counted`: a target `"X|OLDB"` -> not assigned, `outside == 1`; an old entry missing from the legacy tree -> `absent == 1`; neither raises.
  - `test_legacy_none_skips`: `assign(..., legacy=None)` assigns nothing and returns zeros.
  - `test_notes_carry_replaces`: through `build` with the mini clone and a legacy index, a 2024 spell and class note have `replaces` as a YAML list of strings; a note with none has no key; a 2014 build (`legacy_ids=None`, `lib.edition == "2014"`) never writes the key.
  - `test_legacy_index_keys`: a two-note tree (a spell, a subclass with `class: "ashen-zed"`) -> keys `("spell","thornflare","oldb","")` and `("subclass", ..., "ashen-zed")`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**; the writers add `**({"replaces": e["_replaces"]} if e.get("_replaces") else {})` to their frontmatter dict; the build log prints the `assign` counts.
- [ ] **Step 4: `$TEST`** green; scratch 2014 diff clean.
- [ ] **Step 5: Commit** `feat: record on each 2024 note which 2014 ids it replaces so the sheet can pair editions without a hand-kept alias list`

---

### Task 10: Verification scripts

**Depends on:** Task 2 (the checks read output trees, not converters; they can be written against invented trees).

**Files:** Modify `dndc/verify.py`, `verify.py`. Test: `tests/test_verify.py` (YAML-dependent cases `skipUnless(yaml)`; run them also with `/usr/bin/python3 -m unittest tests.test_verify`).

**Interfaces:** Each check is `check_<name>(...) -> list[str]` (empty = pass). CLI: `/usr/bin/python3 -I $IMP/verify.py 2024 --out <out root> --data /docker/dnd-compendium/5etools-2024 --sources $IMP/sources-2024.json --legacy <out root>/compendium/5e/WotC --report <json path>` prints one `PASS`/`FAIL <check>: <n>` line per check, writes the JSON report (counts table and failures), exit 1 on any FAIL. Checks:
- `check_counts`: notes per `type` in `WotC 2024` equal counts computed from the raw JSON filtered by the enabled ids (monsters with `hp` or `ac` after `_copy` resolution, spells, non-`_copy` items plus base items plus magic variants by `inherits.source`, conditions + status + diseases, classes, subclasses whose class is in the library, species, expanded lineages, feats plus expanded variants, backgrounds, masteries, book and adventure chapters plus one index each). Prints the table `type expected actual`.
- `check_classes`: every class note has `hitDie`, `saves`, an int `subclassLevel`, a `levels` key for every level where the raw class lists a feature, and every subclass note has ops at one or more levels and a `class` that exists.
- `check_scales_and_formulas`: every `scale` value is `int` or dice text; every `resource.max` and `modify.set` formula uses only `prof`, `level`, `total`, ability names, numbers, `floor min max`, and scale ids defined in the same note.
- `check_backgrounds`: each background note has `abilityPick` with non-empty `patterns` and a `feat` op, unless its `needs_review` names `grants no feat` (those are listed).
- `check_mastery`: each base weapon in the data with `mastery` has `weapon.mastery` equal to the mastery id and that id exists under `Masteries/`.
- `check_links`: every `[[target...]]` and `![[target]]` target (anchors and aliases stripped) starts with `compendium/5e/WotC 2024/` and exists as `<target>.md`.
- `check_replaces`: every element is a non-empty string, unique per note, and exists as an `id` of the same `type` in `--legacy`.
- `check_yaml`: every note's front matter parses with `yaml.safe_load`; `edition == "2024"` (a `str`); `5e/edition/2024` in `tags`; `id` unique per `type`; `type` in the known set.
- `check_arithmetic_flagged`: every creature whose `hp` disagrees with `hp_formula`'s average, or `xp` with the CR table, or with a missing ability score, has a `needs_review` line (the build's own check, Task 8).
- `check_review_page`: every note with `needs_review` appears on `Index/Needs Review.md`; the page's count equals the number of such notes.

- [ ] **Step 1: Write the failing tests**: for each check one passing invented tree and one tree with the fault named above (count off by one, class missing a level key, `1+x` formula with unknown name, background without `abilityPick`, base weapon without mastery, a link to `compendium/5e/WotC/...`, a `replaces` of `""` and of an id not in the legacy tree, a front matter with a tab, an unflagged arithmetic failure, a flagged note missing from the page); the CLI test runs `main([...])` on the pass tree and expects exit 0 and a report file.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (stdlib plus lazy `import yaml` inside `check_yaml`; `verify.py` re-checks that `yaml` imported and prints `use /usr/bin/python3` otherwise).
- [ ] **Step 4: `$TEST`** (venv, YAML cases skipped) and `/usr/bin/python3 -m unittest tests.test_verify` (all cases) green.
- [ ] **Step 5: Commit** `feat: add scripted checks for counts, class tables, links, replaces and YAML so the 2024 output is verified without trusting a model`

---

### Task 11: Docs and plugin manifest

**Depends on:** Tasks 4, 5, 6, 7, 8, 9, 10.

**Files:** Modify `$IMP/README.md` (importer), `$WT/plugins/dnd/skills/dnd-compendium/SKILL.md`, `references/note-format.md`, `references/sources.md`, `references/operations.md`, `templates/background.md`, `templates/feat.md`, `templates/item.md`, `templates/class.md`, `templates/race.md` (same folder), create `templates/mastery.md`, `$WT/plugins/dnd/.claude-plugin/plugin.json` (version `1.1.0` -> `1.2.0`). Test: `tests/test_docs.py`.

- [ ] **Step 1: Write the failing test** `test_docs.py` (paths from `tests/` up three levels to the repo root): the manifest `version == "1.2.0"`; `README.md`, `SKILL.md`, `note-format.md`, `sources.md`, `operations.md` each contain `WotC 2024`; `note-format.md` contains `edition`, `replaces`, `abilityPick`, `5e-mastery`, `5e/edition/2024`, `minLevel`, `what: mastery`; `sources.md` contains `sources-2024.json` and `WoW` and does not contain the old sentence `would go to` + `compendium/5e2024/`; `operations.md` contains `sync --libs`, `vault-count`, `stamp-diff` and `verify.py`; every template front matter parses (`skipUnless(yaml)`); `templates/mastery.md` exists.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Write the docs.** Content to carry, no rules text: the two libraries and what builds each; `sources-2024.json` (the cutoff, how to add a later title as one entry, `enabled: false` for unreleased); both editions' stamp and tag; the new fields exactly as in Global Constraints; the 2024 build's known gaps (creature variants not expanded, limited-use features without a table column, class mastery restrictions are prose, innate spells in text only, third-caster spell list assumed); commands (`build --libs`, `sync --libs`, `sync --dry-run`, `vault-count`, `verify.py stamp-diff`, `verify.py 2024`, the scratch-root recipe from Task 1); the order of release (the plugin's edition-aware build before the 2024 folder is synced); hard rule 5 gets the verify commands; the skill table gets a `WotC 2024/` row and the "Mystic Arts is unstamped" note. Templates: `background.md` shows `abilityPick` and a `feat` op; `feat.md` shows `category` and `minLevel`; `item.md` shows `weapon.mastery`; `class.md` shows `asi.feats`, a `feat` op and `choose what: mastery`; `race.md` notes a species has no ability scores and may grant a `feat`; `mastery.md` is a new homebrew mastery property template. All use invented names.
- [ ] **Step 4: `$TEST`** green (and the YAML case with `/usr/bin/python3`).
- [ ] **Step 5: Commit** `docs: describe the 2024 library, the book list, the new fields and the commands, and bump the dnd plugin to 1.2.0`

---

### Task 12: Production build and verification

**Depends on:** Tasks 4, 5, 6, 7, 8, 9, 10 (Task 11 not required).

**Files:** none edited. Replaces `/docker/dnd-compendium/out` (after backup) and refreshes `/docker/dnd-compendium/code`.

- [ ] **Step 1: Branch is clean and green**

Run: `git -C $WT status --short && git -C $WT log --oneline -1 && $TEST 2>&1 | tail -3`
Expected: no status lines; `OK`. Record the commit.

- [ ] **Step 2: Back up, never overwrite**

```
test ! -e /docker/dnd-compendium/out.bak-$D && cp -a /docker/dnd-compendium/out /docker/dnd-compendium/out.bak-$D
test ! -e /docker/dnd-compendium/code.bak-$D && cp -a /docker/dnd-compendium/code /docker/dnd-compendium/code.bak-$D
for p in out code; do diff -rq /docker/dnd-compendium/$p /docker/dnd-compendium/$p.bak-$D | grep -v pycache; done
```
Expected: no `diff` lines. If either `.bak-$D` exists already, stop and report (a previous attempt); do not overwrite.

- [ ] **Step 3: Refresh the live code from the branch**

Run: `rsync -a --delete --exclude __pycache__ $IMP/ /docker/dnd-compendium/code/ && diff -r -x __pycache__ $IMP /docker/dnd-compendium/code`
Expected: no diff output.

- [ ] **Step 4: Build all libraries**

Run: `$PY -I /docker/dnd-compendium/code/compendium.py build > /docker/dnd-compendium/build-$D.log 2>&1; tail -20 /docker/dnd-compendium/build-$D.log`
Expected: `build compendium/5e/WotC`, `build compendium/5e/WotC 2024` with per-type counts and the `replaces` counts, then the two PDF libraries; no traceback. `Mystic Arts` is not in the log.

- [ ] **Step 5: Prove the stamp is the only change**

Run: `/usr/bin/python3 -I $IMP/verify.py stamp-diff /docker/dnd-compendium/out.bak-$D /docker/dnd-compendium/out --libs "WotC,Kobold Press,Necromancer Games"`
Expected: `other differences: 0`, exit 0. Then `diff -r "/docker/dnd-compendium/out.bak-$D/compendium/5e/Mystic Arts" "/docker/dnd-compendium/out/compendium/5e/Mystic Arts"` prints nothing, and `ls /docker/dnd-compendium/out/compendium` shows only `5e`.

- [ ] **Step 6: Scripted verification of the 2024 library**

Run: `mkdir -p /docker/dnd-compendium/verify-$D && /usr/bin/python3 -I $IMP/verify.py 2024 --out /docker/dnd-compendium/out --data /docker/dnd-compendium/5etools-2024 --sources $IMP/sources-2024.json --legacy /docker/dnd-compendium/out/compendium/5e/WotC --report /docker/dnd-compendium/verify-$D/report-2024.json`
Expected: every line `PASS`. A `FAIL` is a converter bug: fix it in its task's file with a test first, commit, and repeat from Step 3 (do not repeat Step 2). A data oddity that cannot be converted is not waved through: it must appear on `WotC 2024/Index/Needs Review.md` and in the final counts.

- [ ] **Step 7: The build is deterministic**

Run: `DNDC_ROOT=$V $PY -I $IMP/compendium.py build --libs "WotC 2024" && diff -rq "$V/out/compendium/5e/WotC 2024" "/docker/dnd-compendium/out/compendium/5e/WotC 2024"`
Expected: no output.

- [ ] **Step 8: Record the counts** (`find` per type folder per library, plus `Needs Review` line counts for both WotC libraries) in `/docker/dnd-compendium/verify-$D/counts.txt` and report them: notes per type, notes total, Needs Review lines, `replaces` assigned/outside/absent, `unmapped item types`, `creature_versions_skipped`. No commit (nothing in git changed).

---

### Task 13: Local-model second look (draft only)

**Depends on:** Task 12.

**Files:** none in git. Private scratch under `/docker/dnd-compendium/verify-$D/sample/`.

- [ ] **Step 1: Draw the sample deterministically:** `find` 40 creature notes (stratified: 10 each CR band 0-1, 2-5, 6-12, 13+ plus 5 with legendary actions), 10 spells (ritual, concentration, upcast dice), 5 classes' notes, 5 species: `shuf -n <k> --random-source=<(yes seed)` over sorted lists; copy to the sample folder.
- [ ] **Step 2: Submit to the local tier** (`llm-job` skill, tier `local`, so private text stays on the LAN) one job per 10 notes with the prompt: recompute hit points from the formula, XP from CR, modifiers from scores, and spell level and dice progression from the stated text; answer as a JSON list `{note, line, claim, why}` of anything that disagrees; no rewriting.
- [ ] **Step 3: Check every claim against the data** with a script or by reading the source JSON for that entry; keep a table `claim | verdict | where checked`. The model's answer is a draft: a confirmed fault becomes a failing test and a converter or check fix (back to the owning task, then Task 12 Steps 3-8); an unconfirmed claim is dropped. Nothing from the model's output is quoted in docs, commits or the report except the counts `submitted / confirmed / rejected`.
- [ ] **Step 4: Report** the three counts. No commit unless a fix was made.

---

### Task 14: GATED sync (a): re-stamped existing libraries

**GATED: run only when the orchestrator says so.** Depends on Tasks 4 and 12. Precondition the orchestrator confirms: the plugin plan's test that today's build reads a stamped note exactly as an unstamped one has passed.

**Files:** none. Writes the vault folders `WotC`, `Kobold Press`, `Necromancer Games` on azure-dragon only.

- [ ] **Step 1: Before-counts and the plan, nothing sent**

```
export DNDC_VAULT_HOST=azure-dragon,azure-dragon-vpn; C=/docker/dnd-compendium/code/compendium.py
$PY -I $C vault-count > /docker/dnd-compendium/verify-$D/vault-before.txt; cat /docker/dnd-compendium/verify-$D/vault-before.txt
$PY -I $C sync --dry-run
```
Expected: counts for the three folders (and `WotC 2024` absent, `Mystic Arts` listed but not in the sync plan); the dry run lists exactly the three folders with their local file counts.

- [ ] **Step 2: Sync** (plain `sync` is the three existing folders; it cannot select `WotC 2024`, `Mystic Arts`, `5e2024` or `campaigns`)

Run: `$PY -I $C sync 2>&1 | tee /docker/dnd-compendium/sync-restamp-$D.log`
Expected: three lines `synced <n> notes to <host>:C:/obsidian/dnd/compendium/5e/<folder> (swapped <n> files)`.

- [ ] **Step 3: Read the result back:** `$PY -I $C vault-count`. Expected: for each of the three, `files=<n>` equals `find "/docker/dnd-compendium/out/compendium/5e/<folder>" -type f | wc -l` and `marker=True`; `Mystic Arts` count equals its `vault-before.txt` value; no `WotC 2024` line with files.
- [ ] **Step 4: If the link drops** (scp or ssh error, timeout, count mismatch): the remote swap is all-or-nothing and a failed swap restores the old folder, so re-run Step 2, then Step 3. Leftovers `C:\obsidian\.dnd-library.tar` and `.dnd-library-staging` are outside the vault and overwritten by the next run. After three failed attempts stop and report the log; never delete or edit anything in the vault by hand, never run `graph`.
- [ ] **Step 5: Report** the before and after counts and the log path. No commit.

---

### Task 15: GATED sync (b): the new `WotC 2024` folder

**GATED: run only when the orchestrator says so.** Depends on Task 12 (and Task 13 if it ran). Precondition the orchestrator confirms: the plugin's edition-aware build is deployed (the 2024 folder must not reach a plugin that does not know editions).

**Files:** none. Writes only `compendium/5e/WotC 2024/` in the vault.

- [ ] **Step 1: Plan, nothing sent**

Run: `export DNDC_VAULT_HOST=azure-dragon,azure-dragon-vpn; $PY -I $C sync --libs "WotC 2024" --dry-run`
Expected: one folder, `compendium/5e/WotC 2024`, local file count equal to `find ... -type f | wc -l` of `/docker/dnd-compendium/out/compendium/5e/WotC 2024`.

- [ ] **Step 2: Sync:** `$PY -I $C sync --libs "WotC 2024" 2>&1 | tee /docker/dnd-compendium/sync-2024-$D.log`. Expected: `synced <n> notes to <host>:C:/obsidian/dnd/compendium/5e/WotC 2024 (swapped <n> files)`.
- [ ] **Step 3: Read the result back:** `$PY -I $C vault-count`. Expected: `WotC 2024 files=<n> marker=True` with `<n>` equal to the local count; the other three folders equal their Task 14 after-counts; `Mystic Arts` unchanged.
- [ ] **Step 4: If the link drops:** same rule as Task 14 Step 4 (re-run Steps 2-3, at most three attempts, then stop and report; no hand edits in the vault).
- [ ] **Step 5: Report** the counts and log path. No commit.

---

## Self-review (run on this plan)

1. **Spec coverage.** Goal 6: second library, own marker/Index/Needs Review (T2); explicit book list with `WoW`/`ICC` off (T2); stamp on every library with diff proof (T4, T12); converters for the 2024 shapes in goal 4's importer half (T5 classes, masteries, feats, prepared counts; T6 ability picks, background feats, categories, species; T7 mastery, item types; T8 creature, spell, condition layouts); links stay inside (T2 test, T10 check); counts and Needs Review (T2, T8, T10, T12); local model as draft (T13); sync adds the folder, two gated tasks (T14, T15). Contract: `replaces` (T9), `abilityPick` (T6), `feat` op (T5, T6), `asi.feats` (T5), feat `category`/`minLevel` (T6), `choose what: mastery` (T5), weapon `mastery` (T7), `5e-mastery` (T7), `5e-race` kept (T6). Docs and manifest (T11). Backups before the build (T12 Step 2).
2. **Step scan.** Bodies appear nowhere; each code step names file, signature and the values it must produce. Task 5 Step 3 and Task 6 Step 3 leave rule-dependent values (`RESOURCES_2024`, version mods) to be read from the clone, which is the spec's rule for 2024 values.
3. **Type consistency.** `Library` fields, `sync_targets`, `stamp_tree`, `rules_module`, `_problems`, `outside_copy_problem`, `category_slug`, `additional_spell_ops`, `expand_versions`, `legacy_index`, `assign` and `check_*` are defined once and referenced by the same names; `$V` is defined in Task 1 and reused.
4. **Review Focus.** Five lines above, each with a test in the named task (T2 `test_source_warnings`, T4 `test_body_lines_are_not_front_matter`/`test_idempotent`, T5/T6 missing-piece tests, T6 `test_background_feat_must_exist`, T9 `test_targets_outside_the_library_are_counted`).
5. **Proportion.** About 540 lines against a 200-line spec; code blocks are shell conventions only.
