"""Weapon mastery on weapons, mastery notes and 2024 item types, on invented data only."""
import collections
import os
import unittest

from dndc import fivetools as F
from dndc import ft_notes
from dndc.ft_notes import item_meta, item_native, mastery_note, unmapped_item_types
from dndc.libraries import WOTC_2014, WOTC_2024
from tests.test_libraries import L24, build, files_under, read

BLADE = {"name": "Zorblat Blade", "source": "NEWB", "type": "M|XPHB", "dmg1": "1d8", "dmgType": "S",
         "weaponCategory": "martial", "mastery": ["Quill|XPHB"]}
BASES = {("zorblat blade", "newb"): BLADE}

GOLDEN_DAGGER = (
    '---\ntype: "5e-item"\nschema: 1\nid: "quill-dagger"\nname: "Quill Dagger"\nsource: "NEWB"\npage: 13\n'
    'item_type: "Weapon"\nrarity: "mundane"\nattunement: false\nmagic: false\nweight: 2\ntags: \n  - "5e/item"\n'
    '  - "5e/item/weapon"\n  - "5e/rarity/mundane"\n  - "5e/source/newb"\nkind: "weapon"\nweapon: \n  dmg: "1d4"\n'
    '  type: "piercing"\n  ab: "str"\n  range: "melee"\n  category: "simple"\n---\n\n# Quill Dagger\n*Weapon*\n\n'
    '**Damage** 1d4 piercing  \n\n\n\n---\n*Source: [[compendium/5e/WotC/Books/New Invented Book/'
    'New Invented Book|New Invented Book]], p. 13*\n')
GOLDEN_LANTERN = (
    '---\ntype: "5e-item"\nschema: 1\nid: "ashen-lantern"\nname: "Ashen Lantern"\nsource: "NEWB"\npage: 9\n'
    'item_type: "Adventuring Gear"\nrarity: "mundane"\nattunement: false\nmagic: false\nweight: 1\ntags: \n'
    '  - "5e/item"\n  - "5e/item/adventuring-gear"\n  - "5e/rarity/mundane"\n  - "5e/source/newb"\n---\n\n'
    '# Ashen Lantern\n*Adventuring Gear*\n\n\nAn invented lantern.\n\n---\n*Source: [[compendium/5e/WotC/Books/'
    'New Invented Book/New Invented Book|New Invented Book]], p. 9*\n')


def mastery_files(data):
    data = dict(data)
    data["itemMastery"] = [{"name": "Quill", "source": "NEWB", "page": 4, "entries": ["An invented rule line."]}]
    return data


def with_mastery(extra=None):
    out = {"items-base.json": mastery_files}
    out.update(extra or {})
    return out


class ItemMastery(unittest.TestCase):
    def test_base_weapon_note_carries_mastery(self):
        w = item_native(BLADE, {})["weapon"]
        self.assertEqual(w["mastery"], "quill")
        self.assertEqual((w["dmg"], w["type"], w["ab"]), ("1d8", "slashing", "str"))

    def test_magic_weapon_takes_mastery_from_its_base(self):
        magic = {"name": "Glow Blade", "source": "NEWB", "baseItem": "zorblat blade|newb", "bonusWeapon": "+1"}
        self.assertEqual(item_native(magic, BASES)["weapon"]["mastery"], "quill")
        own = dict(magic, mastery=["Ember Step|XPHB"])
        self.assertEqual(item_native(own, BASES)["weapon"]["mastery"], "ember-step")

    def test_no_mastery_no_field(self):
        plain = {k: v for k, v in BLADE.items() if k != "mastery"}
        self.assertNotIn("mastery", item_native(plain, {})["weapon"])
        staff = dict(BLADE, name="Zorblat Staff")  # no `weapon` flag, still mapped
        self.assertEqual(item_native(staff, {})["weapon"]["mastery"], "quill")

    def test_focus_that_is_also_a_weapon_gets_mastery(self):
        focus = dict(BLADE, name="Zorblat Focus", type="SCF|NEWB")
        w = item_native(focus, {})["weapon"]
        self.assertEqual((w["mastery"], w["dmg"], w["range"]), ("quill", "1d8", "melee"))
        self.assertEqual(item_native(focus, {})["kind"], "weapon")
        no_mastery = {k: v for k, v in focus.items() if k != "mastery"}
        self.assertNotIn("weapon", item_native(no_mastery, {}))

    def test_dict_shaped_mastery_and_property(self):
        it = dict(BLADE, mastery=[{"uid": "Quill|XPHB", "note": "invented"}],
                  property=[{"uid": "V|XPHB", "note": "invented"}, "F|XPHB"])
        w = item_native(it, {})["weapon"]
        self.assertEqual(w["mastery"], "quill")
        self.assertEqual(w["ab"], "finesse")
        self.assertEqual(w["props"], ["versatile"])

    def test_string_property_unchanged(self):
        it = dict(BLADE, property=["V|XPHB", "L"])
        self.assertEqual(item_native(it, {})["weapon"]["props"], ["versatile", "light"])


class MasteryNotes(unittest.TestCase):
    def test_mastery_note(self):
        tmp, out, counts, _ = build(WOTC_2024, ["NEWB"], extra=with_mastery())
        self.addCleanup(tmp.cleanup)
        self.assertEqual(counts["mastery"], 1)
        self.assertEqual(files_under(out, L24 + "/Masteries"), ["Quill.md"])
        text = read(out, L24 + "/Masteries/Quill")
        for line in ('type: "5e-mastery"', "schema: 1", 'id: "quill"', 'name: "Quill"', 'source: "NEWB"', "page: 4",
                     '  - "5e/mastery"', '  - "5e/source/newb"', "An invented rule line.", "*Source:"):
            self.assertIn(line, text)

    def test_mastery_note_function(self):
        ctx = {"links": F.Links(), "titles": {"NEWB": "New Invented Book"}, "book_notes": {}}
        m = {"name": "Quill", "source": "NEWB", "page": 4, "entries": ["Invented."], "_note": "L/Masteries/Quill",
             "_id": "quill"}
        text = mastery_note(m, ctx)
        self.assertIn('type: "5e-mastery"', text)
        self.assertIn("# Quill", text)

    def test_empty_item_mastery_writes_no_folder(self):
        tmp, out, counts, _ = build(WOTC_2024, ["NEWB"], extra={
            "items-base.json": lambda d: dict(d, itemMastery=[])})
        self.addCleanup(tmp.cleanup)
        self.assertNotIn("mastery", counts)
        self.assertFalse(os.path.exists(os.path.join(out, *L24.split("/"), "Masteries")))

    def test_2014_build_has_no_masteries(self):
        tmp, out, counts, _ = build(WOTC_2014)
        self.addCleanup(tmp.cleanup)
        self.assertNotIn("mastery", counts)
        self.assertFalse(os.path.exists(os.path.join(out, "compendium/5e/WotC/Masteries")))

    def test_mastery_tag_links(self):
        ex = with_mastery({"conditions" + "diseases.json": lambda d: dict(d, condition=[
            dict(d["condition"][0], entries=["See {@itemMastery Quill|NEWB} first."])] + d["condition"][1:])})
        tmp, out, _, _ = build(WOTC_2024, ["NEWB"], extra=ex)
        self.addCleanup(tmp.cleanup)
        self.assertIn(f"[[{L24}/Masteries/Quill|Quill]]", read(out, L24 + "/Conditions/Hushed"))
        tmp2, out2, _, _ = build(WOTC_2024, ["NEWB"], extra={
            "conditionsdiseases.json": ex["conditionsdiseases.json"]})
        self.addCleanup(tmp2.cleanup)
        text = read(out2, L24 + "/Conditions/Hushed")
        self.assertIn("See Quill first.", text)
        self.assertNotIn("[[", text.split("See")[1].split("first")[0])

    def test_weapon_note_in_build_has_mastery(self):
        def base(d):
            d = mastery_files(d)
            d["baseitem"] = d["baseitem"] + [dict(BLADE, page=5)]
            return d
        tmp, out, _, _ = build(WOTC_2024, ["NEWB"], extra={"items-base.json": base})
        self.addCleanup(tmp.cleanup)
        self.assertIn('  mastery: "quill"', read(out, L24 + "/Items/Zorblat Blade"))

    def test_property_dict_does_not_crash_build(self):
        def base(d):
            d = dict(d)
            d["baseitem"] = d["baseitem"] + [dict(BLADE, property=[{"uid": "V|XPHB", "note": "x"}])]
            return d
        tmp, out, _, _ = build(WOTC_2024, ["NEWB"], extra={"items-base.json": base})
        self.addCleanup(tmp.cleanup)
        self.assertIn('  - "versatile"', read(out, L24 + "/Items/Zorblat Blade"))


class ItemTypes(unittest.TestCase):
    def test_item_type_codes(self):
        self.assertEqual(item_meta({"name": "x", "type": "$G|XDMG"})[0], "Treasure")
        self.assertEqual(item_meta({"name": "x", "type": "$A|XDMG"})[0], "Treasure")

    def test_2014_treasure_codes_stay_plain_items(self):
        self.assertEqual(item_meta({"name": "x", "type": "$G|DMG"})[0], "Item")

    def test_unmapped_item_types(self):
        got = unmapped_item_types([{"type": "TB|XDMG"}, {"type": "TB|XDMG"}, {"type": "M|XPHB"}, {"name": "no type"}])
        self.assertEqual(got, collections.Counter({"TB": 2}))


class Unchanged2014(unittest.TestCase):
    def test_2014_item_note_unchanged(self):
        tmp, out, _, _ = build(WOTC_2014)
        self.addCleanup(tmp.cleanup)
        self.assertEqual(read(out, "compendium/5e/WotC/Items/Quill Dagger"), GOLDEN_DAGGER)
        self.assertEqual(read(out, "compendium/5e/WotC/Items/Ashen Lantern"), GOLDEN_LANTERN)


if __name__ == "__main__":
    unittest.main()
