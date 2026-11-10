"""2024 class and subclass converters.

Reads the 5e.tools 2024 class files (loaded by ft_classes.load) into the sheet plugin's op format.
Each of these is a known flaw of the 2014 converter that is not repeated here:

- scale values are whole numbers or dice strings ("1d8"), never "+2" or "+10 ft."; table columns that
  only count spells (cantrips, prepared spells, slots) are not scales;
- a subclass becomes a caster only when its data gives a casterProgression (a bare spellcastingAbility
  is just a save DC), and a class only when its progression is a known one: nothing defaults to "full"
  or "third";
- nothing in code names a class, subclass or feature except the limited-use table RESOURCES_2024,
  whose numbers come from the class tables, the feature text or formulas over level and abilities;
- class feature references are found at any depth (23 in the 2024 books sit inside wrappers), and a
  reference that resolves to nothing is a problem line instead of a silent gap;
- tool and weapon words keep their apostrophes (title_name);
- prepared spell counts, weapon mastery counts and feat slots become ops (spells, choose, feat, asi).

A converter doc may carry `_problems`; rule_note moves it into the note's needs_review.
"""
import re

from .. import fivetools as F
from ..ft_classes import (ARMOR, PROGRESSION, WEAPONS, class_feature, op,  # noqa: F401
                          plain, progression_steps, requires, skills_choice, slug, subclass_feature)
from . import common

# Limited-use features that have a class table column (max is the scale op id, "scale-<slug>" with "_" for "-") or a
# formula over level and abilities, read from the 2024 class files: (resource name, max, reset).
# Reset is the word the plugin takes; a feature with a short-rest refill of one use is written "long"
# here and its refill is in REFILLS_2024. A formula names a scale by its slug with "_" for "-" (the plugin reads "-" as
# minus). Whole numbers are the counts the feature text itself states ("once", "twice").
RESOURCES_2024 = {
    "Rage": ("Rage", "scale_rages", "long"),
    "Second Wind": ("Second Wind", "scale_second_wind", "long"),
    "Channel Divinity": ("Channel Divinity", "scale_channel_divinity", "long"),
    "Wild Shape": ("Wild Shape", "scale_wild_shape", "long"),
    "Monk's Focus": ("Focus Points", "scale_focus_points", "short"),
    "Font of Magic": ("Sorcery Points", "scale_sorcery_points", "long"),
    "Favored Enemy": ("Favored Enemy", "scale_favored_enemy", "long"),
    "Bardic Inspiration": ("Bardic Inspiration", "max(1, cha)", "long"),
    "Flash of Genius": ("Flash of Genius", "max(1, int)", "long"),
    "Lay on Hands": ("Lay on Hands", "5 * level", "long"),
    "Action Surge": ("Action Surge", "1 + min(1, floor(level / 17))", "short"),
    "Indomitable": ("Indomitable", "1 + min(1, floor(level / 13)) + min(1, floor(level / 17))", "long"),
    "Stroke of Luck": ("Stroke of Luck", 1, "short"),
    "Innate Sorcery": ("Innate Sorcery", 2, "long"),
    "Arcane Recovery": ("Arcane Recovery", 1, "long"),
}
# Features whose classFeature entries give a short-rest refill of one use (reset stays long; read from the
# 2024 class files): (on, amount) for the plugin's refill.
REFILLS_2024 = {"Rage": ("short", 1), "Second Wind": ("short", 1), "Channel Divinity": ("short", 1),
                "Wild Shape": ("short", 1)}
_SLUG_MAX = re.compile(r"[a-z][a-z_]*")

# Feat categories an Ability Score Improvement slot takes: those whose feats need nothing the sheet
# cannot check (feats.json feat[].category and feat[].prerequisite: O has none, G and EB carry a level,
# which the plugin enforces as minLevel). Decided by the class files' classFeature entry of that name
# and those feats.json keys; the XSAC book (id XSAC) is silent. Left out: fighting-style (its
# prerequisite is a feature the sheet does not check; the Fighting Style slot offers it), FS:P and FS:R
# (otherSummary only) and D, DG (campaign prerequisite). A class's own featProgression entry for the
# feature, if one exists, is added to the list.
ASI_FEATS = ["general", "origin", "epic-boon"]
ASI_NAME = "Ability Score Improvement"

# class table columns that count spells or slots: the spells ops carry them, they are not scales
NOT_SCALES = re.compile(r"^(cantrips( known)?|prepared spells|spells prepared|spells known|spell slots|slot level|"
                        r"\d+(st|nd|rd|th)?|invocations( known)?|proficiency bonus|features|level)$", re.I)
DICE = re.compile(r"^\d+d\d+( \+ \d+d\d+)*$")
# a sentence that limits uses between rests; sentences about preparing or swapping spells do not count
LIMITED = re.compile(r"(Short|Long) Rest.*(regain|expended|again|before a rest)|"
                     r"(regain|expended|again).*(Short|Long) Rest", re.I | re.S)
NOT_LIMITED = re.compile(r"prepar|replac|chang|swap", re.I)
EXPERTISE_COUNT = re.compile(r"[Ee]xpertise in (one|two|three) of your|[Cc]hoose (one|two|three) of your skill")
NUMBER_WORDS = {"one": 1, "two": 2, "three": 3}
SPELLBOOK_PROBLEM = "prepared spell counts not written: this class learns spells into a spellbook"
MULTICLASS_PROBLEM = "multiclass ability requirement is not in the data"


# ---------------------------------------------------------------- references

def ref_name(ref):
    text = (ref.get("classFeature") or ref.get("subclassFeature")) if isinstance(ref, dict) else ref
    return str(text).split("|")[0]


def _resolve(fn, *args):
    try:
        return fn(*args)
    except (ValueError, IndexError, AttributeError):
        return None


def _find(data, kind, ref, cls=None):
    """A class or subclass feature by reference; a reference that differs from the feature only in the
    case of its name still resolves (one 2024 reference reads "Subclass feature")."""
    if kind == "subclass":
        feat = _resolve(subclass_feature, data, ref)
        table, text = data["subclass_features"], ref.get("subclassFeature") if isinstance(ref, dict) else ref
    else:
        feat = _resolve(class_feature, data, ref, cls)
        table, text = data["class_features"], ref.get("classFeature") if isinstance(ref, dict) else ref
    if feat:
        return feat
    parts = str(text).split("|")
    same = [f for k, f in table.items() if k[0].lower() == parts[0].lower() and k[0] != parts[0]]
    for f in same:
        fixed = "|".join([f["name"]] + parts[1:])
        feat = _resolve(subclass_feature, data, fixed) if kind == "subclass" else _resolve(class_feature, data, fixed, cls)
        if feat:
            return feat
    return None


def walk_refs(entries):
    """Every refClassFeature and refSubclassFeature at any depth through entries and items."""
    for e in entries or []:
        if isinstance(e, dict):
            if e.get("type") in ("refClassFeature", "refSubclassFeature"):
                yield e
            for key in ("entries", "items"):
                yield from walk_refs(e.get(key))


def strip_refs(entries):
    """The entries without the reference entries, dropping wrappers that held only references."""
    out = []
    for e in entries or []:
        if isinstance(e, dict):
            if e.get("type") in ("refClassFeature", "refSubclassFeature"):
                continue
            inner = {k: strip_refs(e[k]) for k in ("entries", "items") if k in e}
            if inner and not any(inner.values()) and not e.get("name"):
                continue
            e = {**e, **inner}
        out.append(e)
    return out


# ---------------------------------------------------------------- tables

def column_name(label):
    """A column label as plain text; a {@tip text|tooltip} label is named by its tooltip."""
    m = re.search(r"\{@tip [^|}]*\|([^}|]+)", label)
    return (m.group(1) if m else F.render_text(label, None)).strip()


def cell_scale(cell):
    """A table cell as a whole number or a dice string; None when it is empty or not readable."""
    if isinstance(cell, bool):
        return None
    if isinstance(cell, int):
        return cell
    if isinstance(cell, dict):
        if cell.get("type") == "dice":
            parts = [f"{r.get('number', 1)}d{r['faces']}" for r in cell.get("toRoll", []) if "faces" in r]
            return " + ".join(parts) or None
        if cell.get("type") in ("bonus", "bonusSpeed"):
            return cell_scale(cell.get("value"))
        return None
    if isinstance(cell, str):
        raw = cell.strip()
        m = re.fullmatch(r"\{@dice ([^}|]+)(\|[^}]*)?\}", raw)
        if m:
            raw = m.group(1).strip().lower()
            raw = ("1" + raw) if raw.startswith("d") else raw
            return raw if DICE.match(raw) else None
        raw = F.render_text(raw, None).strip()
        if re.fullmatch(r"[+-]?\d+( ft\.?)?", raw):
            return int(re.match(r"[+-]?\d+", raw).group(0))
        return raw if DICE.match(raw) else None
    return None


def scales(groups, used, problems):
    """Class or subclass table columns -> (scale ops with the values where they change, their slugs)."""
    ops, slugs = [], set()
    for g in groups or []:
        if "rowsSpellProgression" in g:
            continue
        for ci, label in enumerate(g.get("colLabels", [])):
            name = column_name(label)
            if NOT_SCALES.match(name):
                continue
            values, last, unread = {}, object(), False
            for lvl, row in enumerate(g.get("rows", []), start=1):
                cell = row[ci] if ci < len(row) else None
                v = cell_scale(cell)
                if v is None:
                    unread = unread or cell not in (None, "", "—", "-")
                    last = object()
                    continue
                if v != last:
                    values[str(lvl)] = v
                last = v
            if unread:
                problems.append(f"table column {name} has values that could not be read as numbers")
            if values:
                ops.append(op("scale", used, f"scale-{name}", name=name, values=values))
                slugs.add(ops[-1]["id"].replace("-", "_"))
    return ops, slugs


# ---------------------------------------------------------------- features

def asi_feats(owner):
    """Feat categories an Ability Score Improvement slot accepts (see ASI_FEATS), plus any the owner's
    own featProgression entry for the feature lists."""
    listed = []
    for p in owner.get("featProgression") or []:
        if p.get("name") == ASI_NAME:
            listed += [common.category_slug(c) for c in p.get("category", [])]
    return list(dict.fromkeys(ASI_FEATS + listed))


def limits_uses(text):
    return any(LIMITED.search(t) and not NOT_LIMITED.search(t) for t in re.split(r"(?<=[.!?])\s+", text))


class _Build:
    """The state of one class or subclass conversion."""

    def __init__(self, data, cls, owner, track_limited):
        self.data, self.cls, self.owner = data, cls, owner
        self.used, self.problems, self.levels = set(), [], {}
        self.seen, self.res_done, self.slugs = set(), set(), set()
        self.limited = [] if track_limited else None

    def put(self, level, *ops):
        self.levels.setdefault(str(level), []).extend(ops)

    def feature(self, feat):
        """A feature, the features it embeds by reference (each at its own level), and its extra ops."""
        if not feat or id(feat) in self.seen:
            return
        self.seen.add(id(feat))
        level, name = feat["level"], feat["name"]
        raw = feat.get("entries", [])
        text = plain(strip_refs(raw))
        if name == ASI_NAME:
            self.put(level, op("asi", self.used, name, feats=asi_feats(self.owner)))
        else:
            # optional class features riding inside a class are opt-in for the plugin
            extra = {"optional": True} if feat.get("isClassFeatureVariant") else {}
            self.put(level, op("feature", self.used, name, name=name, text=text, **extra))
        res = RESOURCES_2024.get(name)
        if res and name not in self.res_done:
            rname, mx, reset = res
            if not (isinstance(mx, str) and _SLUG_MAX.fullmatch(mx) and mx not in self.slugs):
                self.res_done.add(name)
                on, amount = REFILLS_2024.get(name, (None, None))
                refill = {"on": on, "amount": amount} if on else None
                self.put(level, op("resource", self.used, f"res-{rname}", name=rname, max=mx, reset=reset,
                                   refill=refill))
        if self.limited is not None and name not in self.limited and limits_uses(text):
            self.limited.append(name)
        if name == "Expertise":
            m = EXPERTISE_COUNT.search(text)
            if m:
                count = NUMBER_WORDS[(m.group(1) or m.group(2)).lower()]
                self.put(level, op("choose", self.used, f"{name}-choice", what="expertise", count=count))
        for ref in walk_refs(raw):
            kind = "subclass" if ref["type"] == "refSubclassFeature" else "class"
            nested = _find(self.data, kind, ref, self.cls)
            if nested:
                self.feature(nested)
            else:
                self.problems.append(f"{kind} feature {ref_name(ref)} not found")

    def spells(self, owner, class_id):
        """Cantrip and prepared-spell numbers -> spells ops where the count rises.

        A class that learns into a spellbook keeps its spellbook counts (the fixed list)."""
        can = progression_steps(owner.get("cantripProgression") or [])
        fixed = owner.get("spellsKnownProgressionFixed") or []
        prepared = owner.get("preparedSpellsProgression") or []
        if fixed:
            if prepared:
                self.problems.append(SPELLBOOK_PROBLEM)
            counts = {i + 1: n for i, n in enumerate(fixed) if n > 0}
        else:
            counts = progression_steps(prepared)
        for lvl in sorted(set(counts) | set(can)):
            fields = {"count": counts.get(lvl, 0), "from": class_id}
            if can.get(lvl):
                fields["cantrips"] = can[lvl]
            self.put(lvl, op("spells", self.used, f"spells-{lvl}", **fields))

    def additional(self, owner):
        grants, problems = common.additional_spell_ops(owner.get("additionalSpells") or [], self.used)
        for lvl, ops in grants.items():
            self.put(lvl, *ops)
        self.problems.extend(problems)

    def feats(self, owner):
        """featProgression -> feat ops that follow the feature of the same name at that level.

        The Ability Score Improvement entry is not a feat slot of its own: it sets the asi op."""
        for p in owner.get("featProgression") or []:
            if p.get("name") == ASI_NAME:
                continue
            cats = list(dict.fromkeys(common.category_slug(c) for c in p.get("category", [])))
            for lvl, count in sorted((int(k), v) for k, v in (p.get("progression") or {}).items()):
                for _ in range(count if isinstance(count, int) else 0):
                    new = op("feat", self.used, f"feat-{slug(p['name'])}-{lvl}", categories=cats)
                    ops = self.levels.setdefault(str(lvl), [])
                    at = next((i for i, o in enumerate(ops) if o["op"] == "feature" and o.get("name") == p["name"]), None)
                    ops.insert(len(ops) if at is None else at + 1, new)

    def options(self, progressions):
        """optionalfeatureProgression -> options lists, with choose ops added into levels."""
        options = {}
        for p in progressions or []:
            list_id = slug(p["name"])
            types = set(p.get("featureType", []))
            found = [o for o in self.data["optional"] if types & set(o.get("featureType", []))]
            if not found:
                self.problems.append(f"no options found for {p['name']}")
                continue
            bases = [slug(o["name"]) for o in found]
            picks = []
            for o, base in zip(found, bases):
                pre = [x["level"]["level"] for x in o.get("prerequisite", []) if isinstance(x, dict)
                       and isinstance(x.get("level"), dict) and x["level"].get("level")]
                picks.append({"id": base if bases.count(base) == 1 else f"{base}-{slug(o['source'])}",
                              "name": o["name"], "text": plain(o.get("entries")),
                              **({"minLevel": pre[0]} if pre else {})})
            options[list_id] = sorted(picks, key=lambda x: x["name"])
            steps = progression_steps(p.get("progression", []))
            for lvl, count in steps.items():
                # after the first pick, a new level also lets you swap one you know
                extra = {"swap": True} if lvl > min(steps) else {}
                self.put(lvl, op("choose", self.used, f"{list_id}-{lvl}", what="option", list=list_id,
                                 count=count, **extra))
        return options

    def finish(self, doc):
        doc["levels"] = {k: self.levels[k] for k in sorted(self.levels, key=int) if self.levels[k]}
        doc["_problems"] = list(dict.fromkeys(self.problems))
        return {k: v for k, v in doc.items() if v not in (None, [], {})}


# ---------------------------------------------------------------- classes

def prof_list(p):
    """Armor, weapon and tool proficiencies as words, each named with title_name."""
    out = []
    for key, table in (("armor", ARMOR), ("weapons", WEAPONS)):
        for a in p.get(key, []):
            a = a.get("proficiency", "") if isinstance(a, dict) else a
            out.append(table.get(a) or common.title_name(F.render_text(a, None)))
    for t in p.get("tools", []):
        out.append(common.title_name(F.render_text(t, None)) if isinstance(t, str) else "")
    return [x for x in out if x]


def class_subclass_level(cls):
    """The level of the first reference that grants the subclass, or None."""
    levels = []
    for ref in cls.get("classFeatures", []):
        if isinstance(ref, dict) and ref.get("gainSubclassFeature"):
            try:
                levels.append(int(ref["classFeature"].split("|")[3]))
            except (IndexError, ValueError):
                pass
    return min(levels) if levels else None


def class_doc(data, cls):
    cid = slug(cls["name"])
    b = _Build(data, cls, cls, True)
    scale_ops, b.slugs = scales(cls.get("classTableGroups"), b.used, b.problems)
    sub_level = None
    for ref in cls.get("classFeatures", []):
        feat = _find(data, "class", ref, cls)
        if not feat:
            b.problems.append(f"class feature {ref_name(ref)} not found")
            continue
        b.feature(feat)
        if isinstance(ref, dict) and ref.get("gainSubclassFeature") and sub_level is None:
            sub_level = feat["level"]
            b.put(sub_level, op("subclass", b.used, "subclass"))
    options = b.options(cls.get("optionalfeatureProgression"))
    b.spells(cls, cid)
    b.additional(cls)
    b.feats(cls)
    for lvl, count in progression_steps(cls.get("itemMasteriesProgression") or {}).items():
        b.put(lvl, op("choose", b.used, f"mastery-{lvl}", what="mastery", count=count))
    b.levels.setdefault("1", [])[0:0] = scale_ops
    casting = None
    if cls.get("spellcastingAbility"):
        prog = PROGRESSION.get(cls.get("casterProgression"))
        if prog:
            casting = {"abil": cls["spellcastingAbility"], "progression": prog}
        else:
            b.problems.append(f"caster progression {cls.get('casterProgression')} not recognised: "
                              "spellcasting not written")
    missing = [n for n in b.limited if n not in b.res_done]
    if missing:
        b.problems.append(f"limited-use features without a resource op: {', '.join(missing)}")
    mc = cls.get("multiclassing", {})
    if not mc.get("requirements"):
        b.problems.append(MULTICLASS_PROBLEM)
    start = cls.get("startingProficiencies", {})
    gold = cls.get("startingEquipment", {}).get("goldAlternative")
    gold = re.sub(r"\s", "", F.render_text(gold, None)).replace("×", "*") if gold else None
    return cid, b.finish({
        "hitDie": cls.get("hd", {}).get("faces"), "saves": cls.get("proficiency", []),
        "spellcasting": casting, "proficiencies": prof_list(start), "skills": skills_choice(start),
        "multiclass": {"requires": requires(mc), "proficiencies": prof_list(mc.get("proficienciesGained", {}))},
        "gold": gold, "options": options or None, "subclassLevel": sub_level})


def subclass_doc(data, sub, cls, class_id):
    b = _Build(data, cls, sub, False)
    scale_ops, b.slugs = scales(sub.get("subclassTableGroups"), b.used, b.problems)
    for ref in sub.get("subclassFeatures", []):
        feat = _find(data, "subclass", ref)
        if feat:
            b.feature(feat)
        else:
            b.problems.append(f"subclass feature {ref_name(ref)} not found")
    first = min((int(k) for k in b.levels), default=None)
    if first is None:
        first = class_subclass_level(cls) or 1
        b.problems.append("subclass has no features")
    b.additional(sub)
    word = sub.get("casterProgression")
    if word:
        prog = PROGRESSION.get(word)
        abil = sub.get("spellcastingAbility") or cls.get("spellcastingAbility")
        if prog and abil:
            b.levels.setdefault(str(first), []).insert(0, op(
                "spellcasting", b.used, "spellcasting", abil=abil, progression=prog, list="wizard"))
            b.problems.append("spell list assumed to be wizard")
            b.spells(sub, "wizard")
        else:
            b.problems.append(f"caster progression {word} not recognised: spellcasting not written")
    b.feats(sub)
    b.levels.setdefault(str(first), [])[0:0] = scale_ops
    options = b.options(sub.get("optionalfeatureProgression"))
    return b.finish({"class": class_id, "options": options or None})
