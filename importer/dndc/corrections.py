"""Hand or agent corrections for stat blocks the OCR damaged, read from the page image.

work/corrections.json maps a key to fields to override:
    "<book slug>|<page>|<n>"    the n-th parsed creature on that page (0-based)
    "<book slug>|<page>|u<n>"   the n-th Armor Class line on that page that did not parse;
                                the correction then supplies the whole stat block

Fields (all optional): name, meta, ac, hp, speed, saves, skills, dv, dr, di, ci, senses,
languages, cr, abilities {str..cha}, no_scores (the book prints none), sections {traits|actions|bonus_actions|reactions|
legendary_actions|lair_actions: [{name, text}]}, verified (the printed numbers really
do not add up; the arithmetic issues are dropped), skip (not a stat block).

After a correction the block is validated again, so a wrong correction stays flagged.
"""
import json
import re
import os

from . import parse as P

FIELD_KEYS = ("ac", "hp", "speed", "saves", "skills", "dv", "dr", "di", "ci", "senses", "languages", "cr", "pb")
ARITHMETIC = ("do not match", "does not match")


def load(path):
    return json.load(open(path)) if os.path.exists(path) else {}


def key_for(slug, page, n, unparsed=False):
    return f"{slug}|{page}|{'u' if unparsed else ''}{n}"


def _sections(fix):
    out = {}
    for sec, entries in (fix.get("sections") or {}).items():
        out[sec] = [{"name": e.get("name", "").strip().rstrip("."),
                     "lines": [{"text": e.get("text", ""), "p": 0, "col": 0, "x0": 0, "h": None, "size": 0}]}
                    for e in entries]
    return out


ALIGN_FIRST = re.compile(r"^((?:lawful|neutral|chaotic|unaligned|any)[a-z ]*?)\s+(Tiny|Small|Medium|Large|Huge|Gargantuan)\b\s*(.+)$",
                         re.I)


def _size_first(meta):
    """Fifth Edition Foes prints "Unaligned Large monstrosity"; the parser reads "Large monstrosity, unaligned"."""
    m = ALIGN_FIRST.match(meta.strip())
    if not m:
        return meta
    return f"{m.group(2).title()} {m.group(3).strip()}, {m.group(1).strip().lower()}"


def apply_one(c, fix):
    if fix.get("name"):
        c["name"], c["name_inferred"] = fix["name"], False
    if fix.get("meta"):
        c["meta"] = _size_first(fix["meta"])
    for k in FIELD_KEYS:
        if fix.get(k):
            c["fields"][k] = fix[k]
    if fix.get("abilities"):
        for a, v in fix["abilities"].items():
            if a in c["abilities"] and isinstance(v, int):
                c["abilities"][a] = v
        c["printed_mods"] = {}  # the corrected scores replace what the OCR printed
    if fix.get("sections"):
        c["sections"] = _sections(fix)
        c["intro"] = {}
    P.validate_creature(c)
    # read off the page as printed: scaling summons ("5 + five times your level", "Challenge —")
    if fix.get("hp"):
        c["issues"] = [i for i in c["issues"] if i != "hit points unreadable"]
    if fix.get("cr"):
        c["issues"] = [i for i in c["issues"] if i != "challenge unreadable"]
    if fix.get("no_scores"):  # the book prints no ability scores for this one (molds, grasses)
        c["issues"] = [i for i in c["issues"] if not i.startswith("ability scores missing")]
    if fix.get("verified"):
        c["issues"] = [i for i in c["issues"] if not any(a in i for a in ARITHMETIC)]
        c["verified_as_printed"] = True
    c["corrected"] = True
    return c


def new_creature(fix, page):
    c = {"kind": "creature", "start": -1, "end": -1, "page": page, "name": fix.get("name"),
         "name_inferred": False, "meta": fix.get("meta"), "fields": {},
         "abilities": {a: None for a in P.ABIL}, "printed_mods": {}, "sections": {}, "intro": {}}
    return apply_one(c, fix)


def apply(ents, book, fixes):
    """Apply this book's corrections to its parsed entities; return the new list."""
    slug = book["slug"]
    seen = {}
    out = []
    for e in ents:
        if e["kind"] == "creature":
            n = seen.get(e["page"], 0)
            seen[e["page"]] = n + 1
            fix = fixes.get(key_for(slug, e["page"], n))
            if fix and fix.get("skip"):
                continue
            if fix:
                apply_one(e, fix)
        out.append(e)
    useen = {}
    remaining = []
    for page, text in book.get("unparsed", []):
        n = useen.get(page, 0)
        useen[page] = n + 1
        fix = fixes.get(key_for(slug, page, n, unparsed=True))
        if fix and fix.get("skip"):
            continue
        if fix and fix.get("name"):
            c = new_creature(fix, page)
            c["source"], c["book"] = book["abbr"], book["title"]
            out.append(c)
        else:
            remaining.append((page, text))
    book["unparsed"] = remaining
    return out
