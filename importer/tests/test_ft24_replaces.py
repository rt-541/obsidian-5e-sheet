"""replaces: which 2014 ids a 2024 note stands in for, from reprintedAs, on invented data only."""
import dataclasses
import os
import tempfile
import unittest

from dndc import ft_notes
from dndc.ft24 import replaces as R
from dndc.libraries import WOTC_2014, WOTC_2024
from tests import minidata
from tests.test_libraries import L24, build, read

LEG = "compendium/5e/WotC"
LIB24 = dataclasses.replace(WOTC_2024, sources=frozenset(["NEWB"]))


def tag(key, name, source, targets):
    def mutate(data):
        data = dict(data)
        data[key] = [dict(e, reprintedAs=targets) if e["name"] == name and e["source"] == source else e for e in data[key]]
        return data
    return mutate


def write_note(root, rel, **fm):
    path = os.path.join(root, rel + ".md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = ["---"] + [f'{k}: "{v}"' for k, v in fm.items()] + ["tags: ", '  - "5e/x"', "---", "", "body"]
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def ent(kind, name, source, id_, **kw):
    return kind, dict({"name": name, "source": source, "_id": id_}, **kw)


class Index(unittest.TestCase):
    def test_legacy_index_keys(self):
        with tempfile.TemporaryDirectory() as t:
            write_note(t, "Spells/Thornflare", type="5e-spell", id="thornflare", name="Thornflare", source="OLDB")
            write_note(t, "Classes/Ashen Zed/Subclasses/Ember Path", type="5e-subclass", id="ember-path",
                       name="Ember Path", source="OLDB", **{"class": "ashen-zed"})
            idx = R.legacy_index(t)
        self.assertEqual(idx[("spell", "thornflare", "oldb", "")], "thornflare")
        self.assertEqual(idx[("subclass", "ember path", "oldb", "ashen-zed")], "ember-path")
        self.assertEqual(len(idx), 2)

    def test_index_reads_a_stamped_note(self):
        with tempfile.TemporaryDirectory() as t:
            write_note(t, "Spells/Thornflare", type="5e-spell", id="thornflare", name="Thornflare", source="OLDB",
                       edition="2014")
            self.assertEqual(R.legacy_index(t), {("spell", "thornflare", "oldb", ""): "thornflare"})


class Reprints(unittest.TestCase):
    def test_forms(self):
        data = {"monsters": [{"name": "A", "source": "OLDB", "reprintedAs": ["Quillbeast|NEWB"]}],
                "spells": [{"name": "B", "source": "OLDB", "reprintedAs": [{"uid": "Thornflare|NEWB", "tag": "spell"}]}],
                "items": [{"name": "C", "source": "OLDB", "reprintedAs": ["Lamp|NEWB"]}],
                "classes": [], "feats": [], "backgrounds": [], "races": [], "subraces": [],
                "subclasses": [{"name": "Stray", "source": "OLDB", "className": "Oldzed", "classSource": "OLDB",
                                "reprintedAs": ["Ember Path|Ashen Zed|NEWB|NEWB"]}]}
        got = {(k, n): (s, p, t) for k, n, s, p, t in R.reprints(data)}
        self.assertEqual(got[("creature", "A")], ("OLDB", "", ["Quillbeast|NEWB"]))
        self.assertEqual(got[("spell", "B")][2], ["Thornflare|NEWB"])
        self.assertEqual(got[("subclass", "Stray")], ("OLDB", "Oldzed|OLDB", ["Ember Path|Ashen Zed|NEWB|NEWB"]))


class Assign(unittest.TestCase):
    def setUp(self):
        self.lib = WOTC_2024
        self.legacy = {("creature", "old", "oldb", ""): "old", ("spell", "oldspell", "oldb", ""): "oldspell",
                       ("class", "oldzed", "oldb", ""): "oldzed", ("subclass", "stray", "oldb", "oldzed"): "stray-oldb"}

    def test_string_dict_and_subclass_forms(self):
        ents = [ent("creature", "Quillbeast", "XMM", "quillbeast"), ent("spell", "Thornflare", "XPHB", "thornflare"),
                ent("subclass", "Ember Path", "XPHB", "ember-path", _parent={"name": "Ashen Zed", "source": "XPHB"})]
        rep = [("creature", "Old", "OLDB", "", ["Quillbeast|XMM"]),
               ("spell", "OldSpell", "OLDB", "", [{"uid": "Thornflare|XPHB", "tag": "spell"}]),
               ("subclass", "Stray", "OLDB", "Oldzed|OLDB", ["Ember Path|Ashen Zed|XPHB|XPHB"])]
        c = R.assign(ents, rep, self.legacy, self.lib)
        self.assertEqual([e.get("_replaces") for _, e in ents], [["old"], ["oldspell"], ["stray-oldb"]])
        self.assertEqual(c, {"assigned": 3, "outside": 0, "absent": 0})

    def test_subclass_target_uses_the_short_name_and_a_rehomed_class_still_finds_its_id(self):
        ents = [ent("subclass", "Path of Ember", "XPHB", "path-of-ember", shortName="Ember",
                    _parent={"name": "Ashen Zed", "source": "XPHB"})]
        legacy = {("class", "oldzed", "oldb", ""): "oldzed", ("subclass", "path of old", "oldb", "oldzed"): "path-of-old"}
        rep = [("subclass", "Path of Old", "OLDB", "Oldzed|XPHB", ["Ember|Ashen Zed|XPHB|XPHB"])]
        self.assertEqual(R.assign(ents, rep, legacy, self.lib)["assigned"], 1)
        self.assertEqual(ents[0][1]["_replaces"], ["path-of-old"])

    def test_subrace_pointing_at_a_species_is_not_cross_typed(self):
        ents = [ent("race", "Thornfolk", "XPHB", "thornfolk")]
        legacy = {("subrace", "hill", "oldb", "oldfolk"): "hill", ("race", "oldfolk", "oldb", ""): "oldfolk"}
        c = R.assign(ents, [("subrace", "Hill", "OLDB", "Oldfolk|OLDB", ["Thornfolk|XPHB"])], legacy, self.lib)
        self.assertNotIn("_replaces", ents[0][1])
        self.assertEqual(c, {"assigned": 0, "outside": 1, "absent": 0})

    def test_ids_come_from_the_2014_library(self):
        legacy = {("creature", "old", "oldb", ""): "quillbeast-oldb"}
        ents = [ent("creature", "Quillbeast", "XMM", "quillbeast")]
        R.assign(ents, [("creature", "Old", "OLDB", "", ["Quillbeast|XMM"])], legacy, self.lib)
        self.assertEqual(ents[0][1]["_replaces"], ["quillbeast-oldb"])

    def test_same_id_is_omitted_and_lists_are_sorted(self):
        legacy = {("creature", "quillbeast", "oldb", ""): "quillbeast", ("creature", "z", "oldb", ""): "zeta",
                  ("creature", "a", "oldb", ""): "alpha"}
        ents = [ent("creature", "Quillbeast", "XMM", "quillbeast"), ent("creature", "Other", "XMM", "other")]
        rep = [("creature", "Quillbeast", "OLDB", "", ["Quillbeast|XMM"]),
               ("creature", "Z", "OLDB", "", ["Other|XMM"]), ("creature", "A", "OLDB", "", ["Other|XMM", "Other|XMM"]),
               ("creature", "A", "OLDB", "", ["Other|XMM"])]
        R.assign(ents, rep, legacy, self.lib)
        self.assertNotIn("_replaces", ents[0][1])
        self.assertEqual(ents[1][1]["_replaces"], ["alpha", "zeta"])

    def test_targets_outside_the_library_are_counted(self):
        ents = [ent("creature", "Quillbeast", "XMM", "quillbeast")]
        rep = [("creature", "Old", "OLDB", "", ["X|MPMM"]), ("creature", "Gone", "OLDB", "", ["Quillbeast|XMM"])]
        by_kind = {}
        c = R.assign(ents, rep, self.legacy, self.lib, by_kind)
        self.assertEqual(c, {"assigned": 0, "outside": 1, "absent": 1})
        self.assertEqual(by_kind, {"creature": {"assigned": 0, "outside": 1, "absent": 1}})
        self.assertNotIn("_replaces", ents[0][1])

    def test_legacy_none_skips(self):
        ents = [ent("creature", "Quillbeast", "XMM", "quillbeast")]
        c = R.assign(ents, [("creature", "Old", "OLDB", "", ["Quillbeast|XMM"])], None, self.lib)
        self.assertEqual(c, {"assigned": 0, "outside": 0, "absent": 0})
        self.assertNotIn("_replaces", ents[0][1])

    def test_kinds_do_not_cross(self):
        ents = [ent("spell", "Quillbeast", "XMM", "quillbeast")]
        c = R.assign(ents, [("creature", "Old", "OLDB", "", ["Quillbeast|XMM"])], self.legacy, self.lib)
        self.assertNotIn("_replaces", ents[0][1])
        self.assertEqual(c["assigned"], 0)


def all_extra():
    marks = {"bestiary/bestiary-newb.json": tag("monster", "Gravelquill", "OLDB", ["Quillbeast|NEWB"]),
             "spells/spells-newb.json": tag("spell", "Oldflare", "OLDB", [{"uid": "Thornflare|NEWB", "tag": "spell"}]),
             "items.json": tag("item", "Old Lantern", "OLDB", ["Ashen Lantern|NEWB"]),
             "class/class-zed.json": lambda d: dict(d, **{"class": [dict(c, reprintedAs=["Zedcaller|NEWB"]) if c["name"] == "Oldzed" else c
                                                                      for c in d["class"]],
                                                          "subclass": [dict(c, reprintedAs=["Ashen Zed|Zedcaller|NEWB|NEWB"])
                                                                       if c["name"] == "Stray Zed" else c for c in d["subclass"]]}),
             "feats.json": tag("feat", "Old Knack", "OLDB", ["Quill Knack|NEWB"]),
             "backgrounds.json": tag("background", "Old Hermit", "OLDB", ["Quill Hermit|NEWB"]),
             "races.json": lambda d: dict(d, race=[dict(r, reprintedAs=["Thornfolk|NEWB"]) if r["name"] == "Oldfolk" else r
                                                   for r in d["race"]])}
    return marks


class Notes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t14, out14, _, _ = build(WOTC_2014, extra=all_extra())
        cls.addClassCleanup(t14.cleanup)
        cls.legacy = R.legacy_index(os.path.join(out14, *LEG.split("/")))
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        clone = os.path.join(cls.tmp.name, "clone")
        minidata.write_clone(clone, extra=all_extra())
        cls.out = os.path.join(cls.tmp.name, "out")
        cls.counts, _ = ft_notes.build(clone, cls.out, [], LIB24, cls.legacy)
        cls.out14 = out14

    def front(self, note):
        return read(self.out, f"{L24}/{note}").split("---")[1]

    def test_notes_carry_replaces(self):
        for note, line in [("Creatures/Quillbeast", 'replaces: \n  - "gravelquill"'),
                           ("Spells/Thornflare", 'replaces: \n  - "oldflare"'),
                           ("Items/Ashen Lantern", 'replaces: \n  - "old-lantern"'),
                           ("Classes/Zedcaller/Zedcaller", 'replaces: \n  - "oldzed"'),
                           ("Classes/Zedcaller/Subclasses/Ashen Zed", 'replaces: \n  - "stray-zed"'),
                           ("Feats/Quill Knack", 'replaces: \n  - "old-knack"'),
                           ("Backgrounds/Quill Hermit", 'replaces: \n  - "old-hermit"'),
                           ("Races/Thornfolk/Thornfolk", 'replaces: \n  - "oldfolk"')]:
            self.assertIn(line, self.front(note), note)
        self.assertEqual(self.counts["replaces"]["assigned"], 8)

    def test_note_with_none_has_no_key(self):
        self.assertNotIn("replaces", self.front("Conditions/Hushed"))
        self.assertNotIn("replaces", self.front("Items/Quill Dagger"))

    def test_2014_never_writes_the_key(self):
        for d, _, fs in os.walk(os.path.join(self.out14, *LEG.split("/"))):
            for f in fs:
                if f.endswith(".md"):
                    self.assertNotIn("\nreplaces:", open(os.path.join(d, f)).read(), f)
        t, out, counts, _ = build(WOTC_2014, extra=all_extra())
        self.addCleanup(t.cleanup)
        self.assertNotIn("replaces", counts)

    def test_none_for_2024_without_a_2014_tree(self):
        clone = os.path.join(self.tmp.name, "clone")
        counts, _ = ft_notes.build(clone, os.path.join(self.tmp.name, "out2"), [], LIB24, None)
        self.assertNotIn("replaces", counts)
        self.assertNotIn("\nreplaces:", read(os.path.join(self.tmp.name, "out2"), f"{L24}/Spells/Thornflare"))


if __name__ == "__main__":
    unittest.main()
