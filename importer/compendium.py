#!/usr/bin/env python3
"""Convert the 5e PDF library into a private Obsidian compendium.

    compendium.py extract [--books mm,phb]   PDF -> work/<slug>/lines.json (OCR digits fixed)
    compendium.py repair  [--books ...]      model repair of suspicious lines (cached, resumable)
    compendium.py report  [--books ...]      entity counts and validation issues per book
    compendium.py build [--libs WotC,...]    write out/compendium/5e (all books of each library; links span them)
    compendium.py sync [--libs ...] [--dry-run]  copy each built library into the vault on the DNDC_VAULT_HOST machine
    compendium.py vault-count [--libs ...]   read-only file count and marker of each library in the vault
    compendium.py graph                      merge the graph view color groups into the vault's graph.json
    compendium.py review-prep [--batches 8]  page images + work items for flagged stat blocks
    compendium.py review-merge               fold review/out/batch-*.json into work/corrections.json
    compendium.py all                        extract + repair + build + sync
    compendium.py finish                     wait for a running repair, build, then sync,
                                             retrying every 15 min until the vault machine answers

Book text never enters git: work and output live under $DNDC_ROOT
(default ~/dnd-compendium).
"""
import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import re
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from dndc import extract as E  # noqa: E402
from dndc import ocrfix  # noqa: E402

ROOT = os.environ.get("DNDC_ROOT", os.path.expanduser("~/dnd-compendium"))
WORK = os.path.join(ROOT, "work")
OUT = os.path.join(ROOT, "out")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def load_books(selected=None):
    """The owner's own PDF books, from books.json beside this file (private, not in git; see books.example.json).
    Without that file there are no PDF books and only the 5e.tools libraries are built."""
    path = os.path.join(HERE, "books.json")
    cfg = json.load(open(path)) if os.path.exists(path) else {"source_root": "", "books": []}
    books = [b for b in cfg["books"] if not b.get("skip")]
    for b in books:
        b["path"] = os.path.join(cfg["source_root"], b["file"])
    if selected:
        want = set(selected.split(","))
        books = [b for b in books if b["slug"] in want]
    return books


def wpath(book, name):
    d = os.path.join(WORK, book["slug"])
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name)


def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)


# ---------------------------------------------------------------- extract

def cmd_extract(books, force=False):
    for b in books:
        out = wpath(b, "lines.json")
        if os.path.exists(out) and not force:
            continue
        t = time.time()
        pages, toc = E.extract(b["path"])
        body = E.body_size(pages)
        lines = list(E.styled_lines(pages, body))
        s_digit, votes = ocrfix.choose_s_digit([ln["text"] for ln in lines])
        for ln in lines:
            ln["text"] = ocrfix.fix(ln["text"], s_digit)
        save_json(out, {"body": body, "toc": toc, "pages": len(pages), "s_digit": s_digit, "lines": lines})
        log(f"extract {b['slug']}: {len(pages)} pages, {len(lines)} lines, body {body}pt, "
            f"S={s_digit} {votes}, {time.time() - t:.0f}s")


def load_lines(book):
    return json.load(open(wpath(book, "lines.json")))


# ---------------------------------------------------------------- repair

WORD = re.compile(r"[A-Za-z][A-Za-z'’]*")
ODD = re.compile(r"[~·•=^`{}<>\\¦]|[a-z][.,;:][a-z]|\b[b-zB-HJ-Z]\b")


def vocab_counts():
    """Word counts over every extracted book (the rarity test needs the whole corpus)."""
    path = os.path.join(WORK, "vocab.json")
    c = collections.Counter()
    for b in load_books():
        try:
            data = load_lines(b)
        except FileNotFoundError:
            continue
        for ln in data["lines"]:
            c.update(norm_word(w) for w in WORD.findall(ln["text"]))
    save_json(path, c)
    return c


def norm_word(w):
    return re.sub(r"['’]s$", "", w.lower()).strip("'’")


def suspicious(text, vocab):
    """Worth a model repair: stray symbols, split letters, or words rare across all books."""
    t = re.sub(r"\*+", "", text).lstrip("#").strip()
    if len(t) < 3 or not re.search(r"[A-Za-z]{2}", t):
        return False
    if ODD.search(t):
        return True
    # a word hyphenated at the line end is not an error
    for w in WORD.findall(re.sub(r"[A-Za-z]+-$", "", t)):
        lw = norm_word(w)
        if len(lw) >= 3 and vocab.get(lw, 0) < 3:
            return True
    return False


def line_key(text):
    return hashlib.sha1(text.encode()).hexdigest()[:16]


def cmd_repair(books, workers=6, batch=60):
    from dndc import llm
    vocab = vocab_counts()
    jobs = []
    caches = {}
    for b in books:
        cpath = wpath(b, "repair.json")
        cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
        caches[b["slug"]] = (cpath, cache, threading.Lock())
        todo = []
        seen = set()
        for ln in load_lines(b)["lines"]:
            k = line_key(ln["text"])
            # a None proposal (line missing from a truncated reply) is retried
            if cache.get(k) is not None or k in seen or not suspicious(ln["text"], vocab):
                continue
            seen.add(k)
            todo.append(ln["text"])
        for i in range(0, len(todo), batch):
            jobs.append((b["slug"], todo[i:i + batch]))
        log(f"repair {b['slug']}: {len(todo)} suspicious lines to do, {len(cache)} cached")
    total = len(jobs)
    log(f"repair: {total} batches with {workers} workers")
    done = [0]
    stats = collections.Counter()

    def run(job):
        slug, texts = job
        _, proposals, st = llm.repair_lines(texts)
        cpath, cache, lock = caches[slug]
        with lock:
            # cache the model's proposal, not the verdict: a changed acceptance
            # rule is then re-applied at build time without new model calls
            for a, m in zip(texts, proposals):
                if m is not None:
                    cache[line_key(a)] = m
            save_json(cpath, cache)
            done[0] += 1
            for k in ("accepted", "unchanged", "rejected", "blanked"):
                stats[k] += st[k]
            if done[0] % 20 == 0 or done[0] == total:
                log(f"repair {done[0]}/{total} batches  {dict(stats)}")

    failed = 0
    with cf.ThreadPoolExecutor(workers) as ex:
        for f in cf.as_completed([ex.submit(run, j) for j in jobs]):
            try:
                f.result()
            except Exception as e:  # endpoint gone for over an hour; the lines stay unrepaired
                failed += 1
                log(f"repair: batch failed: {e}")
    return failed


def repaired_lines(book):
    from dndc.llm import accept
    data = load_lines(book)
    cpath = wpath(book, "repair.json")
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for ln in data["lines"]:
        ln["text"] = accept(ln["text"], cache.get(line_key(ln["text"])))
    return data


# ---------------------------------------------------------------- report / build

def cmd_report(books):
    from dndc import parse as P
    for b in books:
        data = repaired_lines(b)
        ents = P.find_entities(data["lines"], b, data["body"])
        kinds = collections.Counter(e["kind"] for e in ents)
        bad = [e for e in ents if e["issues"]]
        log(f"{b['slug']}: {dict(kinds)}; {len(bad)} with issues")
        for e in bad[:12]:
            log(f"   p{e['page']} {e['kind']} {e.get('name')}: {'; '.join(e['issues'])}")


def cmd_build(libs=None):
    """Build every library into a temp tree, then swap each one in.

    The WotC libraries come from the 5e.tools data (one clone per edition, see dndc/libraries.py);
    the third-party PDFs go through the OCR route into one folder per publisher (books.json
    "publisher"). `libs` (folders under compendium/5e) restricts what is built.
    """
    import shutil
    from dndc import fivetools as F, ft_notes, libraries, render
    from dndc.ft24 import replaces
    want = libraries.build_targets(libs)
    tmp = OUT + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    built, seed = [], []
    wants_pdf = any(f in want for f in render.PUBLISHER_LIBS.values())
    for lib in libraries.BUILT:
        # a publisher-only build still builds WotC 2014 into the temp tree for the link seed, but never swaps it in
        seed_only = lib is libraries.WOTC_2014 and lib.folder not in want and wants_pdf
        if lib.folder not in want and not seed_only:
            continue
        root = os.path.join(ROOT, lib.data_dir)
        if not os.path.isdir(os.path.join(root, "data")):
            log(f"build: no 5e.tools clone at {root}; skipping {lib.folder}")
            continue
        if lib.sources is not None:
            ddir = os.path.join(root, "data")
            read = lambda n, k: json.load(open(os.path.join(ddir, n)))[k]
            for line in libraries.source_warnings(lib, read("books.json", "book"), read("adventures.json", "adventure")):
                log(f"source_warnings {lib.folder}: {line}")
        variant_problems = []
        legacy = None
        if lib.edition == "2024":
            # ids come from the 2014 library built in this run, else from the live one
            for tree in (os.path.join(tmp, *libraries.WOTC_2014.folder.split("/")),
                         os.path.join(OUT, *libraries.WOTC_2014.folder.split("/"))):
                if os.path.isdir(tree):
                    legacy = replaces.legacy_index(tree)
                    break
            if legacy is None:
                log("replaces skipped: no 2014 library to read ids from")
        counts, lib_seed = ft_notes.build(root, tmp, variant_problems, lib, legacy)
        if lib is libraries.WOTC_2014:
            seed = lib_seed
        log(f"build {lib.folder}: {counts}")
        its = [i for i in F.load(root)["items"] if lib.sources is None or i["source"] in lib.sources]
        unmapped = ft_notes.unmapped_item_types(its)
        if unmapped:
            log(f"   item types with no kind name (written as Item): {dict(unmapped)}")
        for line in variant_problems:
            log(f"   {line}")
        if not seed_only:
            log(f"stamp {lib.folder}: {render.stamp_tree(os.path.join(tmp, *lib.folder.split('/')), libraries.EDITIONS[lib.folder])} notes")
            built.append(lib.folder)
    for publisher, lib in render.PUBLISHER_LIBS.items():
        if lib not in want:
            continue
        books = [b for b in load_books() if b.get("publisher") == publisher]
        if books:
            render.build(books, repaired_lines, tmp, lib, seed)
            log(f"stamp {lib}: {render.stamp_tree(os.path.join(tmp, *lib.split('/')), libraries.EDITIONS[lib])} notes")
            built.append(lib)
            log(f"build {lib}: {', '.join(b['title'] for b in books)}")
    for lib in built:
        live, new = os.path.join(OUT, *lib.split("/")), os.path.join(tmp, *lib.split("/"))
        os.makedirs(os.path.dirname(live), exist_ok=True)
        old = live + ".old"
        shutil.rmtree(old, ignore_errors=True)
        if os.path.isdir(live):
            os.replace(live, old)
        os.replace(new, live)
        shutil.rmtree(old, ignore_errors=True)
    shutil.rmtree(tmp, ignore_errors=True)


def cmd_sync(libs=None, dry_run=False):
    """Sync each built library folder; each replaces only its own folder in the vault."""
    from dndc import libraries, render
    for lib in libraries.sync_targets(libs):
        src = os.path.join(OUT, *lib.split("/"))
        if not os.path.isdir(src):
            continue
        if dry_run:
            n = sum(len(fs) for _, _, fs in os.walk(src))
            log(f"sync dry run: {src} ({n} files) -> {render.VAULT_PATH}/{lib}")
        else:
            render.sync(OUT, lib)


def cmd_vault_count(libs=None):
    """Read-only: file count and marker of each library folder in the vault."""
    import base64
    import subprocess
    from dndc import libraries, render
    for lib in libraries.count_targets(libs):
        path = f"{render.VAULT_PATH}/{lib}".replace("/", "\\")
        encoded = base64.b64encode(render.count_script(path).encode("utf-16-le")).decode()
        out = None
        for h in render.VAULT_HOSTS:
            r = subprocess.run(["ssh", *render.SSH_OPTS, h, f"powershell -NoProfile -NonInteractive -EncodedCommand {encoded}"],
                               capture_output=True, text=True, timeout=300)
            if r.returncode == 0 and "files=" in r.stdout:
                out = next(l for l in r.stdout.splitlines() if l.startswith("files=")).strip()
                break
        print(f"{lib} {out or 'unreachable'}")


def cmd_finish(retry_s=900, give_up_s=3 * 86400):
    import subprocess
    while subprocess.run(["pgrep", "-f", "compendium.py repair"], capture_output=True).returncode == 0:
        log("finish: repair still running")
        time.sleep(300)
    # catch-up pass: lines a crashed or truncated run left without a proposal
    failed = cmd_repair(load_books(), workers=4)
    if failed:
        log(f"finish: WARNING {failed} repair batches failed; building with those lines unrepaired")
    cmd_build()
    log("finish: build done")
    start = time.time()
    while True:
        try:
            cmd_sync()
            log("finish: synced")
            return
        except (SystemExit, Exception) as e:
            if time.time() - start > give_up_s:
                raise
            log(f"finish: {e}; retrying in {retry_s // 60} min")
            time.sleep(retry_s)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["extract", "repair", "report", "build", "sync", "all", "finish", "graph",
                                    "review-prep", "review-merge", "vault-count"])
    ap.add_argument("--books", help="comma-separated slugs (default: all)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--force", action="store_true", help="re-extract even if cached")
    ap.add_argument("--libs", help="comma-separated folders under compendium/5e, e.g. 'WotC,WotC 2024' "
                                   "(build, sync, vault-count; default: all)")
    ap.add_argument("--dry-run", action="store_true", help="sync: list what would be sent and send nothing")
    ap.add_argument("--batches", type=int, default=8, help="review-prep: number of batch files")
    a = ap.parse_args()
    books = load_books(a.books)
    libs = a.libs.split(",") if a.libs else None
    if a.cmd in ("extract", "all"):
        cmd_extract(books, a.force)
    if a.cmd in ("repair", "all"):
        cmd_repair(books, a.workers)
    if a.cmd == "report":
        cmd_report(books)
    if a.cmd in ("build", "all"):
        cmd_build(libs)
    if a.cmd in ("sync", "all"):
        cmd_sync(libs, a.dry_run)
    if a.cmd == "vault-count":
        cmd_vault_count(libs)
    if a.cmd == "finish":
        cmd_finish()
    if a.cmd == "review-prep":
        from dndc import review
        log(f"review-prep: {review.prep(books, repaired_lines, WORK, a.batches)} items")
    if a.cmd == "review-merge":
        from dndc import review
        log("review-merge: {} corrections read, {} in corrections.json".format(*review.merge(WORK)))
    if a.cmd == "graph":
        from dndc import graph
        graph.apply()


if __name__ == "__main__":
    main()
