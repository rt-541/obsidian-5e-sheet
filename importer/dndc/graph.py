"""Graph view color groups for the compendium, merged into the vault's .obsidian/graph.json.

Obsidian applies the first matching group, so the order below is the priority.
Groups this tool owns are recognised by their query (it mentions compendium/5e
or a #5e/ tag); any other group in the file is the user's and is kept, ahead of
ours, so a hand-made group always wins.
"""
import json
import os
import subprocess
import tempfile

from .render import LIB, LIBS, VAULT_HOSTS, VAULT_PATH, SSH_OPTS

T = "tag:#5e/"
GROUPS = [
    # (legend label, query, hex color)
    ("Creatures, tier 4 (CR 17+)", f"{T}tier/4", "#C62828"),
    ("Creatures, tier 3 (CR 11-16)", f"{T}tier/3", "#EF6C00"),
    ("Creatures, tier 2 (CR 5-10)", f"{T}tier/2", "#F9A825"),
    ("Creatures, tier 1 (CR 0-4)", f"{T}tier/1", "#2E7D32"),
    ("Creatures, CR unreadable", f"{T}creature", "#827717"),
    ("Cantrips", f"{T}spell/cantrip", "#80DEEA"),
    ("Spells, levels 1-3", f"{T}spell/level/1 OR {T}spell/level/2 OR {T}spell/level/3", "#29B6F6"),
    ("Spells, levels 4-6", f"{T}spell/level/4 OR {T}spell/level/5 OR {T}spell/level/6", "#1565C0"),
    ("Spells, levels 7-9", f"{T}spell/level/7 OR {T}spell/level/8 OR {T}spell/level/9", "#3F2B96"),
    ("Items, legendary and artifact", f"{T}rarity/legendary OR {T}rarity/artifact", "#D81B60"),
    ("Items, very rare", f"{T}rarity/very-rare", "#6A1B9A"),
    ("Items, rare", f"{T}rarity/rare", "#9C4DCC"),
    ("Items, common, uncommon, varies", f"{T}item", "#CE93D8"),
    ("Conditions", f"{T}condition", "#00897B"),
]


# Indexes and the 15 conditions link to nearly every creature (2,000+ and 5,000+ links)
# and pull the whole library into one ball; hidden from the graph, still linked in notes.
FILTER = " ".join(f'-path:"{lib}/Index"' for lib in LIBS) + " -tag:#5e/condition"
OLD_FILTERS = {"", '-path:"compendium/5e/Index" -tag:#5e/condition',
               f'-path:"{LIB}/Index" -tag:#5e/condition'}  # earlier defaults, safe to replace


def ours(group):
    q = group.get("query", "")
    return any(lib in q for lib in LIBS) or "#5e/" in q


def merged(graph):
    keep = [g for g in graph.get("colorGroups", []) if not ours(g)]
    mine = [{"query": q, "color": {"a": 1, "rgb": int(c[1:], 16)}} for _, q, c in GROUPS]
    graph["colorGroups"] = keep + mine
    if graph.get("search", "") in OLD_FILTERS | {FILTER}:
        graph["search"] = FILTER  # only when the user has not set a filter of their own
    return graph


def legend():
    """Markdown note explaining the colors (written into Index/ by the build)."""
    rows = ["# Graph Legend", "",
            "Colors in the graph view come from `compendium.py graph`; the first matching row wins.",
            f"The graph filter `{FILTER}` hides the indexes and conditions, which link to almost every",
            "creature and would pull the whole library into one ball; clear it in the graph's search box to see them.", "",
            "| Color | Notes | Query |", "|---|---|---|"]
    for label, q, c in GROUPS:
        swatch = f'<span style="color:{c}">&#9679;</span> `{c}`'
        rows.append(f"| {swatch} | {label} | `{q.replace('|', '/')}` |")
    return "\n".join(rows) + "\n"


def apply():
    """Fetch graph.json from the vault host, merge our groups, write it back."""
    remote = f"/{VAULT_PATH}/.obsidian/graph.json"
    with tempfile.TemporaryDirectory() as d:
        local = os.path.join(d, "graph.json")
        host = next((h for h in VAULT_HOSTS
                     if subprocess.run(["scp", *SSH_OPTS, "-q", f"{h}:{remote}", local], timeout=120).returncode == 0),
                    None)
        if not host:
            raise SystemExit(f"could not read graph.json from {', '.join(VAULT_HOSTS)}")
        with open(local) as f:
            graph = json.load(f)
        with open(local, "w") as f:
            json.dump(merged(graph), f, indent=2)
        if subprocess.run(["scp", *SSH_OPTS, "-q", local, f"{host}:{remote}"], timeout=120).returncode:
            raise SystemExit(f"could not write graph.json to {host}")
    print(f"wrote {len(GROUPS)} color groups to {host}:{VAULT_PATH}/.obsidian/graph.json; "
          "reload Obsidian (Ctrl+R) to see them")
