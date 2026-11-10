# Install guide

One guide for a new machine: the plugin, the importer that builds the private game library, and the
books. Everything the importer makes stays private. This repo holds no book text, and neither
should your vault's git history.

## What is in this repo

- The plugin: the Obsidian character sheet (`src/`, built into `main.js`, `styles.css` and
  `manifest.json`).
- `importer/`: the Python tool that turns the 5e.tools data and your own PDFs into the generated
  library notes in your vault. It holds no book text.
- The guides: this file, [IMPORTING.md](IMPORTING.md) (build, check and sync the library) and
  [USING.md](USING.md) (for players).

## Install the plugin

Pick one.

1. Into a vault on this machine. From a checkout of this repo (needs Node and `npm install` once):

   ```
   scripts/install-plugin.sh "<vault-folder>"
   ```

   It builds, copies the three files into `<vault-folder>/.obsidian/plugins/dnd-5e-sheet/` and prints
   the SHA-256 of the copied `main.js`. Add `--no-build` to copy an existing build. It stops with a
   message if the folder has no `.obsidian` folder, so open the vault once in Obsidian first.

2. Onto another machine over SSH (a Windows machine with OpenSSH):

   ```
   scripts/deploy-vault.sh arthu@rocinante.rt-541.io
   ```

   Give one or more host names and it deploys to each. With no host names it uses the owner's
   default hosts. Set `DND_VAULT` for the vault path on the host (default `C:/obsidian/dnd`).

3. Without building, from the latest release:

   ```
   gh release download --repo rt-541/obsidian-5e-sheet --pattern main.js --pattern styles.css --pattern manifest.json --dir "<vault>/.obsidian/plugins/dnd-5e-sheet" --clobber
   ```

In every case, then open Obsidian, go to Settings, Community plugins, turn off restricted mode if it
is on, and enable "5e Character Sheet" in the list.

## Set it up in Obsidian

Open the plugin's settings. Set the compendium folder (the folder that holds the library and your
homebrew; the default is `Compendium/`, and the importer writes under `compendium/5e/`, so point it at
the folder that contains `5e`). Choose the default rules edition for new characters, 2014 or 2024.
Each character can still pick its own edition on the builder's first page.

## Install the importer

You need Python 3 and git.

```
python3 -m venv "$DNDC_ROOT/venv"
"$DNDC_ROOT/venv/bin/pip" install -r importer/requirements.txt
```

`DNDC_ROOT` is the data folder for the clones, work files and output. Choose a folder outside this
repo and outside any git checkout, and keep it private:

```
export DNDC_ROOT=/path/to/dnd-compendium
mkdir -p "$DNDC_ROOT" && chmod 700 "$DNDC_ROOT"
```

Set `DNDC_ROOT` in the shell for every importer command (the default is `/docker/dnd-compendium`).
Run the importer as `"$DNDC_ROOT/venv/bin/python" -I importer/compendium.py ...`.

## Pull the source books

The library is only for books you own, for your own use. The WotC books come from two public data
clones:

```
git clone --depth 1 https://github.com/5etools-mirror-3/5etools-2014-src.git "$DNDC_ROOT/5etools-2014"
git clone --depth 1 --branch v2.41.0 https://github.com/5etools-mirror-3/5etools-src.git "$DNDC_ROOT/5etools-2024"
```

Books from other publishers come from your own PDFs (with a text layer). Put each PDF where
`importer/books.json` says its `file` is, outside git, and add a line there for a new one. The
steps are in [IMPORTING.md](IMPORTING.md), which also covers building, checking and syncing the
library into the vault (the 2014 books become the `WotC` folder, the 2024 books `WotC 2024`).

## More than one device

Obsidian Sync carries the notes, and the library's root note (`5e Library.md`), between devices. It
does not carry dot-files, so the `.dnd-compendium-generated` marker never arrives. The root note is
what lets every device recognise the library as generated. The plugin itself is not synced: install
it on each device (one of the three ways above, or Obsidian's own plugin folder on a phone or tablet
through Sync's community plugin setting).

## The Claude Code skill (optional)

The `dnd` plugin from the owner's marketplace helps Claude add books and fix stat blocks:

```
claude plugin marketplace add git@github.com:rt-541/homelab-config.git --sparse .claude-plugin plugins
claude plugin install dnd@rt-541
```
