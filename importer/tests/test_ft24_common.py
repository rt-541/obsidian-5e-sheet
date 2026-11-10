"""The 2024 converter seam and its shared helpers, on invented values."""
import dataclasses
import unittest

from dndc import ft24, ft_classes, ft_notes
from dndc.ft24 import common
from dndc.libraries import WOTC_2014, WOTC_2024

NAMES = ["load", "class_doc", "subclass_doc", "race_doc", "feat_doc", "background_doc", "class_feature",
         "subclass_feature"]


class Helpers(unittest.TestCase):
    def test_category_slug(self):
        self.assertEqual(common.category_slug("FS:R"), "fighting-style-ranger")
        self.assertEqual(common.category_slug("EB"), "epic-boon")
        self.assertEqual(common.category_slug("XX:Y z"), "xx-y-z")

    def test_category_table(self):
        self.assertEqual(common.FEAT_CATEGORIES, {
            "G": "general", "O": "origin", "FS": "fighting-style", "FS:P": "fighting-style-paladin",
            "FS:R": "fighting-style-ranger", "EB": "epic-boon", "D": "dragonmark", "DG": "dark-gift"})

    def test_spell_slugs(self):
        self.assertEqual(common.spell_slugs(["thornflare|xphb#c", "Ashen Veil|NEWB", {"choose": "level=1"}]),
                         ["thornflare", "ashen-veil"])

    def test_additional_spell_ops(self):
        used = set()
        levels, problems = common.additional_spell_ops(
            [{"prepared": {"3": ["a|x"], "5": ["b|x"]}, "known": {"_": ["c|x#c"]}, "expanded": {"2": ["d|x"]}}], used)
        self.assertEqual(problems, [])
        self.assertEqual(list(levels), ["1", "2", "3", "5"])
        got = {k: v[0]["spells"] for k, v in levels.items()}
        self.assertEqual(got, {"1": ["c"], "2": ["d"], "3": ["a"], "5": ["b"]})
        ops = [o for v in levels.values() for o in v]
        self.assertTrue(all(o["op"] == "grant" for o in ops))
        self.assertEqual(len({o["id"] for o in ops}), 4)
        self.assertEqual(used, {o["id"] for o in ops})

    def test_additional_spell_problem(self):
        levels, problems = common.additional_spell_ops(
            [{"innate": {"_": {"daily": {"1": ["a|x"]}}}, "prepared": {"3": ["b|x"]}}], set())
        self.assertEqual(problems, ["innate or chosen spells kept in the text only"])
        self.assertEqual(levels["3"][0]["spells"], ["b"])
        used = set()
        l2, p2 = common.additional_spell_ops([{"known": {"_": [{"choose": "level=1"}]}}], used)
        self.assertEqual(l2, {})
        self.assertEqual(used, set())
        self.assertEqual(p2, ["innate or chosen spells kept in the text only"])

    def test_other_forms_have_their_own_problem(self):
        for block in ({"prepared": {"s1": ["a|x"]}}, {"known": {"_": {"daily": {"1": ["a|x"]}}}},
                      {"innate": {"_": ["a|x"]}, "prepared": {"s1": ["a|x"]}}):
            _, problems = common.additional_spell_ops([block], set())
            self.assertEqual(len(problems), 1)
        self.assertEqual(common.additional_spell_ops([{"prepared": {"s1": ["a|x"]}}], set())[1],
                         ["spells by spell level or uses per day kept in the text only"])

    def test_alternative_blocks_grant_only_shared(self):
        used = set()
        levels, problems = common.additional_spell_ops([
            {"name": "One", "prepared": {"3": ["a|x", "b|x"], "5": ["c|x"]}},
            {"name": "Two", "prepared": {"3": ["b|x", "d|x"], "5": ["e|x"]}}], used)
        self.assertEqual({k: v[0]["spells"] for k, v in levels.items()}, {"3": ["b"]})
        self.assertEqual(problems, ["alternative spell lists kept in the text only"])
        levels, problems = common.additional_spell_ops([
            {"prepared": {"3": ["a|x"]}}, {"prepared": {"3": ["b|x"]}}], set())
        self.assertEqual(levels, {})
        self.assertEqual(problems, ["alternative spell lists kept in the text only"])

    def test_problem_lines_not_repeated(self):
        _, problems = common.additional_spell_ops(
            [{"innate": {"_": ["a|x"]}}, {"innate": {"_": ["b|x"]}}], set())
        self.assertEqual(problems, ["innate or chosen spells kept in the text only",
                                    "alternative spell lists kept in the text only"])

    def test_title_name(self):
        self.assertEqual(common.title_name("navigator's tools"), "Navigator's Tools")
        self.assertEqual(common.title_name("dice set"), "Dice Set")

    def test_outside_copy_problem(self):
        lib = dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB"}))
        self.assertEqual(common.outside_copy_problem({"_copy": {"name": "Old Thing", "source": "OLDB"}}, lib),
                         "inherits from Old Thing (OLDB), a book outside this library")
        self.assertIsNone(common.outside_copy_problem({"_copy": {"name": "X", "source": "NEWB"}}, lib))
        self.assertIsNone(common.outside_copy_problem({"name": "X"}, lib))


class Seam(unittest.TestCase):
    def test_modules(self):
        mod = ft_notes.rules_module(WOTC_2024)
        self.assertIs(mod, ft24)
        for n in NAMES:
            self.assertTrue(callable(getattr(mod, n)), n)
        self.assertIs(ft_notes.rules_module(WOTC_2014), ft_classes)

    def test_problems_become_needs_review(self):
        class Conv:
            @staticmethod
            def feat_doc(f):
                return {"category": "general", "_problems": ["x"]}

        e = {"name": "Thing", "source": "NEWB", "_id": "thing", "_display": "Thing", "_note": "n/Thing",
             "entries": ["plain words"]}
        ctx = {"links": ft_notes.F.Links(), "titles": {}, "book_notes": {}, "data": {}, "bases": {}}
        text = ft_notes.rule_note("feat", e, {}, ctx, Conv)
        head = text.split("---")[1]
        self.assertIn("needs_review:", head)
        self.assertIn("x", head)
        self.assertNotIn("_problems", head)
        self.assertEqual(e["_problems"], ["x"])


class IndexPage(unittest.TestCase):
    def test_rule_problem_reaches_needs_review(self):
        import os
        import tempfile
        from unittest import mock
        from tests import minidata
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        clone, out = os.path.join(tmp.name, "clone"), os.path.join(tmp.name, "out")
        minidata.write_clone(clone)
        real = ft24.feat_doc
        with mock.patch.object(ft24, "feat_doc", lambda f: dict(real(f), _problems=["invented problem"])):
            ft_notes.build(clone, out, [], dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB"})))
        page = open(os.path.join(out, "compendium/5e/WotC 2024/Index/Needs Review.md")).read()
        self.assertIn("invented problem", page)
        self.assertIn("Feats/", page)


if __name__ == "__main__":
    unittest.main()
