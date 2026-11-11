"""Checks on a built tree, stdlib only (runs under system python through verify.py).

stamp_diff: the only difference between two builds of a library is the edition stamp.
The `check_*` functions verify a built WotC 2024 tree against the raw data; each returns a list of
problem lines (empty = pass). Nothing here imports another dndc module: verify.py runs under
/usr/bin/python3 -I, where fitz (pulled in by render, ft_notes and fivetools) does not exist, so
the pieces of those modules the checks need (front matter reading, `_copy` presence, the slug) are
re-implemented below on purpose. PyYAML is imported only inside check_yaml.
"""
import glob
import json
import os
import re

# written out here on purpose: the check must not share code with the stamp it checks
EDITIONS = {"WotC": "2014", "Kobold Press": "2014", "Necromancer Games": "2014", "WotC 2024": "2024"}
_PREFIX = ("compendium", "5e")


def _files(root):
    out = set()
    for d, _, fs in os.walk(root):
        out.update(os.path.relpath(os.path.join(d, f), root) for f in fs)
    return out


def _unstamp(text, edition):
    """(text without the two stamp lines in the first front matter block, whether both were there)."""
    lines = text.split("\n")
    if lines[0] != "---" or "---" not in lines[1:]:
        return text, False
    end = lines.index("---", 1)
    fm = lines[1:end]
    want = [f'edition: "{edition}"', f'  - "5e/edition/{edition}"']
    if not all(w in fm for w in want):
        return text, False
    for w in want:
        fm.remove(w)
    return "\n".join(["---"] + fm + lines[end:]), True


def stamp_compare(old_root, new_root, libs):
    """(files compared, files stamped, problem lines)."""
    compared = stamped = 0
    problems = []
    for lib in libs:
        edition = EDITIONS.get(lib)
        if edition is None:
            problems.append(f"{lib}: unknown library")
            continue
        old_dir, new_dir = (os.path.join(r, *_PREFIX, lib) for r in (old_root, new_root))
        old_files, new_files = _files(old_dir), _files(new_dir)
        for rel in sorted(old_files - new_files):
            problems.append(f"{lib}/{rel}: only in OLD")
        for rel in sorted(new_files - old_files):
            problems.append(f"{lib}/{rel}: only in NEW")
        for rel in sorted(old_files & new_files):
            compared += 1
            with open(os.path.join(old_dir, rel), "rb") as f:
                old = f.read()
            with open(os.path.join(new_dir, rel), "rb") as f:
                new = f.read()
            if not rel.endswith(".md"):
                if old != new:
                    problems.append(f"{lib}/{rel}: changed")
                continue
            try:
                old_t, new_t = old.decode(), new.decode()
            except UnicodeDecodeError:
                problems.append(f"{lib}/{rel}: not utf-8")
                continue
            if old_t.split("\n", 1)[0] != "---" or "---" not in old_t.split("\n")[1:]:
                expect = f'---\nedition: "{edition}"\ntags: \n  - "5e/edition/{edition}"\n---\n\n' + old_t
                if new_t == expect:
                    stamped += 1
                else:
                    problems.append(f"{lib}/{rel}: no front matter in OLD and NEW is not the minimal stamp block")
                continue
            plain, ok = _unstamp(new_t, edition)
            if not ok:
                problems.append(f"{lib}/{rel}: not stamped with edition {edition}")
            elif plain != old_t:
                problems.append(f"{lib}/{rel}: differs beyond the stamp")
            else:
                stamped += 1
    return compared, stamped, problems


def stamp_diff(old_root, new_root, libs):
    """Problem lines; empty means the stamp is the only change."""
    return stamp_compare(old_root, new_root, libs)[2]


# ======================================================================== the 2024 library checks

LIB_2024 = "WotC 2024"
EDITION_2024 = "2024"
ABILS = ("str", "dex", "con", "int", "wis", "cha")
# every note type a writer in this importer emits (render and ft_notes: creature, spell, item,
# condition; ft_notes.rule_note: class, subclass, race, subrace, feat, background; Task 7: mastery)
KNOWN_TYPES = frozenset("5e-" + t for t in ("creature", "spell", "item", "condition", "class", "subclass", "race",
                                             "subrace", "feat", "background", "mastery"))
CR_XP = {"0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
         "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
         "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
         "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000,
         "28": 120000, "29": 135000, "30": 155000}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower().replace("'", "")).strip("-")


# ---------------------------------------------------------------- front matter (the writer's own format)

def _indent(line):
    return len(line) - len(line.lstrip(" "))


def _scalar(tok):
    tok = tok.strip()
    try:
        return json.loads(tok)
    except ValueError:
        return tok


def _block(lines, i, indent):
    """One nested block starting at lines[i] (indented `indent`): a list of `- item` or a mapping."""
    if lines[i][indent:].startswith("- "):
        out = []
        while i < len(lines) and _indent(lines[i]) == indent and lines[i][indent:].startswith("- "):
            out.append(_scalar(lines[i][indent + 2:]))
            i += 1
        return out, i
    out = {}
    while i < len(lines) and _indent(lines[i]) == indent and not lines[i][indent:].startswith("- "):
        key, sep, rest = lines[i][indent:].partition(":")
        if not sep:
            raise ValueError(f"no key in {lines[i]!r}")
        i += 1
        if rest.strip():
            out[key.strip()] = _scalar(rest)
        elif i < len(lines) and _indent(lines[i]) > indent:
            out[key.strip()], i = _block(lines, i, _indent(lines[i]))
        else:
            out[key.strip()] = ""
    return out, i


def front_lines(text):
    """The lines between the first two `---` lines, or None when the text has no front matter."""
    lines = text.split("\n")
    if lines[0] != "---" or "---" not in lines[1:]:
        return None
    return lines[1:lines.index("---", 1)]


def parse_front(text):
    """(mapping, None) read with the importer's writer format (render.frontmatter), or (None, why).

    Scalars are JSON, lists are `  - item` lines (an item that is a mapping or list is JSON on one
    line), nested mappings are indented two spaces per level and keep their keys as text. Hand-made
    notes may use other YAML; check_yaml is the judge of validity, this reader serves the content checks.
    """
    lines = front_lines(text)
    if lines is None:
        return None, "no front matter"
    if not lines:
        return {}, None
    try:
        fm, i = _block(lines, 0, 0)
        if i != len(lines):
            raise ValueError(f"unread line {lines[i]!r}")
        return fm, None
    except (ValueError, IndexError) as e:
        return None, str(e)


class Note:
    def __init__(self, path, rel, text):
        self.path, self.rel, self.text = path, rel, text   # path: vault path without .md; rel: under the library
        self.fm, self.err = parse_front(text)
        self.fm = self.fm or {}

    def get(self, key, default=None):
        return self.fm.get(key, default)

    @property
    def type(self):
        return self.fm.get("type")


class Tree:
    """Every .md note of one library under an out root, read once."""

    def __init__(self, out_root, lib=LIB_2024):
        self.out_root, self.lib = out_root, lib
        self.prefix = f"compendium/5e/{lib}/"
        self.base = os.path.join(out_root, "compendium", "5e", lib)
        self.notes = []
        for d, _, fs in os.walk(self.base):
            for f in sorted(fs):
                if f.endswith(".md"):
                    full = os.path.join(d, f)
                    rel = os.path.relpath(full, self.base).replace(os.sep, "/")
                    with open(full, encoding="utf-8") as fh:
                        self.notes.append(Note(self.prefix + rel[:-3], rel, fh.read()))
        self.notes.sort(key=lambda n: n.path)

    def of_type(self, t):
        return [n for n in self.notes if n.type == t]

    def page(self, rel):
        return next((n for n in self.notes if n.rel == rel), None)


# ---------------------------------------------------------------- check_counts

def enabled_ids(sources_path):
    with open(sources_path) as f:
        return {e["id"] for e in json.load(f)["sources"] if e["enabled"]}


def _json(data_dir, *parts, default=None):
    path = os.path.join(data_dir, "data", *parts)
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _has_stats_after_copy(m, index, depth=0):
    """hp or ac present on a monster after `_copy` resolution. A minimal re-implementation of
    fivetools.resolve_copies for this one question: a copy has the keys of its base (followed
    recursively, eight deep like the converter) overridden by its own. `_mod`s and templates that
    add or remove hp or ac are not applied; a copy whose base is missing keeps only its own keys."""
    if m.get("hp") or m.get("ac"):
        return True
    c = m.get("_copy")
    if not c or depth > 8:
        return False
    base = index.get((c["name"].lower(), c["source"].lower()))
    return base is not None and _has_stats_after_copy(base, index, depth + 1)


def _version_count(e):
    """Entities `fivetools.expand_versions` makes from one entry's `_versions`: one per version with a
    name, and one per implementation of an `_abstract`."""
    n = 0
    for v in e.get("_versions") or []:
        if "_abstract" in v:
            n += len(v.get("_implementations") or [])
        else:
            n += 1
    return n


def expected_counts(data_dir, sources_path):
    """{type: expected note count} from the raw 5e.tools JSON for the enabled source ids.

    Rules (these mirror ft_notes.build and rule_entities, written independently; a difference
    from the build is a finding, not a reason to bend either side):
    5e-creature   every monster entry of an enabled source (all bestiary-*.json) with hp or ac after _copy.
    5e-spell      every spell entry of an enabled source (spells/spells-*.json).
    5e-item       items.json and items-base.json entries of an enabled source without `_copy`, plus every
                  magicvariants.json entry whose `inherits.source` is enabled.
    5e-condition  conditionsdiseases.json condition + status + disease entries of an enabled source.
    5e-class      class/class-*.json classes of an enabled source.
    5e-subclass   subclasses of an enabled source, without `_copy`, whose (className, classSource) is an enabled class.
    5e-race       races.json `race` entries with a name of an enabled source (species).
    5e-subrace    the lineages: for every enabled species, one per `_versions` entry with a name and one per
                  implementation of an `_abstract`; plus old-style `subrace` entries of an enabled source with
                  a name whose (raceName, raceSource) is an enabled species.
    5e-feat       feats.json entries with a name of an enabled source, plus each one's expanded `_versions`
                  (counted like species lineages).
    5e-background backgrounds.json entries with a name of an enabled source.
    5e-mastery    items-base.json `itemMastery` entries of an enabled source.
    book-chapter  for each enabled book and adventure listed in books.json / adventures.json that has a
                  book/book-<id>.json or adventure/adventure-<id>.json file: the number of top-level
                  entries in its first `data` array (a chapter is one top-level entry).
    book-index    one per book or adventure with at least one chapter.
    """
    on = enabled_ids(sources_path)
    ok = lambda e: e.get("source") in on
    out = {}

    monsters = []
    for f in sorted(glob.glob(os.path.join(data_dir, "data", "bestiary", "bestiary-*.json"))):
        with open(f, encoding="utf-8") as fh:
            monsters += json.load(fh).get("monster", [])
    index = {(m["name"].lower(), m["source"].lower()): m for m in monsters if "name" in m and "source" in m}
    out["5e-creature"] = sum(1 for m in monsters if ok(m) and _has_stats_after_copy(m, index))

    spells = 0
    for f in sorted(glob.glob(os.path.join(data_dir, "data", "spells", "spells-*.json"))):
        with open(f, encoding="utf-8") as fh:
            spells += sum(1 for s in json.load(fh).get("spell", []) if ok(s))
    out["5e-spell"] = spells

    items = (_json(data_dir, "items.json", default={}).get("item", []) +
             (_json(data_dir, "items-base.json", default={}).get("baseitem", [])))
    variants = _json(data_dir, "magicvariants.json", default={}).get("magicvariant", [])
    out["5e-item"] = (sum(1 for i in items if ok(i) and not i.get("_copy")) +
                      sum(1 for v in variants if (v.get("inherits") or {}).get("source") in on))

    cd = _json(data_dir, "conditionsdiseases.json", default={})
    out["5e-condition"] = sum(1 for k in ("condition", "status", "disease") for c in cd.get(k, []) if ok(c))

    classes, subclasses = [], []
    for f in sorted(glob.glob(os.path.join(data_dir, "data", "class", "class-*.json"))):
        with open(f, encoding="utf-8") as fh:
            j = json.load(fh)
        classes += [c for c in j.get("class", []) if ok(c)]
        subclasses += [c for c in j.get("subclass", []) if ok(c)]
    have = {(c["name"].lower(), c["source"].lower()) for c in classes}
    out["5e-class"] = len(classes)
    out["5e-subclass"] = sum(1 for s in subclasses if not s.get("_copy") and
                             (s.get("className", "").lower(), s.get("classSource", "").lower()) in have)

    races = _json(data_dir, "races.json", default={})
    species = [r for r in races.get("race", []) if ok(r) and r.get("name")]
    species_keys = {(r["name"].lower(), r["source"].lower()) for r in species}
    out["5e-race"] = len(species)
    out["5e-subrace"] = (sum(_version_count(r) for r in species) +
                         sum(1 for s in races.get("subrace", []) if ok(s) and s.get("name") and
                             (s.get("raceName", "").lower(), s.get("raceSource", "").lower()) in species_keys))
    feats = [f for f in _json(data_dir, "feats.json", default={}).get("feat", []) if ok(f) and f.get("name")]
    out["5e-feat"] = len(feats) + sum(_version_count(f) for f in feats)
    out["5e-background"] = sum(1 for b in _json(data_dir, "backgrounds.json", default={}).get("background", [])
                               if ok(b) and b.get("name"))
    out["5e-mastery"] = sum(1 for m in _json(data_dir, "items-base.json", default={}).get("itemMastery", []) if ok(m))

    chapters = indexes = 0
    for kind, key in (("book", "book"), ("adventure", "adventure")):
        for b in _json(data_dir, f"{kind}s.json", default={}).get(key, []):
            if b.get("id") not in on:
                continue
            wrapped = _json(data_dir, kind, f"{kind}-{b['id'].lower()}.json", default={}).get(f"{kind}Data") or [{}]
            n = len(wrapped[0].get("data", []))
            chapters += n
            indexes += 1 if n else 0
    out["book-chapter"], out["book-index"] = chapters, indexes
    return out


def actual_counts(tree):
    """{type: note count}: typed notes by `type`, notes under Books/ as book-chapter and book-index
    (the index is the note named like its folder), index pages and the library page not counted."""
    out = {}
    for n in tree.notes:
        if n.rel.startswith("Books/"):
            parts = n.rel[:-3].split("/")
            kind = "book-index" if len(parts) == 3 and parts[1] == parts[2] else "book-chapter"
        elif n.type and n.type != "5e-library":
            kind = n.type
        else:
            continue
        out[kind] = out.get(kind, 0) + 1
    return out


def count_table(tree, data_dir, sources_path):
    """[(type, expected, actual)] over every type either side knows."""
    exp, act = expected_counts(data_dir, sources_path), actual_counts(tree)
    return [(t, exp.get(t, 0), act.get(t, 0)) for t in sorted(set(exp) | set(act))]


def check_counts(tree, data_dir, sources_path):
    return [f"{t}: expected {e}, found {a}" for t, e, a in count_table(tree, data_dir, sources_path) if e != a]


# ---------------------------------------------------------------- check_classes

def _raw_class_levels(data_dir):
    """{(name lower, source lower): set of levels where the raw class lists a feature}."""
    out = {}
    for f in sorted(glob.glob(os.path.join(data_dir, "data", "class", "class-*.json"))):
        with open(f, encoding="utf-8") as fh:
            for c in json.load(fh).get("class", []):
                levels = set()
                for ref in c.get("classFeatures", []):
                    s = ref if isinstance(ref, str) else (ref.get("classFeature") if isinstance(ref, dict) else None)
                    parts = (s or "").split("|")
                    if len(parts) > 3 and parts[3].strip().isdigit():
                        levels.add(int(parts[3]))
                out[(c["name"].lower(), c["source"].lower())] = levels
    return out


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def check_classes(tree, data_dir):
    out = []
    raw = _raw_class_levels(data_dir)
    class_ids = {n.get("id") for n in tree.of_type("5e-class")}
    for n in tree.of_type("5e-class"):
        where = n.path
        if not _is_int(n.get("hitDie")):
            out.append(f"{where}: hitDie missing or not a number")
        if not isinstance(n.get("saves"), list) or not n.get("saves"):
            out.append(f"{where}: saves missing or empty")
        if not _is_int(n.get("subclassLevel")):
            out.append(f"{where}: subclassLevel missing or not a whole number")
        levels = n.get("levels")
        if not isinstance(levels, dict) or not levels:
            out.append(f"{where}: no levels table")
            continue
        have = {int(k) for k in levels if str(k).isdigit()}
        want = raw.get((str(n.get("name", "")).lower(), str(n.get("source", "")).lower()))
        if want is None:
            out.append(f"{where}: not found in the class data (name {n.get('name')!r}, source {n.get('source')!r})")
            continue
        missing = sorted(want - have)
        if missing:
            out.append(f"{where}: no levels entry for level {', '.join(map(str, missing))}")
    for n in tree.of_type("5e-subclass"):
        levels = n.get("levels")
        if not isinstance(levels, dict) or not any(isinstance(v, list) and v for v in levels.values()):
            out.append(f"{n.path}: no ops at any level")
        if n.get("class") not in class_ids:
            out.append(f"{n.path}: class {n.get('class')!r} is not a class note in this library")
    return out


# ---------------------------------------------------------------- check_scales_and_formulas

DICE = re.compile(r"\d*d\d+(\s*[+-]\s*(\d*d\d+|\d+))*")
_FORMULA_FNS = ("floor", "max", "min")
_MAX_FORMULA = 200


class _Formula:
    """The plugin's Formula grammar (src/core/formula.ts): numbers, identifiers, + - * /, unary -,
    parentheses, floor(x), max(a, ...), min(a, ...). Identifiers must be in `allowed`."""

    def __init__(self, src, allowed):
        self.src, self.allowed, self.i = src, allowed, 0

    def peek(self):
        while self.i < len(self.src) and self.src[self.i] == " ":
            self.i += 1
        return self.src[self.i] if self.i < len(self.src) else None

    def run(self):
        if len(self.src) > _MAX_FORMULA:
            raise ValueError(f"longer than {_MAX_FORMULA} characters")
        self.expr()
        if self.peek() is not None:
            raise ValueError(f"unexpected {self.src[self.i]!r}")

    def expr(self):
        self.term()
        while self.peek() in ("+", "-"):
            self.i += 1
            self.term()

    def term(self):
        self.unary()
        while self.peek() in ("*", "/"):
            self.i += 1
            self.unary()

    def unary(self):
        if self.peek() == "-":
            self.i += 1
            return self.unary()
        self.primary()

    def primary(self):
        c = self.peek()
        if c is None:
            raise ValueError("ends too early")
        if c == "(":
            self.i += 1
            self.expr()
            if self.peek() != ")":
                raise ValueError("missing )")
            self.i += 1
            return
        m = re.match(r"\d+(?:\.\d+)?", self.src[self.i:])
        if m:
            self.i += m.end()
            return
        m = re.match(r"[a-z_][a-z0-9_]*", self.src[self.i:])
        if not m:
            raise ValueError(f"unexpected {c!r}")
        name = m.group(0)
        self.i += m.end()
        if self.peek() == "(":
            if name not in _FORMULA_FNS:
                raise ValueError(f"unknown function {name}")
            self.i += 1
            n = 0
            if self.peek() != ")":
                while True:
                    self.expr()
                    n += 1
                    if self.peek() == ",":
                        self.i += 1
                        continue
                    break
            if self.peek() != ")":
                raise ValueError("missing )")
            self.i += 1
            if (name == "floor" and n != 1) or n < 1:
                raise ValueError(f"{name}() has the wrong number of arguments")
            return
        if name not in self.allowed:
            raise ValueError(f"unknown name {name}")


def formula_problem(f, allowed, unlimited=False):
    """None when f is a valid formula (a number or text in the grammar; the word `unlimited` only when
    unlimited is true, as for resource.max in the plugin), else a sentence."""
    if isinstance(f, bool):
        return "is not a number or formula"
    if isinstance(f, (int, float)):
        return None
    if not isinstance(f, str):
        return "is not a number or formula"
    if unlimited and re.fullmatch(r"\s*unlimited\s*", f, re.I):
        return None
    try:
        _Formula(f, allowed).run()
    except ValueError as e:
        return str(e)
    return None


def _note_ops(n):
    """Every op dict a note carries: class and subclass `levels` lists, and `grants` / `ops` lists."""
    out = []
    levels = n.get("levels")
    if isinstance(levels, dict):
        for v in levels.values():
            out += [o for o in v if isinstance(o, dict)] if isinstance(v, list) else []
    for key in ("grants", "ops"):
        v = n.get(key)
        out += [o for o in v if isinstance(o, dict)] if isinstance(v, list) else []
    return out


def check_scales_and_formulas(tree):
    out = []
    for n in tree.notes:
        ops = _note_ops(n)
        if not ops:
            continue
        scale_ids = {str(o.get("id", "")).replace("-", "_") for o in ops if o.get("op") == "scale"}
        allowed = {"prof", "level", "total", *ABILS} | scale_ids
        for o in ops:
            kind, oid = o.get("op"), o.get("id")
            if kind == "scale":
                values = o.get("values")
                if values is not None:
                    if not isinstance(values, dict):
                        out.append(f"{n.path}: scale {oid}: values is not a mapping")
                    else:
                        for lvl, v in values.items():
                            if not (_is_int(v) or (isinstance(v, str) and DICE.fullmatch(v.strip()))):
                                out.append(f"{n.path}: scale {oid} at level {lvl}: {v!r} is neither a whole number nor dice")
                if "formula" in o:
                    p = formula_problem(o["formula"], allowed)
                    if p:
                        out.append(f"{n.path}: scale {oid} formula {o['formula']!r}: {p}")
            elif kind == "resource" and "max" in o:
                p = formula_problem(o["max"], allowed, unlimited=True)
                if p:
                    out.append(f"{n.path}: resource {oid} max {o['max']!r}: {p}")
            elif kind == "modify":
                p = formula_problem(o.get("set"), allowed) if "set" in o else "has no set"
                if p:
                    out.append(f"{n.path}: modify {oid} set {o.get('set')!r}: {p}")
    return out


# ---------------------------------------------------------------- check_backgrounds

def _review_lines(n):
    nr = n.get("needs_review")
    if isinstance(nr, str):
        return [nr]
    return [str(x) for x in nr] if isinstance(nr, list) else []


def _feat_flagged(n):
    """needs_review says why there is no feat op: the data grants none, or the feat is outside the library."""
    return any("grants no feat" in x or ("feat " in x and "is not in this library" in x) for x in _review_lines(n))


def backgrounds_without_feat(tree):
    """Paths of background notes with no feat op whose needs_review says why (listed in the report)."""
    return [n.path for n in tree.of_type("5e-background") if _feat_flagged(n)]


def check_backgrounds(tree):
    out = []
    for n in tree.of_type("5e-background"):
        pick = n.get("abilityPick")
        if not (isinstance(pick, dict) and isinstance(pick.get("patterns"), list) and pick["patterns"]
                and isinstance(pick.get("from"), list) and pick["from"]):
            out.append(f"{n.path}: abilityPick missing, or without from or patterns")
        grants = n.get("grants")
        has_feat = isinstance(grants, list) and any(isinstance(o, dict) and o.get("op") == "feat" for o in grants)
        if not has_feat and not _feat_flagged(n):
            out.append(f"{n.path}: no feat op and no `grants no feat` or `feat <id> is not in this library` line in needs_review")
    return out


# ---------------------------------------------------------------- check_mastery

def check_mastery(tree, data_dir, sources_path):
    on = enabled_ids(sources_path)
    mastery_ids = {n.get("id") for n in tree.of_type("5e-mastery") if n.rel.startswith("Masteries/")}
    items = tree.of_type("5e-item")
    out = []
    for b in _json(data_dir, "items-base.json", default={}).get("baseitem", []):
        if b.get("source") not in on or not b.get("mastery"):
            continue
        first = b["mastery"][0]
        mid = slug(str(first if isinstance(first, str) else (first or {}).get("name", "")).split("|")[0])
        notes = [n for n in items if n.get("name") == b["name"] and n.get("source") == b["source"]]
        who = f"{b['name']} ({b['source']})"
        if not notes:
            out.append(f"{who}: no item note")
        elif not any(isinstance(n.get("weapon"), dict) and n.get("weapon").get("mastery") == mid
                     for n in notes):
            out.append(f"{who}: weapon.mastery is not {mid!r}")
        if mid not in mastery_ids:
            out.append(f"{who}: mastery {mid!r} has no note under Masteries/")
    return out


# ---------------------------------------------------------------- check_links



def link_target(raw):
    """The note path of a wikilink body: alias, anchor, block id and a table-escaped pipe stripped."""
    t = raw.split("|", 1)[0]
    t = t.split("#", 1)[0].split("^", 1)[0]
    return t.rstrip("\\").strip()


def wikilinks(text):
    """[(line number, body)] of every [[...]] and ![[...]]; a link never spans lines. A `[[` with no
    `]]` after it on its line comes back as (line number, None). The body ends at the first `]]`, so a
    single `]` inside it is part of the target."""
    out = []
    for no, line in enumerate(text.split("\n"), 1):
        i = line.find("[[")
        while i != -1:
            j = line.find("]]", i + 2)
            if j == -1:
                out.append((no, None))
                break
            out.append((no, line[i + 2:j]))
            i = line.find("[[", j + 2)
    return out


def check_links(tree):
    out = []
    for n in tree.notes:
        for no, body in wikilinks(n.text):
            if body is None:
                out.append(f"{n.path}: unclosed [[ at line {no}")
                continue
            t = link_target(body)
            if not t:
                continue    # [[#heading]]: a link inside the same note
            if not t.startswith(tree.prefix):
                out.append(f"{n.path}: link to {t!r} leaves {tree.prefix}")
            elif not os.path.isfile(os.path.join(tree.out_root, *(t + ".md").split("/"))):
                out.append(f"{n.path}: link to {t!r} has no note")
    return out


# ---------------------------------------------------------------- check_replaces

def legacy_ids(legacy_dir):
    """{(type, id)} of every note under the legacy library folder, from the two top-level scalar lines."""
    out = set()
    for d, _, fs in os.walk(legacy_dir):
        for f in fs:
            if not f.endswith(".md"):
                continue
            with open(os.path.join(d, f), encoding="utf-8") as fh:
                lines = fh.read().split("\n")
            fm = front_lines("\n".join(lines))
            t = i = None
            for line in fm or []:
                if line.startswith("type: "):
                    t = _scalar(line[6:])
                elif line.startswith("id: "):
                    i = _scalar(line[4:])
            if t and i:
                out.add((t, i))
    return out


def check_replaces(tree, legacy_dir):
    have = legacy_ids(legacy_dir)
    out = []
    for n in tree.notes:
        if "replaces" not in n.fm:
            continue
        r = n.fm["replaces"]
        if not isinstance(r, list) or not r:
            out.append(f"{n.path}: replaces is not a non-empty list")
            continue
        seen = set()
        for x in r:
            if not isinstance(x, str) or not x.strip():
                out.append(f"{n.path}: replaces has an empty or non-text element {x!r}")
            elif x in seen:
                out.append(f"{n.path}: replaces lists {x!r} twice")
            elif (n.type, x) not in have:
                out.append(f"{n.path}: replaces {x!r}, which is not a {n.type} id in the legacy library")
            seen.add(x)
    return out


# ---------------------------------------------------------------- check_yaml

def check_yaml(tree):
    import yaml    # lazily: only system python has it
    out, seen = [], {}
    for n in tree.notes:
        lines = front_lines(n.text)
        if lines is None:
            out.append(f"{n.path}: no front matter")
            continue
        try:
            fm = yaml.safe_load("\n".join(lines)) or {}
        except yaml.YAMLError as e:
            out.append(f"{n.path}: front matter does not parse ({str(e).splitlines()[0] if str(e) else 'error'})")
            continue
        if not isinstance(fm, dict):
            out.append(f"{n.path}: front matter is not a mapping")
            continue
        if not isinstance(fm.get("edition"), str) or fm.get("edition") != EDITION_2024:
            out.append(f"{n.path}: edition is {fm.get('edition')!r}, not the text \"{EDITION_2024}\"")
        tags = fm.get("tags")
        if not isinstance(tags, list) or f"5e/edition/{EDITION_2024}" not in tags:
            out.append(f"{n.path}: tags lack 5e/edition/{EDITION_2024}")
        t = fm.get("type")
        if t is None:
            continue    # book chapters, book indexes and index pages carry no type
        if t == "5e-library":
            continue    # the library root note: not a content type, has no id
        if t not in KNOWN_TYPES:
            out.append(f"{n.path}: unknown type {t!r}")
        key = (t, fm.get("id"))
        if fm.get("id") in (None, ""):
            out.append(f"{n.path}: no id")
        elif key in seen:
            out.append(f"{n.path}: id {fm['id']!r} of type {t} is also used by {seen[key]}")
        else:
            seen[key] = n.path
    return out


# ---------------------------------------------------------------- check_arithmetic_flagged

def formula_average(formula):
    """floor(sum of dice averages) + flat part of `NdM + K` style hit point text; None when unreadable."""
    s = str(formula).replace(" ", "")
    if not s or not re.fullmatch(r"[+-]?(\d+d\d+|\d+)([+-](\d+d\d+|\d+))*", s):
        return None
    dice, flat = 0.0, 0
    for sign, a, b in re.findall(r"([+-]?)(\d+)(?:d(\d+))?", s):
        sgn = -1 if sign == "-" else 1
        if b:
            dice += sgn * int(a) * (int(b) + 1) / 2
        else:
            flat += sgn * int(a)
    return int(dice // 1) + flat


def check_arithmetic_flagged(tree):
    """Creatures whose numbers disagree must say so in needs_review (the build's own check, Task 8).

    Disagreements: hp against hp_formula's average (floor of the dice, plus the flat part); xp against
    the CR table (CR 0 also accepts 0; a cr not in the table, e.g. "None", is not checked); an ability
    score that is not a whole number. The flag must name the problem: a line containing `hit points`,
    `XP` or `ability score` (any case) for the three."""
    out = []
    for n in tree.of_type("5e-creature"):
        lines = [x.lower() for x in _review_lines(n)]
        flagged = lambda word: any(word in x for x in lines)
        hp, form = n.get("hp"), n.get("hp_formula")
        if _is_int(hp) and form is not None:
            avg = formula_average(form)
            if avg is not None and avg != hp and not flagged("hit points"):
                out.append(f"{n.path}: hp {hp} does not match {form} (average {avg}) and is not flagged")
        xp, cr = n.get("xp"), n.get("cr")
        if _is_int(xp) and str(cr) in CR_XP:
            ok = {CR_XP[str(cr)]} | ({0} if str(cr) == "0" else set())
            if xp not in ok and not flagged("xp"):
                out.append(f"{n.path}: xp {xp} does not match CR {cr} and is not flagged")
        abil = n.get("abilities")
        if not isinstance(abil, dict) or any(not _is_int(abil.get(a)) for a in ABILS):
            if not flagged("ability score"):
                out.append(f"{n.path}: missing ability score and not flagged")
    return out


# ---------------------------------------------------------------- check_review_page

_PAGE_LINK = re.compile(r"^- \[\[([^\]|]+)")


def review_lines_without_note(tree):
    """Needs Review lines that name an entry with no note (no link); listed in the report, not counted as notes."""
    page = tree.page("Index/Needs Review.md")
    if page is None:
        return []
    out = []
    for line in page.text.split("\n"):
        if line.startswith("## "):
            break  # later sections (stat blocks not converted) are not entries
        if line.startswith("- ") and not _PAGE_LINK.match(line):
            out.append(line)
    return out


def check_review_page(tree):
    flagged = [n for n in tree.notes if _review_lines(n)]
    page = tree.page("Index/Needs Review.md")
    if page is None:
        return ["Index/Needs Review.md does not exist"]
    listed = [m.group(1) for line in page.text.split("\n") for m in [_PAGE_LINK.match(line)] if m]
    out = []
    paths = {n.path for n in tree.notes}
    for p in listed:
        if p not in paths:
            out.append(f"Index/Needs Review lists {p}, which is no note")
    for n in flagged:
        if n.path not in listed:
            out.append(f"{n.path}: has needs_review but is not on Index/Needs Review")
    if len(listed) != len(flagged):
        out.append(f"Index/Needs Review lists {len(listed)} notes, {len(flagged)} notes have needs_review")
    lib_page = tree.page("5e Library.md")
    if lib_page is not None:
        m = re.search(r"Needs Review\|Needs Review\]\] \((\d+)\)", lib_page.text)
        unlinked = len(review_lines_without_note(tree))
        if m and int(m.group(1)) != len(flagged) + unlinked:
            out.append(f"5e Library says {m.group(1)} Needs Review entries, {len(flagged)} notes have needs_review "
                       f"and {unlinked} lines name no note")
    return out


# ---------------------------------------------------------------- check_library_note

def check_library_note(tree):
    """The library root note exists and says `type: "5e-library"`: the marker that travels with Obsidian Sync.

    Works on a Tree of any library."""
    n = tree.page("5e Library.md")
    if n is None:
        return ["5e Library.md is missing"]
    if n.err or n.get("type") != "5e-library":
        return [f"5e Library.md has type {n.get('type')!r}, not '5e-library'"]
    return []


# ---------------------------------------------------------------- all checks

CHECKS = ["counts", "classes", "scales_and_formulas", "backgrounds", "mastery", "links", "replaces", "yaml",
          "arithmetic_flagged", "review_page", "library_note"]


def run_2024(out_root, data_dir, sources_path, legacy_dir):
    """(results {check: [problem lines]}, report dict). Raises ImportError when PyYAML is missing."""
    import yaml  # noqa: F401  fail early, before reading the whole tree
    tree = Tree(out_root, LIB_2024)
    calls = {
        "counts": lambda: check_counts(tree, data_dir, sources_path),
        "classes": lambda: check_classes(tree, data_dir),
        "scales_and_formulas": lambda: check_scales_and_formulas(tree),
        "backgrounds": lambda: check_backgrounds(tree),
        "mastery": lambda: check_mastery(tree, data_dir, sources_path),
        "links": lambda: check_links(tree),
        "replaces": lambda: check_replaces(tree, legacy_dir),
        "yaml": lambda: check_yaml(tree),
        "arithmetic_flagged": lambda: check_arithmetic_flagged(tree),
        "review_page": lambda: check_review_page(tree),
        "library_note": lambda: check_library_note(tree),
    }
    results = {name: calls[name]() for name in CHECKS}
    report = {
        "notes": len(tree.notes),
        "counts": [{"type": t, "expected": e, "actual": a} for t, e, a in count_table(tree, data_dir, sources_path)],
        "backgrounds_without_feat": backgrounds_without_feat(tree),
        "review_lines_without_note": review_lines_without_note(tree),
        "checks": {k: {"passed": not v, "failures": v} for k, v in results.items()},
    }
    return results, report
