"""Helpers shared by the 2024 converters."""
import re

from ..ft_classes import op, slug

FEAT_CATEGORIES = {"G": "general", "O": "origin", "FS": "fighting-style", "FS:P": "fighting-style-paladin",
                   "FS:R": "fighting-style-ranger", "EB": "epic-boon", "D": "dragonmark", "DG": "dark-gift"}

INNATE_PROBLEM = "innate or chosen spells kept in the text only"
LEVEL_PROBLEM = "spells by spell level or uses per day kept in the text only"
ALTERNATIVES_PROBLEM = "alternative spell lists kept in the text only"


def category_slug(code):
    return FEAT_CATEGORIES.get(code) or re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-")


def spell_slugs(spec):
    """["name|src#c", ...] -> id slugs; dict members (choose objects) are skipped."""
    return [slug(re.split(r"[|#]", s)[0]) for s in spec if isinstance(s, str)]


def _block_spells(block):
    """One block -> ({level: [slugs]}, problem or None)."""
    levels, innate, other = {}, bool(block.get("innate")), False
    for key in ("prepared", "known", "expanded"):
        for lvl, spells in (block.get(key) or {}).items():
            lvl = "1" if lvl == "_" else lvl
            if not isinstance(spells, list) or not lvl.isdigit():
                other = True
                continue
            innate = innate or any(not isinstance(x, str) for x in spells)
            names = [x for x in spell_slugs(spells) if x not in levels.get(lvl, [])]
            if names:
                levels.setdefault(lvl, []).extend(names)
    problem = INNATE_PROBLEM if innate else LEVEL_PROBLEM if other else None
    return levels, problem


def additional_spell_ops(blocks, used):
    """An entry's additionalSpells -> ({level: [grant ops]}, problems).

    prepared, known and expanded become grants ("_" is level 1). innate and choose objects, spell-level
    keys and uses per day cannot be written as ops: each such block adds one problem line. Several
    blocks are alternatives the player picks one of, so only the spells every block shares at the same
    level are granted.
    """
    parsed = [_block_spells(b) for b in blocks]
    problems = [p for _, p in parsed if p]
    if len(parsed) > 1:
        shared = {}
        for lvl, names in parsed[0][0].items():
            keep = [n for n in names if all(n in other.get(lvl, []) for other, _ in parsed[1:])]
            if keep:
                shared[lvl] = keep
        merged = shared
        problems.append(ALTERNATIVES_PROBLEM)
    else:
        merged = parsed[0][0] if parsed else {}
    levels = {}
    for lvl in sorted(merged, key=int):
        levels[lvl] = [op("grant", used, f"spells-{lvl}", spells=merged[lvl])]
    return levels, list(dict.fromkeys(problems))


def title_name(s):
    """Capitalize each word without touching what follows an apostrophe."""
    return re.sub(r"(^|[\s(/-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), s)


def outside_copy_problem(e, lib):
    base = e.get("_copy")
    if base and lib.sources is not None and base.get("source") not in lib.sources:
        return f"inherits from {base.get('name')} ({base.get('source')}), a book outside this library"
    return None
