"""Task 10: the scripted checks on a built WotC 2024 tree, written against invented trees.

Imports only dndc.verify (stdlib), so the whole module runs under /usr/bin/python3 -m unittest;
the cases that need PyYAML are skipped under the venv.
"""
import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

from dndc import verify as V

try:
    import yaml
except ImportError:
    yaml = None

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = "WotC 2024"
PFX = f"compendium/5e/{LIB}/"


def _spec():
    spec = importlib.util.spec_from_file_location("verify_entry", os.path.join(HERE, "..", "verify.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# the importer's writer format (render.yaml_value), copied so this test needs no fitz
def yv(v, indent=0):
    pad = "  " * indent
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        if not v:
            return "[]"
        return "\n" + "\n".join(f"{pad}  - {json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else yv(x, indent + 1)}" for x in v)
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "\n" + "\n".join(f"{pad}  {k}: {yv(x, indent + 1)}" for k, x in v.items())
    return json.dumps(str(v))


def front(d):
    return "\n".join(["---"] + [f"{k}: {yv(v)}" for k, v in d.items() if v not in (None, [], {})] + ["---"])


def stamp(d, *tags):
    return dict(d, edition="2024", tags=list(tags) + ["5e/edition/2024"])


def op(kind, oid, **kw):
    return {"op": kind, "id": oid, **kw}


ABIL = {"str": 12, "dex": 14, "con": 12, "int": 3, "wis": 11, "cha": 5}


def creature(name, **kw):
    return stamp(dict({"type": "5e-creature", "schema": 1, "id": V.slug(name), "name": name, "source": "NEWB", "ac": 13,
                       "hp": 22, "hp_formula": "4d8 + 4", "abilities": ABIL, "cr": "1", "xp": 200}, **kw), "5e/creature")


NOTES = {
    "Creatures/Quillbeast": creature("Quillbeast"),
    "Creatures/Spinebeast": creature("Spinebeast", needs_review=["copied from a creature outside this library"]),
    "Spells/Thornflare": stamp({"type": "5e-spell", "schema": 1, "id": "thornflare", "name": "Thornflare", "source": "NEWB"}),
    "Items/Ashen Lantern": stamp({"type": "5e-item", "schema": 1, "id": "ashen-lantern", "name": "Ashen Lantern", "source": "NEWB"}),
    "Items/Zorblat Blade": stamp({"type": "5e-item", "schema": 1, "id": "zorblat-blade", "name": "Zorblat Blade", "source": "NEWB",
                                  "weapon": {"dmg": "1d8", "type": "slashing", "mastery": "quill"}}),
    "Items/Glimmer Weapon": stamp({"type": "5e-item", "schema": 1, "id": "glimmer-weapon", "name": "Glimmer Weapon", "source": "NEWB"}),
    "Conditions/Hushed": stamp({"type": "5e-condition", "schema": 1, "id": "hushed", "name": "Hushed", "source": "NEWB"}),
    "Conditions/Dazed": stamp({"type": "5e-condition", "schema": 1, "id": "dazed", "name": "Dazed", "source": "NEWB"}),
    "Conditions/Zedrot": stamp({"type": "5e-condition", "schema": 1, "id": "zedrot", "name": "Zedrot", "source": "NEWB"}),
    "Masteries/Quill": stamp({"type": "5e-mastery", "schema": 1, "id": "quill", "name": "Quill", "source": "NEWB"}),
    "Classes/Zedcaller/Zedcaller": stamp({
        "type": "5e-class", "schema": 1, "id": "zedcaller", "name": "Zedcaller", "source": "NEWB", "hitDie": 8,
        "saves": ["con", "int"], "subclassLevel": 3,
        "levels": {"1": [op("feature", "quill-strike", name="Quill Strike", text="Invented."),
                         op("scale", "scale-surge", name="Surge", values={"1": "d6", "5": "2d6"}),
                         op("scale", "scale-rank", name="Rank", values={"1": 1, "5": 2}),
                         op("resource", "res-pulses", name="Pulses", max="2 + floor(level / 4)", reset="long")],
                   "3": [op("subclass", "subclass")],
                   "5": [op("feature", "mending", name="Mending", text="Invented."),
                         op("modify", "more-pulses", resource="Pulses", set="max(1, scale_rank + cha)")]}}, "5e/class"),
    "Classes/Zedcaller/Subclasses/Ashen Zed": stamp({
        "type": "5e-subclass", "schema": 1, "id": "ashen-zed", "name": "Ashen Zed", "source": "NEWB", "class": "zedcaller",
        "levels": {"3": [op("feature", "ash", name="Ash", text="Invented.")]}}, "5e/subclass"),
    "Races/Thornfolk/Thornfolk": stamp({"type": "5e-race", "schema": 1, "id": "thornfolk", "name": "Thornfolk", "source": "NEWB"}),
    "Races/Thornfolk/Subraces/Thornfolk (Red)": stamp({"type": "5e-subrace", "schema": 1, "id": "thornfolk-red", "name": "Thornfolk (Red)", "source": "NEWB", "race": "thornfolk"}),
    "Races/Thornfolk/Subraces/Thornfolk (Drake A)": stamp({"type": "5e-subrace", "schema": 1, "id": "thornfolk-drake-a", "name": "Thornfolk (Drake A)", "source": "NEWB", "race": "thornfolk"}),
    "Races/Thornfolk/Subraces/Thornfolk (Drake B)": stamp({"type": "5e-subrace", "schema": 1, "id": "thornfolk-drake-b", "name": "Thornfolk (Drake B)", "source": "NEWB", "race": "thornfolk"}),
    "Feats/Quill Knack": stamp({"type": "5e-feat", "schema": 1, "id": "quill-knack", "name": "Quill Knack", "source": "NEWB",
                                "category": "origin", "replaces": ["old-knack"]}),
    "Feats/Quill Knack (Gamma)": stamp({"type": "5e-feat", "schema": 1, "id": "quill-knack-gamma", "name": "Quill Knack (Gamma)", "source": "NEWB", "category": "origin"}),
    "Backgrounds/Quill Hermit": stamp({
        "type": "5e-background", "schema": 1, "id": "quill-hermit", "name": "Quill Hermit", "source": "NEWB",
        "abilityPick": {"from": ["int", "wis", "cha"], "patterns": [[2, 1], [1, 1, 1]]},
        "grants": [op("grant", "grant", proficiencies=["Arcana"]), op("feat", "quill-knack", feat="quill-knack")]}),
    "Books/New Invented Book/New Invented Book": {"book": "New Invented Book", "source": "NEWB", "edition": "2024",
                                                  "tags": ["5e/book", "5e/edition/2024"]},
    "Books/New Invented Book/00 First Chapter": {"book": "New Invented Book", "source": "NEWB", "edition": "2024",
                                                 "tags": ["5e/book", "5e/edition/2024"]},
    "Books/New Invented Book/01 Second Chapter": {"book": "New Invented Book", "source": "NEWB", "edition": "2024",
                                                  "tags": ["5e/book", "5e/edition/2024"]},
    "Books/New Invented Tale/New Invented Tale": {"book": "New Invented Tale", "source": "NEWA", "edition": "2024",
                                                  "tags": ["5e/book", "5e/edition/2024"]},
    "Books/New Invented Tale/00 Opening": {"book": "New Invented Tale", "source": "NEWA", "edition": "2024",
                                           "tags": ["5e/book", "5e/edition/2024"]},
    "Index/Needs Review": {"edition": "2024", "tags": ["5e/edition/2024"]},
    "5e Library": {"type": "5e-library", "schema": 1, "generated": True, "edition": "2024", "tags": ["5e/edition/2024"]},
}
BODIES = {
    "Books/New Invented Book/00 First Chapter": f"# First\n\nSee [[{PFX}Creatures/Quillbeast|Quillbeast]] and ![[{PFX}Items/Ashen Lantern]]"
                                                f" and [[{PFX}Spells/Thornflare#Text|a spell]] and a table [[{PFX}Spells/Thornflare\\|spell]] and [[#Here]].\n",
    "Index/Needs Review": f"# Needs Review\n\nIntro.\n\n- [[{PFX}Creatures/Spinebeast|Spinebeast]] (NEWB p. 7): copied from a creature outside this library\n",
    "5e Library": f"# 5e Library\n\n- [[{PFX}Index/Needs Review|Needs Review]] (1)\n",
}


def mon(name, source, **kw):
    return dict({"name": name, "source": source, "hp": {"average": 22, "formula": "4d8 + 4"}, "ac": [13]}, **kw)


DATA = {
    "books.json": {"book": [{"id": "NEWB", "name": "New Invented Book"}, {"id": "OFFB", "name": "Off"}, {"id": "OLDB", "name": "Old"}]},
    "adventures.json": {"adventure": [{"id": "NEWA", "name": "New Invented Tale"}]},
    "book/book-newb.json": {"bookData": [{"id": "NEWB", "data": [{"name": "First Chapter"}, {"name": "Second Chapter"}]}]},
    "book/book-offb.json": {"bookData": [{"id": "OFFB", "data": [{"name": "Not Yet"}]}]},
    "adventure/adventure-newa.json": {"adventureData": [{"id": "NEWA", "data": [{"name": "Opening"}]}]},
    "bestiary/bestiary-newb.json": {"monster": [
        mon("Quillbeast", "NEWB"),
        {"name": "Spinebeast", "source": "NEWB", "_copy": {"name": "Gravelquill", "source": "OLDB"}},
        {"name": "Ghostquill", "source": "NEWB"},
        mon("Dustquill", "OFFB"), mon("Gravelquill", "OLDB")]},
    "spells/spells-newb.json": {"spell": [{"name": "Thornflare", "source": "NEWB"}, {"name": "Oldflare", "source": "OLDB"}]},
    "items.json": {"item": [{"name": "Ashen Lantern", "source": "NEWB"}, {"name": "Twin Lantern", "source": "NEWB", "_copy": {"name": "x"}},
                            {"name": "Old Lantern", "source": "OLDB"}]},
    "items-base.json": {"baseitem": [{"name": "Zorblat Blade", "source": "NEWB", "mastery": ["Quill|NEWB"]},
                                     {"name": "Gravel Dagger", "source": "OLDB", "mastery": ["Quill|NEWB"]}],
                        "itemMastery": [{"name": "Quill", "source": "NEWB"}, {"name": "Oldquill", "source": "OLDB"}]},
    "magicvariants.json": {"magicvariant": [{"name": "Glimmer Weapon", "inherits": {"source": "NEWB"}},
                                            {"name": "Fade Weapon", "inherits": {"source": "OLDB"}}]},
    "conditionsdiseases.json": {"condition": [{"name": "Hushed", "source": "NEWB"}, {"name": "Oldmute", "source": "OLDB"}],
                                "status": [{"name": "Dazed", "source": "NEWB"}], "disease": [{"name": "Zedrot", "source": "NEWB"}]},
    "class/class-zed.json": {
        "class": [{"name": "Zedcaller", "source": "NEWB",
                   "classFeatures": ["Quill Strike|Zedcaller|NEWB|1", {"classFeature": "Gate|Zedcaller|NEWB|3", "gainSubclassFeature": True},
                                     "Mending|Zedcaller|NEWB|5"]},
                  {"name": "Oldzed", "source": "OLDB"}],
        "subclass": [{"name": "Ashen Zed", "source": "NEWB", "className": "Zedcaller", "classSource": "NEWB"},
                     {"name": "Stray Zed", "source": "NEWB", "className": "Oldzed", "classSource": "OLDB"},
                     {"name": "Copy Zed", "source": "NEWB", "className": "Zedcaller", "classSource": "NEWB", "_copy": {"name": "x"}}]},
    "races.json": {"race": [
        {"name": "Thornfolk", "source": "NEWB", "_versions": [
            {"name": "Thornfolk; Red", "source": "NEWB", "_mod": {}},
            {"_abstract": {"name": "Drake ({{c}})"}, "_implementations": [{"_variables": {"c": "A"}}, {"_variables": {"c": "B"}}]}]},
        {"name": "Oldfolk", "source": "OLDB", "_versions": [{"name": "Oldfolk; X", "_mod": {}}]}], "subrace": []},
    "feats.json": {"feat": [{"name": "Quill Knack", "source": "NEWB", "_versions": [{"name": "Quill Knack; Gamma", "_mod": {}}]},
                            {"name": "Old Knack", "source": "OLDB"}]},
    "backgrounds.json": {"background": [{"name": "Quill Hermit", "source": "NEWB"}, {"name": "Old Hermit", "source": "OLDB"}]},
}
SOURCES = {"edition": "2024", "sources": [
    {"id": "NEWB", "kind": "book", "published": "2024-10-01", "enabled": True},
    {"id": "NEWA", "kind": "adventure", "published": "2025-01-01", "enabled": True},
    {"id": "OFFB", "kind": "book", "published": "2026-11-17", "enabled": False}]}
LEGACY = {"Feats/Old Knack": {"type": "5e-feat", "id": "old-knack"}, "Spells/Oldflare": {"type": "5e-spell", "id": "oldflare"}}


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


class Case(unittest.TestCase):
    """A complete, passing tree under self.out, its data clone, sources file and legacy folder."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = tmp.name
        self.out, self.data = os.path.join(root, "out"), os.path.join(root, "clone")
        self.src = os.path.join(root, "sources.json")
        self.legacy = os.path.join(self.out, "compendium", "5e", "WotC")
        self.fm = {rel: json.loads(json.dumps(d)) for rel, d in NOTES.items()}
        self.body = dict(BODIES)
        self.rawtext = {}
        for rel, d in DATA.items():
            write(os.path.join(self.data, "data", rel), json.dumps(d))
        write(self.src, json.dumps(SOURCES))
        for rel, d in LEGACY.items():
            write(os.path.join(self.legacy, rel + ".md"), front(d) + "\n\n# x\n")
        self.flush()

    def flush(self):
        shutil.rmtree(os.path.join(self.out, "compendium", "5e", LIB), ignore_errors=True)
        for rel, d in self.fm.items():
            write(os.path.join(self.out, "compendium", "5e", LIB, rel + ".md"), front(d) + "\n\n" + self.body.get(rel, "# x\n"))
        for rel, text in self.rawtext.items():
            write(os.path.join(self.out, "compendium", "5e", LIB, rel + ".md"), text)

    def tree(self):
        self.flush()
        return V.Tree(self.out, LIB)

    def raw(self, rel, text):
        """Replace a note's file with exact text (for faults the writer would not make)."""
        self.rawtext[rel] = text


class Reader(Case):
    def test_reads_the_writers_format(self):
        n = self.tree().page("Classes/Zedcaller/Zedcaller.md")
        self.assertIsNone(n.err)
        self.assertEqual(n.get("subclassLevel"), 3)
        self.assertEqual(n.get("levels")["1"][1]["values"], {"1": "d6", "5": "2d6"})
        self.assertEqual(n.get("tags"), ["5e/class", "5e/edition/2024"])
        self.assertEqual(self.tree().page("Backgrounds/Quill Hermit.md").get("abilityPick")["patterns"], [[2, 1], [1, 1, 1]])

    def test_no_front_matter(self):
        self.raw("Spells/Thornflare", "# bare\n")
        self.assertEqual(self.tree().page("Spells/Thornflare.md").err, "no front matter")

    @unittest.skipUnless(yaml, "PyYAML only exists in system python")
    def test_reader_agrees_with_yaml(self):
        for n in self.tree().notes:
            want = yaml.safe_load("\n".join(V.front_lines(n.text)))
            norm = lambda x: {str(k): norm(v) for k, v in x.items()} if isinstance(x, dict) else \
                [norm(v) for v in x] if isinstance(x, list) else x
            self.assertEqual(n.fm, norm(want), n.path)


class Counts(Case):
    def test_expected_counts_from_raw_data(self):
        got = V.expected_counts(self.data, self.src)
        self.assertEqual(got, {
            "5e-creature": 2, "5e-spell": 1, "5e-item": 3, "5e-condition": 3, "5e-class": 1, "5e-subclass": 1,
            "5e-race": 1, "5e-subrace": 3, "5e-feat": 2, "5e-background": 1, "5e-mastery": 1,
            "book-chapter": 3, "book-index": 2})

    def test_pass(self):
        self.assertEqual(V.check_counts(self.tree(), self.data, self.src), [])
        table = V.count_table(self.tree(), self.data, self.src)
        self.assertIn(("5e-creature", 2, 2), table)

    def test_off_by_one(self):
        self.fm["Spells/Emberthorn"] = stamp({"type": "5e-spell", "schema": 1, "id": "emberthorn", "name": "Emberthorn", "source": "NEWB"})
        out = V.check_counts(self.tree(), self.data, self.src)
        self.assertEqual(out, ["5e-spell: expected 1, found 2"])

    def test_missing_chapter_and_unknown_type(self):
        del self.fm["Books/New Invented Book/01 Second Chapter"]
        self.fm["Spells/Odd"] = stamp({"type": "5e-spellx", "id": "odd"})
        out = V.check_counts(self.tree(), self.data, self.src)
        self.assertIn("book-chapter: expected 3, found 2", out)
        self.assertIn("5e-spellx: expected 0, found 1", out)

    def test_copy_without_stats_is_not_counted(self):
        d = json.loads(json.dumps(DATA["bestiary/bestiary-newb.json"]))
        d["monster"][1]["_copy"]["name"] = "Nobody"
        write(os.path.join(self.data, "data", "bestiary/bestiary-newb.json"), json.dumps(d))
        self.assertEqual(V.expected_counts(self.data, self.src)["5e-creature"], 1)


class Classes(Case):
    def test_pass(self):
        self.assertEqual(V.check_classes(self.tree(), self.data), [])

    def test_missing_level_key(self):
        del self.fm["Classes/Zedcaller/Zedcaller"]["levels"]["5"]
        self.assertEqual(V.check_classes(self.tree(), self.data), [
            f"{PFX}Classes/Zedcaller/Zedcaller: no levels entry for level 5"])

    def test_missing_fields(self):
        c = self.fm["Classes/Zedcaller/Zedcaller"]
        del c["hitDie"], c["saves"]
        c["subclassLevel"] = "3"
        out = V.check_classes(self.tree(), self.data)
        self.assertEqual(len(out), 3)

    def test_subclass_without_ops_or_class(self):
        s = self.fm["Classes/Zedcaller/Subclasses/Ashen Zed"]
        s["levels"] = {"3": []}
        s["class"] = "nope"
        out = V.check_classes(self.tree(), self.data)
        self.assertEqual(len(out), 2)


class Formulas(Case):
    def test_pass(self):
        self.assertEqual(V.check_scales_and_formulas(self.tree()), [])

    def test_unknown_name_in_formula(self):
        self.fm["Classes/Zedcaller/Zedcaller"]["levels"]["1"][3]["max"] = "1+x"
        out = V.check_scales_and_formulas(self.tree())
        self.assertEqual(len(out), 1)
        self.assertIn("unknown name x", out[0])

    def test_scale_value_types(self):
        sc = self.fm["Classes/Zedcaller/Zedcaller"]["levels"]["1"][1]
        sc["values"] = {"1": "d6", "2": "tall", "3": 2.5, "4": True}
        self.assertEqual(len(V.check_scales_and_formulas(self.tree())), 3)

    def test_modify_and_scale_formula(self):
        ops = self.fm["Classes/Zedcaller/Zedcaller"]["levels"]["5"]
        ops[1]["set"] = "floor(level / 2"
        ops.append(op("scale", "scale-calc", name="Calc", formula="scale_other + 1"))
        out = V.check_scales_and_formulas(self.tree())
        self.assertEqual(len(out), 2)

    def test_formula_grammar(self):
        ok = {"prof", "level", "total", *V.ABILS, "scale_a"}
        for f in ("5 * level", "max(1, cha)", "1 + min(1, floor(level / 17))", "-wis + scale_a", 3, 0.5, "(1+2)*3"):
            self.assertIsNone(V.formula_problem(f, ok), f)
        self.assertIsNotNone(V.formula_problem("unlimited", ok))
        self.assertIsNone(V.formula_problem("unlimited", ok, unlimited=True))
        for f in ("", "1+", "x", "floor(1, 2)", "floor()", "round(1)", "level level", "1 % 2", "Level", True, None, "a" * 201):
            self.assertIsNotNone(V.formula_problem(f, ok), f)


class Backgrounds(Case):
    def test_pass(self):
        self.assertEqual(V.check_backgrounds(self.tree()), [])
        self.assertEqual(V.backgrounds_without_feat(self.tree()), [])

    def test_without_ability_pick(self):
        del self.fm["Backgrounds/Quill Hermit"]["abilityPick"]
        self.assertEqual(len(V.check_backgrounds(self.tree())), 1)
        self.fm["Backgrounds/Quill Hermit"]["abilityPick"] = {"from": ["int"], "patterns": []}
        self.assertEqual(len(V.check_backgrounds(self.tree())), 1)

    def test_without_feat_unless_flagged(self):
        b = self.fm["Backgrounds/Quill Hermit"]
        b["grants"] = [b["grants"][0]]
        self.assertEqual(len(V.check_backgrounds(self.tree())), 1)
        b["needs_review"] = ["grants no feat"]
        self.assertEqual(V.check_backgrounds(self.tree()), [])
        self.assertEqual(V.backgrounds_without_feat(self.tree()), [f"{PFX}Backgrounds/Quill Hermit"])


    def test_feat_outside_the_library_is_accepted_when_flagged(self):
        b = self.fm["Backgrounds/Quill Hermit"]
        b["grants"] = [b["grants"][0]]
        b["needs_review"] = ["feat zed-gift is not in this library"]
        self.assertEqual(V.check_backgrounds(self.tree()), [])
        self.assertEqual(V.backgrounds_without_feat(self.tree()), [f"{PFX}Backgrounds/Quill Hermit"])
        b["needs_review"] = ["something else"]
        self.assertEqual(len(V.check_backgrounds(self.tree())), 1)


class Mastery(Case):
    def test_pass(self):
        self.assertEqual(V.check_mastery(self.tree(), self.data, self.src), [])

    def test_weapon_without_mastery(self):
        del self.fm["Items/Zorblat Blade"]["weapon"]["mastery"]
        out = V.check_mastery(self.tree(), self.data, self.src)
        self.assertEqual(out, ["Zorblat Blade (NEWB): weapon.mastery is not 'quill'"])

    def test_mastery_note_missing(self):
        del self.fm["Masteries/Quill"]
        out = V.check_mastery(self.tree(), self.data, self.src)
        self.assertEqual(out, ["Zorblat Blade (NEWB): mastery 'quill' has no note under Masteries/"])

    def test_item_note_missing(self):
        del self.fm["Items/Zorblat Blade"]
        self.assertEqual(V.check_mastery(self.tree(), self.data, self.src), ["Zorblat Blade (NEWB): no item note"])


class Links(Case):
    def test_pass(self):
        self.assertEqual(V.check_links(self.tree()), [])

    def test_link_into_the_2014_library(self):
        self.body["Spells/Thornflare"] = "See [[compendium/5e/WotC/Spells/Thornflare|x]].\n"
        out = V.check_links(self.tree())
        self.assertEqual(len(out), 1)
        self.assertIn("leaves", out[0])

    def test_dangling_and_embed(self):
        self.body["Spells/Thornflare"] = f"[[{PFX}Spells/Nowhere]] ![[{PFX}Items/Nowhere|pic]]\n"
        self.assertEqual(len(V.check_links(self.tree())), 2)

    def test_broken_link_is_one_line_and_does_not_swallow_the_next(self):
        self.body["Spells/Thornflare"] = (f"first [[{PFX}Spells/Nowhere]] ok\nsecond [[{PFX}Spells/Thornflare]]\n"
                                          f"third [[{PFX}Spells/Gone]]\n")
        out = V.check_links(self.tree())
        self.assertEqual(len(out), 2, out)
        self.assertTrue(all("\n" not in x for x in out))

    def test_lone_bracket_inside_a_link_is_still_checked(self):
        self.body["Spells/Thornflare"] = f"[[{PFX}Spells/No]where]] and [[{PFX}Items/Nowhere]]\n"
        out = V.check_links(self.tree())
        self.assertEqual(len(out), 2, out)

    def test_unclosed_link_reports_its_line(self):
        self.body["Spells/Thornflare"] = f"fine\nbroken [[{PFX}Spells/Thornflare\nnext line ]] here\n"
        out = V.check_links(self.tree())
        self.assertEqual(len(out), 1, out)
        self.assertIn("unclosed [[ at line", out[0])

    def test_link_target_parsing(self):
        self.assertEqual(V.link_target("a/b#c|d"), "a/b")
        self.assertEqual(V.link_target("a/b\\|d"), "a/b")
        self.assertEqual(V.link_target("a/b^id"), "a/b")
        self.assertEqual(V.link_target("#h"), "")


class Replaces(Case):
    def test_pass(self):
        self.assertEqual(V.check_replaces(self.tree(), self.legacy), [])

    def test_empty_unknown_duplicate_and_wrong_type(self):
        self.fm["Feats/Quill Knack"]["replaces"] = ["", "nope", "old-knack", "old-knack"]
        self.fm["Spells/Thornflare"]["replaces"] = ["old-knack"]
        out = V.check_replaces(self.tree(), self.legacy)
        self.assertEqual(len(out), 4, out)

    def test_replaces_must_be_a_list(self):
        self.fm["Feats/Quill Knack"]["replaces"] = "old-knack"
        self.assertEqual(len(V.check_replaces(self.tree(), self.legacy)), 1)


@unittest.skipUnless(yaml, "PyYAML only exists in system python")
class Yaml(Case):
    def test_pass(self):
        self.assertEqual(V.check_yaml(self.tree()), [])

    def test_tab_in_front_matter(self):
        self.raw("Spells/Thornflare", '---\ntype: "5e-spell"\nid: "thornflare"\nedition: "2024"\ntags:\n\t- "5e/edition/2024"\n---\n\n# x\n')
        out = V.check_yaml(self.tree())
        self.assertEqual(len(out), 1)
        self.assertIn("does not parse", out[0])

    def test_edition_tags_type_and_ids(self):
        self.raw("Spells/Thornflare", '---\ntype: "5e-spell"\nid: "thornflare"\nedition: 2024\ntags:\n  - "5e/spell"\n---\n')
        self.fm["Spells/Dup"] = stamp({"type": "5e-spell", "id": "oldflare2", "name": "D"})
        self.fm["Spells/Dup2"] = stamp({"type": "5e-spell", "id": "oldflare2", "name": "D"})
        self.fm["Spells/Odd"] = stamp({"type": "5e-widget", "id": "w"})
        self.raw("Items/Bare", "# bare\n")
        out = V.check_yaml(self.tree())
        text = "\n".join(out)
        self.assertIn("edition is 2024, not the text", text)
        self.assertIn("tags lack", text)
        self.assertIn("also used by", text)
        self.assertIn("unknown type '5e-widget'", text)
        self.assertEqual(len([x for x in out if "no front matter" in x]), 1)

    def test_known_types_cover_the_writers(self):
        for t in ("creature", "spell", "item", "condition", "class", "subclass", "race", "subrace", "feat", "background", "mastery"):
            self.assertIn("5e-" + t, V.KNOWN_TYPES)


class VerifyLibraryNote(Case):
    def test_pass(self):
        self.assertEqual(V.check_library_note(self.tree()), [])
        self.assertIn("library_note", V.CHECKS)

    def test_missing_type_fails(self):
        self.fm["5e Library"] = {"edition": "2024", "tags": ["5e/edition/2024"]}
        out = V.check_library_note(self.tree())
        self.assertEqual(len(out), 1)
        self.assertIn("5e-library", out[0])

    def test_missing_note_fails(self):
        del self.fm["5e Library"]
        self.assertEqual(len(V.check_library_note(self.tree())), 1)

    def test_yaml_check_accepts_the_note(self):
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("PyYAML only exists in system python")
        self.assertEqual(V.check_yaml(self.tree()), [])



class Arithmetic(Case):
    def test_pass(self):
        self.assertEqual(V.check_arithmetic_flagged(self.tree()), [])

    def test_formula_average(self):
        self.assertEqual(V.formula_average("5d8 + 5"), 27)
        self.assertEqual(V.formula_average("4d8+4"), 22)
        self.assertEqual(V.formula_average("2d6 - 1"), 6)
        self.assertEqual(V.formula_average("1d4 + 2d6"), 9)    # floor(2.5 + 7) = 9
        self.assertIsNone(V.formula_average("lots"))

    def test_unflagged_failures(self):
        c = self.fm["Creatures/Quillbeast"]
        c["hp"], c["xp"] = 30, 100
        c["abilities"] = dict(ABIL, dex=None)
        out = V.check_arithmetic_flagged(self.tree())
        self.assertEqual(len(out), 3, out)

    def test_flagged_failures_pass(self):
        c = self.fm["Creatures/Quillbeast"]
        c["hp"], c["xp"] = 30, 100
        c["abilities"] = dict(ABIL, dex=None)
        c["needs_review"] = ["hit points 30 do not match 4d8 + 4", "XP 100 does not match CR 1", "missing ability score"]
        self.assertEqual(V.check_arithmetic_flagged(self.tree()), [])

    def test_a_different_flag_does_not_cover(self):
        c = self.fm["Creatures/Quillbeast"]
        c["hp"] = 30
        c["needs_review"] = ["copied from a creature outside this library"]
        self.assertEqual(len(V.check_arithmetic_flagged(self.tree())), 1)

    def test_cr_zero_and_unknown_cr(self):
        c = self.fm["Creatures/Quillbeast"]
        c["cr"], c["xp"] = "0", 0
        self.assertEqual(V.check_arithmetic_flagged(self.tree()), [])
        c["cr"], c["xp"] = "None", 0
        self.assertEqual(V.check_arithmetic_flagged(self.tree()), [])
        c["cr"], c["xp"] = "0", 15
        self.assertEqual(len(V.check_arithmetic_flagged(self.tree())), 1)


class ReviewPage(Case):
    def test_pass(self):
        self.assertEqual(V.check_review_page(self.tree()), [])

    def test_flagged_note_missing_from_page(self):
        self.fm["Creatures/Quillbeast"]["needs_review"] = ["x"]
        out = V.check_review_page(self.tree())
        self.assertTrue(any("Quillbeast" in x and "not on Index/Needs Review" in x for x in out))
        self.assertTrue(any("lists 1 notes, 2 notes" in x for x in out))

    def test_listed_path_must_exist(self):
        self.body["Index/Needs Review"] += f"- [[{PFX}Creatures/Ghost|Ghost]] (NEWB): x\n"
        out = V.check_review_page(self.tree())
        self.assertTrue(any("Ghost" in x and "no note" in x for x in out), out)

    def test_page_lists_a_note_that_is_not_flagged(self):
        del self.fm["Creatures/Spinebeast"]["needs_review"]
        out = V.check_review_page(self.tree())
        self.assertTrue(any("lists 1 notes, 0 notes" in x for x in out))

    def test_library_page_count(self):
        self.body["5e Library"] = f"- [[{PFX}Index/Needs Review|Needs Review]] (4)\n"
        out = V.check_review_page(self.tree())
        self.assertEqual(len(out), 1)

    def test_unlinked_lines_are_counted_in_the_library_page_only(self):
        self.body["Index/Needs Review"] += "- Twin Lantern (NEWB p. 9): item Twin Lantern (NEWB) copies another item\n"
        self.body["5e Library"] = f"- [[{PFX}Index/Needs Review|Needs Review]] (2)\n"
        self.assertEqual(V.check_review_page(self.tree()), [])
        self.assertEqual(V.review_lines_without_note(self.tree()),
                         ["- Twin Lantern (NEWB p. 9): item Twin Lantern (NEWB) copies another item"])
        self.body["5e Library"] = f"- [[{PFX}Index/Needs Review|Needs Review]] (1)\n"
        self.assertEqual(len(V.check_review_page(self.tree())), 1)

    def test_no_page(self):
        del self.fm["Index/Needs Review"]
        self.assertEqual(V.check_review_page(self.tree()), ["Index/Needs Review.md does not exist"])


class Cli(Case):
    def args(self):
        self.report = os.path.join(self.out, "..", "verify", "report.json")
        return ["2024", "--out", self.out, "--data", self.data, "--sources", self.src, "--legacy", self.legacy,
                "--report", self.report]

    def run_cli(self, argv):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = _spec().main(argv)
        return code, buf.getvalue()

    @unittest.skipUnless(yaml, "PyYAML only exists in system python")
    def test_pass_tree_exits_zero_and_writes_the_report(self):
        self.flush()
        code, text = self.run_cli(self.args())
        self.assertEqual(code, 0, text)
        for name in V.CHECKS:
            self.assertIn("PASS " + name, text)
        self.assertIn("type expected actual", text)
        with open(self.report) as f:
            rep = json.load(f)
        self.assertEqual(rep["checks"]["counts"], {"passed": True, "failures": []})
        self.assertIn({"type": "5e-spell", "expected": 1, "actual": 1}, rep["counts"])

    @unittest.skipUnless(yaml, "PyYAML only exists in system python")
    def test_fault_exits_one(self):
        self.fm["Spells/Emberthorn"] = stamp({"type": "5e-spell", "schema": 1, "id": "emberthorn", "name": "E", "source": "NEWB"})
        self.flush()
        code, text = self.run_cli(self.args())
        self.assertEqual(code, 1)
        self.assertIn("FAIL counts: 1", text)
        self.assertIn("PASS links", text)
        with open(self.report) as f:
            self.assertFalse(json.load(f)["checks"]["counts"]["passed"])

    def test_without_pyyaml_says_which_python(self):
        self.flush()
        with mock.patch.dict(sys.modules, {"yaml": None}):
            code, text = self.run_cli(self.args())
        self.assertEqual(code, 2)
        self.assertIn("/usr/bin/python3", text)


if __name__ == "__main__":
    unittest.main()
