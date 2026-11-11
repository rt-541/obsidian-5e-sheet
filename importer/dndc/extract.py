"""PDF -> styled lines in reading order.

Each book's text layer is read with PyMuPDF. Pages are cut into horizontal
bands at full-width lines (chapter titles, wide tables); inside a band the
left column is read before the right. Lines sharing a baseline are merged
into one row so ability-score rows and table rows stay together.
"""
import collections
import re

import fitz

BOLD = re.compile(r"bold|bd\b|-bd|black|heavy|semibold|demi", re.I)
WATERMARK = re.compile(r"modified using a demo version|Debenu|PDF Aerialist", re.I)
ITALIC = re.compile(r"italic|oblique|-it\b|\bit$", re.I)


def _style(span):
    f = span["font"]
    bold = bool(BOLD.search(f)) or bool(span["flags"] & 16)
    italic = bool(ITALIC.search(f)) or bool(span["flags"] & 2)
    return bold, italic


def _page_lines(page):
    w, h = page.rect.width, page.rect.height
    out = []
    for b in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]:
        for l in b.get("lines", []):
            for spans in _split_at_gaps([s for s in l["spans"] if s["text"].strip()]):
                _add_line(out, spans, l, page, w, h)
    return out


def _split_at_gaps(spans):
    """Cut a PDF line where its spans leave a gap far wider than a word space.

    The OCR layer sometimes stores one line running from the left column across
    the gutter into the right one; left whole, it reads as a full-width line and
    breaks the column order of the page.
    """
    parts, cur = [], []
    for s in spans:
        if cur and s["bbox"][0] - cur[-1]["bbox"][2] > max(20, 2.5 * s["size"]):
            parts.append(cur)
            cur = []
        cur.append(s)
    if cur:
        parts.append(cur)
    return parts


def _add_line(out, spans, l, page, w, h):
    if not spans:
        return
    text = "".join(s["text"] for s in spans).strip()
    size = max(s["size"] for s in spans)
    if size < 5 and len(text) < 4:
        return
    # an invisible watermark one PDF tool stamped across the middle of every page
    if WATERMARK.search(text):
        return
    x0, y0 = spans[0]["bbox"][0], l["bbox"][1]
    x1, y1 = spans[-1]["bbox"][2], l["bbox"][3]
    # running headers/footers and page numbers
    if (y1 < h * 0.045 or y0 > h * 0.955) and len(text) < 60:
        return
    if text.isdigit() and (y1 < h * 0.08 or y0 > h * 0.92) and abs(int(text) - page.number - 1) <= 20:
        return
    out.append({
        "x0": x0, "x1": x1, "y0": y0, "base": spans[0]["origin"][1],
        "size": round(size, 1), "spans": spans, "text": text, "w": w,
    })


def _row_text(row):
    """Join the spans of one visual row, with inline markdown for style."""
    pieces = []
    prev_x1 = None
    prev_space = False
    for ln in sorted(row, key=lambda l: l["x0"]):
        for s in ln["spans"]:
            t = s["text"]
            if not t.strip():
                continue
            bold, italic = _style(s)
            core = t.strip()
            if bold and italic:
                core = f"***{core}***"
            elif bold:
                core = f"**{core}**"
            elif italic:
                core = f"*{core}*"
            x0 = s["bbox"][0]
            gap = None if prev_x1 is None else x0 - prev_x1
            if gap is None:
                sep = ""
            elif gap > 2.5 * s["size"]:
                sep = " | "
            elif gap > 0.12 * s["size"] or t[:1].isspace() or prev_space:
                sep = " "
            else:
                sep = ""
            prev_space = t[-1:].isspace()
            pieces.append(sep + core)
            prev_x1 = s["bbox"][2]
    # merge adjacent runs of the same style: "*a* *b*" -> "*a b*"
    return re.sub(r"(?<=[^\s*])(\*{1,3}) \1(?=[^\s*])", " ", "".join(pieces))


def _order(lines):
    if not lines:
        return []
    w = lines[0]["w"]
    mid = w / 2
    # only lines across most of the page cut it into bands; an OCR line that merely
    # straddles the gutter would otherwise send a column's tail after the next column
    spanning = lambda l: l["x0"] < w * 0.2 and l["x1"] > w * 0.8
    lines = sorted(lines, key=lambda l: l["base"])
    bands, cur = [], []
    for l in lines:
        if spanning(l):
            if cur:
                bands.append(cur)
                cur = []
            bands.append([l])
        else:
            cur.append(l)
    if cur:
        bands.append(cur)
    ordered = []
    for band in bands:
        if len(band) == 1 and spanning(band[0]):
            ordered.append((2, [band[0]]))
            continue
        for col in (0, 1):
            cl = [l for l in band if (l["x0"] >= mid - 25) == bool(col)]
            rows = []
            for l in sorted(cl, key=lambda l: l["base"]):
                if rows and abs(rows[-1][-1]["base"] - l["base"]) <= max(2.5, l["size"] * 0.35):
                    rows[-1].append(l)
                else:
                    rows.append([l])
            ordered.extend((col, r) for r in rows)
    return ordered


def _major_size(row):
    c = collections.Counter()
    for l in row:
        for sp in l["spans"]:
            c[round(sp["size"], 1)] += len(sp["text"].strip())
    return c.most_common(1)[0][0]


def extract(pdf_path):
    doc = fitz.open(pdf_path)
    pages = []
    for pno, page in enumerate(doc):
        rows = _order(_page_lines(page))
        pages.append([{
            "p": pno + 1,
            "col": col,
            "x0": round(min(l["x0"] for l in r), 1),
            "size": _major_size(r),
            "text": _row_text(r),
            "plain": " ".join(l["text"] for l in sorted(r, key=lambda l: l["x0"])),
        } for col, r in rows])
    toc = doc.get_toc()
    return pages, toc


def body_size(pages):
    c = collections.Counter()
    for pg in pages:
        for r in pg:
            c[r["size"]] += len(r["plain"])
    return c.most_common(1)[0][0] if c else 10.0


RATIOS = ((2.2, 1), (1.6, 2), (1.22, 3))


def heading_level(size, body, plain):
    if len(plain) > 70:
        return None
    for r, lvl in RATIOS:
        if size >= body * r:
            return lvl
    return None


def styled_lines(pages, body):
    for pg in pages:
        for r in pg:
            lvl = heading_level(r["size"], body, r["plain"])
            text = r["plain"] if lvl else r["text"]
            yield {"p": r["p"], "h": lvl, "size": r["size"], "col": r["col"], "x0": r["x0"],
                   "text": ("#" * lvl + " " + text) if lvl else text}
