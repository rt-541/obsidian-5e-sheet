"""5e.tools classes, subclasses, races, feats and backgrounds -> the sheet plugin's op format.

The dnd-5e-sheet plugin levels characters by replaying operations per level
(spec: obsidian-5e-sheet docs/plans/2026-10-17-leveling.md section 2; example
src/content/srd/classes.json). Op keys are camelCase, as the plugin expects;
the note's own frontmatter (source, page, tags) follows this pipeline's
contract. Op text is plain (no wikilinks, it is YAML); the note body carries
the same text with links.

5e.tools gives most of it as data: hit die, saves, proficiencies, multiclass
requirements, features by level, subclass level, cantrip and spells-known
progressions, class table columns (scales), optional feature progressions
(options + choose). Limited uses (Rage, Second Wind, Channel Divinity...) are
not structured there, so the known ones are listed in RESOURCES by name.
"""
import glob
import json
import os
import re

from . import fivetools as F

ABILS = ["str", "dex", "con", "int", "wis", "cha"]
PROGRESSION = {"full": "full", "1/2": "half", "1/3": "third", "pact": "pact", "artificer": "half"}
# class table columns that are spellcasting bookkeeping, not scales
NOT_SCALES = re.compile(r"^(cantrips known|spells known|spell slots|slot level|\d+(st|nd|rd|th)|invocations known|"
                        r"infusions known|infused items|proficiency bonus|features|level)$", re.I)
# limited-use features by name: (resource name, max Formula, reset). 5e.tools keeps these in prose.
# In a Formula a scale is named by its slug with "_" for "-" (the plugin reads "-" as minus).
RESOURCES = {
    "Rage": ("Rage", "rages", "long"),
    "Second Wind": ("Second Wind", 1, "short"),
    "Action Surge": ("Action Surge", "1 + min(1, floor(level / 17))", "short"),
    "Indomitable": ("Indomitable", "1 + min(1, floor(level / 13)) + min(1, floor(level / 17))", "long"),
    "Bardic Inspiration": ("Bardic Inspiration", "max(1, cha)", "long"),
    "Channel Divinity": ("Channel Divinity", "1 + min(1, floor(level / 6)) + min(1, floor(level / 18))", "short"),
    "Channel Divinity|Paladin": ("Channel Divinity", 1, "short"),
    "Wild Shape": ("Wild Shape", 2, "short"),
    "Lay on Hands": ("Lay on Hands", "5 * level", "long"),
    "Divine Sense": ("Divine Sense", "1 + cha", "long"),
    "Arcane Recovery": ("Arcane Recovery", 1, "long"),
    "Ki": ("Ki", "ki_points", "short"),
    "Font of Magic": ("Sorcery Points", "sorcery_points", "long"),
    "Combat Superiority": ("Superiority Dice", "4 + min(1, floor(level / 7)) + min(1, floor(level / 15))", "short"),
}
DCS = {"Ki": ("Ki", "wis", None), "Combat Superiority": ("Maneuver", "str", "dex")}
# per-level values 5e.tools keeps in prose rather than a table column
SCALES = {"Combat Superiority": ("Superiority Die", {"3": "d8", "10": "d10", "18": "d12"})}
# race entries that only describe (age, size...) rather than grant something
DESCRIPTIVE = {"Age", "Alignment", "Size", "Languages", "Language"}
ABIL_NAMES = {"str": "Strength", "dex": "Dexterity", "con": "Constitution", "int": "Intelligence",
              "wis": "Wisdom", "cha": "Charisma"}
EXPERTISE = {"Expertise": 2}
SCHOOLS_FOR = {"Eldritch Knight": ["abjuration", "evocation"], "Arcane Trickster": ["enchantment", "illusion"]}
SKILLS = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation",
          "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion",
          "sleight of hand", "stealth", "survival"]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower().replace("'", "")).strip("-")


def plain(entries, depth=3):
    """Op text: Markdown without wikilinks (it lives in YAML frontmatter)."""
    return F.render_entries(entries, None, depth)


def load(root, sources=None):
    """sources, when given, keeps only classes, subclasses and optional features from those books.

    Features stay unfiltered (a reference resolves by key), and races, feats and backgrounds are
    filtered by the caller after `_copy` resolution, so a copy of an older entry still works.
    """
    d = os.path.join(root, "data")
    cls, sub, cf, sf = [], [], [], []
    for f in sorted(glob.glob(os.path.join(d, "class", "class-*.json"))):
        j = json.load(open(f))
        cls += j.get("class", [])
        sub += j.get("subclass", [])
        cf += j.get("classFeature", [])
        sf += j.get("subclassFeature", [])
    races = json.load(open(os.path.join(d, "races.json")))
    if sources is not None:
        cls = [c for c in cls if c["source"] in sources]
        sub = [c for c in sub if c["source"] in sources]
    optional = json.load(open(os.path.join(d, "optionalfeatures.json")))["optionalfeature"]
    if sources is not None:
        optional = [o for o in optional if o["source"] in sources]
    return {
        "classes": cls, "subclasses": sub,
        "class_features": {(f["name"], f["className"].lower(), f["classSource"].lower(), f["level"], f["source"].lower()): f
                           for f in cf},
        "subclass_features": {(f["name"], f["className"].lower(), f["subclassShortName"].lower(),
                               f["subclassSource"].lower(), f["level"], f["source"].lower()): f for f in sf},
        "optional": optional,
        "feats": json.load(open(os.path.join(d, "feats.json")))["feat"],
        "backgrounds": json.load(open(os.path.join(d, "backgrounds.json")))["background"],
        "races": races.get("race", []), "subraces": races.get("subrace", []),
    }


# ---------------------------------------------------------------- feature lookup

def class_feature(data, ref, cls):
    """"Name|Class|ClassSource|Level|Source" -> feature dict (empty parts default to the class)."""
    p = (ref.get("classFeature") if isinstance(ref, dict) else ref).split("|")
    p += [""] * (5 - len(p))
    csrc = (p[2] or cls["source"]).lower()
    return data["class_features"].get((p[0], p[1].lower(), csrc, int(p[3]), (p[4] or csrc).lower()))


def subclass_feature(data, ref):
    """"Name|Class|ClassSrc|SubShort|SubSrc|Level|Source"."""
    p = (ref.get("subclassFeature") if isinstance(ref, dict) else ref).split("|")
    p += [""] * (7 - len(p))
    ssrc = (p[4] or p[2] or "phb").lower()
    return data["subclass_features"].get((p[0], p[1].lower(), p[3].lower(), ssrc, int(p[5]), (p[6] or ssrc).lower()))


def feature_ops(data, feat, cls, used_ids, level, sub=None):
    """A feature plus the features it embeds by reference (subclass features nest that way)."""
    if not feat:
        return []
    top, nested = [], []
    for e in feat.get("entries", []):
        if isinstance(e, dict) and e.get("type") == "refSubclassFeature":
            nested.append(subclass_feature(data, e["subclassFeature"]))
        elif isinstance(e, dict) and e.get("type") == "refClassFeature":
            nested.append(class_feature(data, e["classFeature"], cls))
        else:
            top.append(e)
    name = feat["name"]
    ops = []
    if name == "Ability Score Improvement":
        ops.append(op("asi", used_ids, name))
    else:
        # Tasha's optional class features ride inside the PHB classes; the plugin treats them as opt-in
        extra = {"optional": True} if feat.get("isClassFeatureVariant") else {}
        ops.append(op("feature", used_ids, name, name=name, text=plain(top), **extra))
    key = f"{name}|{cls['name']}"
    res = RESOURCES.get(key, RESOURCES.get(name))
    if res:
        rname, mx, reset = res
        ops.append(op("resource", used_ids, f"res-{rname}", name=rname, max=mx, reset=reset))
    if name in SCALES:
        sname, values = SCALES[name]
        ops.append(op("scale", used_ids, f"scale-{sname}", name=sname, values=values))
    if name in DCS:
        dname, abil, alt = DCS[name]
        ops.append(op("dc", used_ids, f"dc-{dname}", name=dname, abil=abil, **({"alt": alt} if alt else {})))
    if name in EXPERTISE:
        ops.append(op("choose", used_ids, f"{name}-choice", what="expertise", count=EXPERTISE[name]))
    for n in nested:
        if n and n.get("level", level) == level:
            ops += feature_ops(data, n, cls, used_ids, level, sub)
    return ops


def op(kind, used_ids, base, **fields):
    ident = slug(base) or kind
    n, candidate = 2, ident
    while candidate in used_ids:
        candidate = f"{ident}-{n}"
        n += 1
    used_ids.add(candidate)
    return {"op": kind, "id": candidate, **{k: v for k, v in fields.items() if v not in (None, "", [], {})}}


# ---------------------------------------------------------------- tables, options, spells

def cell_value(c):
    if isinstance(c, dict):
        if c.get("type") == "dice":
            return " + ".join(f"{r.get('number', 1)}d{r['faces']}" for r in c.get("toRoll", []))
        if c.get("type") in ("bonus", "bonusSpeed"):
            return c["value"]  # a number, so formulas and modifiers can use the scale (rage damage, speed bonus)
        return c.get("value", "")
    if isinstance(c, str):
        v = F.render_text(c, None)
        return int(v) if re.fullmatch(r"\d+", v) else v
    return c


def scales(groups, used_ids):
    """Class table columns -> scale ops with the values where they change."""
    ops = []
    for g in groups or []:
        if "rowsSpellProgression" in g:
            continue
        for ci, label in enumerate(g.get("colLabels", [])):
            name = F.render_text(label, None)
            if NOT_SCALES.match(name.strip()):
                continue
            values, last = {}, object()
            for lvl, row in enumerate(g.get("rows", []), start=1):
                v = cell_value(row[ci]) if ci < len(row) else ""
                if v not in ("", "—", "-", 0) and v != last:
                    values[str(lvl)] = v
                last = v
            if values:
                ops.append(op("scale", used_ids, f"scale-{name}", name=name, values=values))
    return ops


def progression_steps(prog):
    """[0, 2, 2, 3...] or {"3": 3, "7": 5} -> {level: new picks}."""
    if isinstance(prog, dict):
        items = sorted((int(k), v) for k, v in prog.items())
    else:
        items = [(i + 1, v) for i, v in enumerate(prog)]
    out, last = {}, 0
    for lvl, n in items:
        if n > last:
            out[lvl] = n - last
        last = max(last, n)
    return out


def options_for(data, progressions, used_ids, levels, minimum_level=1):
    """optionalfeatureProgression -> (options lists, choose ops added into levels)."""
    options = {}
    for p in progressions or []:
        list_id = slug(p["name"])
        types = set(p.get("featureType", []))
        picks = []
        for o in data["optional"]:
            if types & set(o.get("featureType", [])):
                pre = [x.get("level", {}).get("level") for x in o.get("prerequisite", []) if isinstance(x, dict)
                       and isinstance(x.get("level"), dict)]
                picks.append({"id": slug(o["name"]) + ("" if o["source"] == "PHB" else f"-{slug(o['source'])}"),
                              "name": o["name"], "text": plain(o.get("entries")),
                              **({"minLevel": pre[0]} if pre and pre[0] else {})})
        if not picks:
            continue
        options[list_id] = sorted(picks, key=lambda x: x["name"])
        steps = progression_steps(p.get("progression", []))
        for lvl, count in steps.items():
            if lvl >= minimum_level:
                # after the first pick, a new level also lets you swap one you know
                extra = {"swap": True} if lvl > min(steps) else {}
                levels.setdefault(str(lvl), []).append(op("choose", used_ids, f"{list_id}-{lvl}", what="option",
                                                          list=list_id, count=count, **extra))
    return options


def spells_ops(owner, class_id, used_ids, levels, schools=None):
    """Cantrip and spells-known progressions -> spells ops where the count rises."""
    can = owner.get("cantripProgression") or []
    known = owner.get("spellsKnownProgression") or []
    fixed = owner.get("spellsKnownProgressionFixed") or []
    for lvl in range(1, 21):
        i = lvl - 1
        new_c = (can[i] - (can[i - 1] if i else 0)) if i < len(can) else 0
        if fixed:
            new_s = fixed[i] if i < len(fixed) else 0
        elif known:
            new_s = (known[i] - (known[i - 1] if i else 0)) if i < len(known) else 0
        else:
            new_s = 0
        if new_c > 0 or new_s > 0:
            fields = {"count": max(new_s, 0), "from": class_id}
            if new_c > 0:
                fields["cantrips"] = new_c
            if schools:
                fields["schools"] = schools
            levels.setdefault(str(lvl), []).append(op("spells", used_ids, f"spells-{lvl}", **fields))


# ---------------------------------------------------------------- classes

ARMOR = {"light": "Light Armor", "medium": "Medium Armor", "heavy": "Heavy Armor", "shield": "Shields",
         "shields": "Shields"}
WEAPONS = {"simple": "Simple Weapons", "martial": "Martial Weapons"}


def prof_list(p):
    out = []
    for a in p.get("armor", []):
        a = a.get("proficiency", "") if isinstance(a, dict) else a
        out.append(ARMOR.get(a, F.render_text(a, None).title()))
    for w in p.get("weapons", []):
        w = w.get("proficiency", "") if isinstance(w, dict) else w
        out.append(WEAPONS.get(w, F.render_text(w, None).title()))
    for t in p.get("tools", []):
        out.append(F.render_text(t, None) if isinstance(t, str) else "")
    return [x for x in out if x]


def skills_choice(p):
    for s in p.get("skills", []):
        if "choose" in s:
            return {"count": s["choose"].get("count", 1), "from": [slug(x) for x in s["choose"]["from"]]}
        if "any" in s:
            return {"count": s["any"], "from": [slug(x) for x in SKILLS]}
    return None


def requires(mc):
    req = mc.get("requirements", {})
    out = {}
    if "or" in req:
        out["any"] = [{k: v} for alt in req["or"] for k, v in alt.items()]
    rest = {k: v for k, v in req.items() if k in ABILS}
    if rest:
        out["all"] = rest
    return out


def class_doc(data, cls):
    used = set()
    cid = slug(cls["name"])
    levels = {}
    sub_level = None
    for ref in cls.get("classFeatures", []):
        feat = class_feature(data, ref, cls)
        if not feat:
            continue
        lvl = str(feat["level"])
        if isinstance(ref, dict) and ref.get("gainSubclassFeature") and sub_level is None:
            sub_level = feat["level"]
            levels.setdefault(lvl, []).extend(feature_ops(data, feat, cls, used, feat["level"]))
            levels[lvl].append(op("subclass", used, "subclass"))
            continue
        levels.setdefault(lvl, []).extend(feature_ops(data, feat, cls, used, feat["level"]))
    levels.setdefault("1", [])[0:0] = scales(cls.get("classTableGroups"), used)
    options = options_for(data, cls.get("optionalfeatureProgression"), used, levels)
    spells_ops(cls, cid, used, levels)
    sp = {"abil": cls["spellcastingAbility"], "progression": PROGRESSION.get(cls.get("casterProgression"), "full")} \
        if cls.get("spellcastingAbility") else None
    start = cls.get("startingProficiencies", {})
    gold = cls.get("startingEquipment", {}).get("goldAlternative")
    gold = re.sub(r"\s", "", F.render_text(gold, None)).replace("×", "*") if gold else None
    doc = {
        "hitDie": cls.get("hd", {}).get("faces"), "saves": cls.get("proficiency", []),
        "spellcasting": sp, "proficiencies": prof_list(start), "skills": skills_choice(start),
        "multiclass": {"requires": requires(cls.get("multiclassing", {})),
                       "proficiencies": prof_list(cls.get("multiclassing", {}).get("proficienciesGained", {}))},
        "gold": gold, "options": options or None, "subclassLevel": sub_level,
        "levels": {k: levels[k] for k in sorted(levels, key=int) if levels[k]},
    }
    return cid, {k: v for k, v in doc.items() if v not in (None, [], {})}


def subclass_doc(data, sub, cls, class_id):
    used = set()
    levels = {}
    for ref in sub.get("subclassFeatures", []):
        feat = subclass_feature(data, ref)
        if feat:
            levels.setdefault(str(feat["level"]), []).extend(feature_ops(data, feat, cls, used, feat["level"], sub))
    first = min((int(k) for k in levels), default=cls.get("subclassLevel", 3))
    for block in sub.get("additionalSpells", []):
        for lvl, spells in sorted((block.get("prepared") or {}).items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
            if lvl.isdigit():
                names = [s.split("|")[0].split("#")[0] for s in spells if isinstance(s, str)]
                if names:
                    levels.setdefault(lvl, []).append(op("grant", used, f"spells-{lvl}", spells=[slug(n) for n in names]))
    if sub.get("spellcastingAbility"):
        levels.setdefault(str(first), []).insert(0, op(
            "spellcasting", used, "spellcasting", abil=sub["spellcastingAbility"],
            progression=PROGRESSION.get(sub.get("casterProgression"), "third"), list="wizard"))
        spells_ops(sub, "wizard", used, levels, SCHOOLS_FOR.get(sub["shortName"]))
    levels.setdefault(str(first), [])[0:0] = scales(sub.get("subclassTableGroups"), used)
    options = options_for(data, sub.get("optionalfeatureProgression"), used, levels)
    doc = {"class": class_id, "options": options or None,
           "levels": {k: levels[k] for k in sorted(levels, key=int) if levels[k]}}
    return {k: v for k, v in doc.items() if v not in (None, [], {})}


# ---------------------------------------------------------------- races, feats, backgrounds

def language_ops(langs, used):
    named, choose = [], 0
    for block in langs or []:
        for k, v in block.items():
            if k in ("anyStandard", "any", "anyExotic"):
                choose += v
            elif k == "other":
                continue
            elif v is True:
                named.append(k.title())
    return named, ([op("choose", used, "languages", what="languages", count=choose)] if choose else [])


def skill_ops(skills, used):
    named, ops = [], []
    for block in skills or []:
        for k, v in block.items():
            if k == "choose":
                ops.append(op("choose", used, "skills", what="skills", count=v.get("count", 1),
                              **{"from": [slug(x) for x in v["from"]]}))
            elif k == "any":
                ops.append(op("choose", used, "skills", what="skills", count=v))
            elif v is True:
                named.append(f"skill:{slug(k)}")
    return named, ops


def tool_ops(tools, used):
    named, ops = [], []
    for block in tools or []:
        for k, v in block.items():
            if k.startswith("any") or k == "choose":
                count = v if isinstance(v, int) else (v.get("count", 1) if isinstance(v, dict) else 1)
                frm = None
                if k == "anyGamingSet":
                    frm = ["dice-set", "dragonchess-set", "playing-card-set", "three-dragon-ante-set"]
                elif k == "anyMusicalInstrument":
                    frm = ["bagpipes", "drum", "dulcimer", "flute", "lute", "lyre", "horn", "pan-flute", "shawm", "viol"]
                ops.append(op("choose", used, f"tools-{k}", what="tools", count=count, **({"from": frm} if frm else {})))
            elif v is True:
                named.append(k.title())
    return named, ops


def ability_text(ability):
    """[{"con": 2}] or [{"choose": {"from": [...], "amount": 1}}] -> the sentence the books print."""
    parts = []
    for block in ability or []:
        fixed = [f"your {ABIL_NAMES[a]} score increases by {n}" for a, n in block.items() if a in ABIL_NAMES]
        if "choose" in block:
            ch = block["choose"]
            names = [ABIL_NAMES.get(a, a) for a in ch.get("from", [])]
            fixed.append(ch.get("entry") or f"increase {ch.get('count', 1)} of {', '.join(names)} by {ch.get('amount', 1)}")
        if fixed:
            parts.append("; ".join(fixed))
    text = " Or: ".join(parts)
    return text[:1].upper() + text[1:] + ("." if text and not text.endswith(".") else "")


def named_feature_ops(entries, used, skip=()):
    ops = []
    for e in entries or []:
        if isinstance(e, dict) and e.get("name") and e.get("type", "entries") == "entries" and e["name"] not in skip:
            ops.append(op("feature", used, e["name"], name=e["name"], text=plain(e.get("entries"))))
    return ops


def race_doc(r):
    used = set()
    speed = r.get("speed")
    walk = speed if isinstance(speed, int) else (speed or {}).get("walk")
    langs, lang_ops = language_ops(r.get("languageProficiencies"), used)
    skills, sk_ops = skill_ops(r.get("skillProficiencies"), used)
    weapons = [w.split("|")[0].title() for b in r.get("weaponProficiencies", []) for w, v in b.items() if v is True]
    grant = op("grant", used, "grant", proficiencies=skills + weapons, languages=langs, speed=walk,
               darkvision=r.get("darkvision"))
    asi = [op("feature", used, "Ability Score Increase", name="Ability Score Increase",
              text=ability_text(r["ability"]))] if r.get("ability") else []
    grants = [grant] + lang_ops + sk_ops + asi + named_feature_ops(r.get("entries"), used, DESCRIPTIVE)
    return {"size": [F.SIZES.get(s, s) for s in r.get("size", [])] or None,
            "ability": r.get("ability") or None, "grants": [g for g in grants if len(g) > 2]}


def feat_doc(f):
    used = set()
    pre = []
    for p in f.get("prerequisite", []):
        for k, v in p.items():
            if k == "ability":
                pre.append(" or ".join(f"{a.title()} {n}" for x in v for a, n in x.items()))
            elif k == "spellcasting" and v:
                pre.append("The ability to cast at least one spell")
            elif k == "race":
                pre.append(" or ".join(x.get("name", "").title() for x in v))
            elif k == "proficiency":
                pre.append(" or ".join(f"proficiency with {kk} {vv}".replace("armor armor", "armor") for x in v
                                       for kk, vv in x.items()))
            elif k == "level":
                pre.append(f"Level {v if isinstance(v, int) else v.get('level')}")
            elif k == "other":
                pre.append(v)
    text = plain(f.get("entries"))
    if f.get("ability"):
        text = f"{text}\n\n- {ability_text(f['ability'])}"
    grants = [op("feature", used, f["name"], name=f["name"], text=text)]
    return {"prerequisite": "; ".join(pre) or None, "ability": f.get("ability") or None, "grants": grants}


def background_doc(b):
    used = set()
    skills, sk_ops = skill_ops(b.get("skillProficiencies"), used)
    tools, tl_ops = tool_ops(b.get("toolProficiencies"), used)
    langs, lang_ops = language_ops(b.get("languageProficiencies"), used)
    items = []
    for block in b.get("startingEquipment", []):
        for x in block.get("_", []):
            name = x if isinstance(x, str) else x.get("item") or ""
            if name:
                items.append(slug(name.split("|")[0]))
    grant = op("grant", used, "grant", proficiencies=skills + tools, languages=langs, items=items)
    feats = [e for e in b.get("entries", []) if isinstance(e, dict) and str(e.get("name", "")).startswith("Feature:")]
    fops = [op("feature", used, e["name"].replace("Feature:", "").strip(),
               name=e["name"].replace("Feature:", "").strip(), text=plain(e.get("entries"))) for e in feats]
    return {"grants": [g for g in [grant] + sk_ops + tl_ops + lang_ops + fops if len(g) > 2]}
