"""Three converter gaps found in review: special-text armor class and hit points, generic items that are not armor,
and a specific armor that names a base item. Invented data only."""
import re
import unittest

from dndc import fivetools as F
from dndc import ft_notes
from dndc.ft_notes import item_meta, item_native, item_note, variants_as_items
from dndc.libraries import WOTC_2014, WOTC_2024
from tests import minidata
from tests.test_ft_layout24 import L14, L24, note, frontmatter_of

BASE_LINE = "armor class or hit points: the number is a base, and the note text says what is added"


def creature_fm(name="Rimequill", **kw):
    m = minidata.creature(name, "NEWB", **kw)
    text, _ = note(WOTC_2024, L24, name, [m])
    return frontmatter_of(text), text


class SpecialArmorClass(unittest.TestCase):
    def test_leading_number_is_ac_and_text_stays_in_note(self):
        fm, text = creature_fm(ac=[{"special": "12 plus the level of the invented spell"}])
        self.assertRegex(fm, r"\nac: 12\n")
        self.assertIn('ac_note: "plus the level of the invented spell"', fm)
        self.assertIn("**Armor Class** 12 plus the level of the invented spell", text)

    def test_special_without_a_number_leaves_ac_empty(self):
        fm, _ = creature_fm(ac=[{"special": "equal to the caster's level"}])
        self.assertNotRegex(fm, r"\nac: ")

    def test_ordinary_entries_are_still_carried(self):
        fm, _ = creature_fm(ac=[{"ac": 15, "from": ["invented plates"]}])
        self.assertRegex(fm, r"\nac: 15\n")
        fm, _ = creature_fm(ac=[16])
        self.assertRegex(fm, r"\nac: 16\n")

    def test_a_later_ordinary_entry_is_carried_when_the_first_is_text_without_a_number(self):
        fm, _ = creature_fm(ac=[{"special": "as the caster"}, {"ac": 14}])
        self.assertRegex(fm, r"\nac: 14\n")


class SpecialHitPoints(unittest.TestCase):
    def hp(self, text):
        fm, body = creature_fm(hp={"special": text})
        m = re.search(r"\nhp: (\d+)\n", fm)
        f = re.search(r'\nhp_formula: "(.*)"\n', fm)
        return (int(m[1]) if m else None), (f[1] if f else None), body

    def test_base_before_a_plus_sign(self):
        hp, formula, body = self.hp("30 + 5 for each invented level above 2")
        self.assertEqual((hp, formula), (30, "30 + 5 for each invented level above 2"))
        self.assertIn("**Hit Points** 30 + 5 for each invented level above 2", body)

    def test_base_before_the_word_plus(self):
        self.assertEqual(self.hp("40, plus 10 per invented level")[:2], (40, "40, plus 10 per invented level"))

    def test_only_a_number(self):
        self.assertEqual(self.hp("28")[:2], (28, "28"))

    def test_two_numbers_before_the_plus_give_no_hp(self):
        self.assertEqual(self.hp("10 or 12 plus 4 more")[:2], (None, "10 or 12 plus 4 more"))

    def test_a_number_that_does_not_lead_gives_no_hp(self):
        self.assertEqual(self.hp("five times the 8 caster levels")[:2], (None, "five times the 8 caster levels"))

    def test_no_number_gives_no_hp(self):
        self.assertEqual(self.hp("as many as the caster has")[:2], (None, "as many as the caster has"))

    def test_normal_hit_points_are_unchanged(self):
        fm, _ = creature_fm()
        self.assertRegex(fm, r'\nhp: 22\nhp_formula: "4d8 \+ 4"\n')


class SpecialReviewLine(unittest.TestCase):
    def test_line_on_special_creatures_in_both_editions(self):
        m = minidata.creature("Rimequill", "NEWB", hp={"special": "30 + 5 per invented level"})
        for lib, folder in ((WOTC_2024, L24), (WOTC_2014, L14)):
            text, _ = note(lib, folder, "Rimequill", [m])
            self.assertIn(BASE_LINE, frontmatter_of(text))

    def test_no_line_on_ordinary_creatures(self):
        fm, _ = creature_fm()
        self.assertNotIn("a base", fm)

    def test_line_for_text_with_no_number_names_no_base(self):
        fm, _ = creature_fm(ac=[{"special": "as the caster"}], hp={"special": "as the caster"})
        self.assertIn("needs_review", fm)
        self.assertNotIn("is a base", fm)


# ------------------------------------------------------------------ fix 2

def generic(name, requires, **inh):
    return {"name": name, "type": "GV", "requires": requires,
            "inherits": dict({"source": "XYZ", "rarity": "rare", "entries": ["Plain invented line."]}, **inh)}


def item_of(v):
    probs = []
    it = variants_as_items([v], probs)[0]
    it.update(_note="Lib/Items/" + v["name"], _id=v["name"].lower().replace(" ", "-"))
    return it, probs


def ctx(edition=None, bases=None):
    c = {"links": F.Links(), "bases": bases or {}, "titles": {}, "book_notes": {}}
    if edition:
        c["edition"] = edition
    return c


SHIELD_BASES = {("buckler", "xyz"): {"name": "Buckler", "type": "S", "ac": 3},
                ("rope", "xyz"): {"name": "Rope", "type": "G"}}


class GenericItemLabels(unittest.TestCase):
    def label(self, requires):
        return item_meta({"type": "GV", "requires": requires})[2]

    def test_armor_codes_stay_armor(self):
        for req in ([{"type": "LA"}, {"type": "MA|XPHB"}, {"type": "HA"}], [{"armor": True}]):
            self.assertTrue(self.label(req).startswith("Armor (any "))

    def test_shield_ammunition_weapon_and_other_codes(self):
        self.assertTrue(self.label([{"type": "S"}, {"type": "S|XPHB"}]).startswith("Shield (any "))
        self.assertTrue(self.label([{"type": "A"}, {"type": "AF|DMG"}]).startswith("Ammunition (any "))
        self.assertTrue(self.label([{"type": "M|XPHB"}]).startswith("Weapon (any "))
        self.assertTrue(self.label([{"type": "SCF", "scfType": "arcane"}]).startswith("Spellcasting Focus (any "))
        self.assertTrue(self.label([{"type": "A"}, {"type": "M"}]).startswith("Weapon (any "))

    def test_note_follows_the_real_type(self):
        it, probs = item_of(generic("Odd Bolts", [{"type": "A"}, {"type": "AF|DMG"}]))
        text = item_note(it, ctx("2024"))
        self.assertIn('item_type: "Ammunition"', text)
        self.assertIn("5e/item/ammunition", text)
        self.assertNotIn("kind: ", text)
        self.assertNotIn("armor", text.lower())
        self.assertNotIn("\nvariant:", text)
        self.assertTrue(any("ammunition" in p for p in probs))
        self.assertTrue(all("type='A'" not in p for p in probs))

    def test_a_weapon_type_variant_is_still_expressed(self):
        it, probs = item_of(generic("Odd Blade", [{"type": "M"}], bonusWeapon="+1"))
        self.assertEqual(it["_variant"], {"base": "weapon", "only": ["melee"], "bonusWeapon": 1})
        self.assertIn('item_type: "Weapon"', item_note(it, ctx()))

    def test_a_focus_requirement_is_named_in_the_review_line(self):
        it, probs = item_of(generic("Odd Wood", [{"type": "SCF", "scfType": "arcane"}]))
        self.assertTrue(any("spellcasting focus" in p for p in probs))
        self.assertIsNone(it["_variant"])

    def test_armor_variant_note_is_unchanged(self):
        it, probs = item_of(generic("Plus One Armor", [{"type": "LA"}, {"type": "HA|XPHB"}], bonusAc="+1"))
        text = item_note(it, ctx())
        self.assertIn('item_type: "Armor"', text)
        self.assertIn('base: "armor"', text)
        self.assertEqual(probs, [])


class AnyShield(unittest.TestCase):
    def shield(self, edition="2024", **inh):
        it, probs = item_of(generic("Plus Two Shield", [{"type": "S"}, {"type": "S|XPHB"}], bonusAc="+2", **inh))
        return it, probs, item_note(it, ctx(edition, SHIELD_BASES))

    def test_written_as_a_shield_with_the_ordinary_shield_plus_the_bonus(self):
        it, probs, text = self.shield()
        fm = text.split("---")[1]
        self.assertIn('kind: "shield"', fm)
        self.assertIn('item_type: "Shield"', fm)
        self.assertIn('"target": "ac"', fm)
        self.assertIn('"value": 5}', fm)
        self.assertNotIn("variant", fm)
        self.assertNotIn("needs_review", fm)
        self.assertEqual(probs, [])
        self.assertEqual(it["_problems"], [])

    def test_matches_a_specific_shield(self):
        specific = {"name": "Odd Shield", "type": "S", "bonusAc": "+2", "baseItem": "buckler|xyz"}
        bases = SHIELD_BASES
        self.assertEqual(item_native(specific, bases)["effects"], {"modifiers": [{"target": "ac", "value": 5}]})
        it, _ = item_of(generic("Plus Two Shield", [{"type": "S"}], bonusAc="+2"))
        self.assertEqual(item_native(it, bases)["effects"], {"modifiers": [{"target": "ac", "value": 5}]})
        self.assertEqual(item_native(it, bases)["kind"], "shield")

    def test_without_a_shield_base_the_ordinary_two_is_used(self):
        it, _ = item_of(generic("Plus One Shield", [{"type": "S"}], bonusAc="+1"))
        self.assertEqual(item_native(it, {})["effects"], {"modifiers": [{"target": "ac", "value": 3}]})

    def test_a_shield_with_other_conditions_keeps_the_review_line(self):
        v = generic("Odd Shield", [{"type": "S", "name": "Buckler"}], bonusAc="+1")
        it, probs = item_of(v)
        self.assertTrue(probs)


# ------------------------------------------------------------------ fix 3

class SpecificArmorTakesBaseStats(unittest.TestCase):
    BASES = {("plain plate", "xyz"): {"name": "Plain Plate", "type": "HA", "ac": 18, "strength": "15", "stealth": True},
             ("plain hide", "xyz"): {"name": "Plain Hide", "type": "LA", "ac": 11}}

    def test_armor_without_numbers_takes_the_base_items(self):
        it = {"name": "Odd Plate", "type": "HA", "baseItem": "plain plate|xyz"}
        out = item_native(it, self.BASES)
        self.assertEqual(out["kind"], "armor")
        self.assertEqual(out["armor"], {"base": 18, "dex": "none", "stealthDis": True, "strReq": 15})

    def test_light_armor_and_its_bonus(self):
        it = {"name": "Odd Hide", "type": "LA", "baseItem": "plain hide|xyz", "bonusAc": "+1"}
        self.assertEqual(item_native(it, self.BASES)["armor"], {"base": 12, "dex": "full"})

    def test_armor_with_its_own_numbers_keeps_them(self):
        it = {"name": "Odd Plate", "type": "HA", "ac": 16, "baseItem": "plain plate|xyz"}
        self.assertEqual(item_native(it, self.BASES)["armor"], {"base": 16, "dex": "none"})

    def test_a_shield_naming_a_base_takes_its_ac(self):
        it = {"name": "Odd Shield", "type": "S", "baseItem": "buckler|xyz"}
        self.assertEqual(item_native(it, SHIELD_BASES)["effects"], {"modifiers": [{"target": "ac", "value": 3}]})


if __name__ == "__main__":
    unittest.main()
