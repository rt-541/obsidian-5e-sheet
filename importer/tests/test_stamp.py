import os
import tempfile
import unittest
from unittest import mock

from dndc import render
from tests import minidata

NOTE = '---\ntype: "5e-spell"\nid: "x"\ntags: \n  - "5e/spell"\n  - "5e/source/phb"\n---\n\n# X\n'


class StampEdition(unittest.TestCase):
    def test_adds_edition_before_tags_and_tag_last(self):
        out = render.stamp_edition(NOTE, "2014")
        self.assertEqual(out, '---\ntype: "5e-spell"\nid: "x"\nedition: "2014"\ntags: \n  - "5e/spell"\n'
                              '  - "5e/source/phb"\n  - "5e/edition/2014"\n---\n\n# X\n')
        self.assertEqual(out.split("\n---\n", 1)[1], NOTE.split("\n---\n", 1)[1])

    def test_body_lines_are_not_front_matter(self):
        body = '\n# X\n\ntags:\n  - "a"\nedition: "9"\n'
        out = render.stamp_edition(NOTE.split("\n---\n", 1)[0] + "\n---\n" + body, "2024")
        self.assertTrue(out.endswith("\n---\n" + body))
        self.assertEqual(out.count('edition: "2024"'), 1)

    def test_no_front_matter_gets_a_minimal_block(self):
        self.assertEqual(render.stamp_edition("# Needs Review\n", "2024"),
                         render.frontmatter({"edition": "2024", "tags": ["5e/edition/2024"]}) + "\n\n# Needs Review\n")

    def test_front_matter_without_tags_gets_a_tags_block(self):
        out = render.stamp_edition('---\ntype: "5e-index"\n---\n\n# I\n', "2014")
        self.assertEqual(out, '---\ntype: "5e-index"\nedition: "2014"\ntags: \n  - "5e/edition/2014"\n---\n\n# I\n')

    def test_idempotent(self):
        once = render.stamp_edition(NOTE, "2014")
        self.assertEqual(render.stamp_edition(once, "2014"), once)
        bare = render.stamp_edition("# A\n", "2014")
        self.assertEqual(render.stamp_edition(bare, "2014"), bare)

    def test_stamp_tree_counts_and_skips_marker(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "Index"))
            for rel in ("a.md", "b.md", "Index/c.md"):
                with open(os.path.join(d, rel), "w") as f:
                    f.write(NOTE)
            marker = os.path.join(d, ".dnd-compendium-generated")
            with open(marker, "w") as f:
                f.write("marker\n")
            self.assertEqual(render.stamp_tree(d, "2014"), 3)
            self.assertEqual(open(marker).read(), "marker\n")
            self.assertEqual(render.stamp_tree(d, "2014"), 0)


class BuildStamps(unittest.TestCase):
    def test_cmd_build_stamps_every_library(self):
        import compendium
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for clone in ("5etools-2014", "5etools-2024"):
            minidata.write_clone(os.path.join(tmp.name, clone))
        with mock.patch.object(compendium, "ROOT", tmp.name), \
                mock.patch.object(compendium, "OUT", os.path.join(tmp.name, "out")), \
                mock.patch.object(render, "PUBLISHER_LIBS", {}):
            compendium.cmd_build(["WotC", "WotC 2024"])
        base = os.path.join(tmp.name, "out", "compendium", "5e")
        for lib, year in (("WotC", "2014"), ("WotC 2024", "2024")):
            seen = 0
            for d, _, files in os.walk(os.path.join(base, lib)):
                for f in files:
                    text = open(os.path.join(d, f)).read()
                    if f.endswith(".md"):
                        seen += 1
                        fm = text.split("\n---\n", 1)[0]
                        self.assertIn(f'\nedition: "{year}"\n', fm + "\n", f)
                        self.assertIn(f'  - "5e/edition/{year}"', fm, f)
                    else:
                        self.assertNotIn("edition", text)
            self.assertGreater(seen, 5, lib)


if __name__ == "__main__":
    unittest.main()
