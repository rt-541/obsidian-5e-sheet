"""An invented, loader-complete 5e.tools-shaped clone for tests. No real entries: names and numbers are made up."""
import copy
import json
import os


def creature(name, source, **kw):
    m = {"name": name, "source": source, "page": 7, "size": ["M"], "type": "beast", "alignment": ["U"],
         "ac": [13], "hp": {"average": 22, "formula": "4d8 + 4"}, "speed": {"walk": 30},
         "str": 12, "dex": 14, "con": 12, "int": 3, "wis": 11, "cha": 5, "passive": 10,
         "cr": "1", "action": [{"name": "Quill", "entries": ["The beast flicks a quill."]}]}
    m.update(kw)
    return m


def spell(name, source):
    return {"name": name, "source": source, "page": 3, "level": 1, "school": "V",
            "time": [{"number": 1, "unit": "action"}], "range": {"type": "point", "distance": {"type": "feet", "amount": 60}},
            "components": {"v": True, "s": True}, "duration": [{"type": "instant"}],
            "entries": ["A small invented glow."]}


def item(name, source):
    return {"name": name, "source": source, "page": 9, "type": "G", "rarity": "none", "weight": 1,
            "entries": ["An invented lantern."]}


def baseitem(name, source):
    return {"name": name, "source": source, "page": 13, "type": "M", "weaponCategory": "simple", "dmg1": "1d4",
            "dmgType": "P", "weight": 2, "rarity": "none"}


def variant(name, source):
    return {"name": name, "type": "GV", "requires": [{"weapon": True}],
            "inherits": {"source": source, "page": 14, "rarity": "uncommon", "bonusWeapon": "+1",
                         "entries": ["An invented glimmer lives in this weapon."]}}


def condition(name, source):
    return {"name": name, "source": source, "page": 2, "entries": ["An invented state of being."]}


def klass(name, source):
    return {"name": name, "source": source, "page": 5, "hd": {"number": 1, "faces": 8}, "proficiency": ["con", "int"],
            "startingProficiencies": {"armor": ["light"], "weapons": ["simple"], "skills": [{"choose": {"from": ["arcana"], "count": 1}}]},
            "classTableGroups": [], "classFeatures": [], "subclassTitle": "Path"}


def subclass(name, source, cls, cls_source):
    return {"name": name, "shortName": name, "source": source, "className": cls, "classSource": cls_source,
            "page": 6, "subclassFeatures": []}


def race(name, source):
    return {"name": name, "source": source, "page": 4, "size": ["M"], "speed": 30, "entries": [{"name": "Trait", "entries": ["Invented."]}]}


def feat(name, source):
    return {"name": name, "source": source, "page": 8, "entries": ["An invented knack."]}


def background(name, source):
    return {"name": name, "source": source, "page": 10, "skillProficiencies": [{"arcana": True}],
            "entries": [{"name": "Feature: Odd Favor", "entries": ["Invented."]}]}


def optional(name, source):
    return {"name": name, "source": source, "page": 11, "featureType": ["EI"], "entries": ["Invented."]}


def files():
    gone = creature("Gravelquill", "OLDB")
    return {
        "books.json": {"book": [
            {"name": "New Invented Book", "id": "NEWB", "source": "NEWB", "published": "2024-10-01", "contents": []},
            {"name": "Off Invented Book", "id": "OFFB", "source": "OFFB", "published": "2026-11-17", "contents": []},
            {"name": "Old Invented Book", "id": "OLDB", "source": "OLDB", "published": "2014-05-01", "contents": []}]},
        "adventures.json": {"adventure": [
            {"name": "New Invented Tale", "id": "NEWA", "source": "NEWA", "published": "2025-01-01", "contents": []}]},
        "bestiary/bestiary-newb.json": {"monster": [
            creature("Quillbeast", "NEWB", action=[{"name": "Glow", "entries": [
                "It casts {@spell Thornflare|NEWB} or {@spell Oldflare|OLDB}."]}]),
            creature("Spinebeast", "NEWB", _copy={"name": "Gravelquill", "source": "OLDB"}) | {"page": 12},
            creature("Dustquill", "OFFB"), gone]},
        "bestiary/fluff-bestiary-newb.json": {"monsterFluff": []},
        "bestiary/legendarygroups.json": {"legendaryGroup": []},
        "bestiary/template.json": {"monsterTemplate": []},
        "spells/spells-newb.json": {"spell": [spell("Thornflare", "NEWB"), spell("Emberthorn", "OFFB"), spell("Oldflare", "OLDB")]},
        "generated/gendata-spell-source-lookup.json": {},
        "items.json": {"item": [item("Ashen Lantern", "NEWB"), item("Cinder Lantern", "OFFB"), item("Old Lantern", "OLDB")]},
        "items-base.json": {"baseitem": [baseitem("Quill Dagger", "NEWB"), baseitem("Gravel Dagger", "OLDB")]},
        "magicvariants.json": {"magicvariant": [variant("Glimmer Weapon", "NEWB"), variant("Fade Weapon", "OLDB")]},
        "conditionsdiseases.json": {"disease": [condition("Zedrot", "NEWB"), condition("Oldrot", "OLDB")],
                                    "condition": [condition("Hushed", "NEWB"), condition("Dimmed", "OFFB"),
                                                  condition("Oldmute", "OLDB")]},
        "class/class-zed.json": {
            "class": [klass("Zedcaller", "NEWB"), klass("Voidzed", "OFFB"), klass("Oldzed", "OLDB")],
            "subclass": [subclass("Ashen Zed", "NEWB", "Zedcaller", "NEWB"), subclass("Stray Zed", "NEWB", "Oldzed", "OLDB")],
            "classFeature": [], "subclassFeature": []},
        "races.json": {"race": [race("Thornfolk", "NEWB"), race("Ashfolk", "OFFB"), race("Oldfolk", "OLDB")], "subrace": []},
        "feats.json": {"feat": [feat("Quill Knack", "NEWB"), feat("Ember Knack", "OFFB"), feat("Old Knack", "OLDB")]},
        "backgrounds.json": {"background": [background("Quill Hermit", "NEWB"), background("Ember Hermit", "OFFB"),
                                            background("Old Hermit", "OLDB")]},
        "optionalfeatures.json": {"optionalfeature": [optional("Zed Trick", "NEWB"), optional("Old Trick", "OLDB")]},
        "book/book-newb.json": {"bookData": [{"id": "NEWB", "source": "NEWB", "data": [
            {"name": "First Chapter", "entries": ["Invented text with {@creature quillbeast|NEWB}."]}]}]},
        "adventure/adventure-newa.json": {"adventureData": [{"id": "NEWA", "source": "NEWA", "data": [
            {"name": "Opening", "entries": ["Invented opening."]}]}]},
    }


def write_clone(root, *, extra=None):
    """Write the clone under root/data. extra: {relative file: function(data) -> data or None} mutators."""
    data = files()
    for rel, mutate in (extra or {}).items():
        out = mutate(data.get(rel, {}))
        data[rel] = data.get(rel) if out is None else out
    for rel, content in data.items():
        path = os.path.join(root, "data", rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(copy.deepcopy(content), f)
    return root
