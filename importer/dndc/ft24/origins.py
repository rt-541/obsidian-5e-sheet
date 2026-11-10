"""2024 species, feat and background converters.

Species carry no ability score (a 2024 background gives them); a background carries `abilityPick` and a
`feat` op; a feat carries a `category` and `minLevel`. Anything the sheet cannot express is left in the
text and recorded in `_problems`, which becomes the note's `needs_review` and the Needs Review page.
"""
from .. import fivetools as F
from .. import ft_classes
from ..ft_classes import (ARMOR, DESCRIPTIVE, WEAPONS, ability_text, language_ops, named_feature_ops, op, plain,
                          skill_ops, slug)
from .common import FEAT_CATEGORIES, additional_spell_ops, category_slug, title_name


def tool_ops(tools, used):
    """Tool proficiencies: named ones as titled names; `choose` with a `from` list as one choose op."""
    named, ops = [], []
    for block in tools or []:
        for k, v in block.items():
            if k == "choose" and isinstance(v, dict) and v.get("from"):
                ops.append(op("choose", used, "tools", what="tools", count=v.get("count", 1),
                              **{"from": [slug(x) for x in v["from"]]}))
            elif k.startswith("any") or k == "choose":
                more_named, more_ops = ft_classes.tool_ops([{k: v}], used)
                named += more_named
                ops += more_ops
            elif v is True:
                named.append(title_name(k))
    return named, ops


def ability_fields(ability):
    """A list of ability blocks -> (plain blocks, abilityPick or None, problems).

    Weighted choices ("2 and 1" or "1, 1 and 1" among the same abilities) become the pick; the rest
    (fixed increases, older "choose" forms) stay as `ability`, which keeps its 2014 meaning.
    """
    patterns, frm, problems, rest = [], None, [], []
    for block in ability or []:
        choose = block.get("choose")
        weighted = choose.get("weighted") if isinstance(choose, dict) else None
        if weighted and weighted.get("from") and weighted.get("weights"):
            if frm is None:
                frm = list(weighted["from"])
            elif list(weighted["from"]) != frm:
                problems.append("ability pick lists differ; only the first list is kept")
                continue
            patterns.append(list(weighted["weights"]))
        else:
            rest.append(block)
    return rest, ({"from": frm, "patterns": patterns} if patterns else None), problems


def feat_ops(feats, used, feat_ids=None):
    """A `feats` list -> (feat ops, problems).

    "name|src": true grants that feat (a variant "name; variant" is the feat "name variant"); an
    anyFromCategory block lets the player pick one feat of those categories, `count` times. When feat_ids
    (the ids the library writes) is given, a named feat it lacks gets a problem and no op, never a dangling id.
    """
    ops, problems = [], []
    for block in feats or []:
        for k, v in block.items():
            if k == "anyFromCategory":
                cats = [category_slug(c) for c in v.get("category", [])]
                for _ in range(v.get("count", 1)):
                    ops.append(op("feat", used, "feat-" + "-".join(cats), categories=cats))
            elif v is True:
                name, _, src = k.partition("|")
                fid = slug(name)
                if feat_ids is not None:
                    found = next((c for c in (fid, f"{fid}-{slug(src)}" if src else None) if c and c in feat_ids), None)
                    if found is None:
                        problems.append(f"feat {fid} is not in this library")
                        continue
                    fid = found
                ops.append(op("feat", used, f"feat-{fid}", feat=fid))
    return ops, problems


def background_doc(b, feat_ids=None):
    used = set()
    problems = list(b.get("_problems", []))
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
    fops, fprobs = feat_ops(b.get("feats"), used, feat_ids)
    problems += fprobs
    if not b.get("feats"):
        problems.append("grants no feat")
    rest, pick, aprobs = ability_fields(b.get("ability"))
    problems += aprobs
    named = [e for e in b.get("entries", []) if isinstance(e, dict) and str(e.get("name", "")).startswith("Feature:")]
    feature = [op("feature", used, e["name"].replace("Feature:", "").strip(),
                  name=e["name"].replace("Feature:", "").strip(), text=plain(e.get("entries"))) for e in named]
    doc = {"ability": rest or None, "abilityPick": pick,
           "grants": [g for g in [grant] + sk_ops + tl_ops + lang_ops + fops + feature if len(g) > 2]}
    doc = {k: v for k, v in doc.items() if v is not None}
    if problems:
        doc["_problems"] = list(dict.fromkeys(problems))
    return doc


# ---------------------------------------------------------------- species

def _speed_fields(speed):
    """5e.tools speed (a number, or {walk: 30, climb: true, fly: 50}) -> (walking speed, other speeds)."""
    if not isinstance(speed, dict):
        return speed, {}
    walk = speed.get("walk")
    return walk, {k: ("walk" if v is True else v) for k, v in speed.items() if k != "walk" and v}


def _armor_weapons(e):
    armor = [ARMOR.get(k) or title_name(k) for b in e.get("armorProficiencies", []) for k, v in b.items() if v is True]
    weapons = [WEAPONS.get(k.split("|")[0]) or title_name(k.split("|")[0])
               for b in e.get("weaponProficiencies", []) for k, v in b.items() if v is True]
    return armor, weapons


def _strip(o):
    return {k: v for k, v in o.items() if k != "id"}


def _without_what_the_species_has(grants, base_grants):
    """A lineage keeps only the grants its species does not already give (a copy would double them)."""
    have = [_strip(g) for g in base_grants]
    base_main = next((g for g in base_grants if g["id"] == "grant"), {})
    out = []
    for g in grants:
        if g["id"] == "grant":
            g = {k: v for k, v in g.items() if k in ("op", "id") or base_main.get(k) != v}
            if len(g) > 2:
                out.append(g)
        elif _strip(g) not in have:
            out.append(g)
    return out


def race_doc(r):
    used = set()
    problems = list(r.get("_problems", []))
    walk, other = _speed_fields(r.get("speed"))
    langs, lang_ops = language_ops(r.get("languageProficiencies"), used)
    skills, sk_ops = skill_ops(r.get("skillProficiencies"), used)
    tools, tl_ops = tool_ops(r.get("toolProficiencies"), used)
    armor, weapons = _armor_weapons(r)
    grant = op("grant", used, "grant", proficiencies=skills + tools + armor + weapons, languages=langs, speed=walk,
               speeds=other, darkvision=r.get("darkvision"))
    f_ops, fprobs = feat_ops(r.get("feats"), used)
    problems += fprobs
    resist = [x for x in r.get("resist") or [] if isinstance(x, str)]
    if len(resist) != len(r.get("resist") or []):
        problems.append("a chosen damage resistance kept in the text only")
    effects = [op("effect", used, "resist", effects={"resist": resist})] if resist else []
    levels, sprobs = additional_spell_ops(r.get("additionalSpells") or [], used)
    problems += sprobs
    if any(lvl != "1" for lvl in levels):
        problems.append("spells gained above level 1 kept in the text only")
    spells = levels.get("1", [])
    features = named_feature_ops(r.get("entries"), used, DESCRIPTIVE)
    grants = [g for g in [grant] + lang_ops + sk_ops + tl_ops + f_ops + effects + spells + features if len(g) > 2]
    size = [F.SIZES.get(s, s) for s in r.get("size", [])] or None
    parent = r.get("_parent")
    if parent:
        base = race_doc({k: v for k, v in parent.items() if k != "_parent"})
        grants = _without_what_the_species_has(grants, base["grants"])
        size = None if size == base.get("size") else size
    elif not size:
        problems.append("no size")
    doc = {"size": size, "grants": grants}
    doc = {k: v for k, v in doc.items() if v is not None}
    if problems:
        doc["_problems"] = list(dict.fromkeys(problems))
    return doc


# ---------------------------------------------------------------- feats

def prerequisites(prereqs, problems=None):
    """A feat's prerequisite blocks -> (sentence parts, minimum level or None).
    A key with no handler is named in `problems` (when given): it is not in the text either."""
    pre, level = [], None
    for p in prereqs or []:
        for k, v in p.items():
            if k == "ability":
                pre.append(" or ".join(f"{a.title()} {n}" for x in v for a, n in x.items() if a != "max"))
            elif k in ("spellcasting", "spellcasting2020") and v:
                pre.append("The ability to cast at least one spell" if k == "spellcasting"
                           else "The Spellcasting or Pact Magic feature")
            elif k == "race":
                pre.append(" or ".join(x.get("name", "").title() for x in v))
            elif k == "proficiency":
                pre.append(" or ".join(f"proficiency with {kk} {vv}".replace("armor armor", "armor") for x in v
                                       for kk, vv in x.items()))
            elif k == "level":
                n = v if isinstance(v, int) else v.get("level")
                pre.append(f"Level {n}")
                if level is None and isinstance(n, int):
                    level = n
            elif k == "feature":
                pre.append(" or ".join(f"The {title_name(x)} feature" for x in v if isinstance(x, str)))
            elif k == "feat":
                pre.append(" or ".join(title_name(x.split("|")[0]) for x in v if isinstance(x, str)))
            elif k == "campaign":
                pre.append("Campaign: " + ", ".join(v))
            elif k == "otherSummary":
                pre.append(v.get("entrySummary") or v.get("entry") or "")
            elif k == "other":
                pre.append(v)
            elif k in ("exclusiveFeatCategory", "featCategory"):
                cats = " or ".join(category_slug(c) for c in v if isinstance(c, str))
                if cats:
                    pre.append(f"No other feat of the {cats} category" if k == "exclusiveFeatCategory"
                               else f"A feat of the {cats} category")
            elif problems is not None and k not in ("spellcasting", "spellcasting2020"):
                problems.append(f"prerequisite {k} kept in the text only")
    return [x for x in pre if x], level


# what a feat may grant that the sheet has no op for: each kind is named in one problem line
TEXT_ONLY_GRANTS = (("expertise", "expertise"), ("immune", "immune"), ("conditionImmune", "conditionImmune"),
                    ("vulnerable", "vulnerable"), ("senses", "senses"), ("savingThrowProficiencies", "saves"),
                    ("skillToolLanguageProficiencies", "skillToolLanguageProficiencies"),
                    ("optionalfeatureProgression", "optionalfeatureProgression"))


def feat_grants(f, used):
    """The proficiencies, resistances and spells a feat gives -> (ops, problems); the rest is named in one problem."""
    problems, left = [], []
    langs, lang_ops = language_ops(f.get("languageProficiencies"), used)
    skills, sk_ops = skill_ops(f.get("skillProficiencies"), used)
    tools, tl_ops = tool_ops(f.get("toolProficiencies"), used)
    armor, weapons = _armor_weapons(f)
    grant = op("grant", used, "grant", proficiencies=skills + tools + armor + weapons, languages=langs)
    resist = [x for x in f.get("resist") or [] if isinstance(x, str)]
    if len(resist) != len(f.get("resist") or []):
        left.append("chosen resistance")
    effects = [op("effect", used, "resist", effects={"resist": resist})] if resist else []
    levels, sprobs = additional_spell_ops(f.get("additionalSpells") or [], used)
    problems += sprobs
    if any(lvl != "1" for lvl in levels):
        left.append("spells above level 1")
    left += [label for key, label in TEXT_ONLY_GRANTS if f.get(key)]
    if left:
        problems.append("feat grants kept in the text only: " + ", ".join(sorted(left)))
    ops = [g for g in [grant] + lang_ops + sk_ops + tl_ops + effects + levels.get("1", []) if len(g) > 2]
    return ops, problems


def feat_doc(f):
    used = set()
    problems = list(f.get("_problems", []))
    pre, level = prerequisites(f.get("prerequisite"), problems)
    code = f.get("category")
    if code and code not in FEAT_CATEGORIES:
        problems.append(f"unmapped feat category {code}")
    blocks = [b for b in f.get("ability") or [] if not b.get("hidden")]
    if len(blocks) != len(f.get("ability") or []):
        problems.append("ability choices kept in the text only")
    rest, pick, aprobs = ability_fields(blocks)
    problems += aprobs
    text = plain(f.get("entries"))
    if rest:
        text = f"{text}\n\n- {ability_text(rest)}"
    feature = op("feature", used, f["name"], name=f["name"], text=text)
    grants, gprobs = feat_grants(f, used)
    problems += gprobs
    doc = {"prerequisite": "; ".join(pre) or None, "category": category_slug(code) if code else None,
           "minLevel": level, "ability": rest or None, "abilityPick": pick, "grants": [feature] + grants}
    doc = {k: v for k, v in doc.items() if v is not None}
    if problems:
        doc["_problems"] = list(dict.fromkeys(problems))
    return doc
