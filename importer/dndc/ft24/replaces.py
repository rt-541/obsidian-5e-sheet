"""replaces: which 2014 note ids a 2024 note stands in for, read from the data's `reprintedAs`.

Ids come from the built 2014 library (a collision suffix like -oldb is part of the id), never from slugging
a name. A target outside the 2024 library's books, or an older entry the 2014 library does not have, is
counted and skipped, not an error.
"""
import json
import os

# (data key, kind) pairs the clone's `reprintedAs` appears under; items and base items share one list
SOURCES = (("monsters", "creature"), ("spells", "spell"), ("items", "item"), ("classes", "class"),
           ("subclasses", "subclass"), ("races", "race"), ("subraces", "subrace"), ("feats", "feat"),
           ("backgrounds", "background"))
PARENT_OF = {"subclass": "class", "subrace": "race"}


def _scalar(tok):
    tok = tok.strip()
    try:
        return json.loads(tok)
    except ValueError:
        return tok


def _top_level(path):
    """The top-level `key: scalar` lines of a note's front matter (lists and mappings are skipped)."""
    out = {}
    with open(path, encoding="utf-8") as f:
        if f.readline().rstrip("\n") != "---":
            return out
        for line in f:
            line = line.rstrip("\n")
            if line == "---":
                break
            if line[:1] in (" ", "-", "") or ": " not in line:
                continue
            k, v = line.split(": ", 1)
            out[k] = _scalar(v)
    return out


def legacy_index(lib_root):
    """{(kind, name.lower(), source.lower(), parent): id} for every note of a built library.

    kind is `type` without `5e-`; parent is the `class` of a subclass or the `race` of a subrace, else "".
    """
    out = {}
    for d, _, files in os.walk(lib_root):
        for f in sorted(files):
            if not f.endswith(".md"):
                continue
            fm = _top_level(os.path.join(d, f))
            t, i = fm.get("type"), fm.get("id")
            if not (isinstance(t, str) and t.startswith("5e-") and isinstance(i, str) and i):
                continue
            kind = t[3:]
            parent = fm.get(PARENT_OF.get(kind, ""), "") or ""
            key = (kind, str(fm.get("name", "")).lower(), str(fm.get("source", "")).lower(), str(parent))
            out.setdefault(key, i)
    return out


def _uid(t):
    return t.get("uid") if isinstance(t, dict) else t


def reprints(data):
    """(kind, name, source, parent, targets) for every entry of the clone (all sources) with `reprintedAs`.

    parent is "Class|ClassSource" for a subclass, "Race|RaceSource" for a subrace, else "".
    targets are "Name|SRC" strings (the dict form {"uid": ...} is unwrapped); a subclass target keeps
    its "ShortName|Class|ClassSrc|Src" form (the subclass's shortName, not its full name).
    """
    for key, kind in SOURCES:
        for e in data.get(key) or []:
            targets = [u for u in (_uid(t) for t in e.get("reprintedAs") or []) if isinstance(u, str) and u]
            if not targets:
                continue
            parent = ""
            if kind == "subclass":
                parent = f"{e.get('className', '')}|{e.get('classSource', '')}"
            elif kind == "subrace":
                parent = f"{e.get('raceName', '')}|{e.get('raceSource', '')}"
            yield kind, e.get("name", ""), e.get("source", ""), parent, targets


def _target(kind, uid):
    """(name, source, parent) of a reprint target, parent as "class|classsrc" lower case; None if unreadable."""
    p = uid.split("|")
    if kind == "subclass":
        return (p[0], p[3], f"{p[1]}|{p[2]}".lower()) if len(p) >= 4 and p[0] and p[3] else None
    return (p[0], p[1], "") if len(p) >= 2 and p[0] and p[1] else None


def assign(entities, reprints, legacy, lib, by_kind=None):
    """Set e["_replaces"] on library entities from reprints; returns {"assigned", "outside", "absent"}.

    Counted per (old entry, target) pair. outside: the target is not an entity of this library (its book
    is not one of lib.sources, or the entry is not written). absent: the old entry has no note in the 2014
    library. by_kind, when given, is filled with the same three counts per kind.
    """
    total = {"assigned": 0, "outside": 0, "absent": 0}
    if legacy is None:
        return total
    where = {}
    for kind, e in entities:
        parent = ""
        if kind in PARENT_OF and e.get("_parent"):
            parent = f"{e['_parent']['name']}|{e['_parent']['source']}".lower()
        for name in {e["name"], e.get("shortName") or e["name"]}:  # a subclass target names its short name
            where.setdefault((kind, name.lower(), e["source"].lower(), parent), e)
    by_name = {}
    for (k, n, _, p), i in legacy.items():
        if k in PARENT_OF.values() and not p:
            by_name.setdefault((k, n), i)
    found = {}
    for kind, name, source, parent, targets in reprints:
        count = by_kind.setdefault(kind, {"assigned": 0, "outside": 0, "absent": 0}) if by_kind is not None else None
        old_parent = ""
        if parent:
            pk = PARENT_OF[kind]
            pname, _, psrc = parent.partition("|")
            # the 2024 clone sometimes re-homes an old subclass under the new class: fall back to the class name
            old_parent = legacy.get((pk, pname.lower(), psrc.lower(), "")) or by_name.get((pk, pname.lower()))
        for uid in targets:
            t = _target(kind, _uid(uid)) if isinstance(_uid(uid), str) else None
            ent = where.get((kind,) + (t[0].lower(), t[1].lower(), t[2])) if t else None
            if ent is None or (lib.sources is not None and t[1] not in lib.sources):
                state = "outside"
            else:
                old = legacy.get((kind, name.lower(), source.lower(), old_parent or "")) if (old_parent is not None) else None
                state = "assigned" if old else "absent"
            total[state] += 1
            if count is not None:
                count[state] += 1
            if state == "assigned":
                found.setdefault(id(ent), (ent, set()))[1].add(old)
    for ent, ids in found.values():
        ids = sorted(ids)
        if ids and ids != [ent["_id"]]:
            ent["_replaces"] = ids
    return total
