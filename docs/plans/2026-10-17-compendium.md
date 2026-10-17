# One compendium with folder sources, library adapter and browser: design and plan

> For agentic workers: this file is the shared context for everyone on this build. Read all of it before touching code or the vault. Test first, commit per task, push to `feat/compendium` (branched from `feat/leveling`). Never push to main.

## Who owns what (coordination)

- **This plugin** (rt-541/obsidian-5e-sheet) and the folders `compendium/5e/<Source>/` for every source EXCEPT `WotC`.
- **`compendium/5e/WotC/`** is owned by another Claude session, "5e book download search", via `scripts/dnd-compendium` (homelab-config branch `worktree-dnd-compendium`, data in `/docker/dnd-compendium`). Its sync replaces that whole folder (guarded by `.dnd-compendium-generated` inside it). **Never write, move or delete anything under `C:/obsidian/dnd/compendium/5e/WotC`.** Read it only. That session was asked to keep `type: 5e-*`, `id`, `name`, `schema: 1` and its tag scheme stable and to message "obsidian 5e character sheet plugin" before changing them.
- **Never modify `C:/obsidian/dnd/campaigns/**`** (the user's own campaign notes).
- Vault host alias: `azure-dragon-vpn` (ssh/scp, Windows OpenSSH, cmd.exe login shell; create folders with `powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '<p>'"`, never pipe inside the -Command string).

## Approved design (user, 2026-10-17)

1. **One compendium root: `compendium/5e`.** The plugin setting `compendiumFolder` becomes `compendium/5e` (update `data.json` on the vault and the default in code).
2. **The first folder under the root is the source** (the folder determines the source; there is no `source:` frontmatter override). Sources today: `WotC` (generated library), `Critical Role`, `Roll20`, `Homebrew`; any new folder is a new source. Notes directly in the root are `Homebrew`. Bundled SRD content shows as source **`WotC (SRD)`**.
3. **Classes:** `<Source>/Classes/<Class>/<Class>.md` is the base class; `<Source>/Classes/<Class>/Subclasses/*.md` are its subclasses; a subclass's parent class comes from its folder (`class:` frontmatter optional; folder wins when both exist). A subclass for another source's class lives under its own source with the parent class folder name, e.g. `Homebrew/Classes/Tactician/Subclasses/Arbiter.md` attaches to the Roll20 Tactician (match by class id, which is the slug of the class folder name or the class note's `id`). Other types: `<Source>/Races/`, `Backgrounds/`, `Feats/`, `Spells/`, `Items/`, `Creatures/`, `Conditions/` (type still comes from `type: 5e-...`; type folders are for organisation only).
4. **Folders are primary; tags on top.** Every note the plugin writes gets `tags: [5e/<type>, source/<source-slug>]` (plus `5e/class/<class>` on subclasses). The loader ignores tags for logic.
5. **Compendium browser**: a new Obsidian view (ribbon icon `book-open`, command "Open 5e compendium"): source tabs (All, WotC (SRD), WotC, Critical Role, Roll20, Homebrew, any other source folder), type tabs (Classes, Subclasses, Races, Backgrounds, Feats, Spells, Items, Creatures, Conditions), search, list with source badge (and book sub-label for WotC library notes, e.g. `WotC · PHB`), detail card (same detail cards as the sheet, lazy body), "Open note" for vault entries, "Add to character" (items, spells, companions) targeting the most recently active sheet. Desktop pane / mobile full screen; same parity rules as the sheet.
6. **Source badges** in every picker (level-up wizard, builder, add spell, add item, add companion, hover cards).
7. **Per-campaign source switches:** campaign note `sources: { "<Source>": true|false }` (absent = on). Off sources are hidden from wizard/builder/add-* choices; still visible in the browser (dimmed with "off in this campaign").
8. **Library adapter** for notes under `WotC/` (generator schema, snake_case): map to plugin data:
   - spells: `casting_time` -> castingTime; `components: "V, S, M (...)"` -> components [V,S,M] + material; save from tag `5e/save/<abil>`; damage type from `5e/damage/<type>`; damage dice parsed from the body ("takes 8d6 fire damage" -> bySlot base; "increases by 1d6 for each slot level above 3rd" -> extend bySlot) when unambiguous, else omitted; attack from text "ranged spell attack"/"melee spell attack"; heal similarly; `higherLevel` from the "At Higher Levels." paragraph; rules = body without the heading/meta lines.
   - items: `item_type` -> kind (Weapon->weapon, Armor->armor, Shield, Wondrous Item->wondrous, Potion->consumable, Ring/Rod/Staff/Wand->wondrous, else gear); `attunement`; `rarity`; weapon/armor stats only when present in the note (most library items are text-only: keep effects empty, rules = body).
   - creatures: map stat block fields the generator provides (inspect several `WotC/Creatures/*.md` first; e.g. ac, hp, speed, abilities, cr_value) into CreatureData; anything missing -> the creature is "reference only" (browser and hover only, not addable as a companion), never a compendium problem.
   - conditions: name + rules text (effects empty unless an SRD condition of the same id exists, in which case the SRD effects apply and the library text is shown).
   - Library entries that fail mapping are marked `referenceOnly` and listed in a separate "library notes not usable on the sheet" count, NOT as compendium problems (problems are for user-authored notes).
   - Same id in several sources: precedence for the sheet = user sources (Homebrew > Critical Role/Roll20/others alphabetical) > WotC library > WotC (SRD); the browser shows all of them with badges.
9. **Indexing performance (3,477+ notes, mobile):** index from `metadataCache` frontmatter only; read note bodies lazily (on card open / rules display) with a small LRU cache; never `cachedRead` every file at startup. Initial index must not block the UI (yield every ~200 notes).

## Tasks

- **Stage A (core):** source-from-folder + `WotC (SRD)` for bundled content; class/subclass folder resolution; library adapter with tests built from real samples (copy 3-5 notes per type from the vault into `tests/fixtures/library/` — these are the user's private data: keep fixtures minimal and paraphrase the rules text into a single dummy sentence, keep frontmatter/tags verbatim); campaign `sources` switches; precedence; lazy body + metadata-only index; settings default `compendium/5e`.
- **Stage B (UI):** compendium browser view + command + ribbon; source badges everywhere; pickers respect campaign source switches; parity tests.
- **Stage C (vault migration):** move the plugin's vault content from `C:/obsidian/dnd/5e-sheet/Compendium/` into the new layout (Blood Hunter + 4 Orders -> `compendium/5e/Critical Role/Classes/Blood Hunter/...`; Tactician + Grandmaster/Mentalist/Scholar/War Mind -> `compendium/5e/Roll20/Classes/Tactician/...`; Chromatic Dragonborn + Lightning Ancestry, Savage Attacker, Stormweave Voidblade, Emberheart Warhammer, Frostbitten -> `compendium/5e/Homebrew/<Type>/`), add tags, write the four new homebrew Tactician subclasses (Arbiter, Field Marshal, Spymaster, Wyrm Strategist) as op-format subclass notes in `compendium/5e/Homebrew/Classes/Tactician/Subclasses/` from the approved design at `C:/obsidian/dnd/5e-sheet/Homebrew/Tactician Strategic Focuses (design).md` (local copy: `/home/aschneider/.claude/jobs/e6629327/tmp/sources/Tactician Strategic Focuses (design).md`), set `data.json` compendiumFolder to `compendium/5e`, verify Azur (`5e-sheet/Characters/Azur.md`) still derives the same numbers (AC 19, Int save +7, Investigation +10, 7 plan dice, Analysis DC 15) and that ids referenced by Azur and the examples still resolve. Validate every note locally with the plugin's parser before upload; then remove the old `5e-sheet/Compendium` folder only after the new layout validates and is uploaded. Leave `5e-sheet/Characters`, `5e-sheet/Examples`, `5e-sheet/Homebrew` in place.

## Review focus

1. Nothing under `compendium/5e/WotC` or `campaigns/` is written.
2. Startup with 3,477 library notes stays responsive (measure index time in a test with 3,500 synthetic metadata entries; no body reads).
3. Library notes never appear as compendium problems; user notes still do.
4. Moving a note between source folders updates its source live; renaming a class folder keeps its subclasses attached.
5. Desktop/mobile parity for the browser; no note text rendered as HTML.
