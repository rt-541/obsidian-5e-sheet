"""Which classes can cast which spell, from the books' class spell lists.

The lists are printed in two or three narrow sub-columns per page column, which
the general reading order interleaves, so these pages are read again straight
from the PDF: lines are clustered into sub-columns by x position and read top to
bottom. A "<CLASS> SPELLS" heading sets the current class; level headings are
skipped; every other line that names a known spell (compared letters-only, so
OCR splits like "See I nvisibility" still match) is assigned to that class.
"""
import re

import fitz

CLASSES = ["artificer", "bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"]
HEAD = re.compile(r"^(" + "|".join(CLASSES) + r")spells$")


def key(text):
    text = re.sub(r"\([^)]*\)", "", text)  # "(evocation)", "(ritual)"
    return re.sub(r"[^a-z]", "", text.lower())


def _subcolumns(lines):
    xs = sorted({round(l[0]) for l in lines})
    bounds, start = [], xs[0] if xs else 0
    for a, b in zip(xs, xs[1:]):
        if b - a > 40:
            bounds.append((start, a))
            start = b
    bounds.append((start, xs[-1] if xs else 0))
    col = lambda x: next(i for i, (lo, hi) in enumerate(bounds) if lo - 1 <= round(x) <= hi + 1)
    return sorted(lines, key=lambda l: (col(l[0]), l[1]))


def class_lists(pdf_path, spell_names):
    """{spell name: sorted [classes]} for the spells named in this PDF's class lists."""
    by_key = {key(n): n for n in spell_names}
    doc = fitz.open(pdf_path)
    out, cls, misses = {}, None, 0
    for page in doc:
        lines = []
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                # the OCR can put two list cells in one line: cut at wide gaps
                seg, x0, prev = [], None, None
                for s in ln["spans"]:
                    if prev is not None and s["bbox"][0] - prev > 15 and seg:
                        lines.append((x0, ln["bbox"][1], "".join(seg).strip()))
                        seg, x0 = [], None
                    if x0 is None:
                        x0 = s["bbox"][0]
                    seg.append(s["text"])
                    prev = s["bbox"][2]
                if seg and "".join(seg).strip():
                    lines.append((x0, ln["bbox"][1], "".join(seg).strip()))
        heads = [l for l in lines if HEAD.match(key(l[2]))]
        if not heads and cls is None:
            continue
        hits = 0
        ordered = _subcolumns(lines)
        skip = False
        for n, (x, y, t) in enumerate(ordered):
            if skip:
                skip = False
                continue
            k = key(t)
            m = HEAD.match(k)
            if m:
                cls = m.group(1)
                continue
            if not cls:
                continue
            if k not in by_key and n + 1 < len(ordered) and k + key(ordered[n + 1][2]) in by_key:
                k, skip = k + key(ordered[n + 1][2]), True  # a name wrapped onto the next line
            if k in by_key:
                out.setdefault(by_key[k], set()).add(cls)
                hits += 1
        # the lists end where a page names no spells and starts no list
        if not heads and hits < 5:
            cls = None
            misses += 1
    return {n: sorted(c) for n, c in out.items()}
