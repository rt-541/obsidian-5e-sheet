"""The library root note is the generated-library marker that travels with Obsidian Sync (dot-files do not)."""
import os
import tempfile
import unittest

from dndc import libraries, render
from tests import minidata
from tests.test_libraries import build, read

TYPE_LINE = 'type: "5e-library"'


def fm_lines(text):
    lines = text.split("\n")
    assert lines[0] == "---"
    return lines[1:lines.index("---", 1)]


def body_of(text):
    return text.split("\n---\n", 1)[1]


class RootNote(unittest.TestCase):
    def check(self, text, edition):
        fm = fm_lines(text)
        self.assertEqual(fm[:3], [TYPE_LINE, "schema: 1", "generated: true"])
        stamped = render.stamp_edition(text, edition)
        sfm = fm_lines(stamped)
        self.assertEqual(sfm[:3], fm[:3])
        self.assertIn(f'edition: "{edition}"', sfm)
        self.assertIn(f'  - "5e/edition/{edition}"', sfm)
        self.assertEqual(body_of(stamped), body_of(text))
        self.assertEqual(render.stamp_edition(stamped, edition), stamped)
        return stamped

    def test_wotc_route_build(self):
        for lib, year in ((libraries.WOTC_2014, "2014"), (libraries.WOTC_2024, "2024")):
            tmp, out, _, lib = build(lib)
            self.addCleanup(tmp.cleanup)
            text = read(out, f"{lib.folder}/5e Library")
            self.assertTrue(text.startswith("---\n"))
            self.assertIn("# 5e Library", body_of(text))
            self.check(text, year)
            self.assertTrue(os.path.exists(os.path.join(out, *lib.folder.split("/"), render.MARKER)))

    def test_pdf_route_indexes(self):
        ent = {"kind": "item", "note": "Kobold Press/Items/Odd Shield", "name": "Odd Shield", "source": "XYZ",
               "page": None, "book": "Invented", "issues": [], "item_type": "armor", "rarity": "rare",
               "attunement": False}
        with tempfile.TemporaryDirectory() as d:
            render.write_indexes(d, [ent], (), "Kobold Press")
            text = open(os.path.join(d, "Kobold Press", "5e Library.md")).read()
        self.assertIn("## Books", body_of(text))
        self.check(text, "2014")


class Guard(unittest.TestCase):
    def script(self):
        return render.SWAP_PS.format(tarf=r"C:\o\.t.tar", stage=r"C:\o\.s", live=r"C:\o\dnd\compendium\5e\Lib",
                                     leaf="Lib", marker=render.MARKER, expected=7)

    def test_both_conditions_and_refusal(self):
        s = self.script()
        self.assertIn(render.MARKER, s)
        self.assertIn("5e Library.md", s)
        self.assertIn("5e-library", s)
        self.assertIn("refusing to replace", s)
        self.assertEqual(s.count("{"), s.count("}"))
        self.assertEqual(s.count("("), s.count(")"))
        self.assertNotIn("{marker}", s)

    def test_library_note_test_reads_only_the_first_lines(self):
        s = self.script()
        self.assertRegex(s, r"Get-Content[^\n]*-TotalCount|Select-Object -First")
        self.assertNotIn("ReadAllText", s)

    def test_count_script_prints_library_note(self):
        s = render.count_script(r"C:\obsidian\dnd\compendium\5e\WotC")
        self.assertIn("library_note=", s)
        self.assertIn("5e Library.md", s)
        self.assertIn("files=0 marker=False absent=True", s)
        self.assertEqual(s.count("{"), s.count("}"))


if __name__ == "__main__":
    unittest.main()
