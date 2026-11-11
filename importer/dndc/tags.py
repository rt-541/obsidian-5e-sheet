"""Nested tags under 5e/ for browsing the compendium in Obsidian's tag pane.

Exact values (CR, HP, level) stay properties so Bases can sort and filter them;
tags carry the facets people browse by. Obsidian tags allow letters, digits,
"-", "_" and "/" for nesting, so "1/4" is written "1-4".
"""
import re

DAMAGE = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison",
          "psychic", "radiant", "slashing", "thunder"]
CONDITIONS = ["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated",
              "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]
ABILITIES = {"strength": "str", "dexterity": "dex", "constitution": "con", "intelligence": "int",
             "wisdom": "wis", "charisma": "cha"}
ALIGNMENTS = ["lawful good", "neutral good", "chaotic good", "lawful neutral", "neutral", "chaotic neutral",
              "lawful evil", "neutral evil", "chaotic evil", "unaligned", "any alignment"]
# trait names worth a tag of their own -> tag
TRAITS = {"spellcasting": "spellcasting", "innate spellcasting": "spellcasting", "magic resistance": "magic-resistance",
          "legendary resistance": "legendary-resistance", "regeneration": "regeneration", "pack tactics": "pack-tactics",
          "amphibious": "amphibious", "incorporeal movement": "incorporeal", "shapechanger": "shapechanger",
          "sunlight sensitivity": "sunlight-sensitivity", "flyby": "flyby", "rampage": "rampage"}


def part(s):
    """One tag segment: lower case, words joined by "-", nothing Obsidian rejects."""
    s = re.sub(r"[’']", "", str(s).lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def tag(*parts):
    return "5e/" + "/".join(part(p) for p in parts if part(p))


def cr_value(cr):
    if not cr or not re.fullmatch(r"\d+(/\d+)?", str(cr)):  # "Unknown", "—"
        return None
    if "/" in cr:
        a, b = cr.split("/")
        return round(int(a) / int(b), 3)
    return int(cr)


def tier(v):
    return 1 if v <= 4 else 2 if v <= 10 else 3 if v <= 16 else 4


def common(e):
    out = [tag("source", e["source"])]
    if e.get("issues"):
        out.append("5e/review")
    return out


TYPES = ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant",
         "humanoid", "monstrosity", "ooze", "plant", "undead"]


def creature_type(word):
    """Snap an OCR'd type ("humonoid", "monstrosi", "beas") to the official one, or None."""
    import difflib
    word = word.lower()
    pre = [t for t in TYPES if len(word) >= 2 and t.startswith(word)]
    if len(pre) == 1:
        return pre[0]
    close = difflib.get_close_matches(word, TYPES, n=1, cutoff=0.7)
    return close[0] if close else None


def creature_tags(c, size, ctype, align, f, vocab):
    t = ["5e/creature"]
    v = cr_value(c.get("cr"))
    if v is not None:
        t += [tag("cr", c["cr"].replace("/", "-")), tag("tier", tier(v))]
    if ctype:
        sw = re.match(r"swarm of (?:tiny|small|medium|large) (\w+)", ctype.lower())
        if sw:
            t.append("5e/type/swarm")
            base = creature_type(re.sub(r"s$", "", sw.group(1)))
            if base:
                t.append(tag("type", base))
        else:
            m = re.match(r"([a-z]+)\s*(?:\(([^)]*)\))?", ctype.lower())
            base = creature_type(m.group(1)) if m else None
            if base:
                t.append(tag("type", base))
                for sub in (m.group(2) or "").split(","):
                    sub = sub.strip()
                    words = re.findall(r"[a-z]+", sub)
                    # OCR-garbled subtypes ("gohlinoid", "dem-on") are words the books never use elsewhere
                    if words and "any" not in words and len(words) <= 2 and not re.search(r"\d", sub) \
                            and all(len(w) >= 3 and vocab.get(w, 0) >= 3 for w in words):
                        t.append(tag("type", base, sub))
    if size:
        t.append(tag("size", size))
    if align and align.lower() in ALIGNMENTS:
        t.append(tag("align", align))
    speed = (f.get("speed") or "").lower()
    for mode in ("fly", "swim", "burrow", "climb"):
        if re.search(rf"\b{mode}\b", speed):
            t.append(tag("moves", mode))
    if "hover" in speed:
        t.append("5e/moves/hover")
    secs = c.get("sections", {})
    for key, name in (("legendary_actions", "legendary"), ("mythic_actions", "mythic"), ("lair_actions", "lair")):
        if secs.get(key):
            t.append(tag("has", name))
    for e in secs.get("traits", []):
        hit = TRAITS.get(re.sub(r"\s*\(.*", "", e["name"]).strip().lower())
        if hit and tag("has", hit) not in t:
            t.append(tag("has", hit))
    if ctype and "shapechanger" in ctype.lower() and "5e/has/shapechanger" not in t:
        t.append("5e/has/shapechanger")
    for key, word in (("di", "immune"), ("dr", "resist"), ("dv", "vulnerable")):
        val = (f.get(key) or "").lower()
        for d in DAMAGE:
            if re.search(rf"\b{d}\b", val):
                t.append(tag(word, d))
        if "nonmagical" in val:
            t.append(tag(word, "nonmagical-weapons"))
    ci = (f.get("ci") or "").lower()
    for cond in CONDITIONS:
        if re.search(rf"\b{cond}\b", ci):
            t.append(tag("immune", cond))
    return t + common(c)


def spell_tags(s, classes, body):
    f = s["fields"]
    t = ["5e/spell", "5e/spell/cantrip" if s["level"] == 0 else tag("spell", "level", s["level"]),
         tag("school", s["school"])]
    if s["ritual"]:
        t.append("5e/spell/ritual")
    if "concentration" in f.get("Duration", "").lower():
        t.append("5e/spell/concentration")
    ct = re.split(r",| which", f.get("Casting Time", ""))[0].strip().lower()
    ct = re.sub(r"^1 ", "", ct)
    if ct:
        t.append(tag("cast", ct))
    for c in classes:
        t.append(tag("class", c))
    low = body.lower()
    for ab, short in ABILITIES.items():
        if f"{ab} saving throw" in low:
            t.append(tag("save", short))
    if "spell attack" in low:
        t.append("5e/spell/attack")
    for d in DAMAGE:
        if re.search(rf"\b{d} damage\b", low):
            t.append(tag("damage", d))
    if re.search(r"regains? (?:a number of )?hit points|regain hit points", low):
        t.append("5e/spell/healing")
    for cond in CONDITIONS:
        if re.search(rf"\b(?:is|be|becomes?|are) {cond}\b", low):
            t.append(tag("inflicts", cond))
    return t + common(s)


def item_tags(it):
    t = ["5e/item", tag("item", it["item_type"]), tag("rarity", it["rarity"])]
    m = re.search(r"requires attunement(?: by an? ([a-z, ]+?))?\)", it["meta"].lower())
    if m:
        t.append("5e/attunement")
        for who in re.split(r",\s*|\s+or\s+", m.group(1) or ""):
            if who.strip():
                t.append(tag("attunement", who.strip()))
    return t + common(it)


def condition_tags(c):
    return ["5e/condition"] + common(c)
