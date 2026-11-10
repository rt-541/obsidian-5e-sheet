"""Entities and book text -> Obsidian notes, links, indexes; and the vault sync.

Layout under out/compendium/5e/ (the plugin reads type: 5e-<type> notes anywhere
below the vault compendium folder; 5e/ is generated and replaced wholesale on sync,
so nothing else in the vault is touched):
    Creatures/ Spells/ Items/ Conditions/   one note per entity
    Books/<Title>/<NN Chapter>.md            book text, entities embedded
    Books/<Title>/<Title>.md                 book index
    Index/                                   by CR, level, rarity, Needs Review
"""
import collections
import json
import os
import re
import shutil
import subprocess

from . import classlists
from . import corrections
from . import parse as P
from . import tags as T
from .ocrfix import CR_XP, ability_mod

# tried in order: the LAN name at home, then whatever else is listed (e.g. a VPN address)
VAULT_HOSTS = [h for h in os.environ.get("DNDC_VAULT_HOST", "azure-dragon").split(",") if h]
VAULT_PATH = os.environ.get("DNDC_VAULT_PATH", "C:/obsidian/dnd")
# the vault keeps one folder per source under compendium/5e/ (WotC, Critical Role, Roll20, Homebrew);
# this library is the WotC one, and only it is replaced on sync
LIB = os.environ.get("DNDC_LIB", "compendium/5e/WotC")  # the 5e.tools WotC library
# generated libraries, one source folder each; sync replaces each folder on its own
PUBLISHER_LIBS = {"Kobold Press": "compendium/5e/Kobold Press", "Necromancer Games": "compendium/5e/Necromancer Games"}
LIBS = [LIB] + list(PUBLISHER_LIBS.values())
MARKER = ".dnd-compendium-generated"
FOLDERS = {"creature": "Creatures", "spell": "Spells", "item": "Items", "condition": "Conditions",
           "mastery": "Masteries"}
CR_ORDER = {k: i for i, k in enumerate(CR_XP)}
ATTACK = re.compile(r"\b((?:Melee|Ranged|Melee or Ranged) (?:Weapon|Spell) Attack:|Hit:)")


# ---------------------------------------------------------------- helpers

def safe(name):
    """A filename Obsidian can link to: no []#^|\\/:*?"<>."""
    s = re.sub(r'[\[\]#^|\\/*?"<>]', "", name).replace(":", " -")
    return re.sub(r"\s+", " ", s).strip(" .")[:120] or "Untitled"


def _segment(letters, vocab):
    """Split a run of letters into the most frequent book words, or None if some part is not a word."""
    import math
    best = [(0.0, [])] + [None] * len(letters)
    for i in range(1, len(letters) + 1):
        for j in range(max(0, i - 20), i):
            w = letters[j:i]
            n = vocab.get(w, 0)
            if best[j] is None or n < 3 or (len(w) < 3 and w not in P.SMALL):
                continue
            cost = best[j][0] + 10 - math.log(n)  # fewer, more common words
            if best[i] is None or cost < best[i][0]:
                best[i] = (cost, best[j][1] + [w])
    return best[-1][1] if best[-1] else None


def clean_name(name, vocab):
    """Undo OCR splits and digits in a name ("F Ind G Re at Er Steed", "Adult0blex").

    Only clear damage triggers it: a lone capital other than "A", or a digit inside a
    word. Only the run of fragments around it is re-split, and only when every new
    piece is a word the books use; the rest of the name is kept as it is.
    """
    toks = list(re.finditer(r"[A-Za-z0-9]+", name.split(" (")[0]))
    word = lambda t: vocab.get(t.lower(), 0) >= 3 and len(t) >= 4
    # a lone capital, or the letter O printed as 0 ("Yug0loths"); other digits are left alone
    damaged = lambda t: (len(t) == 1 and t.isupper() and t != "A") or bool(re.search(r"[A-Za-z]0|0[A-Za-z]", t))
    out, i = name, len(toks) - 1
    while i >= 0:  # right to left, so earlier spans stay valid
        if not damaged(toks[i].group(0)):
            i -= 1
            continue
        lo = hi = i
        while lo > 0 and not word(toks[lo - 1].group(0)) and name[toks[lo - 1].end():toks[lo].start()] == " ":
            lo -= 1
        while hi + 1 < len(toks) and not word(toks[hi + 1].group(0)) and name[toks[hi].end():toks[hi + 1].start()] == " ":
            hi += 1
        if hi + 1 < len(toks) and lo == hi and name[toks[hi].end():toks[hi + 1].start()] == " ":
            hi += 1  # a lone letter belongs to the word after it ("S Cale")
        while lo < i and toks[lo].group(0) in P.SMALL:  # a real lower-case "of" at the edge stays
            lo += 1
        letters = name[toks[lo].start():toks[hi].end()].replace("0", "o").lower()
        words = _segment(re.sub(r"[^a-z]", "", letters), vocab)
        has_digit = any(re.search(r"\d", toks[k].group(0)) for k in range(lo, hi + 1))
        # joining split letters must reduce the pieces; a digit repair ("Adult0blex") may not
        if words and (has_digit or len(words) < hi - lo + 1):
            fixed = " ".join(w if w in P.SMALL and lo + k else w[:1].upper() + w[1:] for k, w in enumerate(words))
            out = out[:toks[lo].start()] + fixed + out[toks[hi].end():]
        i = lo - 1
    return out


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def yaml_value(v, indent=0):
    pad = "  " * indent
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        if not v:
            return "[]"
        # mappings inside a list are written as JSON flow mappings (valid YAML), one per line
        return "\n" + "\n".join(f"{pad}  - {json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else yaml_value(x, indent + 1)}" for x in v)
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "\n" + "\n".join(f"{pad}  {k}: {yaml_value(x, indent + 1)}" for k, x in v.items())
    return json.dumps(str(v))


def frontmatter(d):
    lines = ["---"]
    for k, v in d.items():
        if v is None or v == [] or v == {}:
            continue
        lines.append(f"{k}: {yaml_value(v)}")
    lines.append("---")
    return "\n".join(lines)


def strip_marks(t):
    return re.sub(r"\*+", "", t)


def entry_text(lines, vocab, marg):
    """Text of a trait/action: style marks dropped, attack labels re-italicised."""
    paras = P.join_lines([dict(l, text=strip_marks(l["text"])) for l in lines if not P.garbage(l["text"])], vocab, marg,
                         keep_breaks=P.SPELL_LIST)
    return [ATTACK.sub(r"*\1*", p) for p in paras]


def split_list(s):
    return [x.strip() for x in re.split(r"[;,]\s*(?![^()]*\))", s or "") if x.strip() and x.strip() not in ("-", "—")]


# ---------------------------------------------------------------- entity notes

def creature_note(c, ctx):
    f, ab = c["fields"], c["abilities"]
    size = ctype = align = None
    if c["meta"]:
        m = P.SIZE_TYPE.match(c["meta"])
        if m:
            size, ctype, align = m.group(1), m.group(2).strip(" ,"), m.group(3).strip()
    saves = dict((k.lower()[:3], int(v)) for k, v in re.findall(r"\b(Str|Dex|Con|Int|Wis|Cha)\w*\s*([+\-]\d+)", f.get("saves", "")))
    skills = dict((k.lower().replace(" ", "_"), int(v)) for k, v in re.findall(r"([A-Z][a-z]+(?: [A-Za-z]+)*)\s*([+\-]\d+)", f.get("skills", "")))
    pp = re.search(r"passive Perception (\d+)", f.get("senses", ""), re.I)
    fm = {
        "type": "5e-creature", "schema": 1, "id": slug(c["name"] or "unknown"), "name": c["name"],
        "source": c["source"], "page": c["page"], "size": size, "creature_type": ctype, "alignment": align,
        "ac": c.get("ac"), "ac_note": (re.sub(r"^\d+\s*", "", f.get("ac", "")) or None),
        "hp": c.get("hp"), "hp_formula": c.get("hp_formula"),
        "speed": f.get("speed"), "abilities": {k: v for k, v in ab.items()},
        "saves": saves or None, "skills": skills or None,
        "damage_vulnerabilities": split_list(f.get("dv")), "damage_resistances": split_list(f.get("dr")),
        "damage_immunities": split_list(f.get("di")), "condition_immunities": split_list(f.get("ci")),
        "senses": f.get("senses"), "passive_perception": int(pp.group(1)) if pp else None,
        "languages": f.get("languages"), "cr": c.get("cr"), "cr_value": T.cr_value(c.get("cr")), "xp": c.get("xp"),
        "tags": T.creature_tags(c, size, ctype, align, f, ctx["vocab"]),
        "corrected_from_page": True if c.get("corrected") else None,
        "verified_as_printed": True if c.get("verified_as_printed") else None,
        "needs_review": c["issues"] or None,
    }
    out = [frontmatter(fm), "", f"# {c['name']}"]
    if c["meta"]:
        out.append(f"*{c['meta']}*")
    out.append("")
    for key, label in (("ac", "Armor Class"), ("hp", "Hit Points"), ("speed", "Speed")):
        if f.get(key):
            out.append(f"**{label}** {f[key]}  ")
    out.append("")
    cells = [f"{ab[a]} ({ability_mod(ab[a]):+d})" if ab[a] is not None else "?" for a in P.ABIL]
    out += ["| STR | DEX | CON | INT | WIS | CHA |", "|:-:|:-:|:-:|:-:|:-:|:-:|", "| " + " | ".join(cells) + " |", ""]
    for key, label in (("saves", "Saving Throws"), ("skills", "Skills"), ("dv", "Damage Vulnerabilities"),
                       ("dr", "Damage Resistances"), ("di", "Damage Immunities"),
                       ("ci", "Condition Immunities"), ("senses", "Senses"), ("languages", "Languages"),
                       ("cr", "Challenge"), ("pb", "Proficiency Bonus")):
        if f.get(key):
            out.append(f"**{label}** {f[key]}  ")
    titles = {"traits": None, "actions": "Actions", "bonus_actions": "Bonus Actions", "reactions": "Reactions",
              "legendary_actions": "Legendary Actions", "mythic_actions": "Mythic Actions", "lair_actions": "Lair Actions"}
    for sec, title in titles.items():
        entries = c["sections"].get(sec) or []
        intro = c["intro"].get(sec) or []
        if not entries and not intro:
            continue
        out.append("")
        if title:
            out += [f"## {title}", ""]
        for p in entry_text(intro, ctx["vocab"], ctx["marg"]):
            out += [p, ""]
        for e in entries:
            paras = entry_text(e["lines"], ctx["vocab"], ctx["marg"]) or [""]
            out.append(f"***{e['name'].strip()}.*** {paras[0]}".rstrip())
            for p in paras[1:]:
                out.append(p)
            out.append("")
    out.append(source_line(c, ctx))
    return "\n".join(out).rstrip() + "\n"


def spell_note(s, ctx):
    f = s["fields"]
    comps = f.get("Components", "")
    mat = re.search(r"M \((.*)\)", comps)
    fm = {
        "type": "5e-spell", "schema": 1, "id": slug(s["name"]), "name": s["name"], "source": s["source"],
        "page": s["page"], "level": s["level"], "school": s["school"], "ritual": s["ritual"],
        "casting_time": f.get("Casting Time"), "range": f.get("Range"), "components": comps,
        "material": mat.group(1) if mat else None, "duration": f.get("Duration"),
        "concentration": "concentration" in f.get("Duration", "").lower(),
        "classes": s.get("classes") or None,
        "needs_review": s["issues"] or None,
    }
    body = P.join_lines(ctx["lines"][s["body_start"]:s["end"]], ctx["vocab"], ctx["marg"])
    body = [re.sub(r"^(At Higher Levels\.)", r"**\1**", strip_marks(p) if p.count("*") % 2 else p) for p in body]
    fm["tags"] = T.spell_tags(s, s.get("classes") or [], " ".join(body))
    fm["needs_review"] = fm.pop("needs_review")
    out = [frontmatter(fm), "", f"# {s['name']}", f"*{s['level_line']}*", ""]
    for k in ("Casting Time", "Range", "Components", "Duration"):
        out.append(f"**{k}:** {f.get(k, '')}  ")
    out.append("")
    for p in body:
        out += [p, ""]
    out.append(source_line(s, ctx))
    return "\n".join(out).rstrip() + "\n"


def item_note(it, ctx):
    fm = {
        "type": "5e-item", "schema": 1, "id": slug(it["name"]), "name": it["name"], "source": it["source"],
        "page": it["page"], "item_type": it["item_type"], "rarity": it["rarity"],
        "attunement": it["attunement"], "magic": True,
        "tags": T.item_tags(it),
        "needs_review": it["issues"] or None,
    }
    body = render_prose(ctx["lines"][it["body_start"]:it["end"]], ctx, shift=1)
    out = [frontmatter(fm), "", f"# {it['name']}", f"*{it['meta']}*", "", body, "", source_line(it, ctx)]
    return "\n".join(out).rstrip() + "\n"


def condition_note(c, ctx):
    fm = {"type": "5e-condition", "schema": 1, "id": slug(c["name"]), "name": c["name"], "source": c["source"],
          "page": c["page"], "tags": T.condition_tags(c)}
    body = render_prose(ctx["lines"][c["body_start"]:c["end"]], ctx, shift=1)
    return "\n".join([frontmatter(fm), "", f"# {c['name']}", "", body, "", source_line(c, ctx)]).rstrip() + "\n"


def source_line(e, ctx):
    chap = ctx["chapter_of"].get(id(e))
    where = f"[[{chap}|{e['book']}]]" if chap else e["book"]
    return f"---\n*Source: {where}, p. {e['page']}*"


# ---------------------------------------------------------------- prose

def table_block(rows):
    cells = [[c.strip() for c in strip_marks(r).split(" | ")] for r in rows]
    width = max(len(r) for r in cells)
    cells = [r + [""] * (width - len(r)) for r in cells]
    out = ["| " + " | ".join(cells[0]) + " |", "|" + "---|" * width]
    out += ["| " + " | ".join(r) + " |" for r in cells[1:]]
    return "\n".join(out)


RUNNING_HEAD = re.compile(r"^(CHAPTER|APPENDIX|PART)\s*[\dIVXl]*\s*[|I]\s")


def furniture_key(t):
    return re.sub(r"[\d\W]+", " ", P.plain(t)).strip().lower()


def find_furniture(lines):
    """Running heads and footers that sit inside the text column: short lines repeated on many pages."""
    pages = collections.defaultdict(set)
    for ln in lines:
        k = furniture_key(ln["text"])
        if 3 <= len(k) <= 70 and not ln["h"]:
            pages[k].add(ln["p"])
    keep = {k.lower().replace(" ", "") for k in P.SECTIONS} | set(P.CONDITIONS)
    return {k for k, ps in pages.items() if len(ps) >= 6 and k.replace(" ", "") not in keep}


def caps_heading(t):
    pt = P.plain(t)
    letters = [c for c in pt if c.isalpha()]
    if not (3 <= len(letters) and len(pt) <= 60) or pt.endswith((".", ",", ";")) or " | " in t:
        return False
    if re.sub(r"\s+", "", pt.upper()) in P.SECTION_KEYS:
        return False
    return sum(c.isupper() for c in letters) >= 0.8 * len(letters)


def continues(lines, n):
    """True when the next text line carries on the same sentence (small-caps chapter openings, epigraphs)."""
    for ln in lines[n + 1:n + 3]:
        nxt = P.plain(ln["text"]).strip()
        if nxt:
            return nxt[:1].islower()
    return False


def render_prose(lines, ctx, shift=1):
    """Book lines -> markdown: headings, tables, paragraphs."""
    out, buf, tbl = [], [], []

    def flush_para():
        if buf:
            out.extend(P.join_lines(buf, ctx["vocab"], ctx["marg"]))
            buf.clear()

    def flush_tbl():
        if tbl:
            if len(tbl) >= 2:
                out.append(table_block([t["text"] for t in tbl]))
            else:
                buf.extend(tbl)
                flush_para()
            tbl.clear()

    furniture = ctx.get("furniture", set())
    for n, ln in enumerate(lines):
        t = ln["text"].strip()
        if not t or P.garbage(t) or furniture_key(t) in furniture or RUNNING_HEAD.match(P.plain(t)):
            continue
        if ln["h"]:
            flush_tbl(); flush_para()
            level = min(6, ln["h"] + shift)
            out.append("#" * level + " " + P.title_case(P.plain(t)))
        elif caps_heading(t) and not continues(lines, n):
            # bold or all-caps standalone lines at body size: area names, sidebar titles
            flush_tbl(); flush_para()
            out.append("#" * min(6, 4 + shift - 1) + " " + P.title_case(P.plain(t)))
        elif " | " in t and t.count(" | ") >= 1 and len(t) < 200:
            flush_para()
            tbl.append(ln)
        else:
            flush_tbl()
            buf.append(ln)
    flush_tbl(); flush_para()
    return "\n\n".join(out)


# ---------------------------------------------------------------- chapters

def chapters(book, data):
    """[(title, first page)] from the PDF bookmarks, or page ranges when there are none."""
    toc = [(lvl, t.strip(), p) for lvl, t, p in data["toc"] if p > 0]
    chosen = None
    for lvl in (1, 2, 3, 4):
        entries = [(t, p) for l, t, p in toc if l <= lvl]
        if len(entries) >= 6:
            chosen = entries if len(entries) <= 90 else chosen
            break
        chosen = entries
    if chosen and len(chosen) >= 4:
        # a chapter longer than 40 pages is split at the next bookmark level
        # (Tome of Beasts 2 has one "Content" entry above the whole bestiary)
        lvl_of = {(t, p): l for l, t, p in toc}
        chosen = sorted(chosen, key=lambda x: x[1])
        refined = []
        for i, (t, p) in enumerate(chosen):
            refined.append((t, p))
            end = chosen[i + 1][1] if i + 1 < len(chosen) else data["pages"] + 1
            if end - p > 40:
                depth = lvl_of.get((t, p), 1) + 1
                kids = [(ct, cp) for l, ct, cp in toc if l == depth and p < cp < end]
                # merge per-creature bookmarks into runs of at least 10 pages
                runs = []
                for j, (ct, cp) in enumerate(kids):
                    if runs and cp - runs[-1][1] < 10:
                        runs[-1][2] = ct
                    else:
                        runs.append([ct, cp, ct])
                refined += [(a if a == z else f"{a} to {z}", cp) for a, cp, z in runs]
        chosen = refined
        seen, out = set(), []
        for t, p in sorted(chosen, key=lambda x: x[1]):
            if p in seen or re.fullmatch(r"(contents|title page|credits|table of contents)", t, re.I):
                continue
            seen.add(p)
            out.append((t, p))
        if out and out[0][1] > 1:
            out.insert(0, ("Front Matter", 1))
        return out
    # no usable bookmarks: ~12-page sections named after their first heading
    heads = {}
    for ln in data["lines"]:
        if ln["h"] and ln["p"] not in heads and not P.garbage(ln["text"]):
            heads[ln["p"]] = P.title_case(P.plain(ln["text"]))
    out, p = [], 1
    while p <= data["pages"]:
        first = next((heads[q] for q in range(p, min(p + 12, data["pages"] + 1)) if q in heads), f"Pages {p}")
        out.append((f"{first} (p. {p})", p))
        p += 12
    return out


# ---------------------------------------------------------------- links

class Linker:
    def __init__(self):
        self.spells, self.items, self.creatures, self.conditions = {}, {}, {}, {}

    def add(self, kind, name, target):
        key = name.lower()
        table = {"spell": self.spells, "item": self.items, "creature": self.creatures, "condition": self.conditions}[kind]
        table.setdefault(key, target)
        if kind == "creature":
            for pl in plurals(key):
                table.setdefault(pl, target)

    def link(self, text, self_target=None):
        seen_cond = set()

        def italic(m):
            inner = m.group(1)
            tgt = self.spells.get(inner.lower()) or self.items.get(inner.lower())
            return f"*[[{tgt}|{inner}]]*" if tgt and tgt != self_target else m.group(0)

        def bold(m):
            inner = m.group(1)
            if inner.rstrip().endswith((".", ":")):
                return m.group(0)
            key = re.sub(r"^(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+", "", inner.lower())
            tgt = self.creatures.get(key)
            return f"**[[{tgt}|{inner}]]**" if tgt and tgt != self_target else m.group(0)

        def cond(m):
            w = m.group(0)
            tgt = self.conditions.get(w.lower())
            if not tgt or tgt == self_target or w.lower() in seen_cond:
                return w
            seen_cond.add(w.lower())
            return f"[[{tgt}|{w}]]"

        def npc(m):
            # "(LN male human commoner)": link the longest trailing phrase that is a creature
            inner = m.group(1)
            words = inner.split()
            for n in (3, 2, 1):
                if len(words) > n:
                    key = " ".join(words[-n:]).lower()
                    tgt = self.creatures.get(key)
                    if tgt and tgt != self_target:
                        head = " ".join(words[:-n])
                        return f"({head} [[{tgt}|{' '.join(words[-n:])}]])"
            return m.group(0)

        def stats_of(m):
            name = m.group(2)
            for cand in (name, " ".join(name.split()[:3]), " ".join(name.split()[:2]), name.split()[0]):
                tgt = self.creatures.get(cand.lower())
                if tgt and tgt != self_target:
                    return f"{m.group(1)}[[{tgt}|{cand}]]{name[len(cand):]}"
            return m.group(0)

        # never inside frontmatter: those values are data the plugin reads
        fm = re.match(r"^---\n.*?\n---\n", text, flags=re.S)
        head, text = (fm.group(0), text[fm.end():]) if fm else ("", text)
        protect = r"(\[\[.*?\]\]|^#.*$)"
        parts = re.split(protect, text, flags=re.M)
        for i in range(0, len(parts), 2):
            t = parts[i]
            t = re.sub(r"(?<![*\w])\*([^*\n]{2,60})\*(?!\*)", italic, t)
            t = re.sub(r"(?<!\*)\*\*([^*\n]{2,60})\*\*(?!\*)", bold, t)
            t = re.sub(r"\(((?:LG|NG|CG|LN|N|CN|LE|NE|CE|any alignment|unaligned) [a-z][a-z \-]{2,60})\)", npc, t)
            t = re.sub(r"(statistics of (?:an? |the )?)([a-z][a-z\-]+(?: [a-z][a-z\-]+){0,3})", stats_of, t)
            parts[i] = t
        text = "".join(parts)
        if self.conditions:
            # second pass, so the links added above are protected too
            parts = re.split(protect, text, flags=re.M)
            cond_re = re.compile(r"\b(" + "|".join(map(re.escape, self.conditions)) + r")\b")
            for i in range(0, len(parts), 2):
                parts[i] = cond_re.sub(cond, parts[i])
            text = "".join(parts)
        # inside a table row the alias pipe would split the cell
        text = re.sub(r"^\|.*$", lambda m: re.sub(r"\[\[([^\]|]*)\|", r"[[\1\\|", m.group(0)), text, flags=re.M)
        return head + text


def plurals(name):
    out = {name + "s", name + "es"}
    if name.endswith("f"):
        out.add(name[:-1] + "ves")
    if name.endswith("y"):
        out.add(name[:-1] + "ies")
    if name.endswith("man"):
        out.add(name[:-3] + "men")
    return out


# ---------------------------------------------------------------- build

def build(books, load, out_root, lib=LIB, seed=None):
    root = os.path.join(out_root, *lib.split("/"))
    if os.path.isdir(root):
        shutil.rmtree(root)
    for d in [f for k, f in FOLDERS.items() if k != "mastery"] + ["Books", "Index"]:
        os.makedirs(os.path.join(root, d), exist_ok=True)

    vocab = json.load(open(os.path.join(os.path.dirname(out_root), "work", "vocab.json"))) \
        if os.path.exists(os.path.join(os.path.dirname(out_root), "work", "vocab.json")) else {}
    linker = Linker()
    # notes in another library (the WotC conditions and spells a third-party creature mentions)
    for kind, name, note in seed or ():
        linker.add(kind, name, note)
    variants = collections.defaultdict(list)   # (kind, lower name) -> entities that own a note
    owned, used = [], set()                    # note owners; note paths taken (lower case)
    books_data = []

    fixes = corrections.load(os.path.join(os.path.dirname(out_root), "work", "corrections.json"))
    for b in books:
        data = load(b)
        lines = data["lines"]
        ents = corrections.apply(P.find_entities(lines, b, data["body"]), b, fixes)
        chaps = chapters(b, data)
        books_data.append((b, data, ents, chaps))
        for e in ents:
            if not e.get("name"):
                e["name"] = f"Unnamed {e['kind']} {b['abbr']} p{e['page']}"
            e["name"] = clean_name(e["name"], vocab)
            key = (e["kind"], e["name"].lower())
            match = next((v for v in variants[key] if same_entity(v, e)), None)
            if match:
                match.setdefault("also_in", []).append(f"{e['book']} p. {e['page']}")
                e["note"] = match["note"]
                continue
            # a different block under a taken name gets the book, then the page, then a counter
            cands = [e["name"], f"{e['name']} ({b['abbr']})", f"{e['name']} ({b['abbr']} p. {e['page']})"]
            cands += [f"{e['name']} ({b['abbr']} p. {e['page']}) {n}" for n in range(2, 20)]
            if e.get("name_inferred"):
                # a guessed name never takes the plain name (or links) from the real creature
                cands = [f"{e['name']} (unverified, {b['abbr']} p. {e['page']})"] + cands[3:]
            for c in (cands if not variants[key] or e.get("name_inferred") else cands[1:]):
                note = f"{lib}/{FOLDERS[e['kind']]}/{safe(c)}"
                if note.lower() not in used:
                    break
            e["note"] = note
            used.add(note.lower())
            owned.append(e)
            if not e.get("name_inferred"):
                variants[key].append(e)
                linker.add(e["kind"], e["name"], e["note"])

    # which classes cast each spell, from the books' class spell lists
    spells = {e["name"]: e for e in owned if e["kind"] == "spell"}
    for b, *_ in books_data:
        if b["slug"] in ("phb", "xgte", "tcoe", "scag"):
            for name, cls in classlists.class_lists(b["path"], list(spells)).items():
                spells[name]["classes"] = sorted(set(spells[name].get("classes", [])) | set(cls))

    # chapter notes
    for b, data, ents, chaps in books_data:
        lines = data["lines"]
        marg = P.margins(lines)
        title = safe(b["title"])
        folder = f"{lib}/Books/{title}"
        os.makedirs(os.path.join(out_root, folder), exist_ok=True)
        notes = []
        for ci, (ctitle, cpage) in enumerate(chaps):
            nxt = chaps[ci + 1][1] if ci + 1 < len(chaps) else 10 ** 6
            notes.append((f"{folder}/{ci:02d} {safe(ctitle)}", ctitle, cpage, nxt))
        ctx = {"lines": lines, "vocab": vocab, "marg": marg, "chapter_of": {}, "furniture": find_furniture(lines)}
        for e in ents:
            for path, _, lo, hi in notes:
                if lo <= e["page"] < hi:
                    ctx["chapter_of"][id(e)] = path
                    break
        # entity notes owned by this book
        owners = {id(x) for x in owned}
        for e in ents:
            if id(e) not in owners:
                continue
            render_fn = {"creature": creature_note, "spell": spell_note, "item": item_note,
                         "condition": condition_note}[e["kind"]]
            text = render_fn(e, ctx)
            if e.get("also_in"):
                text = text.rstrip() + "\n*Also in: " + "; ".join(e["also_in"]) + "*\n"
            write(out_root, e["note"], linker.link(text, self_target=e["note"]))
        # chapter text with entities embedded
        cover = {}
        for e in ents:
            for j in range(e["start"], e["end"]):
                cover[j] = e
        for path, ctitle, lo, hi in notes:
            idx = [i for i, ln in enumerate(lines) if lo <= ln["p"] < hi]
            if not idx:
                continue
            parts, run, i = [], [], idx[0]
            end = idx[-1] + 1
            while i < end:
                if i in cover:
                    # an entity: embed it where it starts; a tail carried over from the
                    # previous chapter is skipped rather than rendered as prose
                    e = cover[i]
                    if e["start"] == i:
                        if run:
                            parts.append(render_prose(run, ctx))
                            run = []
                        parts.append(f"![[{e['note']}]]")
                    i = max(e["end"], i + 1)
                    continue
                run.append(lines[i])
                i += 1
            if run:
                parts.append(render_prose(run, ctx))
            fm = frontmatter({"book": b["title"], "source": b["abbr"], "pages": f"{lo}-{min(hi - 1, data['pages'])}",
                              "tags": ["5e/book", T.tag("source", b["abbr"])]})
            body = "\n\n".join(p for p in parts if p.strip())
            # the chapter's own title usually opens its text too
            body = re.sub(rf"^#+ {re.escape(P.title_case(ctitle))}\s*\n+", "", body, flags=re.I)
            write(out_root, path, linker.link(f"{fm}\n\n# {ctitle}\n\n{body}\n"))
        idx_lines = [frontmatter({"book": b["title"], "source": b["abbr"], "tags": ["5e/book", T.tag("source", b["abbr"])]}),
                     "", f"# {b['title']}", ""]
        idx_lines += [f"- [[{p}|{t}]] (p. {lo})" for p, t, lo, _ in notes]
        counts = collections.Counter(e["kind"] for e in ents)
        idx_lines += ["", "Entities: " + ", ".join(f"{v} {k}s" for k, v in counts.items())]
        write(out_root, f"{folder}/{title}", "\n".join(idx_lines) + "\n")

    unparsed = [(b["abbr"], p, t) for b, *_ in books_data for p, t in b.get("unparsed", [])]
    write_indexes(out_root, owned, unparsed, lib)
    # sync only replaces a folder carrying this marker (or an empty one)
    with open(os.path.join(root, MARKER), "w") as f:
        f.write("Generated by scripts/dnd-compendium in homelab-config. Replaced on every sync; "
                "keep your own notes outside this folder.\n")
    return owned


def same_entity(a, b):
    if a["kind"] != b["kind"]:
        return False
    if a["kind"] == "creature":
        return a.get("hp") == b.get("hp") and a.get("ac") == b.get("ac") and a.get("cr") == b.get("cr")
    return True


def write(out_root, note, text):
    path = os.path.join(out_root, note + ".md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def _split_frontmatter(text):
    """(front matter lines without the fences, the rest of the text from the closing fence on) or None.

    Only a block that opens on the first line counts; a body line reading `tags:` is never seen here.
    """
    lines = text.split("\n")
    if lines[0] != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i] == "---":
            return lines[1:i], "\n".join(lines[i:])
    return None


def stamp_edition(text, edition):
    """Add `edition: "<year>"` before `tags:` and the tag `5e/edition/<year>` after the last tag.

    Touches only the first front matter block; a note with none gets a minimal one; stamping twice
    changes nothing.
    """
    tag = f"5e/edition/{edition}"
    line_edition = f"edition: {yaml_value(edition)}"
    split = _split_frontmatter(text)
    if split is None:
        return frontmatter({"edition": edition, "tags": [tag]}) + "\n\n" + text
    fm, rest = split
    if not any(l.startswith("edition:") for l in fm):
        at = next((i for i, l in enumerate(fm) if l.startswith("tags:")), len(fm))
        fm.insert(at, line_edition)
    item = f"  - {yaml_value(tag)}"
    start = next((i for i, l in enumerate(fm) if l.startswith("tags:")), None)
    if start is None:
        fm += ["tags: ", item]
    else:
        end = start + 1
        while end < len(fm) and fm[end].startswith("  - "):
            end += 1
        if item not in fm[start + 1:end]:
            fm.insert(end, item)
    return "\n".join(["---"] + fm + [rest])


def stamp_tree(root, edition):
    """Stamp every .md file under root in place; returns how many changed. Other files are left alone."""
    changed = 0
    for d, _, files in os.walk(root):
        for f in files:
            if not f.endswith(".md"):
                continue
            path = os.path.join(d, f)
            with open(path) as fh:
                text = fh.read()
            new = stamp_edition(text, edition)
            if new != text:
                with open(path, "w") as fh:
                    fh.write(new)
                changed += 1
    return changed


def write_indexes(out_root, ents, unparsed=(), lib=LIB, review_intro=None):
    link = lambda e: f"[[{e['note']}|{e['name']}]]" if e.get("note") else e["name"]
    cr = collections.defaultdict(list)
    for e in ents:
        if e["kind"] == "creature":
            cr[e.get("cr") or "?"].append(e)
    out = ["# Creatures by Challenge", ""]
    for k in sorted(cr, key=lambda k: CR_ORDER.get(k, 99)):
        out += [f"## CR {k}", ""] + [f"- {link(e)} ({e['source']})" for e in sorted(cr[k], key=lambda e: e["name"])] + [""]
    write(out_root, f"{lib}/Index/Creatures by CR", "\n".join(out))

    lv = collections.defaultdict(list)
    for e in ents:
        if e["kind"] == "spell":
            lv[e["level"]].append(e)
    out = ["# Spells by Level", ""]
    for k in sorted(lv):
        out += [f"## {'Cantrips' if k == 0 else f'Level {k}'}", ""]
        out += [f"- {link(e)} ({e['school']}{', ritual' if e['ritual'] else ''}; {e['source']})"
                for e in sorted(lv[k], key=lambda e: e["name"])] + [""]
    write(out_root, f"{lib}/Index/Spells by Level", "\n".join(out))

    order = ["common", "uncommon", "rare", "very rare", "legendary", "artifact", "rarity varies"]
    rar = collections.defaultdict(list)
    for e in ents:
        if e["kind"] == "item":
            rar[e["rarity"]].append(e)
    out = ["# Magic Items by Rarity", ""]
    for k in sorted(rar, key=lambda k: order.index(k) if k in order else 99):
        out += [f"## {k.title()}", ""]
        out += [f"- {link(e)} ({e['item_type']}{', attunement' if e['attunement'] else ''}; {e['source']})"
                for e in sorted(rar[k], key=lambda e: e["name"])] + [""]
    write(out_root, f"{lib}/Index/Magic Items by Rarity", "\n".join(out))

    bad = [e for e in ents if e.get("issues")]
    out = ["# Needs Review", "",
           review_intro or "Entries whose OCR text failed a check. Each note's `needs_review` property lists the "
           "problem; compare with the PDF page and edit the note.", ""]
    for e in sorted(bad, key=lambda e: (e["source"], e["page"] or 0)):
        out.append(f"- {link(e)} ({e['source']}{' p. ' + str(e['page']) if e['page'] else ''}): {'; '.join(e['issues'])}")
    if unparsed:
        out += ["", "## Stat blocks not converted", "",
                "An Armor Class line was found but the block could not be read; it stays only in the book text.", ""]
        out += [f"- {src} p. {p}: `{t.replace('`', '')}`" for src, p, t in unparsed]
    write(out_root, f"{lib}/Index/Needs Review", "\n".join(out) + "\n")
    from .graph import legend  # graph imports render's settings
    write(out_root, f"{lib}/Index/Graph Legend", legend())

    # the root note is the generated-library marker that travels: Obsidian Sync drops the dot-file
    head = frontmatter({"type": "5e-library", "schema": 1, "generated": True})
    out = ["# 5e Library", "", f"- [[{lib}/Index/Creatures by CR|Creatures by CR]]",
           f"- [[{lib}/Index/Spells by Level|Spells by Level]]",
           f"- [[{lib}/Index/Magic Items by Rarity|Magic Items by Rarity]]",
           f"- [[{lib}/Index/Needs Review|Needs Review]] ({len(bad) + len(unparsed)})",
           f"- [[{lib}/Index/Graph Legend|Graph Legend]]", "", "## Books", ""]
    out += sorted({f"- [[{lib}/Books/{safe(e['book'])}/{safe(e['book'])}|{e['book']}]]" for e in ents})
    write(out_root, f"{lib}/5e Library", head + "\n\n" + "\n".join(out) + "\n")


# ---------------------------------------------------------------- sync

SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=4"]

# True when <dir>\5e Library.md exists and its front matter (between the first two --- lines, read from the
# first 40 lines only) has the line type: "5e-library". Doubled braces: this text goes through str.format.
LIBRARY_NOTE_FN = r"""function Test-LibraryNote($dir) {{
    $f = Join-Path $dir '5e Library.md'
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {{ return $false }}
    $head = @(Get-Content -LiteralPath $f -TotalCount 40 -Encoding UTF8)
    if ($head.Count -lt 2 -or $head[0].Trim() -ne '---') {{ return $false }}
    for ($i = 1; $i -lt $head.Count; $i++) {{
        if ($head[$i].Trim() -eq '---') {{ return $false }}
        if ($head[$i].TrimEnd() -ceq 'type: "5e-library"') {{ return $true }}
    }}
    return $false
}}
"""

SWAP_PS = r"""
$ErrorActionPreference = 'Stop'
""" + LIBRARY_NOTE_FN + r"""$tarf = '{tarf}'; $stage = '{stage}'; $live = '{live}'; $leaf = '{leaf}'
$old = Join-Path $stage 'old'
if ((Test-Path $live) -and (Get-ChildItem $live -Recurse -File -Force | Select-Object -First 1) -and
    -not ((Test-Path (Join-Path $live '{marker}')) -or (Test-LibraryNote $live))) {{
    throw "refusing to replace $live`: it has files this tool did not create"
}}
if (Test-Path $stage) {{ Remove-Item -Recurse -Force $stage }}
New-Item -ItemType Directory $stage | Out-Null
tar -xf $tarf -C $stage
if ($LASTEXITCODE -ne 0) {{ throw "tar exited $LASTEXITCODE" }}
$n = (Get-ChildItem (Join-Path $stage $leaf) -Recurse -File -Force).Count
if ($n -ne {expected}) {{ throw "unpacked $n files, expected {expected}" }}
New-Item -ItemType Directory -Force (Split-Path $live -Parent) | Out-Null
try {{
    if (Test-Path $live) {{ Move-Item $live $old }}
    Move-Item (Join-Path $stage $leaf) $live
}} catch {{
    if (-not (Test-Path $live) -and (Test-Path $old)) {{ Move-Item $old $live }}
    throw
}}
Remove-Item -Recurse -Force $stage
Remove-Item -Force $tarf
Write-Output "swapped $n files"
"""


def count_script(path):
    """PowerShell that prints `files=<n> marker=<True|False> library_note=<True|False>` for one vault folder
    (read-only). library_note is True when the folder's `5e Library.md` carries `type: "5e-library"`.

    A missing folder prints `files=0 marker=False absent=True library_note=False` instead of failing.
    """
    p = path.replace("'", "''")
    return (f"$ErrorActionPreference = 'Stop'\n"
            + LIBRARY_NOTE_FN.format() +
            f"if (-not (Test-Path -LiteralPath '{p}')) {{ Write-Output 'files=0 marker=False absent=True library_note=False'; exit 0 }}\n"
            f"$n = (Get-ChildItem -LiteralPath '{p}' -Recurse -File -Force).Count\n"
            f"$m = Test-Path -LiteralPath (Join-Path '{p}' '{MARKER}')\n"
            f"$l = Test-LibraryNote '{p}'\n"
            f'Write-Output "files=$n marker=$m library_note=$l"\n')


def sync(out_root, lib=LIB):
    """Replace the vault's LIB folder (compendium/5e) on azure-dragon.

    The tar is copied with scp, unpacked into a staging folder beside the vault
    (outside it, so Obsidian Sync never sees a half-written tree), checked for
    tar's exit code and the file count, and only then swapped in for the live
    folder; a failed swap puts the old one back. A non-empty target without
    the build's marker file is never replaced. Nothing else in the vault is touched.
    """
    import base64
    src = os.path.join(out_root, *lib.split("/"))
    expected = sum(len(fs) for _, _, fs in os.walk(src))
    tar_path = os.path.join(out_root, "library.tar")
    leaf = os.path.basename(src)
    subprocess.run(["tar", "-cf", tar_path, "-C", os.path.dirname(src), leaf], check=True)
    parent = VAULT_PATH.rstrip("/").rsplit("/", 1)[0]          # C:/obsidian
    win = lambda p: p.replace("/", "\\")
    remote_tar = f"{parent}/.dnd-library.tar"
    script = SWAP_PS.format(tarf=win(remote_tar), stage=win(f"{parent}/.dnd-library-staging"),
                            live=win(f"{VAULT_PATH}/{lib}"), leaf=leaf, marker=MARKER, expected=expected)
    encoded = base64.b64encode(script.encode("utf-16-le")).decode()
    try:
        host = None
        for h in VAULT_HOSTS:
            if subprocess.run(["scp", *SSH_OPTS, "-q", tar_path, f"{h}:/{remote_tar}"], timeout=1800).returncode == 0:
                host = h
                break
        if not host:
            raise SystemExit(f"sync failed: scp to {', '.join(VAULT_HOSTS)} failed; is azure-dragon awake?")
        r = subprocess.run(["ssh", *SSH_OPTS, host,
                            f"powershell -NoProfile -NonInteractive -EncodedCommand {encoded}"],
                           timeout=1800, capture_output=True, text=True)
    except subprocess.TimeoutExpired as e:
        raise SystemExit(f"sync failed: {e}")
    finally:
        os.remove(tar_path)
    if r.returncode or "swapped" not in r.stdout:
        raise SystemExit(f"sync failed: remote rc={r.returncode}: {(r.stdout + r.stderr).strip()[-500:]}")
    print(f"synced {expected} notes to {host}:{VAULT_PATH}/{lib} ({r.stdout.strip()})")
