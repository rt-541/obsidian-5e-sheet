"""Deterministic structure: stat blocks, spells, magic items, conditions, prose.

Input is one book's repaired lines in reading order, each
{p, h, size, col, x0, text}. Entities are found by their fixed printed
labels (Armor Class ... Challenge; level/school line + Casting Time;
item type/rarity line), so nothing here depends on the model.
"""
import re
import statistics

from .ocrfix import CR_XP, HP_LINE, ability_mod

SCHOOLS = "abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation"
CONDITIONS = ["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated",
              "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]
SMALL = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"}

SIZE_TYPE = re.compile(r"^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b(.{0,80}?)[,.;]+\s*([A-Za-z \-()]+)$")
LEVEL = re.compile(rf"^(?:(\d)(?:st|nd|rd|th)[- ]?level ({SCHOOLS})(\s*\(ritual\))?|({SCHOOLS}) can ?trip)$", re.I)
ITEM_META = re.compile(r"^(Wondrous item|Armor|Weapon|Potion|Ring|Rod|Scroll|Staff|Wand)\b(.{0,90}?)\b"
                       r"(common|uncommon|rare|very rare|legendary|artifact|rarity varies)\b(.{0,80})$")
LABELS = [("ac", "Armor Class"), ("hp", "Hit Points"), ("speed", "Speed"), ("saves", "Saving Throws"),
          ("skills", "Skills"), ("dv", "Damage Vulnerabilities"), ("dr", "Damage Resistances"),
          ("di", "Damage Immunities"), ("ci", "Condition Immunities"), ("senses", "Senses"),
          ("languages", "Languages"), ("cr", "Challenge"), ("pb", "Proficiency Bonus")]
# "Armor Class" as the OCR sometimes prints it: "Armo.r Class", "Arm or Class"
AC_START = re.compile(r"^A\W?r\W?m\W?o\W?r\W?\s?C\W?l\W?a\W?s\W?s\b")
HEADERISH = re.compile(r"^(A\W?r\W?m\W?o\W?r\W?\s?C\W?l\W?a\W?s\W?s|Hit Points \d|Speed \d+ ?ft)")
LABEL_RE = re.compile(r"^(" + "|".join(l for _, l in LABELS) + r")\b\s*:?\s*(.*)$")
TRAILING_SECTION = re.compile(r"\s+((?:L ?E ?G ?E ?N ?D ?A ?R ?Y|B ?O ?N ?U ?S|M ?Y ?T ?H ?I ?C|L ?A ?I ?R)?\s*A ?C ?T ?I ?O ?N ?S|R ?E ?A ?C ?T ?I ?O ?N ?S)\s*$")
SECTIONS = {"ACTIONS": "actions", "BONUS ACTIONS": "bonus_actions", "REACTIONS": "reactions",
            "LEGENDARY ACTIONS": "legendary_actions", "MYTHIC ACTIONS": "mythic_actions",
            "LAIR ACTIONS": "lair_actions"}
SECTION_KEYS = {k.replace(" ", ""): v for k, v in SECTIONS.items()}
ABIL = ["str", "dex", "con", "int", "wis", "cha"]
SCORE = re.compile(r"(\d{1,2}|\?)\s*\(\s*([+\-–−]\s*\d{1,2})\s*\)")
LEAD_STYLED = re.compile(r"^\*{1,3}([^*]{2,90}?)\*{1,3}\s*(.*)$")
LEAD_PLAIN = re.compile(r"^([A-Z][\w'’\-]*(?: (?:[A-Z0-9][\w'’\-/]*|of|the|and|or|a|an|in|on|to|with|from|for|by)){0,7}"
                        r"(?: \([^)]{1,50}\))?)\. (.+)$")
SPELL_LIST = re.compile(r"^(Cantrips|\d+(?:st|nd|rd|th) level|At will|\d+/day)", re.I)


def plain(t):
    return re.sub(r"\*+", "", t).lstrip("#").strip()


def title_case(s):
    letters = [c for c in s if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) < 0.7 * len(letters):
        return s
    words = s.lower().split()
    return " ".join(w if (i and w in SMALL) else w[:1].upper() + w[1:] for i, w in enumerate(words))


def garbage(t):
    """Decorative OCR noise: no real word and few letters or digits ("'t..~~!, '(~7/ ~")."""
    core = plain(t)
    if not core:
        return True
    if re.search(r"[A-Za-z]{3}", core):
        return False
    return sum(ch.isalnum() for ch in core) < 0.3 * len(core)


def _next(lines, k, n=1):
    """Index of the n-th line after k that is not noise, or None."""
    j = k
    while n:
        j += 1
        while j < len(lines) and garbage(lines[j]["text"]):
            j += 1
        if j >= len(lines):
            return None
        n -= 1
    return j


def clean_marks(t):
    """Drop style marks from a line whose marks do not pair up."""
    return re.sub(r"\*+", "", t) if t.count("*") % 2 else t


# ---------------------------------------------------------------- paragraphs

def margins(lines):
    """Left margin per (page, column): low percentile of x0 of long lines."""
    by = {}
    for ln in lines:
        if len(ln["text"]) > 30:
            by.setdefault((ln["p"], ln["col"]), []).append(ln["x0"])
    return {k: sorted(v)[max(0, len(v) // 10)] for k, v in by.items()}


def join_lines(lines, vocab, marg, keep_breaks=None):
    """Lines -> paragraph strings, using first-line indents and lead-ins."""
    paras, cur = [], ""
    for ln in lines:
        t = clean_marks(ln["text"].strip())
        if not t:
            continue
        m = marg.get((ln["p"], ln["col"]))
        indented = m is not None and ln["x0"] > m + 3.5
        sentence_end = re.search(r"[.!?\"\u201d)]\**$", cur) is not None
        new = (not cur or (indented and sentence_end) or (t.startswith("*") and sentence_end)
               or t.startswith(("•", "- ")) or (keep_breaks and keep_breaks.match(plain(t))))
        if cur.endswith("\u00ad"):  # soft hyphen at the line end
            cur = cur[:-1] + t
            continue
        if new:
            if cur:
                paras.append(cur)
            cur = t
        elif cur.endswith("-") and t[:1].islower():
            a = re.search(r"([A-Za-z]+)-$", cur)
            b = re.match(r"([A-Za-z]+)", t)
            joined = (a.group(1) + b.group(1)).lower() if a and b else ""
            cur = cur[:-1] + t if vocab.get(joined, 0) >= 2 else cur + t
        else:
            cur += " " + t
    if cur:
        paras.append(cur)
    out = []
    for p in paras:
        p = re.sub(r"^[•]\s*", "- ", p)
        m = LEAD_STYLED.match(p)
        if m and m.group(1).rstrip().endswith(".") and len(m.group(1)) < 80:
            p = f"**{m.group(1).strip()}** {m.group(2)}".rstrip()
        out.append(re.sub(r"\s{2,}", " ", p))
    return out


# ---------------------------------------------------------------- stat blocks

def _ability_row(t):
    toks = [x for x in re.split(r"[\s|]+", plain(t).upper()) if x]
    abil = [x for x in toks if x in ("STR", "DEX", "CON", "INT", "WIS", "CHA")]
    return abil if len(abil) >= 2 and len(abil) >= len(toks) - 6 else None


def _namelike(pt):
    return 1 < len(pt) <= 50 and not pt.endswith((".", ",", ";", ":")) and not pt[:1].islower()


def _find_header_above(lines, i):
    """Return (start index, name, meta) for a stat block whose Armor Class line is i."""
    k, meta_lines = i - 1, []
    while k >= 0 and garbage(lines[k]["text"]):
        k -= 1
    # meta may wrap over two lines
    for span in (1, 2):
        if k - span + 1 < 0:
            break
        cand = " ".join(plain(lines[j]["text"]) for j in range(k - span + 1, k + 1))
        if SIZE_TYPE.match(cand):
            meta_lines = list(range(k - span + 1, k + 1))
            break
    meta = re.sub(r",\s*[.;]+", ",", " ".join(plain(lines[j]["text"]) for j in meta_lines)) if meta_lines else None
    n = (meta_lines[0] if meta_lines else i) - 1
    while n >= 0 and garbage(lines[n]["text"]):
        n -= 1
    name = None
    if n >= 0:
        cand = plain(lines[n]["text"])
        if 1 < len(cand) <= 50 and not cand.endswith((".", ",", ":")) and not LABEL_RE.match(cand) \
                and (lines[n]["h"] or cand.upper() == cand or cand.istitle()):
            name = title_case(cand)
    start = n if name else (meta_lines[0] if meta_lines else i)
    inferred = False
    if not name:
        # OCR lost the name: take the nearest heading above, flagged for review
        for j in range(start - 1, max(-1, start - 120), -1):
            if lines[j]["h"] and not garbage(lines[j]["text"]):
                cand = plain(lines[j]["text"])
                if 1 < len(cand) <= 50 and not cand.endswith("."):
                    name, inferred = title_case(cand), True
                break
    return start, name, meta, inferred


def parse_statblock(lines, i, stat_gap, stop=None):
    start, name, meta, inferred = _find_header_above(lines, i)
    fields, abil_labels, scores, k, cur = {}, None, [], i, None
    stat_sizes = []
    while k < len(lines) and k < i + 30:
        t = lines[k]["text"].strip()
        pt = plain(t)
        k += 1
        if not pt:
            continue
        lab = LABEL_RE.match(AC_START.sub("Armor Class", pt))
        row = _ability_row(t)
        if lab:
            key = next(key for key, l in LABELS if l == lab.group(1))
            fields[key] = lab.group(2).strip()
            cur = key
            stat_sizes.append(lines[k - 1]["size"])
            if key == "cr":
                # an optional Proficiency Bonus line may follow
                if k < len(lines) and plain(lines[k]["text"]).startswith("Proficiency Bonus"):
                    fields["pb"] = LABEL_RE.match(plain(lines[k]["text"])).group(2)
                    k += 1
                break
        elif row and abil_labels is None:
            abil_labels = [a.lower() for a in row]
            scores += SCORE.findall(pt)
            cur = "abil"
        elif cur == "abil" or (abil_labels is None and len(SCORE.findall(pt)) >= 3):
            scores += SCORE.findall(pt)
            if abil_labels is None:
                cur = "abil"
        elif cur and cur not in ("abil", "ac", "hp") and not re.fullmatch(r"[\d\s.,|]+", pt):
            fields[cur] += " " + pt
    else:
        return None
    if "hp" not in fields or "cr" not in fields:
        return None
    header_end = k
    stat_size = statistics.median(stat_sizes) if stat_sizes else 0

    # ability scores, mapped to whichever labels the OCR kept
    labels = abil_labels if abil_labels and len(abil_labels) == len(scores) else ABIL
    abilities, printed = {a: None for a in ABIL}, {}
    for a, (sc, mod) in zip(labels, scores[:6]):
        abilities[a] = int(sc) if sc.isdigit() else None
        printed[a] = int(re.sub(r"\s", "", mod).replace("\u2013", "-").replace("\u2212", "-"))

    # body: traits and action sections
    sections = {"traits": []}
    current, intro = "traits", {}
    k = header_end
    stop = min(stop or len(lines), len(lines), header_end + 160)
    while k < stop:
        ln = lines[k]
        t = ln["text"].strip()
        pt = plain(t)
        if not pt or garbage(t):
            k += 1
            continue
        up = re.sub(r"\s+", "", pt.upper().rstrip(".:"))
        if up in SECTION_KEYS:
            current = SECTION_KEYS[up]
            sections.setdefault(current, [])
            k += 1
            continue
        trail = TRAILING_SECTION.search(pt) if pt.upper() != pt else None
        if trail:
            # OCR merged the section header onto the end of the previous line
            ln = dict(ln, text=ln["text"][:len(ln["text"]) - len(trail.group(0))].rstrip())
            t, pt = ln["text"].strip(), plain(ln["text"])
        if ln["h"] or HEADERISH.match(pt) or _ability_row(t):
            break
        if stat_gap and ln["size"] >= stat_size + 0.45 and not t.startswith("*"):
            break
        n1, n2 = _next(lines, k), _next(lines, k, 2)
        nxt1 = plain(lines[n1]["text"]) if n1 is not None else ""
        nxt2 = plain(lines[n2]["text"]) if n2 is not None else ""
        if AC_START.match(nxt1) and (_namelike(pt) or SIZE_TYPE.match(pt)):
            break
        if SIZE_TYPE.match(nxt1) and AC_START.match(nxt2) and _namelike(pt):
            break
        lead = _lead(t)
        if lead:
            sections.setdefault(current, []).append({"name": lead[0], "lines": [dict(ln, text=lead[1])]})
        elif sections.get(current):
            sections[current][-1]["lines"].append(ln)
        else:
            intro.setdefault(current, []).append(ln)
        if trail:
            current = SECTION_KEYS[re.sub(r"\s+", "", trail.group(1).upper())]
            sections.setdefault(current, [])
        k += 1
    return {
        "kind": "creature", "start": start, "end": k, "page": lines[i]["p"], "ac_line": i,
        "name": name, "name_inferred": inferred, "meta": meta, "fields": fields, "abilities": abilities,
        "printed_mods": printed, "sections": sections, "intro": intro,
    }


def _lead(t):
    m = LEAD_STYLED.match(t)
    if m:
        inner, rest = m.group(1).strip(), m.group(2)
        if "." in inner:
            nm, _, tail = inner.partition(".")
            if 1 < len(nm) <= 80:
                return nm.strip(), (tail.strip() + " " + rest).strip()
        elif rest.startswith(".") and len(inner) <= 80:
            return inner, rest[1:].strip()
    m = LEAD_PLAIN.match(plain(t))
    if m and len(m.group(1)) <= 70:
        return m.group(1), m.group(2)
    return None


VERBS = ("can|can't|is|isn't|has|makes|takes|deals|uses|regains|must|gains|attacks|doesn't|dies|hits|sheds|"
         "becomes|casts|teleports|magically|exhales|spits|breathes|targets|knows|chooses|emits|moves|loses|"
         "ignores|enters|regenerates|reverts|swallows|tries|telepathically|has|sees|senses|deal|can't")
SELF_REF = re.compile(rf"\b[Tt]he ([a-z][a-z'\-]+(?: [a-z][a-z'\-]+)?) (?:{VERBS})\b")


def infer_name(c):
    """Most frequent "the <creature> <verb>" phrase in the block's own text.

    Two mentions are enough on their own; one is enough when the heading
    name that would otherwise be used does not appear in the block at all.
    """
    text = " ".join(plain(ln["text"]) for sec in c["sections"].values() for e in sec for ln in e["lines"]).lower()
    counts = {}
    for sec in c["sections"].values():
        for e in sec:
            for ln in e["lines"]:
                for w in SELF_REF.findall(plain(ln["text"])):
                    w = re.sub(r" (?:can|is|has|must|then|also|still|instead)$", "", w)
                    if not re.search(r"target|creature|attack|spell|first|same|save|effect|damage", w):
                        counts[w] = counts.get(w, 0) + 1
    if not counts:
        return None
    w, n = max(counts.items(), key=lambda kv: kv[1])
    heading = (c.get("name") or "").lower()
    if n >= 2 or (n == 1 and (not heading or heading not in text)):
        return title_case(w.upper())
    return None


def validate_creature(c):
    issues = []
    f = c["fields"]
    if not c["name"] or c.get("name_inferred"):
        guess = infer_name(c)
        if guess and not (c["name"] and guess.lower() in c["name"].lower()):
            c["name"], c["name_inferred"] = guess, True
    if not c["name"]:
        issues.append("name missing in OCR")
    elif c.get("name_inferred"):
        issues.append("name missing in OCR, inferred from the text")
    if not c["meta"]:
        issues.append("size/type line missing in OCR")
    for a, mod in c.get("printed_mods", {}).items():
        sc = c["abilities"].get(a)
        if sc is None or ability_mod(sc) == mod:
            continue
        # a dropped digit ("5 (+2)" for 15) leaves one score that fits both the digits and the modifier
        fits = [v for v in (2 * mod + 10, 2 * mod + 11)
                if 1 <= v <= 30 and (str(v).endswith(str(sc)) or str(v).startswith(str(sc)))]
        if len(fits) == 1:
            c["abilities"][a] = fits[0]
        else:
            issues.append(f"{a.upper()} {sc} does not match its printed modifier {mod:+d}")
    missing = [a.upper() for a, v in c["abilities"].items() if v is None]
    if missing:
        issues.append("ability scores missing: " + ", ".join(missing))
    m = HP_LINE.match(f.get("hp", ""))
    if m:
        hp, n, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        b = int(m.group(5) or 0) * (-1 if m.group(4) in ("-", "–", "−") else 1)
        if (n * (d + 1)) // 2 + b != hp:
            issues.append(f"hit points {hp} do not match {n}d{d}{b:+d}")
        con = c["abilities"].get("con")
        if con is not None and ability_mod(con) * n != b:
            issues.append(f"hit point bonus {b:+d} does not match Con {con} ({ability_mod(con):+d}) x {n} dice")
        c["hp"], c["hp_formula"] = hp, f"{n}d{d}" + (f" {'+' if b >= 0 else '-'} {abs(b)}" if b else "")
    elif re.match(r"^\d+$", f.get("hp", "").strip()):
        c["hp"], c["hp_formula"] = int(f["hp"]), None
    else:
        issues.append("hit points unreadable")
    cm = re.match(r"(\d+/\d+|\d+)\s*\(([\d,]+)\s*XP", f.get("cr", ""))
    if cm:
        c["cr"], c["xp"] = cm.group(1), int(cm.group(2).replace(",", ""))
        if CR_XP.get(c["cr"]) != c["xp"] and not (c["cr"] == "0" and c["xp"] == 0):  # CR 0 is 0 or 10 XP
            issues.append(f"challenge {c['cr']} does not match {c['xp']} XP")
    else:
        cr = re.match(r"(\d+/\d+|\d+)", f.get("cr", ""))
        c["cr"], c["xp"] = (cr.group(1), CR_XP.get(cr.group(1))) if cr else (None, None)
        if not cr:
            issues.append("challenge unreadable")
    a = re.match(r"(\d+)", f.get("ac", ""))
    c["ac"] = int(a.group(1)) if a else None
    if c["ac"] is None:
        issues.append("armor class unreadable")
    c["issues"] = issues
    return c


# ---------------------------------------------------------------- Fifth Edition Foes layout

FEF_XP = re.compile(r"^XP ([\d,]+) \(CR ([\d/]+)\)$")
FEF_ALIGN = {"LG": "lawful good", "NG": "neutral good", "CG": "chaotic good", "LN": "lawful neutral",
             "N": "neutral", "CN": "chaotic neutral", "LE": "lawful evil", "NE": "neutral evil",
             "CE": "chaotic evil", "U": "unaligned", "Any": "any alignment"}
FEF_FIELDS = {"ac": "ac", "hp": "hp", "saving throws": "saves", "vulnerability": "dv", "vulnerabilities": "dv",
              "resistance": "dr", "resistances": "dr", "immunity": "di", "immunities": "di",
              "condition immunities": "ci", "speed": "speed", "languages": "languages", "skills": "skills",
              "senses": "senses"}
FEF_SECTIONS = {"DEFENSE", "OFFENSE", "STATISTICS", "TRAITS", "ECOLOGY"}
FEF_LEAD = re.compile(r"^\*\*([^*]{1,80}?):?\*\*:?\s*(.*)$")


def parse_fef(lines, i):
    """Necromancer Games layout: XP line, alignment-type line, DEFENSE/OFFENSE/STATISTICS/TRAITS."""
    m = FEF_XP.match(plain(lines[i]["text"]))
    n = i - 1
    while n >= 0 and garbage(lines[n]["text"]):
        n -= 1
    name = title_case(plain(lines[n]["text"])) if n >= 0 else None
    meta_raw = plain(lines[i + 1]["text"]) if i + 1 < len(lines) else ""
    am = re.match(r"^(LG|NG|CG|LN|N|CN|LE|NE|CE|U|Any)\s+(.+)$", meta_raw)
    meta = f"{am.group(2)}, {FEF_ALIGN[am.group(1)]}" if am else meta_raw
    fields = {"cr": f"{m.group(2)} ({m.group(1)} XP)"}
    abilities = {a: None for a in ABIL}
    sections = {"traits": [], "actions": []}
    section, k = None, i + 2
    while k < len(lines) and k < i + 260:
        ln = lines[k]
        t, pt = ln["text"].strip(), plain(ln["text"])
        if not pt:
            k += 1
            continue
        if pt in FEF_SECTIONS:
            if pt == "ECOLOGY":
                break
            section = pt
            k += 1
            continue
        if ln["h"] or FEF_XP.match(pt):
            break
        for ab, sc in re.findall(r"\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d{1,2})\s*\(", pt):
            abilities[ab.lower()] = int(sc)
        if section == "STATISTICS" and re.search(r"\b(Str|Dex|Con|Int|Wis|Cha)\s+\d", pt):
            k += 1
            continue
        lead = FEF_LEAD.match(t)
        key = FEF_FIELDS.get(lead.group(1).strip().lower()) if lead else None
        if key and section in ("DEFENSE", "OFFENSE", "STATISTICS", None):
            fields[key] = lead.group(2).strip()
        elif lead and section in ("OFFENSE", "TRAITS"):
            dest = "actions" if section == "OFFENSE" else "traits"
            sections[dest].append({"name": lead.group(1).strip().rstrip(":"), "lines": [dict(ln, text=lead.group(2))]})
        elif section in ("OFFENSE", "TRAITS") and sections["actions" if section == "OFFENSE" else "traits"]:
            sections["actions" if section == "OFFENSE" else "traits"][-1]["lines"].append(ln)
        k += 1
    return {"kind": "creature", "start": n, "end": k, "page": lines[i]["p"], "name": name,
            "name_inferred": False, "meta": meta, "fields": fields, "abilities": abilities,
            "sections": sections, "intro": {}}


# ---------------------------------------------------------------- spells

def parse_spell(lines, i):
    """i is the level/school line."""
    n = i - 1
    while n >= 0 and not lines[n]["text"].strip():
        n -= 1
    if n < 0:
        return None
    name = plain(lines[n]["text"])
    if not (1 < len(name) <= 50) or name.endswith("."):
        return None
    lv = LEVEL.match(plain(lines[i]["text"]))
    fields, k, cur = {}, i + 1, None
    while k < len(lines) and k < i + 12:
        pt = plain(lines[k]["text"])
        k += 1
        if not pt:
            continue
        m = re.match(r"^(Casting Time|Range|Components|Duration)\s*:\s*(.*)$", pt)
        if m:
            cur = m.group(1)
            fields[cur] = m.group(2)
            if cur == "Duration":
                break
        elif cur:
            fields[cur] += " " + pt  # a field wrapped onto the next line
        elif not cur:
            return None
    if "Casting Time" not in fields or "Duration" not in fields:
        return None
    body_start = k
    while k < len(lines) and k < body_start + 220:
        ln = lines[k]
        if ln["h"] or (k + 1 < len(lines) and LEVEL.match(plain(lines[k + 1]["text"]))) \
                or AC_START.match(plain(ln["text"])):
            break
        k += 1
    level = int(lv.group(1)) if lv.group(1) else 0
    school = (lv.group(2) or lv.group(4)).lower()
    return {"kind": "spell", "start": n, "end": k, "page": lines[i]["p"], "name": title_case(name),
            "level": level, "school": school, "ritual": bool(lv.group(3)) or "ritual" in fields["Casting Time"].lower(),
            "level_line": plain(lines[i]["text"]), "fields": fields, "body_start": body_start, "issues": []}


# ---------------------------------------------------------------- magic items

def parse_item(lines, i):
    n = i - 1
    while n >= 0 and not lines[n]["text"].strip():
        n -= 1
    if n < 0:
        return None
    name = plain(lines[n]["text"])
    letters = sum(ch.isalpha() for ch in name)
    if not (1 < len(name) <= 60) or name.endswith((".", ",", ";", ":")) or LEVEL.match(name) \
            or letters < 0.6 * len(name) or not name[:1].isupper() or len(name.split()) > 8 \
            or re.search(r"\. [A-Z]", name):
        return None
    meta = plain(lines[i]["text"])
    k = i + 1
    while k < len(lines) and k < i + 200:
        ln = lines[k]
        pt = plain(ln["text"])
        if ln["h"] or AC_START.match(pt) or \
                (k + 1 < len(lines) and ITEM_META.match(plain(lines[k + 1]["text"])) and pt and not pt.endswith(".")):
            break
        k += 1
    m = ITEM_META.match(meta)
    rarity = m.group(3).lower()
    return {"kind": "item", "start": n, "end": k, "page": lines[i]["p"], "name": title_case(name),
            "meta": meta, "item_type": m.group(1).title(), "rarity": rarity,
            "attunement": "attunement" in meta.lower(), "body_start": i + 1, "issues": []}


# ---------------------------------------------------------------- conditions

def parse_condition(lines, i):
    k = i + 1
    while k < len(lines) and not lines[k]["h"] and not (
            plain(lines[k]["text"]).isupper() and plain(lines[k]["text"]).lower() in CONDITIONS):
        k += 1
    return {"kind": "condition", "start": i, "end": k, "page": lines[i]["p"],
            "name": plain(lines[i]["text"]).title(), "body_start": i + 1, "issues": []}


# ---------------------------------------------------------------- book

def find_entities(lines, book, body):
    """All entities in a book, non-overlapping, in order.

    Armor Class lines that did not parse into a stat block are kept in
    book["unparsed"] so they reach Needs Review instead of vanishing.
    """
    sizes = [ln["size"] for ln in lines if AC_START.match(plain(ln["text"])) or plain(ln["text"]).startswith("Hit Points")]
    stat_size = statistics.median(sizes) if sizes else body
    stat_gap = body - stat_size >= 0.45
    found, unparsed = [], []
    in_conditions = False
    for i, ln in enumerate(lines):
        pt = plain(ln["text"])
        if not pt:
            continue
        if ln["h"] and book["slug"] == "phb" and "appendix" in pt.lower():
            in_conditions = "conditions" in re.sub(r"\s", "", pt.lower())
        if AC_START.match(pt):
            e = parse_statblock(lines, i, stat_gap)
            if e:
                found.append(validate_creature(e))
            else:
                unparsed.append((ln["p"], pt[:80]))
        elif FEF_XP.match(pt):
            found.append(validate_creature(parse_fef(lines, i)))
        elif LEVEL.match(pt):
            e = parse_spell(lines, i)
            if e:
                found.append(e)
        elif ITEM_META.match(pt) and len(pt) <= 140:
            e = parse_item(lines, i)
            if e:
                found.append(e)
        elif in_conditions and (ln["h"] or pt.isupper()) and pt.lower() in CONDITIONS:
            found.append(parse_condition(lines, i))
    found.sort(key=lambda e: e["start"])
    out, last_end = [], -1
    for e in found:
        if e["start"] >= last_end:
            out.append(e)
            last_end = e["end"]
        elif e["kind"] == "creature" and out:
            prev = out[-1]
            if prev["kind"] == "creature":
                # the previous block's body ran into this one: re-read it up to here
                again = parse_statblock(lines, prev["ac_line"], stat_gap, stop=e["start"]) if "ac_line" in prev else None
                if again:
                    out[-1] = validate_creature(again)
                else:
                    prev["end"] = e["start"]
            else:
                # a stat block beats a spell/item whose body ran into it
                prev["end"] = e["start"]
            out.append(e)
            last_end = e["end"]
        elif e["kind"] == "creature":
            unparsed.append((e["page"], f"stat block overlapping another entity ({e.get('name')})"))
    for e in out:
        e["source"] = book["abbr"]
        e["book"] = book["title"]
    book["unparsed"] = unparsed
    return out

