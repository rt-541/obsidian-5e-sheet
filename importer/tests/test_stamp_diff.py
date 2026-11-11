import os
import subprocess
import sys
import tempfile
import unittest

from dndc import verify

HERE = os.path.dirname(os.path.abspath(__file__))
ENTRY = os.path.join(HERE, "..", "verify.py")
OLD = '---\ntype: "5e-spell"\ntags: \n  - "5e/spell"\n---\n\n# X\n'
NEW = '---\ntype: "5e-spell"\nedition: "2014"\ntags: \n  - "5e/spell"\n  - "5e/edition/2014"\n---\n\n# X\n'
BARE = "# Needs Review\n"
BARE_NEW = '---\nedition: "2014"\ntags: \n  - "5e/edition/2014"\n---\n\n# Needs Review\n'


def put(root, rel, text):
    path = os.path.join(root, "compendium", "5e", "WotC", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


class StampDiff(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.old, self.new = os.path.join(tmp.name, "old"), os.path.join(tmp.name, "new")
        put(self.old, "Spells/x.md", OLD)
        put(self.new, "Spells/x.md", NEW)
        put(self.old, "Index/Needs Review.md", BARE)
        put(self.new, "Index/Needs Review.md", BARE_NEW)
        put(self.old, ".dnd-compendium-generated", "m\n")
        put(self.new, ".dnd-compendium-generated", "m\n")

    def test_stamped_only_differences(self):
        self.assertEqual(verify.stamp_diff(self.old, self.new, ["WotC"]), [])

    def test_counts(self):
        self.assertEqual(verify.stamp_compare(self.old, self.new, ["WotC"])[:2], (3, 2))

    def test_changed_body_character(self):
        put(self.new, "Spells/x.md", NEW.replace("# X", "# Y"))
        lines = verify.stamp_diff(self.old, self.new, ["WotC"])
        self.assertEqual(len(lines), 1)
        self.assertIn("Spells/x.md", lines[0])

    def test_file_only_in_one_side(self):
        put(self.new, "Spells/extra.md", NEW)
        put(self.old, "Spells/gone.md", OLD)
        lines = verify.stamp_diff(self.old, self.new, ["WotC"])
        self.assertEqual(len(lines), 2)
        self.assertTrue(any("extra.md" in l for l in lines) and any("gone.md" in l for l in lines))

    def test_changed_non_md_file(self):
        put(self.new, ".dnd-compendium-generated", "other\n")
        lines = verify.stamp_diff(self.old, self.new, ["WotC"])
        self.assertEqual(len(lines), 1)

    def test_wrong_edition_or_unstamped_note(self):
        put(self.new, "Spells/x.md", NEW.replace("2014", "2024"))
        self.assertEqual(len(verify.stamp_diff(self.old, self.new, ["WotC"])), 1)
        put(self.new, "Spells/x.md", OLD)
        self.assertEqual(len(verify.stamp_diff(self.old, self.new, ["WotC"])), 1)

    def test_cli(self):
        r = subprocess.run([sys.executable, "-I", ENTRY, "stamp-diff", self.old, self.new, "--libs", "WotC"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("files compared: 3, stamped: 2, other differences: 0", r.stdout)
        put(self.new, "Spells/x.md", "changed")
        r = subprocess.run([sys.executable, "-I", ENTRY, "stamp-diff", self.old, self.new, "--libs", "WotC"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)


if __name__ == "__main__":
    unittest.main()
