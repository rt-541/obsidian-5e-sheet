"""2024 class and subclass converters, on an invented class (Ashen Zed) and invented features."""
import dataclasses
import os
import re
import tempfile
import unittest

from dndc.ft24 import classes as K
from dndc import ft_notes
from dndc.ft24 import common
from dndc.libraries import WOTC_2014, WOTC_2024
from tests import minidata

CLS, SRC = "Ashen Zed", "NEWB"
DICE = re.compile(r"^\d+d\d+( \+ \d+d\d+)*$")


def cfeat(name, level, entries=None):
    return {"name": name, "source": SRC, "className": CLS, "classSource": SRC, "level": level,
            "entries": entries if entries is not None else [f"Invented text of {name}."]}


def sfeat(name, level, entries=None, short="Dusk"):
    return {"name": name, "source": SRC, "className": CLS, "classSource": SRC, "subclassShortName": short,
            "subclassSource": SRC, "level": level,
            "entries": entries if entries is not None else [f"Invented text of {name}."]}


def data(cfeats=(), sfeats=(), optional=()):
    return {"class_features": {(f["name"], CLS.lower(), SRC.lower(), f["level"], SRC.lower()): f for f in cfeats},
            "subclass_features": {(f["name"], CLS.lower(), f["subclassShortName"].lower(), SRC.lower(), f["level"],
                                   SRC.lower()): f for f in sfeats},
            "optional": list(optional)}


def ref(name, level, **kw):
    return {"classFeature": f"{name}|{CLS}|{SRC}|{level}", **kw}


def sref(name, level, short="Dusk"):
    return f"{name}|{CLS}|{SRC}|{short}|{SRC}|{level}"


def klass(**kw):
    c = {"name": CLS, "source": SRC, "hd": {"number": 1, "faces": 8}, "proficiency": ["con", "int"],
         "startingProficiencies": {"armor": ["light"], "weapons": ["simple"],
                                   "tools": ["thieves' tools", "navigator's tools"],
                                   "skills": [{"choose": {"from": ["arcana", "history"], "count": 1}}]},
         "multiclassing": {"proficienciesGained": {"armor": ["shield"]}},
         "classFeatures": [], "classTableGroups": []}
    c.update(kw)
    return c


def table(labels, rows):
    return {"colLabels": labels, "rows": [[c if isinstance(c, (dict, int)) else c for c in r] for r in rows]}


def all_ops(doc):
    return [o for ops in doc.get("levels", {}).values() for o in ops]


def ops_of(doc, kind, level=None):
    levels = doc["levels"] if level is None else {str(level): doc["levels"].get(str(level), [])}
    return [o for ops in levels.values() for o in ops if o["op"] == kind]


class Scales(unittest.TestCase):
    def test_scale_values_are_numbers_or_dice(self):
        rows = [[2, {"type": "bonus", "value": 2}, {"type": "bonusSpeed", "value": 10},
                 {"type": "dice", "toRoll": [{"number": 1, "faces": 6}]}, "{@dice d6}", "—"]] * 4
        rows[2] = [3, {"type": "bonus", "value": 3}, {"type": "bonusSpeed", "value": 15},
                   {"type": "dice", "toRoll": [{"number": 1, "faces": 8}]}, "{@dice 2d6}", "4"]
        rows[3] = rows[2]
        cls = klass(classTableGroups=[table(["Charges", "Bonus", "Speed", "Die", "Tag", "Odd"], rows)])
        _, doc = K.class_doc(data(), cls)
        by_name = {o["name"]: o["values"] for o in ops_of(doc, "scale")}
        self.assertEqual(by_name["Charges"], {"1": 2, "3": 3})
        self.assertEqual(by_name["Bonus"], {"1": 2, "3": 3})
        self.assertEqual(by_name["Speed"], {"1": 10, "3": 15})
        self.assertEqual(by_name["Die"], {"1": "1d6", "3": "1d8"})
        self.assertEqual(by_name["Tag"], {"1": "1d6", "3": "2d6"})
        self.assertEqual(by_name["Odd"], {"3": 4})
        for values in by_name.values():
            for v in values.values():
                self.assertTrue(isinstance(v, int) or DICE.match(v), v)

    def test_unreadable_values_are_a_problem_not_a_string(self):
        cls = klass(classTableGroups=[table(["Charges"], [["lots"], [2]])])
        _, doc = K.class_doc(data(), cls)
        self.assertEqual(ops_of(doc, "scale")[0]["values"], {"2": 2})
        self.assertIn("table column Charges has values that could not be read as numbers", doc["_problems"])

    def test_spell_columns_are_not_scales(self):
        cls = klass(classTableGroups=[
            table(["{@filter Cantrips|spells|level=0|class=Zed}", "{@filter Prepared Spells|spells|level=!0|class=Zed}",
                   "Spell Slots", "Slot Level", "Weapon Mastery"], [[2, 2, 1, 1, 2], [2, 3, 2, 1, 2]]),
            {"title": "Spell Slots per Spell Level", "colLabels": ["{@filter 1|spells|level=1|class=Zed}"],
             "rowsSpellProgression": [[2], [3]]}])
        _, doc = K.class_doc(data(), cls)
        self.assertEqual([o["name"] for o in ops_of(doc, "scale")], ["Weapon Mastery"])

    def test_tip_labels_are_named_by_their_tooltip(self):
        sub = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Glow", 3)],
               "subclassTableGroups": [table(["{@tip Die Size|Glow Die Size}", "{@tip Number|Glow Die Number}"],
                                             [["{@dice D6}", 4]] * 5)]}
        doc = K.subclass_doc(data(sfeats=[sfeat("Glow", 3)]), sub, klass(), "ashen-zed")
        self.assertEqual([o["name"] for o in ops_of(doc, "scale")], ["Glow Die Size", "Glow Die Number"])
        self.assertEqual(ops_of(doc, "scale")[0]["values"], {"1": "1d6"})


class Spells(unittest.TestCase):
    def test_prepared_progression_becomes_spells_ops(self):
        cls = klass(preparedSpellsProgression=[2, 3, 3, 4, 4, 4, 5], cantripProgression=[2, 2, 2, 3, 3, 3, 3],
                    spellcastingAbility="int", casterProgression="full")
        _, doc = K.class_doc(data(), cls)
        got = {lvl: {k: v for k, v in o.items() if k not in ("op", "id")}
               for lvl, ops in doc["levels"].items() for o in ops if o["op"] == "spells"}
        self.assertEqual(got, {"1": {"count": 2, "from": "ashen-zed", "cantrips": 2},
                               "2": {"count": 1, "from": "ashen-zed"},
                               "4": {"count": 1, "from": "ashen-zed", "cantrips": 1},
                               "7": {"count": 1, "from": "ashen-zed"}})
        self.assertEqual(doc["spellcasting"], {"abil": "int", "progression": "full"})

    def test_fixed_spellbook_wins_over_prepared(self):
        cls = klass(spellsKnownProgressionFixed=[6, 2, 2], preparedSpellsProgression=[4, 5, 6])
        _, doc = K.class_doc(data(), cls)
        counts = {lvl: o["count"] for lvl, ops in doc["levels"].items() for o in ops if o["op"] == "spells"}
        self.assertEqual(counts, {"1": 6, "2": 2, "3": 2})
        self.assertIn(K.SPELLBOOK_PROBLEM, doc["_problems"])

    def test_unknown_caster_progression_is_not_invented(self):
        _, doc = K.class_doc(data(), klass(spellcastingAbility="int", casterProgression="odd"))
        self.assertNotIn("spellcasting", doc)
        self.assertIn("caster progression odd not recognised: spellcasting not written", doc["_problems"])
        _, doc = K.class_doc(data(), klass(spellcastingAbility="int"))
        self.assertNotIn("spellcasting", doc)

    def test_subclass_with_unknown_caster_progression_is_not_a_caster(self):
        sub = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Glow", 3)],
               "spellcastingAbility": "int", "casterProgression": "odd", "preparedSpellsProgression": [0, 0, 3]}
        doc = K.subclass_doc(data(sfeats=[sfeat("Glow", 3)]), sub, klass(), "ashen-zed")
        self.assertEqual(ops_of(doc, "spellcasting") + ops_of(doc, "spells"), [])
        self.assertIn("caster progression odd not recognised: spellcasting not written", doc["_problems"])

    def test_subclass_spellcasting_needs_a_caster_progression(self):
        base = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Glow", 3)]}
        d = data(sfeats=[sfeat("Glow", 3)])
        doc = K.subclass_doc(d, {**base, "spellcastingAbility": "int"}, klass(), "ashen-zed")
        self.assertEqual(ops_of(doc, "spellcasting") + ops_of(doc, "spells"), [])
        self.assertNotIn("spell list assumed to be wizard", doc.get("_problems", []))
        doc = K.subclass_doc(d, {**base, "spellcastingAbility": "int", "casterProgression": "1/3",
                                 "cantripProgression": [0, 0, 2, 2], "preparedSpellsProgression": [0, 0, 3, 4]},
                             klass(), "ashen-zed")
        casting = ops_of(doc, "spellcasting")
        self.assertEqual(len(casting), 1)
        self.assertEqual({k: v for k, v in casting[0].items() if k != "id"},
                         {"op": "spellcasting", "abil": "int", "progression": "third", "list": "wizard"})
        self.assertIn(casting[0], doc["levels"]["3"])
        spells = {lvl: {k: v for k, v in o.items() if k not in ("op", "id")}
                  for lvl, ops in doc["levels"].items() for o in ops if o["op"] == "spells"}
        self.assertEqual(spells, {"3": {"count": 3, "from": "wizard", "cantrips": 2}, "4": {"count": 1, "from": "wizard"}})
        self.assertIn("spell list assumed to be wizard", doc["_problems"])

    def test_additional_spells_all_blocks(self):
        sub = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Glow", 3)],
               "additionalSpells": [{"prepared": {"3": ["a|x"], "5": ["b|x"]}, "known": {"_": ["c|x#c"]},
                                     "expanded": {"7": ["d|x"]}, "innate": {"3": {"daily": {"1": ["e|x"]}}}}]}
        doc = K.subclass_doc(data(sfeats=[sfeat("Glow", 3)]), sub, klass(), "ashen-zed")
        grants = {lvl: o["spells"] for lvl, ops in doc["levels"].items() for o in ops if o["op"] == "grant"}
        self.assertEqual(grants, {"1": ["c"], "3": ["a"], "5": ["b"], "7": ["d"]})
        self.assertIn(common.INNATE_PROBLEM, doc["_problems"])
        self.assertEqual(len({o["id"] for o in all_ops(doc)}), len(all_ops(doc)))


class Features(unittest.TestCase):
    def test_nested_features_are_found(self):
        inner = cfeat("Deep Spark", 5)
        outer = cfeat("Outer Glow", 3, ["Intro.", {"type": "entries", "entries": [
            {"type": "entries", "entries": [{"type": "refClassFeature", "classFeature": f"Deep Spark|{CLS}|{SRC}|5"}]}]}])
        cls = klass(classFeatures=[ref("Outer Glow", 3)])
        _, doc = K.class_doc(data([outer, inner]), cls)
        self.assertEqual([o["name"] for o in ops_of(doc, "feature", 3)], ["Outer Glow"])
        self.assertEqual([o["name"] for o in ops_of(doc, "feature", 5)], ["Deep Spark"])
        self.assertNotIn("Deep Spark", str([o.get("text") for o in ops_of(doc, "feature", 3)]))
        self.assertEqual(sum(1 for o in all_ops(doc) if o.get("name") == "Deep Spark"), 1)
        sf = sfeat("Pick One", 3, [{"type": "options", "entries": [
            {"type": "refSubclassFeature", "subclassFeature": sref("Path A", 3)},
            {"type": "refSubclassFeature", "subclassFeature": sref("Path B", 3)}]}])
        d = data(sfeats=[sf, sfeat("Path A", 3), sfeat("Path B", 3)])
        sub = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Pick One", 3)]}
        sdoc = K.subclass_doc(d, sub, klass(), "ashen-zed")
        self.assertEqual([o["name"] for o in ops_of(sdoc, "feature", 3)], ["Pick One", "Path A", "Path B"])
        found = [r["type"] for r in K.walk_refs(outer["entries"])] + [r["type"] for r in K.walk_refs(sf["entries"])]
        self.assertEqual(found, ["refClassFeature", "refSubclassFeature", "refSubclassFeature"])

    def test_missing_feature_reference_is_a_problem(self):
        cls = klass(classFeatures=[ref("Real", 1), ref("Ghost", 2)])
        _, doc = K.class_doc(data([cfeat("Real", 1)]), cls)
        self.assertIn("class feature Ghost not found", doc["_problems"])
        self.assertEqual([o["name"] for o in ops_of(doc, "feature")], ["Real"])
        outer = cfeat("Outer", 3, [{"type": "refClassFeature", "classFeature": f"Gone|{CLS}|{SRC}|3"}])
        _, doc = K.class_doc(data([outer]), klass(classFeatures=[ref("Outer", 3)]))
        self.assertIn("class feature Gone not found", doc["_problems"])
        sub = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Nope", 3)]}
        sdoc = K.subclass_doc(data(), sub, klass(), "ashen-zed")
        self.assertIn("subclass feature Nope not found", sdoc["_problems"])

    def test_asi_takes_the_listed_categories(self):
        feats = [cfeat(K.ASI_NAME, 4)]
        full = ["general", "origin", "epic-boon"]
        for listed, want in ((["G"], full), (["G", "O"], full), (None, full), (["G", "FS:R"], full + ["fighting-style-ranger"])):
            fp = [{"name": K.ASI_NAME, "category": listed, "progression": {"4": 1}}] if listed else []
            _, doc = K.class_doc(data(feats), klass(classFeatures=[ref(K.ASI_NAME, 4)], featProgression=fp))
            asi = ops_of(doc, "asi")
            self.assertEqual(len(asi), 1)
            self.assertEqual(asi[0]["feats"], want)
            self.assertEqual(ops_of(doc, "feat"), [])
        self.assertEqual(ops_of(doc, "feature"), [])

    def test_feat_progression_ops(self):
        feats = [cfeat("Fighting Style", 1), cfeat("Second Style", 2), cfeat("Epic Boon", 19), cfeat("Other", 1)]
        fp = [{"name": "Fighting Style", "category": ["FS"], "progression": {"1": 1}},
              {"name": "Second Style", "category": ["FS", "FS:R"], "progression": {"2": 1}},
              {"name": "Epic Boon", "category": ["EB"], "progression": {"19": 1}}]
        cls = klass(classFeatures=[ref("Other", 1), ref("Fighting Style", 1), ref("Second Style", 2), ref("Epic Boon", 19)],
                    featProgression=fp)
        _, doc = K.class_doc(data(feats), cls)
        got = {lvl: [o for o in ops if o["op"] == "feat"][0]["categories"] for lvl, ops in doc["levels"].items()
               if any(o["op"] == "feat" for o in ops)}
        self.assertEqual(got, {"1": ["fighting-style"], "2": ["fighting-style", "fighting-style-ranger"],
                               "19": ["epic-boon"]})
        names = [o.get("name", o["op"]) for o in doc["levels"]["1"]]
        self.assertEqual(names[names.index("Fighting Style") + 1], "feat")
        self.assertLess(names.index("Other"), names.index("Fighting Style"))

    def test_feat_op_sits_right_after_its_feature_not_at_the_end(self):
        feats = [cfeat("Fighting Style", 1), cfeat("Later", 1)]
        cls = klass(classFeatures=[ref("Fighting Style", 1), ref("Later", 1)],
                    featProgression=[{"name": "Fighting Style", "category": ["FS"], "progression": {"1": 1}}])
        _, doc = K.class_doc(data(feats), cls)
        self.assertEqual([o.get("name", o["op"]) for o in doc["levels"]["1"]], ["Fighting Style", "feat", "Later"])

    def test_feat_without_a_matching_feature_goes_last(self):
        sub = {"name": "Dusk", "shortName": "Dusk", "source": SRC, "subclassFeatures": [sref("Glow", 7)],
               "featProgression": [{"name": "Extra Style", "category": ["FS"], "progression": {"7": 1}}]}
        doc = K.subclass_doc(data(sfeats=[sfeat("Glow", 7)]), sub, klass(), "ashen-zed")
        self.assertEqual([o["op"] for o in doc["levels"]["7"]], ["feature", "feat"])

    def test_mastery_ops_one_per_increase(self):
        cls = klass(itemMasteries=True, itemMasteriesProgression={"1": 3, "4": 4, "10": 5})
        _, doc = K.class_doc(data(), cls)
        got = {lvl: o for lvl, ops in doc["levels"].items() for o in ops if o["op"] == "choose"}
        self.assertEqual({k: (o["what"], o["count"], "from" in o) for k, o in got.items()},
                         {"1": ("mastery", 3, False), "4": ("mastery", 1, False), "10": ("mastery", 1, False)})
        _, doc = K.class_doc(data(), klass())
        self.assertEqual(ops_of({"levels": doc.get("levels", {})}, "choose"), [])

    def test_expertise_count_is_read_from_the_text(self):
        feats = [cfeat("Expertise", 2, ["You gain Expertise in two of your skill proficiencies of your choice."]),
                 cfeat("Expertise", 9, ["Choose one of your skill proficiencies with which you lack Expertise."])]
        feats[1]["entries"] = ["Choose three of your skill proficiencies with which you lack Expertise."]
        cls = klass(classFeatures=[ref("Expertise", 2), ref("Expertise", 9)])
        _, doc = K.class_doc(data(feats), cls)
        got = {lvl: o["count"] for lvl, ops in doc["levels"].items() for o in ops if o.get("what") == "expertise"}
        self.assertEqual(got, {"2": 2, "9": 3})

    def test_options_use_plain_ids_and_swap(self):
        opt = [{"name": "Glim Bolt", "source": SRC, "featureType": ["ZZ"], "entries": ["Invented."]},
               {"name": "Dusk Veil", "source": SRC, "featureType": ["ZZ"], "entries": ["Invented."],
                "prerequisite": [{"level": {"level": 5}}]},
               {"name": "Other", "source": SRC, "featureType": ["YY"], "entries": ["Invented."]}]
        cls = klass(optionalfeatureProgression=[{"name": "Glim Lore", "featureType": ["ZZ"],
                                                  "progression": {"2": 1, "5": 2}}])
        _, doc = K.class_doc(data(optional=opt), cls)
        self.assertEqual([p["id"] for p in doc["options"]["glim-lore"]], ["dusk-veil", "glim-bolt"])
        self.assertEqual(doc["options"]["glim-lore"][0]["minLevel"], 5)
        picks = {lvl: o for lvl, ops in doc["levels"].items() for o in ops if o.get("what") == "option"}
        self.assertEqual({k: (o["count"], o.get("swap", False)) for k, o in picks.items()},
                         {"2": (1, False), "5": (1, True)})
        cls = klass(optionalfeatureProgression=[{"name": "Nothing", "featureType": ["QQ"], "progression": {"1": 1}}])
        _, doc = K.class_doc(data(optional=opt), cls)
        self.assertIn("no options found for Nothing", doc["_problems"])


class ClassDoc(unittest.TestCase):
    def test_class_doc_contract(self):
        feats = [cfeat("Glow", 1), cfeat("Ashen Zed Subclass", 3), cfeat("Boost", 3), cfeat("Subclass Feature", 6)]
        cls = klass(classFeatures=[ref("Glow", 1), ref("Ashen Zed Subclass", 3, gainSubclassFeature=True),
                                   ref("Boost", 3), ref("Subclass Feature", 6, gainSubclassFeature=True)],
                    startingEquipment={"goldAlternative": "5d4 × 10"})
        cid, doc = K.class_doc(data(feats), cls)
        self.assertEqual(cid, "ashen-zed")
        self.assertEqual(doc["subclassLevel"], 3)
        self.assertEqual(len(ops_of(doc, "subclass")), 1)
        self.assertIn(ops_of(doc, "subclass")[0], doc["levels"]["3"])
        self.assertEqual(sorted(doc["levels"], key=int), ["1", "3", "6"])
        self.assertEqual(doc["hitDie"], 8)
        self.assertEqual(doc["saves"], ["con", "int"])
        self.assertEqual(doc["proficiencies"], ["Light Armor", "Simple Weapons", "Thieves' Tools", "Navigator's Tools"])
        self.assertEqual(doc["skills"], {"count": 1, "from": ["arcana", "history"]})
        self.assertEqual(doc["multiclass"]["proficiencies"], ["Shields"])
        self.assertEqual(doc["gold"], "5d4*10")
        self.assertIn(K.MULTICLASS_PROBLEM, doc["_problems"])

    def test_no_problems_key_when_clean(self):
        cls = klass(multiclassing={"requirements": {"int": 13}, "proficienciesGained": {}},
                    classFeatures=[ref("Glow", 1)])
        _, doc = K.class_doc(data([cfeat("Glow", 1)]), cls)
        self.assertNotIn("_problems", doc)
        self.assertEqual(doc["multiclass"]["requires"], {"all": {"int": 13}})


class Resources(unittest.TestCase):
    def test_resources_read_table_scales(self):
        cls = klass(classTableGroups=[table(["Second Wind"], [[2], [2], [3]])],
                    classFeatures=[ref("Second Wind", 1), ref("Rage", 1)])
        feats = [cfeat("Second Wind", 1, ["It returns after a Long Rest. You regain one use."]),
                 cfeat("Rage", 1, ["You can regain all expended uses when you finish a Long Rest."])]
        _, doc = K.class_doc(data(feats), cls)
        res = ops_of(doc, "resource")
        self.assertEqual([(o["name"], o["max"], o["reset"]) for o in res],
                         [("Second Wind", "scale_second_wind", K.RESOURCES_2024["Second Wind"][2])])
        self.assertTrue(any(p == "limited-use features without a resource op: Rage" for p in doc["_problems"]),
                        doc["_problems"])

    def test_short_rest_refill_is_its_own_field(self):
        cls = klass(classTableGroups=[table(["Second Wind", "Focus Points"], [[2, 2], [2, 3]])],
                    classFeatures=[ref("Second Wind", 1), ref("Monk's Focus", 1)])
        feats = [cfeat("Second Wind", 1), cfeat("Monk's Focus", 1)]
        _, doc = K.class_doc(data(feats), cls)
        res = {o["name"]: o for o in ops_of(doc, "resource")}
        self.assertEqual((res["Second Wind"]["reset"], res["Second Wind"]["refill"]), ("long", {"on": "short", "amount": 1}))
        self.assertEqual(res["Focus Points"]["reset"], "short")
        self.assertNotIn("refill", res["Focus Points"])
        self.assertEqual(set(K.REFILLS_2024) - set(K.RESOURCES_2024), set())
        self.assertTrue(all(K.RESOURCES_2024[k][2] == "long" for k in K.REFILLS_2024))

    def test_resource_once_per_class(self):
        feats = [cfeat("Indomitable", n, ["Regain it after a Long Rest."]) for n in (9, 13, 17)]
        cls = klass(classFeatures=[ref("Indomitable", n) for n in (9, 13, 17)])
        _, doc = K.class_doc(data(feats), cls)
        self.assertEqual(len(ops_of(doc, "resource")), 1)
        self.assertFalse([p for p in doc["_problems"] if p.startswith("limited-use")])

    def test_resources_table_names_no_invented_numbers(self):
        for key, (name, mx, reset) in K.RESOURCES_2024.items():
            self.assertIn(reset, ("short", "long"), key)
            if isinstance(mx, str):
                self.assertTrue(re.fullmatch(r"[a-z][a-z_]*", mx) or re.fullmatch(r"[a-z0-9_ +*/(),-]+", mx), key)
                for word in re.findall(r"[a-z_]+", mx):
                    if not re.fullmatch(r"scale_[a-z_]+|floor|min|max|level|prof|str|dex|con|int|wis|cha", word):
                        self.fail((key, word))
            else:
                self.assertIsInstance(mx, int)
        self.assertEqual(K.RESOURCES_2024["Rage"][1], "scale_rages")


class Lookups(unittest.TestCase):
    def test_reference_that_differs_only_in_case_resolves(self):
        cls = klass(classFeatures=[ref("subclass feature", 5)])
        _, doc = K.class_doc(data([cfeat("Subclass Feature", 5)]), cls)
        self.assertNotIn("_problems", {k: v for k, v in doc.items() if k == "_problems" and any("not found" in p for p in v)})
        self.assertEqual([o["name"] for o in ops_of(doc, "feature", 5)], ["Subclass Feature"])

    def test_preparing_spells_is_not_a_limited_use(self):
        feats = [cfeat("Casting", 1, ["Whenever you finish a Long Rest, you can replace your prepared spells."]),
                 cfeat("Pulse", 2, ["You can use this once, and regain it when you finish a Short Rest."])]
        _, doc = K.class_doc(data(feats), klass(classFeatures=[ref("Casting", 1), ref("Pulse", 2)]))
        self.assertIn("limited-use features without a resource op: Pulse", doc["_problems"])


class OrphanSubclass(unittest.TestCase):
    def test_subclass_of_a_class_outside_the_library_is_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            clone, out, problems = os.path.join(tmp, "clone"), os.path.join(tmp, "out"), []
            minidata.write_clone(clone)
            lib = dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB", "NEWA"}))
            ft_notes.build(clone, out, problems, lib)
            root = os.path.join(out, "compendium", "5e", "WotC 2024")
            self.assertFalse([f for _, _, fs in os.walk(root) for f in fs if "Stray Zed" in f])
            self.assertTrue([p for p in problems if "Stray Zed" in p and "class outside this library" in p], problems)
            page = open(os.path.join(root, "Index", "Needs Review.md")).read()
            self.assertIn("Stray Zed", page)
            self.assertIn("a class outside this library", page)
            self.assertNotIn("[[None", page)


class CopiedItems(unittest.TestCase):
    def build(self, lib):
        tmp = tempfile.mkdtemp()
        self.addCleanup(__import__("shutil").rmtree, tmp, True)
        clone, out, problems = os.path.join(tmp, "clone"), os.path.join(tmp, "out"), []
        extra = {"items.json": lambda d: {"item": d["item"] + [
            {"name": "Twin Lantern", "source": "NEWB", "page": 9, "_copy": {"name": "Ashen Lantern", "source": "NEWB"}},
            {"name": "Far Twin", "source": "OFFB", "_copy": {"name": "Ashen Lantern", "source": "NEWB"}}]}}
        minidata.write_clone(clone, extra=extra)
        ft_notes.build(clone, out, problems, lib)
        return out, problems

    def test_2024_records_each_dropped_copy_in_library(self):
        out, problems = self.build(dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB"})))
        self.assertEqual([p for p in problems if "Twin Lantern" in p],
                         ["item Twin Lantern (NEWB) copies another item and is not converted"])
        self.assertFalse([p for p in problems if "Far Twin" in p], problems)
        page = open(os.path.join(out, "compendium", "5e", "WotC 2024", "Index", "Needs Review.md")).read()
        self.assertIn("- Twin Lantern (NEWB p. 9): item Twin Lantern (NEWB) copies another item and is not converted", page)
        self.assertNotIn("[[None", page)

    def test_2014_is_silent(self):
        _, problems = self.build(dataclasses.replace(WOTC_2014, sources=None))
        self.assertFalse([p for p in problems if "copies another item" in p], problems)


if __name__ == "__main__":
    unittest.main()
