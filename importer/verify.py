#!/usr/bin/env python3
"""Checks on built libraries. Runs under system python (stdlib only).

    verify.py stamp-diff OLD NEW [--libs "WotC,Kobold Press,Necromancer Games"]
    verify.py 2024 --out OUT --data CLONE --sources sources-2024.json --legacy OUT/compendium/5e/WotC --report FILE

OLD, NEW and OUT are out roots (the directories that hold compendium/5e). Exit 1 on any problem line.
`2024` runs the scripted checks on OUT/compendium/5e/WotC 2024 and needs PyYAML: use /usr/bin/python3 -I.
"""
import json
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dndc import verify  # noqa: E402


def cmd_stamp_diff(a):
    libs = a.libs.split(",")
    compared, stamped, problems = verify.stamp_compare(a.old, a.new, libs)
    for line in problems:
        print(line)
    print(f"files compared: {compared}, stamped: {stamped}, other differences: {len(problems)}")
    return 1 if problems else 0


def cmd_2024(a):
    try:
        results, report = verify.run_2024(a.out, a.data, a.sources, a.legacy)
    except ImportError:
        print("PyYAML is not available here: use /usr/bin/python3 -I")
        return 2
    print("type expected actual")
    for row in report["counts"]:
        print(f"{row['type']} {row['expected']} {row['actual']}")
    for name in verify.CHECKS:
        bad = results[name]
        print("PASS " + name if not bad else f"FAIL {name}: {len(bad)}")
        for line in bad[:20]:
            print("    " + line)
        if len(bad) > 20:
            print(f"    ... {len(bad) - 20} more in the report")
    if report["backgrounds_without_feat"]:
        print("backgrounds that grant no feat: " + "; ".join(report["backgrounds_without_feat"]))
    if report.get("review_lines_without_note"):
        print(f"Needs Review lines with no note: {len(report['review_lines_without_note'])}")
        for line in report["review_lines_without_note"]:
            print("  " + line)
    os.makedirs(os.path.dirname(os.path.abspath(a.report)), exist_ok=True)
    with open(a.report, "w") as f:
        json.dump(report, f, indent=1)
    return 1 if any(results.values()) else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sd = sub.add_parser("stamp-diff", help="the edition stamp is the only difference between two builds")
    sd.add_argument("old")
    sd.add_argument("new")
    sd.add_argument("--libs", default="WotC,Kobold Press,Necromancer Games")
    sd.set_defaults(func=cmd_stamp_diff)
    b = sub.add_parser("2024", help="scripted checks on the built WotC 2024 library")
    b.add_argument("--out", required=True)
    b.add_argument("--data", required=True)
    b.add_argument("--sources", required=True)
    b.add_argument("--legacy", required=True)
    b.add_argument("--report", required=True)
    b.set_defaults(func=cmd_2024)
    a = ap.parse_args(argv)
    return a.func(a)


if __name__ == "__main__":
    sys.exit(main())
