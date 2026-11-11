"""Library values, the 2024 source list and per-library builds, on an invented mini clone."""
import dataclasses
import os
import re
import tempfile
import unittest
from unittest import mock

from dndc import ft_notes, libraries, render
from dndc.libraries import WOTC_2014, WOTC_2024
from tests import minidata

L24 = "compendium/5e/WotC 2024"


def build(lib, sources=None, extra=None):
    tmp = tempfile.TemporaryDirectory()
    clone, out = os.path.join(tmp.name, "clone"), os.path.join(tmp.name, "out")
    minidata.write_clone(clone, extra=extra)
    if sources is not None:
        lib = dataclasses.replace(lib, sources=frozenset(sources))
    counts, seed = ft_notes.build(clone, out, [], lib)
    return tmp, out, counts, lib


def files_under(out, folder):
    root = os.path.join(out, *folder.split("/"))
    return sorted(os.path.relpath(os.path.join(d, f), root) for d, _, fs in os.walk(root) for f in fs)


def read(out, note):
    with open(os.path.join(out, note + ".md")) as f:
        return f.read()


class Sources(unittest.TestCase):
    def test_sources_file_shape(self):
        s = libraries.load_sources()
        self.assertEqual(len(s), 42)
        self.assertEqual(len({e["id"] for e in s}), 42)
        self.assertTrue(all(e["published"] >= "2024-09-17" for e in s))
        self.assertTrue(all(e["kind"] in ("book", "adventure") for e in s))
        self.assertEqual(sum(e["kind"] == "book" for e in s), 18)
        self.assertEqual(sum(e["kind"] == "adventure" for e in s), 24)
        self.assertEqual(sum(e["enabled"] for e in s), 40)
        self.assertEqual({e["id"] for e in s if not e["enabled"]}, {"WoW", "ICC"})
        self.assertTrue(all(set(e) == {"id", "kind", "published", "enabled"} for e in s))

    def test_library_values(self):
        self.assertEqual(WOTC_2014.folder, "compendium/5e/WotC")
        self.assertEqual(WOTC_2014.data_dir, "5etools-2014")
        self.assertIsNone(WOTC_2014.sources)
        self.assertEqual(WOTC_2014.edition, "2014")
        self.assertEqual(WOTC_2014.folder, render.LIB)
        self.assertEqual(WOTC_2024.folder, L24)
        self.assertEqual(WOTC_2024.data_dir, "5etools-2024")
        self.assertEqual(WOTC_2024.edition, "2024")
        enabled = frozenset(e["id"] for e in libraries.load_sources() if e["enabled"])
        self.assertEqual(WOTC_2024.sources, enabled)
        self.assertEqual(set(WOTC_2024.priority), enabled)
        self.assertNotIn("WoW", WOTC_2024.priority)
        self.assertNotIn("ICC", WOTC_2024.priority)
        entries = libraries.load_sources()
        by = lambda kind: [e["id"] for e in sorted((e for e in entries if e["enabled"] and e["kind"] == kind),
                                                   key=lambda e: (e["published"], e["id"]))]
        self.assertEqual(list(WOTC_2024.priority), by("book") + by("adventure"))
        self.assertEqual(len(by("book")), 17)
        self.assertEqual(len(by("adventure")), 23)
        self.assertLess(WOTC_2024.priority.index("XPHB"), WOTC_2024.priority.index("XMM"))

    def test_source_warnings(self):
        books = [{"id": "NEWB", "published": "2024-10-01"}, {"id": "QQQ", "published": "2025-01-01"},
                 {"id": "OLDB", "published": "2014-05-01"}]
        lib = dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB", "ZZZ"}))
        self.assertEqual(libraries.source_warnings(lib, books, []), [
            "listed in sources-2024.json but not in the clone: ZZZ",
            "in the clone, published on or after 2024-09-17, not in sources-2024.json: QQQ"])
        clean = dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB"}))
        self.assertEqual(libraries.source_warnings(clean, books[:1] + books[2:], []), [])
        self.assertEqual(libraries.source_warnings(WOTC_2014, books, []), [])

    def test_disabled_listed_ids_are_not_warned_about(self):
        books = [{"id": "WoW", "published": "2026-11-17"}, {"id": "NEWB", "published": "2024-10-01"}]
        lib = dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB"}))
        self.assertEqual(libraries.source_warnings(lib, books, [], disabled={"WoW"}), [])
        self.assertEqual(libraries.source_warnings(lib, books, [], disabled=set()),
                         ["in the clone, published on or after 2024-09-17, not in sources-2024.json: WoW"])

    def test_sync_targets(self):
        self.assertEqual(libraries.sync_targets(None), ["compendium/5e/WotC", "compendium/5e/Kobold Press",
                                                        "compendium/5e/Necromancer Games"])
        self.assertEqual(libraries.sync_targets(["WotC 2024"]), [L24])
        for bad in ("Mystic Arts", "5e2024", "campaigns", "Homebrew", "../x", "WotC/.."):
            with self.assertRaises(SystemExit, msg=bad):
                libraries.sync_targets([bad])

    def test_editions_cover_the_four_built_folders(self):
        self.assertEqual(libraries.EDITIONS, {"compendium/5e/WotC": "2014", "compendium/5e/Kobold Press": "2014",
                                              "compendium/5e/Necromancer Games": "2014", L24: "2024"})

    def test_count_script(self):
        s = render.count_script(r"C:\obsidian\dnd\compendium\5e\WotC 2024")
        self.assertIn(r"-LiteralPath 'C:\obsidian\dnd\compendium\5e\WotC 2024'", s)
        self.assertIn("-Recurse -File -Force", s)
        self.assertIn(".dnd-compendium-generated", s)
        self.assertIn("files=", s)
        self.assertIn("Test-Path -LiteralPath 'C:\\obsidian\\dnd\\compendium\\5e\\WotC 2024'", s)
        self.assertIn("files=0 marker=False absent=True", s)


class PublisherOnlyBuild(unittest.TestCase):
    def test_publisher_only_build_still_gets_the_wotc_seed_and_swaps_nothing_else(self):
        import compendium
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        minidata.write_clone(os.path.join(tmp.name, "5etools-2014"))
        seen = {}

        def fake_build(books, load, out_root, lib, seed):
            seen["seed"] = list(seed)
            os.makedirs(os.path.join(out_root, *lib.split("/")))
            return []

        with mock.patch.object(compendium, "ROOT", tmp.name), \
                mock.patch.object(compendium, "OUT", os.path.join(tmp.name, "out")), \
                mock.patch.object(compendium, "load_books", lambda *a: [{"publisher": "Kobold Press", "title": "T"}]), \
                mock.patch.object(render, "build", fake_build):
            compendium.cmd_build(["Kobold Press"])
        self.assertTrue(seen["seed"])
        self.assertIn("creature", {k for k, _, _ in seen["seed"]})
        self.assertEqual(os.listdir(os.path.join(tmp.name, "out", "compendium", "5e")), ["Kobold Press"])


class Builds(unittest.TestCase):
    def test_build_2014_layout_unchanged(self):
        tmp, out, counts, _ = build(WOTC_2014)
        self.addCleanup(tmp.cleanup)
        root = os.path.join(out, "compendium", "5e", "WotC")
        self.assertEqual(sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))),
                         sorted(["Creatures", "Spells", "Items", "Conditions", "Classes", "Races", "Feats",
                                 "Backgrounds", "Books", "Index"]))
        with open(os.path.join(root, ".dnd-compendium-generated")) as f:
            marker = f.read()
        self.assertEqual(marker,
                         "Generated by scripts/dnd-compendium (5e.tools data). Replaced on every sync; "
                         "keep your own notes outside this folder.\n")
        self.assertIn("OCR", read(out, "compendium/5e/WotC/Index/Needs Review"))
        self.assertEqual(counts["spell"], 3)  # nothing is filtered out in 2014

    def test_build_2024_filters_by_source(self):
        tmp, out, counts, _ = build(WOTC_2024, {"NEWB", "NEWA"})
        self.addCleanup(tmp.cleanup)
        names = " ".join(files_under(out, L24))
        for yes in ("Quillbeast", "Spinebeast", "Thornflare", "Ashen Lantern", "Hushed", "Zedcaller", "Ashen Zed",
                    "Thornfolk", "Quill Knack", "Quill Hermit", "New Invented Tale", "Quill Dagger", "Glimmer Weapon",
                    "Zedrot"):
            self.assertIn(yes, names)
        for no in ("Dustquill", "Gravelquill", "Emberthorn", "Oldflare", "Cinder Lantern", "Old Lantern", "Dimmed",
                   "Voidzed", "Oldzed", "Stray Zed", "Ashfolk", "Oldfolk", "Ember Knack", "Old Knack",
                   "Ember Hermit", "Old Hermit", "Gravel Dagger", "Fade Weapon", "Oldrot", "Old Trick"):
            self.assertNotIn(no, names)
        for key, n in {"creature": 2, "spell": 1, "item": 3, "condition": 2, "class": 1, "subclass": 1,
                       "race": 1, "feat": 1, "background": 1}.items():
            self.assertEqual(counts[key], n, key)
        self.assertEqual(counts["chapters"], 2)
        # the copy of an older creature keeps the base's stat line
        note = read(out, f"{L24}/Creatures/Spinebeast")
        self.assertIn("ac: 13", note)
        self.assertIn("hp: 22", note)
        self.assertIn('copied_from: "Gravelquill (OLDB)"', note)

    def test_links_stay_inside_the_library(self):
        tmp, out, _, _ = build(WOTC_2024, {"NEWB", "NEWA"})
        self.addCleanup(tmp.cleanup)
        text = read(out, f"{L24}/Creatures/Quillbeast")
        self.assertIn(f"[[{L24}/Spells/Thornflare|Thornflare]]", text)
        self.assertNotIn("[[compendium/5e/WotC/", text)
        self.assertIn("or Oldflare.", text)
        self.assertNotIn("Oldflare]]", text)
        root = os.path.join(out, *L24.split("/"))
        for d, _, fs in os.walk(root):
            for f in fs:
                if f.endswith(".md"):
                    with open(os.path.join(d, f)) as fh:
                        targets = re.findall(r"\[\[([^\]|]+)", fh.read())
                    for target in targets:
                        self.assertTrue(target.startswith(L24 + "/"), f"{f}: {target}")

    def test_marker_and_indexes_per_library(self):
        tmp, out, _, lib = build(WOTC_2024, {"NEWB", "NEWA"})
        self.addCleanup(tmp.cleanup)
        root = os.path.join(out, *L24.split("/"))
        with open(os.path.join(root, ".dnd-compendium-generated")) as f:
            self.assertEqual(f.read(), lib.marker_text)
        for page in ("Index/Needs Review", "Index/Creatures by CR", "5e Library"):
            self.assertTrue(os.path.exists(os.path.join(root, page + ".md")), page)
        review = read(out, f"{L24}/Index/Needs Review")
        self.assertIn(WOTC_2024.review_intro, review)
        self.assertNotIn("OCR", review)

    def test_a_listed_source_the_clone_lacks_still_builds_the_rest(self):
        tmp, out, counts, _ = build(WOTC_2024, {"NEWB", "ZZZ"})
        self.addCleanup(tmp.cleanup)
        self.assertEqual(counts["spell"], 1)


if __name__ == "__main__":
    unittest.main()
