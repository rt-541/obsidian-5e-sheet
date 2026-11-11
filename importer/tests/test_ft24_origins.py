"""2024 species, feats and backgrounds, on invented values."""
import dataclasses
import os
import tempfile
import unittest

from dndc import fivetools as F
from dndc import ft_notes
from dndc.ft24 import origins
from dndc.libraries import WOTC_2024
from tests import minidata

LIB24 = dataclasses.replace(WOTC_2024, sources=frozenset({"NEWB"}))


def bg(**kw):
    b = {"name": "Quill Hermit", "source": "NEWB", "feats": [{"quill gift|newb": True}]}
    b.update(kw)
    return b


def pick(frm, *weights):
    return [{"choose": {"weighted": {"from": frm, "weights": list(w)}}} for w in weights]


class Backgrounds(unittest.TestCase):
    def test_background_ability_pick(self):
        doc = origins.background_doc(bg(ability=pick(["int", "wis", "cha"], [2, 1], [1, 1, 1])))
        self.assertEqual(doc["abilityPick"], {"from": ["int", "wis", "cha"], "patterns": [[2, 1], [1, 1, 1]]})
        self.assertNotIn("ability", doc)
        self.assertNotIn("_problems", doc)
        doc = origins.background_doc(bg(ability=pick(["int", "wis", "cha"], [2, 1]) + pick(["str", "dex"], [1, 1, 1])))
        self.assertEqual(doc["abilityPick"]["from"], ["int", "wis", "cha"])
        self.assertTrue(any("ability" in p for p in doc["_problems"]), doc["_problems"])
        doc = origins.background_doc(bg(ability=[{"str": 1}]))
        self.assertEqual(doc["ability"], [{"str": 1}])
        self.assertNotIn("abilityPick", doc)

    def test_background_feat_ops(self):
        def feats(b):
            return [g for g in origins.background_doc(b)["grants"] if g["op"] == "feat"]

        ops = feats(bg())
        self.assertEqual([(o["op"], o["feat"]) for o in ops], [("feat", "quill-gift")])
        self.assertEqual(feats(bg(feats=[{"quill gift; ember|newb": True}]))[0]["feat"], "quill-gift-ember")
        ops = feats(bg(feats=[{"anyFromCategory": {"category": ["DG"]}}]))
        self.assertEqual(len(ops), 1)
        self.assertEqual(ops[0]["categories"], ["dark-gift"])
        self.assertNotIn("feat", ops[0])
        self.assertEqual(len(feats(bg(feats=[{"anyFromCategory": {"category": ["O"], "count": 2}}]))), 2)
        self.assertEqual(len({o["id"] for o in feats(bg(feats=[{"a|newb": True, "b|newb": True}]))}), 2)
        b = bg()
        del b["feats"]
        doc = origins.background_doc(b)
        self.assertIn("grants no feat", doc["_problems"])
        self.assertEqual(feats(b), [])

    def test_background_feat_must_exist(self):
        doc = origins.background_doc(bg(), feat_ids={"quill-gift"})
        self.assertNotIn("_problems", doc)
        self.assertTrue(any(g["op"] == "feat" for g in doc["grants"]))
        doc = origins.background_doc(bg(), feat_ids={"other"})
        self.assertIn("feat quill-gift is not in this library", doc["_problems"])
        self.assertFalse(any(g["op"] == "feat" for g in doc["grants"]))
        doc = origins.background_doc(bg(feats=[{"quill gift|oldb": True}]), feat_ids={"quill-gift-oldb"})
        self.assertEqual([g["feat"] for g in doc["grants"] if g["op"] == "feat"], ["quill-gift-oldb"])
        self.assertNotIn("_problems", doc)

    def test_background_proficiencies(self):
        doc = origins.background_doc(bg(
            toolProficiencies=[{"navigator's tools": True}, {"anyGamingSet": 1}],
            skillProficiencies=[{"arcana": True, "history": True}],
            languageProficiencies=[{"anyStandard": 2}]))
        g = doc["grants"]
        grant = next(x for x in g if x["op"] == "grant")
        self.assertEqual(grant["proficiencies"], ["skill:arcana", "skill:history", "Navigator's Tools"])
        self.assertIn({"op": "choose", "id": "tools-anygamingset", "what": "tools", "count": 1,
                       "from": ["dice-set", "dragonchess-set", "playing-card-set", "three-dragon-ante-set"]}, g)
        self.assertTrue(any(x["op"] == "choose" and x["what"] == "languages" and x["count"] == 2 for x in g))
        doc = origins.background_doc(bg(toolProficiencies=[
            {"choose": {"from": ["smith's tools", "dice set", "lute"], "count": 1}}]))
        chooses = [x for x in doc["grants"] if x["op"] == "choose" and x["what"] == "tools"]
        self.assertEqual(len(chooses), 1)
        self.assertEqual(chooses[0]["from"], ["smiths-tools", "dice-set", "lute"])
        self.assertEqual(chooses[0]["count"], 1)
        grant = next((x for x in doc["grants"] if x["op"] == "grant"), {})
        self.assertNotIn("proficiencies", grant)


class Species(unittest.TestCase):
    def species(self, **kw):
        r = {"name": "Thornfolk", "source": "NEWB", "size": ["M"], "speed": 30,
             "entries": [{"name": "Trait", "entries": ["Invented."]}]}
        r.update(kw)
        return r

    def grant(self, doc):
        return next(g for g in doc["grants"] if g["id"] == "grant")

    def test_species_grants(self):
        doc = origins.race_doc(self.species(size=["S", "M"]))
        self.assertEqual(doc["size"], ["Small", "Medium"])
        g = self.grant(origins.race_doc(self.species(speed={"walk": 35, "climb": True})))
        self.assertEqual((g["speed"], g["speeds"]), (35, {"climb": "walk"}))
        g = self.grant(origins.race_doc(self.species(speed={"walk": 30, "fly": 50})))
        self.assertEqual((g["speed"], g["speeds"]), (30, {"fly": 50}))
        g = self.grant(origins.race_doc(self.species(speed=30, darkvision=60)))
        self.assertEqual((g["speed"], g["darkvision"]), (30, 60))
        self.assertNotIn("speeds", g)
        g = self.grant(origins.race_doc(self.species(
            armorProficiencies=[{"light": True}], toolProficiencies=[{"smith's tools": True}],
            weaponProficiencies=[{"martial": True}, {"dagger|xphb": True}])))
        self.assertEqual(g["proficiencies"], ["Smith's Tools", "Light Armor", "Martial Weapons", "Dagger"])
        doc = origins.race_doc(self.species(skillProficiencies=[{"any": 1}], feats=[
            {"anyFromCategory": {"category": ["O"], "count": 1}}], resist=["cold", "fire"]))
        ops = doc["grants"]
        self.assertTrue(any(o["op"] == "choose" and o["what"] == "skills" and o["count"] == 1 for o in ops))
        self.assertTrue(any(o["op"] == "feat" and o["categories"] == ["origin"] for o in ops))
        self.assertTrue(any(o["op"] == "effect" and o["effects"] == {"resist": ["cold", "fire"]} for o in ops))
        doc = origins.race_doc(self.species(additionalSpells=[{"known": {"1": ["thornflare|newb#c"]}}]))
        self.assertTrue(any(o["op"] == "grant" and o.get("spells") == ["thornflare"] for o in doc["grants"]))
        doc = origins.race_doc(self.species(entries=[
            {"name": "Age", "entries": ["x"]}, {"name": "Size", "entries": ["x"]},
            {"name": "Thorn Skin", "entries": ["Invented."]}]))
        self.assertEqual([o["name"] for o in doc["grants"] if o["op"] == "feature"], ["Thorn Skin"])
        self.assertNotIn("ability", doc)
        doc = origins.race_doc(self.species(ability=[{"con": 2}]))
        self.assertNotIn("ability", doc)
        self.assertFalse(any("Ability Score" in o.get("name", "") for o in doc["grants"]))
        s = self.species()
        del s["size"]
        self.assertIn("no size", origins.race_doc(s)["_problems"])
        self.assertNotIn("_problems", origins.race_doc(self.species()))

    def test_unwritable_species_parts_are_flagged(self):
        doc = origins.race_doc(self.species(resist=[{"choose": {"from": ["fire", "cold"]}}]))
        self.assertEqual(len(doc["_problems"]), 1)
        doc = origins.race_doc(self.species(additionalSpells=[{"innate": {"3": {"daily": {"1": ["a|x"]}}}}]))
        self.assertEqual(len(doc["_problems"]), 1)
        doc = origins.race_doc(self.species(additionalSpells=[{"known": {"3": ["a|x"]}}]))
        self.assertFalse(any(o.get("spells") for o in doc["grants"]))
        self.assertEqual(len(doc["_problems"]), 1)

    def test_lineage_keeps_only_what_differs(self):
        base = self.species(darkvision=60, skillProficiencies=[{"any": 1}])
        lineage = dict(base, name="Thornfolk (Ashen)", darkvision=120, _parent=base,
                       entries=base["entries"] + [{"name": "Ash Sight", "entries": ["Invented."]}])
        doc = origins.race_doc(lineage)
        names = [o.get("name") for o in doc["grants"] if o["op"] == "feature"]
        self.assertEqual(names, ["Ash Sight"])
        self.assertFalse(any(o["op"] == "choose" for o in doc["grants"]))
        self.assertEqual(self.grant(doc)["darkvision"], 120)
        self.assertNotIn("speed", self.grant(doc))
        self.assertNotIn("size", doc)


class Feats(unittest.TestCase):
    def feat(self, **kw):
        f = {"name": "Quill Gift", "source": "NEWB", "category": "G", "entries": ["Invented."]}
        f.update(kw)
        return f

    def test_category_prerequisites_are_kept_in_the_text(self):
        doc = origins.feat_doc(self.feat(prerequisite=[{"exclusiveFeatCategory": ["DG"]}]))
        self.assertIn("No other feat of the dark-gift category", doc["prerequisite"])
        self.assertNotIn("_problems", doc)
        doc = origins.feat_doc(self.feat(prerequisite=[{"featCategory": ["O", "DG"]}]))
        self.assertIn("A feat of the origin or dark-gift category", doc["prerequisite"])
        self.assertNotIn("_problems", doc)

    def test_unknown_prerequisite_key_is_a_problem_line(self):
        doc = origins.feat_doc(self.feat(prerequisite=[{"level": 4, "moonPhase": ["full"]}]))
        self.assertIn("Level 4", doc["prerequisite"])
        self.assertIn("prerequisite moonPhase kept in the text only", doc["_problems"])

    def test_feat_doc_category_and_gate(self):
        doc = origins.feat_doc(self.feat(category="O"))
        self.assertEqual(doc["category"], "origin")
        self.assertNotIn("_problems", doc)
        doc = origins.feat_doc(self.feat(prerequisite=[{"level": 4}]))
        self.assertEqual(doc["minLevel"], 4)
        self.assertIsInstance(doc["minLevel"], int)
        self.assertIn("Level 4", doc["prerequisite"])
        doc = origins.feat_doc(self.feat(prerequisite=[{"feature": ["Fighting Style"]}]))
        self.assertIn("Fighting Style", doc["prerequisite"])
        self.assertNotIn("minLevel", doc)
        doc = origins.feat_doc(self.feat(ability=[{"cha": 1}]))
        self.assertEqual(doc["ability"], [{"cha": 1}])
        self.assertEqual(doc["grants"][0]["op"], "feature")
        self.assertIn("Charisma", doc["grants"][0]["text"])
        doc = origins.feat_doc(self.feat(category="QQ"))
        self.assertEqual(doc["category"], "qq")
        self.assertIn("unmapped feat category QQ", doc["_problems"])

    def test_feat_grants(self):
        doc = origins.feat_doc(self.feat(
            skillProficiencies=[{"arcana": True}, {"choose": {"from": ["history", "nature"], "count": 1}}],
            toolProficiencies=[{"smith's tools": True}, {"anyMusicalInstrument": 1}],
            languageProficiencies=[{"draconic": True}, {"any": 1}],
            armorProficiencies=[{"light": True, "shield": True}], weaponProficiencies=[{"martial": True}],
            resist=["cold"], additionalSpells=[{"known": {"_": ["thornflare|newb#c"]}}]))
        self.assertNotIn("_problems", doc)
        self.assertEqual(doc["grants"][0]["op"], "feature")
        grant = next(g for g in doc["grants"] if g["id"] == "grant")
        self.assertEqual(grant["proficiencies"], ["skill:arcana", "Smith's Tools", "Light Armor", "Shields",
                                                  "Martial Weapons"])
        self.assertEqual(grant["languages"], ["Draconic"])
        ops = doc["grants"]
        self.assertTrue(any(o["op"] == "choose" and o["what"] == "skills" and o["from"] == ["history", "nature"]
                            for o in ops))
        self.assertTrue(any(o["op"] == "choose" and o["what"] == "tools" for o in ops))
        self.assertTrue(any(o["op"] == "choose" and o["what"] == "languages" for o in ops))
        self.assertTrue(any(o["op"] == "effect" and o["effects"] == {"resist": ["cold"]} for o in ops))
        self.assertTrue(any(o["op"] == "grant" and o.get("spells") == ["thornflare"] for o in ops))
        self.assertEqual(len({o["id"] for o in ops}), len(ops))

    def test_feat_grants_the_sheet_cannot_express_are_flagged_once(self):
        doc = origins.feat_doc(self.feat(expertise=[{"anyProficientSkill": 1}], senses=[{"blindsight": 10}],
                                         immune=["poison"]))
        self.assertEqual(doc["_problems"], ["feat grants kept in the text only: expertise, immune, senses"])
        doc = origins.feat_doc(self.feat(resist=[{"choose": {"from": ["fire"]}}],
                                         additionalSpells=[{"known": {"3": ["a|x"]}}]))
        self.assertIn("feat grants kept in the text only: chosen resistance, spells above level 1", doc["_problems"])
        self.assertFalse(any(o.get("spells") for o in doc["grants"]))
        self.assertNotIn("_problems", origins.feat_doc(self.feat()))

    def test_hidden_ability_alternatives_stay_in_the_text(self):
        doc = origins.feat_doc(self.feat(ability=[
            {"choose": {"from": ["str", "dex"], "amount": 2}, "hidden": True},
            {"choose": {"from": ["str", "dex"], "count": 2}, "hidden": True}]))
        self.assertNotIn("ability", doc)
        self.assertEqual(len(doc["_problems"]), 1)


class Versions(unittest.TestCase):
    def test_expand_versions_feat(self):
        f = {"name": "Gamma", "source": "NEWB", "category": "O",
             "entries": [{"name": "Pick", "entries": ["old"]}, {"name": "Keep", "entries": ["same"]}],
             "_versions": [{"name": "Gamma; One", "source": "NEWB", "_mod": {"entries": {
                 "mode": "replaceArr", "replace": "Pick", "items": {"name": "Pick", "entries": ["new"]}}}}]}
        out = F.expand_versions(f)
        self.assertEqual([e["name"] for e in out], ["Gamma (One)"])
        self.assertEqual(out[0]["entries"][0], {"name": "Pick", "entries": ["new"]})
        self.assertEqual(out[0]["entries"][1]["name"], "Keep")
        self.assertEqual(out[0]["category"], "O")
        self.assertNotIn("_versions", out[0])
        self.assertEqual(f["entries"][0]["entries"], ["old"])
        self.assertIn("_versions", f)

    def test_expand_versions_adds_the_versions_own_fields(self):
        f = {"name": "Gamma", "source": "NEWB", "darkvision": 60, "entries": [],
             "_versions": [{"name": "Gamma; Two", "source": "NEWB", "darkvision": 120, "_mod": {}}]}
        self.assertEqual(F.expand_versions(f)[0]["darkvision"], 120)

    def test_expand_versions_abstract(self):
        f = {"name": "Drake", "source": "NEWB", "entries": [{"name": "Breath", "entries": ["old"]}], "_versions": [{
            "_abstract": {"name": "Drake ({{color}})", "source": "NEWB", "_mod": {"entries": {
                "mode": "replaceArr", "replace": "Breath",
                "items": {"name": "Breath", "entries": ["{{color}} {{damageType}} breath"]}}}},
            "_implementations": [
                {"_variables": {"color": "Red", "damageType": "Fire"}, "resist": ["fire"]},
                {"_variables": {"color": "Blue", "damageType": "Cold"}, "resist": ["cold"]}]}]}
        out = F.expand_versions(f)
        self.assertEqual([e["name"] for e in out], ["Drake (Red)", "Drake (Blue)"])
        self.assertEqual([e["resist"] for e in out], [["fire"], ["cold"]])
        self.assertEqual(out[1]["entries"][0]["entries"], ["Blue Cold breath"])
        self.assertNotIn("{{", repr(out))
        self.assertNotIn("_variables", out[0])

    def test_expand_versions_records_unhandled_modes(self):
        f = {"name": "Gamma", "source": "NEWB", "entries": [], "_versions": [
            {"name": "Gamma; One", "source": "NEWB", "_mod": {"entries": {"mode": "bogusMode"}}}]}
        problems = []
        out = F.expand_versions(f, problems)
        self.assertEqual(len(problems), 1)
        self.assertIn("bogusMode", problems[0])
        self.assertIn("bogusMode", out[0]["_problems"][0])
        self.assertEqual(F.expand_versions({"name": "X", "source": "NEWB"}), [])


def build(extra):
    tmp = tempfile.TemporaryDirectory()
    clone, out = os.path.join(tmp.name, "clone"), os.path.join(tmp.name, "out")
    minidata.write_clone(clone, extra=extra)
    counts, _ = ft_notes.build(clone, out, [], LIB24)
    return tmp, out, counts


def note(out, path):
    with open(os.path.join(out, "compendium/5e/WotC 2024", path + ".md")) as f:
        return f.read()


def head(text):
    return text.split("---")[1]


class Built(unittest.TestCase):
    def test_build_makes_subraces_and_feat_variants(self):
        tmp, out, counts = build({
            "races.json": lambda d: {"race": [
                dict(minidata.race("Thornfolk", "NEWB"), _versions=[
                    {"name": "Thornfolk; Ashen", "source": "NEWB", "darkvision": 60, "_mod": {}},
                    {"name": "Thornfolk; Briar", "source": "NEWB", "_mod": {}}])], "subrace": []},
            "feats.json": lambda d: {"feat": [
                dict(minidata.feat("Gamma", "NEWB"), category="O", _versions=[
                    {"name": "Gamma; One", "source": "NEWB", "_mod": {}}])]},
            "backgrounds.json": lambda d: {"background": [
                dict(minidata.background("Quill Hermit", "NEWB"), feats=[{"gamma; one|newb": True}],
                     ability=pick(["int", "wis", "cha"], [2, 1], [1, 1, 1]))]}})
        self.addCleanup(tmp.cleanup)
        text = note(out, "Races/Thornfolk/Subraces/Thornfolk (Ashen)")
        self.assertIn('type: "5e-subrace"', text)
        self.assertIn('race: "thornfolk"', text)
        self.assertIn('id: "thornfolk-ashen"', text)
        self.assertTrue(os.path.exists(os.path.join(out, "compendium/5e/WotC 2024/Races/Thornfolk/Subraces/Thornfolk (Briar).md")))
        self.assertEqual(counts["subrace"], 2)
        self.assertEqual(counts["feat"], 2)
        variant = note(out, "Feats/Gamma (One)")
        self.assertIn('id: "gamma-one"', variant)
        self.assertIn('category: "origin"', variant)
        bgnote = note(out, "Backgrounds/Quill Hermit")
        self.assertIn('"feat": "gamma-one"', bgnote)
        self.assertIn("abilityPick:", bgnote)
        self.assertNotIn("needs_review", head(bgnote))

    def test_background_naming_a_missing_feat_is_flagged_not_dangling(self):
        tmp, out, _ = build({"backgrounds.json": lambda d: {"background": [
            dict(minidata.background("Quill Hermit", "NEWB"), feats=[{"nowhere|newb": True}])]}})
        self.addCleanup(tmp.cleanup)
        text = note(out, "Backgrounds/Quill Hermit")
        self.assertNotIn('"feat": "nowhere"', text)
        self.assertIn("feat nowhere is not in this library", head(text))
        page = open(os.path.join(out, "compendium/5e/WotC 2024/Index/Needs Review.md")).read()
        self.assertIn("Quill Hermit", page)

    def test_species_copy_from_outside_is_flagged(self):
        tmp, out, _ = build({"races.json": lambda d: {"race": [
            minidata.race("Oldfolk", "OLDB"),
            {"name": "Newfolk", "source": "NEWB", "page": 4, "_copy": {"name": "Oldfolk", "source": "OLDB"}}],
            "subrace": []}})
        self.addCleanup(tmp.cleanup)
        text = note(out, "Races/Newfolk/Newfolk")
        self.assertIn("inherits from Oldfolk (OLDB), a book outside this library", head(text))
        self.assertIn('size:', head(text))
        self.assertFalse(os.path.exists(os.path.join(out, "compendium/5e/WotC 2024/Races/Oldfolk")))

    def test_unhandled_copy_modification_is_flagged(self):
        tmp, out, _ = build({"feats.json": lambda d: {"feat": [
            minidata.feat("Gamma", "NEWB"),
            {"name": "Delta", "source": "NEWB", "page": 4, "category": "G",
             "_copy": {"name": "Gamma", "source": "NEWB", "_mod": {"entries": {"mode": "bogusMode"}}}}]}})
        self.addCleanup(tmp.cleanup)
        self.assertIn("bogusMode", head(note(out, "Feats/Delta")))

    def test_2014_races_unchanged_by_versions(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        clone, out = os.path.join(tmp.name, "clone"), os.path.join(tmp.name, "out")
        minidata.write_clone(clone, extra={"races.json": lambda d: {"race": [
            dict(minidata.race("Thornfolk", "NEWB"), _versions=[{"name": "Thornfolk; Ashen", "source": "NEWB", "_mod": {}}])],
            "subrace": []}})
        counts, _ = ft_notes.build(clone, out, [], ft_notes.WOTC_2014)
        self.assertEqual(counts.get("subrace", 0), 0)
        self.assertEqual(counts["race"], 1)


if __name__ == "__main__":
    unittest.main()
