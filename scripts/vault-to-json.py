#!/usr/bin/env python3
"""Dump every markdown note under a folder as JSON [{path, fm, body}] for tests/content/vault-validate.test.ts.

usage: vault-to-json.py <base-dir> <out.json>
Paths are relative to <base-dir> with forward slashes. Frontmatter is parsed with PyYAML (anchors and all).
The output holds the user's vault text: keep it outside git.
"""
import json, os, re, sys
import yaml

base, out = sys.argv[1], sys.argv[2]
notes = []
for root, _, files in os.walk(base):
    for f in sorted(files):
        if not f.endswith(".md"):
            continue
        p = os.path.join(root, f)
        text = open(p, encoding="utf-8").read()
        m = re.match(r"---\n(.*?)\n---\n?(.*)", text, re.S)
        fm = yaml.safe_load(m.group(1)) if m else None
        notes.append({"path": os.path.relpath(p, base).replace(os.sep, "/"), "fm": fm if isinstance(fm, dict) else None, "body": m.group(2) if m else text})
json.dump(notes, open(out, "w"), default=str)
print(len(notes), "notes")
