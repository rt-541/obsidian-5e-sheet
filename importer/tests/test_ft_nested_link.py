"""A link resolved inside a formatting tag must survive in the 2024 library only."""
import unittest

from dndc import fivetools as F


def links():
    l = F.Links()
    l.add("condition", "Blight", "XYZ", "Lib/Conditions/Blight")
    return l


class NestedLink(unittest.TestCase):
    S = "He has {@i {@condition Blight|XYZ}} now."

    def tearDown(self):
        F.set_nested_links(False)

    def test_2014_keeps_the_old_output(self):
        F.set_nested_links(False)
        out = F.render_text(self.S, links())
        self.assertNotIn("]]", out)  # the legacy cut, kept byte for byte

    def test_2024_keeps_the_link_whole(self):
        F.set_nested_links(True)
        self.assertEqual(F.render_text(self.S, links()), "He has *[[Lib/Conditions/Blight|Blight]]* now.")

    def test_2024_plain_nesting_unchanged(self):
        F.set_nested_links(True)
        self.assertEqual(F.render_text("{@b {@i word}}", links()), "***word***")
