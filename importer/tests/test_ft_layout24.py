"""2024 creature, spell and condition layouts, on invented stat blocks."""
import re
import unittest

from dndc import ft_notes
from dndc.libraries import WOTC_2014, WOTC_2024
from tests import minidata
from tests.test_libraries import build, read

L24 = "compendium/5e/WotC 2024"
L14 = "compendium/5e/WotC"
BESTIARY = "bestiary/bestiary-newb.json"


def with_monsters(*monsters):
    def mutate(d):
        d["monster"] = d["monster"] + list(monsters)
        return d
    return {BESTIARY: mutate}


def note(lib, folder, name, monsters, extra=None):
    ex = with_monsters(*monsters)
    ex.update(extra or {})
    tmp, out, counts, _ = build(lib, sources={"NEWB"} if lib.edition == "2024" else None, extra=ex)
    text = read(out, f"{folder}/Creatures/{name}")
    tmp.cleanup()
    return text, counts


def frontmatter_of(text):
    return text.split("---")[1]


GOLDEN_2014 = """---
type: "5e-creature"
schema: 1
id: "goldenquill"
name: "Goldenquill"
source: "NEWB"
page: 7
size: "Medium"
creature_type: "beast"
alignment: "unaligned"
ac: 13
hp: 22
hp_formula: "4d8 + 4"
speed: "30 ft."
abilities: 
  str: 12
  dex: 14
  con: 12
  int: 3
  wis: 11
  cha: 5
senses: "passive Perception 10"
passive_perception: 10
languages: "—"
cr: "5"
cr_value: 5
xp: 1800
tags: 
  - "5e/creature"
  - "5e/cr/5"
  - "5e/tier/2"
  - "5e/type/beast"
  - "5e/size/medium"
  - "5e/align/unaligned"
  - "5e/source/newb"
---

# Goldenquill
*Medium beast, unaligned*

**Armor Class** 13  
**Hit Points** 22 (4d8 + 4)  
**Speed** 30 ft.  

| STR | DEX | CON | INT | WIS | CHA |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 12 (+1) | 14 (+2) | 12 (+1) | 3 (-4) | 11 (+0) | 5 (-3) |

**Senses** passive Perception 10  
**Languages** —  
**Challenge** 5 (1,800 XP, or 2,300 XP in its lair)  

## Actions

***Quill.*** The beast flicks a quill.

---
*Source: [[compendium/5e/WotC/Books/New Invented Book/New Invented Book|New Invented Book]], p. 7*
"""


class Layout24(unittest.TestCase):
    def test_lair_xp_from_xpLair(self):
        text, _ = note(WOTC_2024, L24, "Lairquill", [minidata.creature("Lairquill", "NEWB", cr={"cr": "3", "xpLair": 1250})])
        self.assertIn("or 1,250 XP in its lair", text)
        self.assertEqual(ft_notes.lair_xp({"cr": {"cr": "3", "xpLair": 1250}}), 1250)
        self.assertEqual(ft_notes.lair_xp({"cr": {"cr": "5", "lair": "6"}}), 2300)
        self.assertIsNone(ft_notes.lair_xp({"cr": "5"}))

    def test_2014_lair_form_and_whole_note_unchanged(self):
        text, _ = note(WOTC_2014, L14, "Goldenquill", [minidata.creature("Goldenquill", "NEWB", cr={"cr": "5", "lair": "6"})])
        self.assertEqual(text, GOLDEN_2014)

    def test_initiative(self):
        mk = lambda n, **kw: minidata.creature(n, "NEWB", cr="1/4", **kw)
        text, _ = note(WOTC_2024, L24, "Quickone", [mk("Quickone", initiative={"proficiency": 1}),
                                                    mk("Quicktwo", initiative={"proficiency": 2}), mk("Slowone")])
        self.assertIn("initiative: 4\n", text)
        self.assertIn("**Initiative** +4 (14)", text)
        two, _ = note(WOTC_2024, L24, "Quicktwo", [mk("Quicktwo", initiative={"proficiency": 2})])
        self.assertIn("initiative: 6\n", two)
        self.assertIn("**Initiative** +6 (16)", two)
        slow, _ = note(WOTC_2024, L24, "Slowone", [mk("Slowone")])
        self.assertNotIn("initiative", slow.lower())
        self.assertEqual(ft_notes.initiative_bonus(mk("x", initiative=3)), 3)
        self.assertIsNone(ft_notes.initiative_bonus(mk("x")))

    def test_gear_line(self):
        extra = {"items.json": lambda d: dict(d, item=d["item"] + [minidata.item("Wand", "NEWB")])}
        mk = lambda n, gear: minidata.creature(n, "NEWB", gear=gear)
        a, _ = note(WOTC_2024, L24, "Geara", [mk("Geara", ["wand|newb"])], extra)
        self.assertIn(f"**Gear** [[{L24}/Items/Wand|Wand]]", a)
        b, _ = note(WOTC_2024, L24, "Gearb", [mk("Gearb", [{"item": "wand|newb", "quantity": 2}])], extra)
        self.assertIn(f"[[{L24}/Items/Wand|Wand]] (2)", b)
        c, _ = note(WOTC_2024, L24, "Gearc", [mk("Gearc", ["sealed jar|newb"])], extra)
        self.assertIn("**Gear** Sealed Jar", c)
        self.assertNotIn("[[compendium/5e/WotC 2024/Items/Sealed", c)

    def test_stated_zero_xp_kept_in_2024_only(self):
        m = minidata.creature("Nilquill", "NEWB", cr={"cr": "0", "xp": 0})
        text, _ = note(WOTC_2024, L24, "Nilquill", [m])
        self.assertIn("xp: 0\n", text)
        self.assertIn("**Challenge** 0 (0 XP)", text)
        old, _ = note(WOTC_2014, L14, "Nilquill", [m])
        self.assertIn("xp: 10\n", old)
        self.assertIn("**Challenge** 0 (10 XP)", old)
        nocr = minidata.creature("Nocrquill", "NEWB", cr={"cr": "None", "xp": 0})
        text, _ = note(WOTC_2024, L24, "Nocrquill", [nocr])
        self.assertIn("no challenge rating", text)

    def test_gear_label_is_item_name(self):
        extra = {"items.json": lambda d: dict(d, item=d["item"] + [minidata.item("Wand", "NEWB"),
                                                                    minidata.item("Wand", "OFFB")])}
        m = minidata.creature("Gearx", "NEWB", gear=["wand|offb"])
        text, _ = note(WOTC_2024, L24, "Gearx", [m], extra)
        self.assertIn("|Wand]]", text)
        self.assertNotIn("(OFFB)]]", text)
        from dndc import fivetools as F
        links = F.Links()
        links.add("item", "Wand", "OFFB", f"{L24}/Items/Wand (OFFB)")
        self.assertEqual(ft_notes.gear_text(m, links, "x", {f"{L24}/Items/Wand (OFFB)": "Wand"}),
                         f"[[{L24}/Items/Wand (OFFB)|Wand]]")

    def test_emanation_range(self):
        feet = lambda n: {"type": "feet", "amount": n}
        self.assertEqual(ft_notes.range_text({"type": "emanation", "distance": feet(30)}), "Self (30-foot emanation)")
        self.assertEqual(ft_notes.range_text({"type": "cone", "distance": feet(15)}), "Self (15-foot cone)")
        self.assertEqual(ft_notes.range_text({"type": "point", "distance": feet(60)}), "60 feet")

    def test_creature_checks(self):
        ok = minidata.creature("x", "NEWB", hp={"average": 27, "formula": "5d8 + 5"})
        self.assertEqual(ft_notes.creature_checks(ok), [])
        bad = dict(ok, hp={"average": 30, "formula": "5d8 + 5"})
        self.assertEqual(ft_notes.creature_checks(bad), ["hit points 30 do not match 5d8 + 5"])
        self.assertEqual(ft_notes.creature_checks(dict(ok, hp={"average": 22, "formula": "4d8 + 4"})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, hp={"average": 6, "formula": "2d6 - 1"})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, hp={"average": 12, "formula": "3d6 + 2"})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, hp={"average": 13, "formula": "3d8"})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, hp={"average": 13})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, hp={"special": "varies"})), [])
        xp = dict(ok, cr={"cr": "1", "xp": 100})
        self.assertEqual(ft_notes.creature_checks(xp), ["XP 100 does not match CR 1"])
        self.assertEqual(ft_notes.creature_checks(dict(ok, cr={"cr": "1", "xp": 200})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, cr={"cr": "0", "xp": 0})), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, cr="1")), [])
        self.assertEqual(ft_notes.creature_checks(dict(ok, cr={"cr": "None", "xp": 0})), ["no challenge rating"])
        self.assertEqual(ft_notes.creature_checks(dict(ok, cr="None")), ["no challenge rating"])
        self.assertEqual(ft_notes.creature_checks(dict(ok, cr=None)), ["no challenge rating"])
        nocr = {k: v for k, v in ok.items() if k != "cr"}
        self.assertEqual(ft_notes.creature_checks(nocr), [])
        gone = {k: v for k, v in ok.items() if k != "wis"}
        self.assertEqual(ft_notes.creature_checks(gone), ["missing ability score"])

    def test_creature_checks_reach_the_note_only_for_2024(self):
        bad = minidata.creature("Offsum", "NEWB", hp={"average": 30, "formula": "5d8 + 5"}, cr={"cr": "1", "xp": 100})
        text, _ = note(WOTC_2024, L24, "Offsum", [bad])
        fm = frontmatter_of(text)
        self.assertIn("needs_review:", fm)
        self.assertIn("hit points 30 do not match 5d8 + 5", fm)
        self.assertIn("XP 100 does not match CR 1", fm)
        old, _ = note(WOTC_2014, L14, "Offsum", [bad])
        self.assertNotIn("needs_review", old)
        # and on the Needs Review page
        tmp, out, _, _ = build(WOTC_2024, sources={"NEWB"}, extra=with_monsters(bad))
        self.addCleanup(tmp.cleanup)
        page = read(out, f"{L24}/Index/Needs Review")
        self.assertIn("hit points 30 do not match 5d8 + 5", page)

    def test_copy_outside_library_flagged(self):
        text, _ = note(WOTC_2024, L24, "Spinebeast", [])
        fm = frontmatter_of(text)
        self.assertIn("inherits from Gravelquill (OLDB), a book outside this library", fm)
        self.assertIn('copied_from: "Gravelquill (OLDB)"', fm)
        old, _ = note(WOTC_2014, L14, "Spinebeast", [])
        self.assertNotIn("a book outside this library", old)
        self.assertEqual(ft_notes._outside_copy({"_copy": {"name": "A", "source": "XMM"}}, WOTC_2024), None)

    def test_status_conditions_written(self):
        status = {"name": "Dazed", "source": "NEWB", "page": 2, "entries": ["An invented state of being."]}
        extra = {"conditionsdiseases.json": lambda d: dict(d, status=[status])}
        tmp, out, _, _ = build(WOTC_2024, sources={"NEWB"}, extra=extra)
        self.addCleanup(tmp.cleanup)
        text = read(out, f"{L24}/Conditions/Dazed")
        self.assertIn('type: "5e-condition"', text)
        self.assertIn('condition_kind: "condition"', text)

    def test_versions_not_expanded_counted(self):
        two = minidata.creature("Shifter", "NEWB", _versions=[{"name": "A", "_mod": {}}, {"name": "B", "_mod": {}}])
        one = minidata.creature("Shifty", "NEWB", _versions=[{"name": "C", "_mod": {}}])
        tmp, out, counts, _ = build(WOTC_2024, sources={"NEWB"}, extra=with_monsters(two, one))
        self.addCleanup(tmp.cleanup)
        self.assertEqual(counts["creature_versions_skipped"], 3)
        self.assertEqual(counts["creatures_with_versions"], 2)
        text = read(out, f"{L24}/Creatures/Shifter")
        self.assertEqual(len(re.findall(r"^# ", text, re.M)), 1)
        tmp2, _, counts2, _ = build(WOTC_2014, extra=with_monsters(two))
        self.addCleanup(tmp2.cleanup)
        self.assertNotIn("creature_versions_skipped", counts2)


if __name__ == "__main__":
    unittest.main()
