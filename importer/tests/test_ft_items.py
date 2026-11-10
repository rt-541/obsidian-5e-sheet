"""Generic magic items (5e.tools magicvariants): invented 5e.tools-shaped dicts, no real entries."""
import unittest

from dndc import fivetools as F
from dndc.ft_notes import check_variant_words, fill_template,item_native, item_note, variant_of, variants_as_items


def ctx():
    return {"links": F.Links(), "bases": {}, "titles": {}, "book_notes": {}}


class VariantOf(unittest.TestCase):
    def test_armor_any(self):
        self.assertEqual(variant_of({"requires": [{"armor": True}], "inherits": {"bonusAc": "+2"}}),
                         ({"base": "armor", "bonusAc": 2}, []))

    def test_weights_and_groups(self):
        self.assertEqual(variant_of({"requires": [{"type": "HA"}, {"type": "MA"}], "inherits": {}})[0],
                         {"base": "armor", "only": ["heavy", "medium"]})
        self.assertEqual(variant_of({"requires": [{"sword": True}], "excludes": {"net": True}, "inherits": {"bonusWeapon": "+1"}})[0],
                         {"base": "weapon", "only": ["sword"], "except": ["net"], "bonusWeapon": 1})
        self.assertEqual(variant_of({"requires": [{"type": "M", "dmgType": "S"}], "inherits": {}})[0],
                         {"base": "weapon", "only": ["melee+slashing"]})

    def test_any_weapon_with_exclusion_has_no_only(self):
        self.assertEqual(variant_of({"requires": [{"weapon": True}], "excludes": {"net": True}, "inherits": {}})[0],
                         {"base": "weapon", "except": ["net"]})

    def test_multi_key_excludes_is_one_except_entry_per_key(self):
        self.assertEqual(variant_of({"requires": [{"weapon": True}], "excludes": {"net": True, "axe": True}, "inherits": {}})[0],
                         {"base": "weapon", "except": ["net", "axe"]})

    def test_name_becomes_a_slug(self):
        self.assertEqual(variant_of({"requires": [{"weapon": True, "name": "Thorn Sword"}], "inherits": {}})[0],
                         {"base": "weapon", "only": ["thorn-sword"]})

    def test_unknown_requirement_is_a_problem_not_a_guess(self):
        v, problems = variant_of({"requires": [{"type": "S"}], "inherits": {}})
        self.assertIsNone(v)
        self.assertTrue(problems)

    def test_mixed_armor_and_weapon_is_a_problem(self):
        v, problems = variant_of({"requires": [{"armor": True}, {"weapon": True}], "inherits": {}})
        self.assertIsNone(v)
        self.assertTrue(problems)


class Notes(unittest.TestCase):
    def variant_item(self, **v):
        v = dict({"name": "Plus One Armor", "requires": [{"armor": True}],
                  "inherits": {"source": "XYZ", "rarity": "rare", "bonusAc": "+1",
                               "entries": ["Plain invented line."]}}, **v)
        probs = []
        it = variants_as_items([v], probs)[0]
        it.update(_note="Lib/Items/Plus One Armor", _id="plus-one-armor")
        return it, probs

    def test_variant_kept_on_item(self):
        it, probs = self.variant_item()
        self.assertEqual(it["_variant"], {"base": "armor", "bonusAc": 1})
        self.assertEqual(it["_inherits"]["bonusAc"], "+1")
        self.assertEqual(probs, [])

    def test_note_has_variant_and_no_duplicate_modifier(self):
        it, _ = self.variant_item()
        text = item_note(it, ctx())
        self.assertIn("variant:", text)
        self.assertIn('base: "armor"', text)
        self.assertIn("bonusAc: 1", text)
        self.assertNotIn("modifiers", text)

    def test_any_mace_has_only_word(self):
        it, _ = self.variant_item(name="Mace Of Odd", requires=[{"mace": True}], inherits={"source": "XYZ"})
        text = item_note(it, ctx())
        self.assertIn("only:", text)
        self.assertIn('"mace"', text)

    def test_base_weapons_carry_groups(self):
        mace = {"name": "Club Mace", "type": "M", "dmg1": "1d6", "dmgType": "B", "mace": True, "weapon": True}
        self.assertEqual(item_native(mace, {})["weapon"]["groups"], ["mace"])
        pole = {"name": "Pole", "type": "M", "dmg1": "1d10", "dmgType": "S", "polearm": True, "sword": True}
        self.assertEqual(item_native(pole, {})["weapon"]["groups"], ["sword", "polearm"])
        plain = {"name": "Stick", "type": "M", "dmg1": "1d4", "dmgType": "B"}
        self.assertNotIn("groups", item_native(plain, {})["weapon"])

    def test_word_matching_no_base_is_reported(self):
        bases = {("club mace", "xyz"): {"name": "Club Mace", "mace": True, "dmg1": "1d6"}}
        self.assertEqual(check_variant_words({"base": "weapon", "only": ["mace", "melee+bludgeoning"]}, bases), [])
        self.assertEqual(len(check_variant_words({"base": "weapon", "only": ["trident"], "except": ["net"]}, bases)), 2)


class FillTemplate(unittest.TestCase):
    def test_fills_inherited_values(self):
        out = fill_template(["Wearers gain {=bonusAc} to AC; this {=baseName/l} hums."], {"bonusAc": "+1"}, "armor")
        self.assertEqual(out, ["Wearers gain +1 to AC; this armor hums."])

    def test_unknown_key_falls_back_to_the_noun(self):
        self.assertEqual(fill_template(["A {=mystery} glow."], {}, "weapon"), ["A weapon glow."])

    def test_note_text_is_filled(self):
        v = {"name": "Plus One Armor", "requires": [{"armor": True}],
             "inherits": {"source": "XYZ", "rarity": "rare", "bonusAc": "+1",
                          "entries": ["Wearers gain {=bonusAc} to AC; this {=baseName/l} hums."]}}
        it = variants_as_items([v], [])[0]
        it.update(_note="Lib/Items/Plus One Armor", _id="plus-one-armor")
        text = item_note(it, ctx())
        self.assertIn("Wearers gain +1 to AC; this armor hums.", text)
        self.assertNotIn("{=", text)

    def test_base_dependent_keys_never_print_nonsense(self):
        out = fill_template(["It adds 1d4 {=dmgType} sparks."], {"dmgType": "F"}, "weapon")
        self.assertEqual(out, ["It adds 1d4 of the weapon's damage type sparks."])
        self.assertNotIn("weapon sparks", out[0])

    def test_base_name_article(self):
        self.assertEqual(fill_template(["Hold {=baseName/a}."], {}, "item"), ["Hold an item."])
        self.assertEqual(fill_template(["Hold {=baseName/a}."], {}, "weapon"), ["Hold a weapon."])

    def test_unknown_modifier_keeps_case(self):
        self.assertEqual(fill_template(["The {=baseName/zz} rings."], {}, "Weapon"), ["The Weapon rings."])
        self.assertEqual(fill_template(["The {=baseName} rings."], {}, "Weapon"), ["The Weapon rings."])


class ProblemsReachReview(unittest.TestCase):
    def test_variant_problems_are_kept_on_the_item(self):
        probs = []
        bad = {"name": "Odd Bolts", "requires": [{"type": "A"}], "inherits": {"source": "XYZ"}}
        it = variants_as_items([bad], probs)[0]
        self.assertTrue(it["_problems"])
        self.assertEqual(len(probs), len(it["_problems"]))

    def test_needs_review_lists_variant_problems_without_a_page(self):
        import tempfile, os
        from dndc import render
        ent = {"kind": "item", "note": "Lib/Items/Odd Shield", "name": "Odd Shield", "source": "XYZ", "page": None,
               "book": "Invented", "issues": ["variant: requires type='S'"], "item_type": "armor",
               "rarity": "rare", "attunement": False}
        with tempfile.TemporaryDirectory() as d:
            render.write_indexes(d, [ent], (), "Lib")
            text = open(os.path.join(d, "Lib", "Index", "Needs Review.md")).read()
        self.assertIn("Odd Shield", text)
        self.assertIn("requires type='S'", text)


if __name__ == "__main__":
    unittest.main()


class ReviewLines2024(unittest.TestCase):
    def item(self):
        it = {"name": "Odd Blade", "source": "XYZ", "type": "M", "_note": "Lib/Items/Odd Blade", "_id": "odd-blade",
              "_problems": ["variant: no base item matches the word 'trident'"]}
        return it

    def test_2024_item_note_lists_its_problems(self):
        c = ctx()
        c["edition"] = "2024"
        text = item_note(self.item(), c)
        self.assertIn("needs_review:", text)
        self.assertIn("no base item matches the word 'trident'", text)

    def test_2014_item_note_stays_page_only(self):
        c = ctx()
        c["edition"] = "2014"
        self.assertNotIn("needs_review", item_note(self.item(), c))
        self.assertNotIn("needs_review", item_note(self.item(), ctx()))

    def test_2024_item_without_problems_has_no_key(self):
        c = ctx()
        c["edition"] = "2024"
        it = self.item()
        it["_problems"] = []
        self.assertNotIn("needs_review", item_note(it, c))
