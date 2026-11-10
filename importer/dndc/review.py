"""Work items for correcting flagged stat blocks from the page images.

`compendium.py review-prep --batches N` writes, under work/review/:
    img/<slug>-p<page>-L.png and -R.png   page halves at 200 dpi (the next page too, for blocks
                                          that run on)
    batch-NN.json                         items: key, book, page, what was parsed, the issues
Each batch is corrected by reading the images; each result goes to out/batch-NN/<item>.json in the
corrections.json format (dndc/corrections.py) and are merged with `review-merge`.
"""
import glob
import json
import os
import shutil

import fitz

from . import corrections, parse as P

INSTRUCTIONS = os.path.join(os.path.dirname(__file__), "..", "..", "..", "plugins", "dnd", "skills", "dnd-compendium",
                            "references", "review-instructions.md")


def _summary(c):
    f = c["fields"]
    return {"name": c.get("name"), "name_inferred": c.get("name_inferred"), "meta": c.get("meta"),
            "fields": {k: f.get(k) for k in corrections.FIELD_KEYS if f.get(k)},
            "abilities": c.get("abilities"),
            "traits_and_actions": {s: [e["name"] for e in v] for s, v in c.get("sections", {}).items() if v}}


def _render(doc, slug, page, root):
    out = []
    for p in (page, page + 1):
        if p > doc.page_count:
            continue
        pg = doc[p - 1]
        r = pg.rect
        for side, clip in (("L", fitz.Rect(0, 0, r.width / 2 + 10, r.height)),
                           ("R", fitz.Rect(r.width / 2 - 10, 0, r.width, r.height))):
            path = os.path.join(root, "img", f"{slug}-p{p}-{side}.png")
            if not os.path.exists(path):
                pg.get_pixmap(dpi=200, clip=clip).save(path)
            out.append(path)
    return out


def prep(books, load, work, batches=8):
    root = os.path.join(work, "review")
    os.makedirs(os.path.join(root, "img"), exist_ok=True)
    os.makedirs(os.path.join(root, "out"), exist_ok=True)
    # the agents' instructions are versioned with the dnd plugin's skill
    if os.path.exists(INSTRUCTIONS):
        shutil.copy(INSTRUCTIONS, os.path.join(root, "INSTRUCTIONS.md"))
    else:
        print(f"WARNING: {os.path.normpath(INSTRUCTIONS)} is missing; the review agents need INSTRUCTIONS.md")
    fixes = corrections.load(os.path.join(work, "corrections.json"))
    items = []
    for b in books:
        data = load(b)
        ents = corrections.apply(P.find_entities(data["lines"], b, data["body"]), b, fixes)
        doc = fitz.open(b["path"])
        seen = {}
        for e in ents:
            if e["kind"] != "creature" or e.get("corrected"):
                continue
            n = seen.get(e["page"], 0)
            seen[e["page"]] = n + 1
            if e["issues"]:
                items.append({"key": corrections.key_for(b["slug"], e["page"], n), "book": b["title"],
                              "page": e["page"], "kind": "fix", "issues": e["issues"],
                              "parsed": _summary(e), "images": _render(doc, b["slug"], e["page"], root)})
        useen = {}
        for page, text in b.get("unparsed", []):
            n = useen.get(page, 0)
            useen[page] = n + 1
            items.append({"key": corrections.key_for(b["slug"], page, n, unparsed=True), "book": b["title"],
                          "page": page, "kind": "unparsed", "ocr_line": text,
                          "images": _render(doc, b["slug"], page, root)})
    for old in glob.glob(os.path.join(root, "batch-*.json")):
        os.remove(old)
    size = -(-len(items) // batches)
    for i in range(batches):
        chunk = items[i * size:(i + 1) * size]
        if chunk:
            with open(os.path.join(root, f"batch-{i:02d}.json"), "w") as f:
                json.dump(chunk, f, indent=1, ensure_ascii=False)
    return len(items)


def merge(work):
    """Fold out/**/*.json (each {key: correction}) into corrections.json, field by field."""
    path = os.path.join(work, "corrections.json")
    fixes = corrections.load(path)
    n = 0
    for f in sorted(glob.glob(os.path.join(work, "review", "out", "**", "*.json"), recursive=True)):
        try:
            data = json.load(open(f))
        except ValueError as e:
            print(f"skipping unreadable {f}: {e}")
            continue
        for key, fix in data.items():
            # fields combine, later files win per field (out/manual/ sorts after out/batch-NN/)
            fixes[key] = {**fixes.get(key, {}), **fix}
            n += 1
    with open(path, "w") as f:
        json.dump(fixes, f, indent=1, ensure_ascii=False, sort_keys=True)
    return n, len(fixes)
