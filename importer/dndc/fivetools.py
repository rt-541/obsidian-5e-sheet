"""5e.tools 2014 data -> compendium entities and Markdown.

The WotC library is built from the 5etools-2014-src mirror's JSON (the user owns
the books; clone in $DNDC_ROOT/5etools-2014, never committed). Unlike the PDF
route there is no OCR: stat blocks, spells and items arrive as fields, and every
{@tag} cross-reference resolves to an exact note.

This module loads the data, resolves `_copy` inheritance, and renders 5e.tools
markup (`{@spell fireball}`) and entry trees (sections, lists, tables, insets)
to Obsidian Markdown. ft_notes.py turns the entities into notes.
"""
import copy
import glob
import json
import os
import re
from fractions import Fraction

SIZES = {"T": "Tiny", "S": "Small", "M": "Medium", "L": "Large", "H": "Huge", "G": "Gargantuan", "V": "Varies"}
SCHOOLS = {"A": "abjuration", "C": "conjuration", "D": "divination", "E": "enchantment", "V": "evocation",
           "I": "illusion", "N": "necromancy", "T": "transmutation", "P": "psionic"}
ALIGN = {"L": "lawful", "N": "neutral", "C": "chaotic", "G": "good", "E": "evil", "U": "unaligned", "A": "any alignment"}
ITEM_TYPES = {"M": "Weapon", "R": "Weapon", "LA": "Armor", "MA": "Armor", "HA": "Armor", "S": "Armor", "P": "Potion",
              "RD": "Rod", "RG": "Ring", "SC": "Scroll", "WD": "Wand", "ST": "Staff", "A": "Ammunition", "AF": "Ammunition",
              "G": "Adventuring Gear", "$": "Treasure", "INS": "Instrument", "AT": "Artisan's Tools", "T": "Tools",
              "GS": "Gaming Set", "SCF": "Spellcasting Focus", "TAH": "Tack and Harness", "MNT": "Mount",
              "VEH": "Vehicle", "SHP": "Vehicle", "AIR": "Vehicle", "FD": "Food and Drink", "TG": "Trade Good",
              "OTH": "Other", "EXP": "Explosive", "GV": "Generic Variant"}
# codes only the 2024 data names (a 2014 "$G|DMG" is written as a plain Item today and stays so)
ITEM_TYPES_2024 = {"$G": "Treasure", "$A": "Treasure"}
SOURCES_2024 = {"XPHB", "XDMG", "XMM"}


def item_type_name(type_field):
    """The kind name for a 5e.tools item `type` ("CODE" or "CODE|SRC"), or None when no table knows it."""
    code, _, src = (type_field or "").partition("|")
    if code in ITEM_TYPES_2024 and src in SOURCES_2024:
        return ITEM_TYPES_2024[code]
    return ITEM_TYPES.get(code)


# which 5e.tools {@tag} names point at which compendium kind, and their default source
TAG_KIND = {"spell": ("spell", "PHB"), "creature": ("creature", "MM"), "item": ("item", "DMG"),
            "condition": ("condition", "PHB"), "disease": ("condition", "DMG"), "status": ("condition", "PHB"),
            "race": ("race", "PHB"), "class": ("class", "PHB"), "background": ("background", "PHB"),
            "feat": ("feat", "PHB"), "itemMastery": ("mastery", "XPHB")}


def load(root):
    """Everything phase 1 needs from data/, as plain lists of dicts."""
    d = os.path.join(root, "data")
    j = lambda p: json.load(open(os.path.join(d, p)))
    monsters = []
    for f in sorted(glob.glob(os.path.join(d, "bestiary", "bestiary-*.json"))):
        monsters += json.load(open(f)).get("monster", [])
    fluff = {}
    for f in glob.glob(os.path.join(d, "bestiary", "fluff-bestiary-*.json")):
        for x in json.load(open(f)).get("monsterFluff", []):
            fluff[(x["name"].lower(), x["source"].lower())] = x
    spells = []
    for f in sorted(glob.glob(os.path.join(d, "spells", "spells-*.json"))):
        spells += json.load(open(f)).get("spell", [])
    # mundane weapons and armor (Longsword, Chain Mail) live in items-base.json
    base = j("items-base.json") if os.path.exists(os.path.join(d, "items-base.json")) else {}
    items = j("items.json")["item"] + base.get("baseitem", [])
    variants = j("magicvariants.json")["magicvariant"]
    cd = j("conditionsdiseases.json")
    legendary = {(g["name"].lower(), g["source"].lower()): g for g in j("bestiary/legendarygroups.json")["legendaryGroup"]}
    templates = {(t["name"].lower(), t["source"].lower()): t for t in j("bestiary/template.json")["monsterTemplate"]}
    return {
        "monsters": monsters, "fluff": fluff, "spells": spells, "items": items, "variants": variants,
        "conditions": cd.get("condition", []) + cd.get("status", []), "diseases": cd.get("disease", []),
        "legendary": legendary, "templates": templates, "spell_classes": j("generated/gendata-spell-source-lookup.json"),
        "masteries": base.get("itemMastery", []),
        "books": j("books.json")["book"], "adventures": j("adventures.json")["adventure"],
        "root": d,
    }


# ---------------------------------------------------------------- _copy

COPY_SKIP = {"_copy", "page", "otherSources", "srd", "basicRules", "reprintedAs", "isReprinted",
             "hasToken", "hasFluff", "hasFluffImages", "referenceSources", "_versions"}


def _replace_txt(obj, mod):
    pat = re.compile(mod["replace"], re.I if "i" in mod.get("flags", "") else 0)
    # the data is written for JavaScript's replace(): $1 and $& are \1 and \g<0> here
    mod = dict(mod, **{"with": re.sub(r"\$(\d)", r"\\\1", mod["with"]).replace("$&", r"\g<0>")})

    def walk(x):
        if isinstance(x, str):
            return pat.sub(mod["with"], x)
        if isinstance(x, list):
            return [walk(v) for v in x]
        if isinstance(x, dict):
            return {k: (walk(v) if k != "name" or mod.get("props") else v) for k, v in x.items()}
        return x
    return walk(obj)


def _apply_mod(m, prop, mod, problems):
    mode = mod.get("mode")
    items = mod.get("items")
    items = items if isinstance(items, list) else [items] if items is not None else []
    arr = m.get(prop)
    named = lambda x, n: isinstance(x, dict) and x.get("name") == n
    if mode == "replaceTxt":
        props = mod.get("props") or (["action", "bonus", "reaction", "trait", "legendary", "mythic", "spellcasting",
                                      "variant", "legendaryHeader", "mythicHeader"] if prop == "*" else [prop])
        for p in props:
            if p in m:
                m[p] = _replace_txt(m[p], mod)
    elif mode == "prependArr":
        m[prop] = items + (arr or [])
    elif mode == "appendArr":
        m[prop] = (arr or []) + items
    elif mode == "appendIfNotExistsArr":
        m[prop] = (arr or []) + [i for i in items if i not in (arr or [])]
    elif mode == "insertArr":
        a = list(arr or [])
        a[mod["index"]:mod["index"]] = items
        m[prop] = a
    elif mode == "removeArr":
        names = mod.get("names") or []
        names = names if isinstance(names, list) else [names]
        drop = items  # already a list
        m[prop] = [x for x in (arr or []) if not any(named(x, n) for n in names) and x not in drop]
    elif mode in ("replaceArr", "replaceOrAppendArr"):
        target = mod["replace"]
        a, done = list(arr or []), False
        for i, x in enumerate(a):
            if (isinstance(target, str) and named(x, target)) or (isinstance(target, dict) and target.get("index") == i):
                a[i:i + 1] = items
                done = True
                break
        if not done and mode == "replaceOrAppendArr":
            a += items
        m[prop] = a
    elif mode == "setProp":
        m[mod["prop"]] = mod["value"]
    elif mode == "scalarAddProp":
        if isinstance(m.get(prop), dict):
            for k, v in m[prop].items():
                if mod["prop"] in ("*", k) and isinstance(v, str):
                    m[prop][k] = f"{int(v) + mod['scalar']:+d}"
    elif mode == "addSenses":
        m["senses"] = (m.get("senses") or []) + [f"{s['type']} {s['range']} ft." for s in
                                                 (mod["senses"] if isinstance(mod["senses"], list) else [mod["senses"]])]
    elif mode == "addSkills":
        # bonus = ability modifier + proficiency bonus (by CR) x 1 or 2 (expertise)
        pb = proficiency_bonus(m)
        skills = dict(m.get("skill") or {})
        for sk, mult in mod["skills"].items():
            score = m.get(SKILL_ABILITY.get(sk, "dex"), 10)
            skills[sk] = f"{(score - 10) // 2 + pb * mult:+d}"
        m["skill"] = skills
    elif mode in ("addSpells", "replaceSpells", "removeSpells"):
        _mod_spells(m, mode, mod)
    elif mode == "remove":
        m.pop(mod.get("prop", prop), None)
    elif mode == "scalarMultProp":
        if isinstance(m.get(prop), dict) and isinstance(m[prop].get(mod["prop"]), (int, float)):
            v = m[prop][mod["prop"]] * mod["scalar"]
            m[prop][mod["prop"]] = int(v) if mod.get("floor") else v
    elif mode == "prefixSuffixStringProp":
        if isinstance(m.get(prop), dict) and isinstance(m[prop].get(mod["prop"]), str):
            m[prop][mod["prop"]] = mod.get("prefix", "") + m[prop][mod["prop"]] + mod.get("suffix", "")
    elif mode == "scalarMultXp":
        m["_xp_mult"] = mod["scalar"]
    elif mode in ("scalarAddHit", "scalarAddDc"):
        tag = "hit" if mode == "scalarAddHit" else "dc"
        bump = lambda t: re.sub(r"\{@" + tag + r" (-?\d+)\}", lambda x: "{@" + tag + f" {int(x.group(1)) + mod['scalar']}" + "}", t)
        for p in ("action", "bonus", "reaction", "legendary", "trait", "spellcasting", "mythic"):
            if p in m:
                m[p] = json.loads(bump(json.dumps(m[p])))
    elif mode == "maxSize":
        order = list(SIZES)
        m["size"] = [s if order.index(s) <= order.index(mod["max"]) else mod["max"] for s in m.get("size", [])]
    else:
        problems.append(f"copy modification {mode} not applied")


SKILL_ABILITY = {"athletics": "str", "acrobatics": "dex", "sleight of hand": "dex", "stealth": "dex",
                 "arcana": "int", "history": "int", "investigation": "int", "nature": "int", "religion": "int",
                 "animal handling": "wis", "insight": "wis", "medicine": "wis", "perception": "wis",
                 "survival": "wis", "deception": "cha", "intimidation": "cha", "performance": "cha",
                 "persuasion": "cha"}


def _mod_spells(m, mode, mod):
    """Edit the first spellcasting block: add, replace or remove spells by level, daily or at will."""
    if not m.get("spellcasting"):
        return
    sc = m["spellcasting"][0]
    for group in ("spells", "daily", "will"):
        change = mod.get(group)
        if change is None:
            continue
        if group == "will":
            cur = sc.setdefault("will", [])
            _list_edit(cur, change, mode)
            continue
        for key, val in change.items():
            if group == "spells":
                cur = sc.setdefault("spells", {}).setdefault(key, {}).setdefault("spells", [])
                if mode == "addSpells" and isinstance(val, dict):
                    sc["spells"][key].update({k: v for k, v in val.items() if k != "spells"})
                    val = val.get("spells", [])
            else:
                cur = sc.setdefault("daily", {}).setdefault(key, [])
            _list_edit(cur, val, mode)


def _list_edit(cur, val, mode):
    if mode == "addSpells":
        cur += val
    elif mode == "removeSpells":
        cur[:] = [s for s in cur if s not in val]
    else:  # replaceSpells: [{replace, with}]
        for r in val:
            cur[:] = [w for s in cur for w in ((r["with"] if isinstance(r["with"], list) else [r["with"]])
                                                if s == r["replace"] else [s])]


def apply_template(m, t, problems):
    """A monster template (a race for an NPC, "Reduced Threat"): root fields, then modifications."""
    a = t.get("apply", {})
    for k, v in (a.get("_root") or {}).items():
        m[k] = copy.deepcopy(v)
    for prop, mods in (a.get("_mod") or {}).items():
        for mod in (mods if isinstance(mods, list) else [mods]):
            _apply_mod(m, prop, mod if isinstance(mod, dict) else {"mode": mod}, problems)


PLACEHOLDER = re.compile(r"<\$(name|short_name|title_short_name|title_name|spell_dc__\w+|to_hit__\w+|damage_mod__\w+)\$>")


def fill_placeholders(m):
    """Template text says "<$title_short_name$> has advantage..."; name it after this creature."""
    short = m.get("shortName") if isinstance(m.get("shortName"), str) else m["name"].lower()
    sub = {"name": m["name"], "title_name": m["name"], "short_name": f"the {short}",
           "title_short_name": f"The {short}"}
    pb = proficiency_bonus(m)

    def value(key):
        if key in sub:
            return sub[key]
        what, ab = key.split("__")
        mod = (m.get(ab, 10) - 10) // 2
        return str({"spell_dc": 8 + pb + mod, "to_hit": pb + mod, "damage_mod": mod}[what])
    return json.loads(PLACEHOLDER.sub(lambda x: value(x.group(1)).replace('"', '\\"'), json.dumps(m)))


def proficiency_bonus(m):
    cr = m.get("cr", {}).get("cr") if isinstance(m.get("cr"), dict) else m.get("cr")
    try:
        v = float(Fraction(str(cr))) if cr else 0
    except (ValueError, ZeroDivisionError):
        v = 0
    return 2 + max(0, (int(v) - 1) // 4) if v >= 1 else 2


def resolve_copies(entities, problems_out=None, templates=None):
    """Fill in every entity that copies another (`_copy`), applying its `_mod`s and templates."""
    index = {(e["name"].lower(), e["source"].lower()): e for e in entities}

    def resolve(e, depth=0):
        if "_copy" not in e or depth > 8:
            return e
        c = e["_copy"]
        base = index.get((c["name"].lower(), c["source"].lower()))
        if base is None:
            return e
        base = resolve(base, depth + 1)
        merged = {k: copy.deepcopy(v) for k, v in base.items() if k not in COPY_SKIP}
        merged.update({k: v for k, v in e.items() if k != "_copy"})
        problems = []
        for prop, mods in (c.get("_mod") or {}).items():
            for mod in (mods if isinstance(mods, list) else [mods]):
                if isinstance(mod, str):
                    mod = {"mode": mod}
                _apply_mod(merged, prop, mod, problems)
        for ref in c.get("_templates") or []:
            t = (templates or {}).get((ref["name"].lower(), ref["source"].lower()))
            if t:
                apply_template(merged, t, problems)
            else:
                problems.append(f"monster template {ref['name']} not found")
        if problems and problems_out is not None:
            problems_out[(e["name"], e["source"])] = problems
        merged["_copied_from"] = f"{c['name']} ({c['source']})"
        return merged

    return [fill_placeholders(resolve(e)) for e in entities]


VERSION_SKIP = (COPY_SKIP - {"page"}) | {"_copied_from"}
VARIABLE = re.compile(r"\{\{(\w+)\}\}")


def _version_name(name):
    """"Base; Variant" -> "Base (Variant)"."""
    base, sep, variant = name.partition("; ")
    return f"{base} ({variant})" if sep else name


def _substitute(obj, variables, problems):
    """Replace every {{var}} in the strings of obj; an unknown variable is left and recorded."""
    def fill(m):
        if m.group(1) in variables:
            return str(variables[m.group(1)])
        problems.append(f"variable {m.group(1)} not set")
        return m.group(0)

    def walk(x):
        if isinstance(x, str):
            return VARIABLE.sub(fill, x)
        if isinstance(x, list):
            return [walk(v) for v in x]
        if isinstance(x, dict):
            return {k: walk(v) for k, v in x.items()}
        return x
    return walk(obj)


def expand_versions(e, problems=None):
    """An entity's `_versions` as full entities (species lineages, feat variants).

    A plain version names itself "Base; Variant", adds its own fields over the base and applies its `_mod`.
    An `_abstract` with `_implementations` makes one entity per implementation, with the implementation's
    `_variables` filled into every {{var}} of the abstract. The base entity is not changed. A modification
    that cannot be applied is recorded in the entity's `_problems` and, when given, in `problems`.
    """
    out = []
    base = {k: copy.deepcopy(v) for k, v in e.items() if k not in VERSION_SKIP}

    def make(name, fields, mods, variables=None):
        local = []
        if variables is not None:
            fields = _substitute(fields, variables, local)
            mods = _substitute(mods, variables, local)
            name = _substitute(name, variables, local)
        mods = copy.deepcopy(mods)
        ent = copy.deepcopy(base)
        ent.update(copy.deepcopy(fields))
        ent["name"] = _version_name(name)
        for prop, group in (mods or {}).items():
            for mod in (group if isinstance(group, list) else [group]):
                _apply_mod(ent, prop, mod if isinstance(mod, dict) else {"mode": mod}, local)
        if local:
            ent["_problems"] = list(ent.get("_problems", [])) + local
            if problems is not None:
                problems.extend(f"{ent['name']}: {p}" for p in local)
        out.append(ent)

    for v in e.get("_versions") or []:
        if "_abstract" in v:
            abstract = copy.deepcopy(v["_abstract"])
            mods = abstract.pop("_mod", None)
            name = abstract.pop("name", e["name"])
            for impl in v.get("_implementations") or []:
                fields = dict(abstract, **{k: x for k, x in impl.items() if k != "_variables"})
                make(name, fields, mods, impl.get("_variables") or {})
        else:
            make(v["name"], {k: x for k, x in v.items() if k not in ("name", "_mod")}, v.get("_mod"))
    return out


# ---------------------------------------------------------------- {@tag} markup

class Links:
    """Looks up the note for a {@kind name|source} reference."""

    def __init__(self):
        self.exact, self.by_name, self.books = {}, {}, {}

    def add(self, kind, name, source, note):
        self.exact[(kind, name.lower(), source.lower())] = note
        self.by_name.setdefault((kind, name.lower()), note)

    def find(self, kind, name, source=None):
        if source and (kind, name.lower(), source.lower()) in self.exact:
            return self.exact[(kind, name.lower(), source.lower())]
        return self.by_name.get((kind, name.lower()))


SIMPLE = {"b": "**{}**", "bold": "**{}**", "i": "*{}*", "italic": "*{}*", "u": "{}", "s": "~~{}~~",
          "strike": "~~{}~~", "note": "*{}*", "code": "`{}`", "sup": "{}", "sub": "{}", "kbd": "`{}`"}
ATK = {"mw": "Melee Weapon Attack:", "rw": "Ranged Weapon Attack:", "mw,rw": "Melee or Ranged Weapon Attack:",
       "ms": "Melee Spell Attack:", "rs": "Ranged Spell Attack:", "ms,rs": "Melee or Ranged Spell Attack:",
       "m": "Melee Attack:", "r": "Ranged Attack:"}


_NESTED_LINKS = False  # set per library by ft_notes.build: only 2024 keeps a link whole inside a formatting tag
_BAR = "\x00"
_LINK = re.compile(r"\[\[[^\[\]]*\]\]")


def set_nested_links(on):
    """2024 only: the 2014 output depends on the old cut at the link's own pipe, so it stays the default."""
    global _NESTED_LINKS
    _NESTED_LINKS = bool(on)


def render_text(s, links, self_note=None):
    """5e.tools inline markup -> Markdown with wikilinks."""
    if not isinstance(s, str):
        return str(s)
    # innermost tags first, so nested markup resolves
    pat = re.compile(r"\{@(\w+)(?: ([^{}]*))?\}")
    if _NESTED_LINKS:  # hide a resolved link's pipe from the outer tag's split, restore it at the end
        hide = lambda b: _LINK.sub(lambda m: m.group(0).replace("|", _BAR), b)
        tag = lambda m: _tag(m.group(1), hide(m.group(2) or ""), links, self_note)
    else:
        tag = lambda m: _tag(m.group(1), m.group(2) or "", links, self_note)
    for _ in range(10):
        new = pat.sub(tag, s)
        if new == s:
            break
        s = new
    return s.replace(_BAR, "|") if _NESTED_LINKS else s


def _tag(tag, body, links, self_note):
    parts = body.split("|")
    text = parts[0]
    if tag in SIMPLE:
        return SIMPLE[tag].format(text)
    if tag == "atk":
        return f"*{ATK.get(text, 'Attack:')}*"
    if tag == "h":
        return "*Hit:* "
    if tag == "hit":
        return f"{int(text):+d}" if re.fullmatch(r"-?\d+", text) else text
    if tag == "dc":
        return f"DC {text}"
    if tag == "recharge":
        return f"(Recharge {text}–6)" if text and text != "6" else "(Recharge 6)"
    if tag in ("damage", "dice", "d20", "chance", "scaledice", "scaledamage", "autodice", "coinflip"):
        if tag in ("scaledice", "scaledamage"):
            return parts[-1] if len(parts) > 2 else text
        if tag == "d20":
            return f"{int(text):+d}" if re.fullmatch(r"-?\d+", text) else text
        if tag == "chance":
            return parts[1] if len(parts) > 1 and parts[1] else f"{text} percent"
        return parts[1] if len(parts) > 1 and parts[1] and tag == "dice" else text
    if tag in TAG_KIND:
        kind, default = TAG_KIND[tag]
        source = parts[1] if len(parts) > 1 and parts[1] else default
        display = parts[2] if len(parts) > 2 and parts[2] else text
        note = links.find(kind, text, source) if links else None
        if note and note != self_note:
            return f"[[{note}|{display}]]"
        return display
    if tag in ("book", "adventure"):
        display = text
        if links and len(parts) > 1:
            note = links.books.get((parts[1].lower(), parts[2] if len(parts) > 2 else "0"))
            if note:
                return f"[[{note}|{display}]]"
        return display
    return text  # filters, rules links, areas...: plain text, there is no note to point at


# ---------------------------------------------------------------- entry trees

def render_entries(entries, links, depth=2, self_note=None):
    """A 5e.tools entries list -> Markdown blocks (joined with blank lines)."""
    out = []
    for e in entries or []:
        out.extend(_entry(e, links, depth, self_note))
    return "\n\n".join(b for b in out if b and b.strip())


def _entry(e, links, depth, self_note):
    T = lambda s: render_text(s, links, self_note)
    if isinstance(e, str):
        return [T(e)]
    if not isinstance(e, dict):
        return []
    t = e.get("type", "entries")
    name = e.get("name")
    if t in ("entries", "section", "inset", "insetReadaloud", "variant", "variantInner", "variantSub",
             "optfeature", "inlineBlock", "homebrew", "refClassFeature", "refSubclassFeature", "refOptionalfeature"):
        if t in ("inset", "insetReadaloud", "variant"):
            kind = {"insetReadaloud": "quote", "variant": "example"}.get(t, "note")
            body = render_entries(e.get("entries"), links, depth + 1, self_note)
            head = f"> [!{kind}]" + (f" {T(name)}" if name else "")
            lines = [head] + ["> " + ln if ln else ">" for ln in body.splitlines()]
            return ["\n".join(lines)]
        blocks = []
        sub = e.get("entries") or []
        if name and t in ("section", "entries") and depth <= 6 and any(isinstance(x, dict) and x.get("type") in
                                                                     ("entries", "section", "table", "list") for x in sub):
            blocks.append("#" * min(depth, 6) + " " + T(name))
            blocks += _flatten(sub, links, depth + 1, self_note)
        elif name:
            # a named paragraph: lead-in in bold, as the books print it
            rest = _flatten(sub, links, depth + 1, self_note)
            if rest and not rest[0].startswith(("#", "|", ">", "- ")):
                rest[0] = f"***{T(name).rstrip('.')}.*** {rest[0]}"
            else:
                rest.insert(0, f"***{T(name).rstrip('.')}.***")
            blocks += rest
        else:
            blocks += _flatten(sub, links, depth, self_note)
        return blocks
    if t == "list":
        lines = []
        for it in e.get("items", []):
            if isinstance(it, dict) and it.get("type") in ("item", "itemSub", "itemSpell"):
                body = it.get("entry") or " ".join(render_entries([x], links, depth, self_note) for x in it.get("entries", []))
                lines.append(f"- **{T(it.get('name', ''))}** {T(body)}".rstrip())
            else:
                lines.append("- " + render_entries([it], links, depth + 1, self_note).replace("\n\n", " "))
        return ["\n".join(lines)]
    if t in ("item", "itemSub", "itemSpell"):
        body = e.get("entry") or render_entries(e.get("entries"), links, depth, self_note)
        return [f"**{T(name or '')}** {T(body)}".strip()]
    if t == "table":
        return [_table(e, links, self_note)]
    if t == "quote":
        body = render_entries(e.get("entries"), links, depth, self_note)
        by = f"\n>\n> — {T(e['by'])}" + (f", *{T(e['from'])}*" if e.get("from") else "") if e.get("by") else ""
        return ["\n".join("> " + ln for ln in body.splitlines()) + by]
    if t == "statblock":
        kind, _ = TAG_KIND.get(e.get("tag", "creature"), ("creature", "MM"))
        note = links.find(kind, e.get("name", ""), e.get("source")) if links else None
        return [f"![[{note}]]"] if note else []
    if t == "spellcasting":
        return [_spellcasting(e, links, self_note)]
    if t in ("abilityDc", "abilityAttackMod"):
        attrs = " or ".join(a.title() for a in e.get("attributes", []))
        what = "Spell save DC" if t == "abilityDc" else "Spell attack modifier"
        extra = "8 + your proficiency bonus + your " if t == "abilityDc" else "your proficiency bonus + your "
        return [f"**{T(name or what)}** = {extra}{attrs} modifier"]
    if t == "hr":
        return ["---"]
    if t in ("image", "gallery", "flowchart", "pagebreak", "ingredient", "statblockInline", "dice"):
        return []
    if t == "inline":
        return ["".join(render_entries([x], links, depth, self_note) for x in e.get("entries", []))]
    if t == "options":
        return _flatten(e.get("entries"), links, depth, self_note)
    if "entries" in e:
        return _flatten(e["entries"], links, depth, self_note)
    if "entry" in e:
        return [T(e["entry"])]
    return []


def _flatten(entries, links, depth, self_note):
    out = []
    for x in entries or []:
        out.extend(_entry(x, links, depth, self_note))
    return out


def _cell(c, links, self_note):
    if isinstance(c, dict):
        if c.get("type") == "cell":
            r = c.get("roll", {})
            if "exact" in r:
                return str(r["exact"])
            if "min" in r:
                return f"{r['min']}–{r['max']}"
            return render_text(c.get("entry", ""), links, self_note)
        return render_entries([c], links, 9, self_note).replace("\n\n", " ").replace("\n", " ")
    return render_text(str(c), links, self_note).replace("\n", " ")


def _table(e, links, self_note):
    rows = [[_cell(c, links, self_note).replace("|", "\\|") for c in r] for r in e.get("rows", [])
            if isinstance(r, list)]
    head = [render_text(h, links, self_note).replace("|", "\\|") for h in e.get("colLabels", [])]
    width = max([len(head)] + [len(r) for r in rows] + [1])
    head = head + [""] * (width - len(head))
    lines = []
    if e.get("caption"):
        lines.append(f"**{render_text(e['caption'], links, self_note)}**\n")
    lines.append("| " + " | ".join(head) + " |")
    lines.append("|" + "---|" * width)
    lines += ["| " + " | ".join(r + [""] * (width - len(r))) + " |" for r in rows]
    return "\n".join(lines)


def _spellcasting(sc, links, self_note):
    T = lambda s: render_text(s, links, self_note)
    head = " ".join(T(x) for x in sc.get("headerEntries", []) if isinstance(x, str))
    lines = [f"***{T(sc.get('name', 'Spellcasting')).rstrip('.')}.*** {head}".rstrip()]
    spell_list = lambda xs: ", ".join(T(x) if isinstance(x, str) else T(x.get("entry", "")) for x in xs)
    if sc.get("will"):
        lines.append(f"At will: {spell_list(sc['will'])}")
    for k, xs in sorted((sc.get("daily") or {}).items()):
        n = k.rstrip("e")
        lines.append(f"{n}/day{' each' if k.endswith('e') else ''}: {spell_list(xs)}")
    for lvl, block in sorted((sc.get("spells") or {}).items(), key=lambda kv: int(kv[0])):
        label = "Cantrips (at will)" if lvl == "0" else \
            f"{lvl}{'st' if lvl == '1' else 'nd' if lvl == '2' else 'rd' if lvl == '3' else 'th'} level" + \
            (f" ({block['slots']} slot{'s' if block['slots'] != 1 else ''})" if block.get("slots") else "")
        lines.append(f"{label}: {spell_list(block.get('spells', []))}")
    for k, xs in sorted((sc.get("rest") or {}).items()):
        lines.append(f"{k.rstrip('e')}/rest{' each' if k.endswith('e') else ''}: {spell_list(xs)}")
    lines += [T(x) for x in sc.get("footerEntries", []) if isinstance(x, str)]
    return "  \n".join(lines)
