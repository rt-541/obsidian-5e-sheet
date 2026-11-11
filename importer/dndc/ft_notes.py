"""5e.tools entities -> the same notes, frontmatter and tags as the PDF route.

The output contract is unchanged (type: 5e-*, id, name, schema: 1, snake_case
fields, 5e/ tags; see README), so the vault and the sheet plugin see more and
cleaner content, not a new format. Phase 1: creatures, spells, items,
conditions and diseases, book and adventure text.
"""
import collections
import json
import os
import re
import shutil

from . import fivetools as F
from . import ft_classes as C
from . import ft24
from .ft24 import common as F24C
from .ft24 import replaces as F24R
from . import tags as T
from .ocrfix import CR_XP, ability_mod
from .libraries import WOTC_2014, WOTC_2024
from .render import FOLDERS, MARKER, frontmatter, safe, slug, write, write_indexes

ANY_VOCAB = collections.defaultdict(lambda: 99)  # 5e.tools subtypes are clean; no OCR check needed
ORD = {1: "1st", 2: "2nd", 3: "3rd"}


def ordinal(n):
    return ORD.get(n, f"{n}th")


# ---------------------------------------------------------------- creature text helpers

def ac_text(ac):
    out = []
    for a in ac or []:
        if isinstance(a, int):
            out.append(str(a))
        elif isinstance(a, dict):
            if "special" in a:
                out.append(a["special"])
                continue
            s = str(a.get("ac", ""))
            if a.get("from"):
                s += " (" + ", ".join(F.render_text(x, None) for x in a["from"]) + ")"
            if a.get("condition"):
                s += " " + F.render_text(a["condition"], None)
            out.append(s)
    return ", ".join(out)


def hp_text(hp):
    if not hp:
        return ""
    if "special" in hp:
        return hp["special"]
    return f"{hp.get('average')} ({hp.get('formula')})" if hp.get("formula") else str(hp.get("average", ""))


def _leading_int(text):
    m = re.match(r"\s*(\d+)(?!\d)", str(text))
    return int(m[1]) if m else None


def ac_number(ac):
    """The armor class a note carries: the first entry that is a number, an {ac, from} entry or a text that starts
    with a whole number (the whole text stays in ac_note); None when no entry gives one."""
    for a in ac or []:
        if isinstance(a, dict):
            n = _leading_int(a["special"]) if "special" in a else a.get("ac")
        else:
            n = a
        if isinstance(n, int):
            return n
    return None


def hp_special(hp):
    """(hit points, hp_formula) for a `special` hit point text: the leading whole number when the part before the
    first `+` or the word plus holds exactly that one number (or the text is only a number), else None; the
    formula is the whole text. (None, None) for hit points that are not a special text."""
    if not isinstance(hp, dict) or "special" not in hp:
        return None, None
    text = str(hp["special"]).strip()
    before = re.split(r"\+|\bplus\b", text, maxsplit=1)[0]
    lead = _leading_int(before)
    one = len(re.findall(r"\d+", before)) == 1
    return (lead if lead is not None and one else None), text


def special_review_line(m):
    """The review line for a creature whose armor class or hit points are a `special` text, else None."""
    ac_special = any(isinstance(a, dict) and "special" in a for a in m.get("ac") or [])
    hp_value, text = hp_special(m.get("hp"))
    if not ac_special and text is None:
        return None
    took = (ac_special and any(isinstance(a, dict) and "special" in a and _leading_int(a["special"]) is not None
                               for a in m["ac"])) or hp_value is not None
    if took:
        return "armor class or hit points: the number is a base, and the note text says what is added"
    return "armor class or hit points: given as a rule in the note text, not as a number"


def speed_text(sp):
    if isinstance(sp, (int, str)):
        return f"{sp} ft."
    parts = []
    for mode in ("walk", "burrow", "climb", "fly", "swim"):
        v = sp.get(mode)
        if v is None or v is False:
            continue
        num, cond = (v.get("number"), v.get("condition", "")) if isinstance(v, dict) else (v, "")
        if v is True:
            num = sp.get("walk", 0) if not isinstance(sp.get("walk"), dict) else sp["walk"].get("number")
        hover = " (hover)" if mode == "fly" and sp.get("canHover") else ""
        parts.append(f"{'' if mode == 'walk' else mode + ' '}{num} ft.{hover}{(' ' + cond) if cond else ''}")
    if sp.get("choose"):
        c = sp["choose"]
        parts.append(f"{' or '.join(c.get('from', []))} {c.get('amount')} ft." + (f" {c['note']}" if c.get("note") else ""))
    return ", ".join(parts)


def type_text(t):
    if isinstance(t, str):
        return t, None
    base = t.get("type")
    if isinstance(base, dict):
        base = " or ".join(base.get("choose", []))
    tags = []
    for x in t.get("tags", []):
        tags.append(x if isinstance(x, str) else f"{x.get('prefix', '')} {x.get('tag', '')}".strip())
    if t.get("swarmSize"):
        return f"swarm of {F.SIZES.get(t['swarmSize'], '').title()} {base}s", None
    return base + (f" ({', '.join(tags)})" if tags else ""), t.get("sidekickType")


def align_text(al):
    if not al:
        return ""
    if all(isinstance(a, dict) for a in al):
        return " or ".join(f"{align_text(a['alignment'])} ({a['chance']}%)" if "chance" in a else
                           (a.get("special") or align_text(a.get("alignment", []))) for a in al)
    codes = [a for a in al if isinstance(a, str)]
    s = set(codes)
    if s == {"L", "N", "C", "G", "E"} or s == {"A"}:
        return "any alignment"
    if s == {"L", "NX", "C", "NY", "E"}:
        return "any non-good alignment"
    if s == {"NX", "C", "G", "NY", "E"}:
        return "any non-lawful alignment"
    if s == {"L", "NX", "C", "G", "NY"}:
        return "any non-evil alignment"
    if s == {"C", "G", "NY", "E"}:
        return "any chaotic alignment"
    if s == {"L", "G", "NY", "E"}:
        return "any lawful alignment"
    if s == {"N"}:
        return "neutral"
    if s == {"U"}:
        return "unaligned"
    words = [{"NX": "neutral", "NY": "neutral"}.get(c, F.ALIGN.get(c, c)) for c in codes]
    return " ".join(dict.fromkeys(words))


def defense_text(lst, key):
    out = []
    for x in lst or []:
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            if "special" in x:
                out.append(x["special"])
                continue
            inner = defense_text(x.get(key, []), key)
            s = (x.get("preNote", "") + " " + inner + " " + x.get("note", "")).strip()
            out.append(s)
    # damage types are joined with commas; qualified groups with semicolons, as printed
    return "; ".join(out) if any(isinstance(x, dict) for x in lst or []) else ", ".join(out)


def cr_of(m):
    cr = m.get("cr")
    if isinstance(cr, dict):
        return cr.get("cr"), cr.get("xp"), cr.get("lair")
    return cr, None, None


def lair_xp(m):
    """XP in the creature's lair: the 2024 `xpLair`, else the XP of the 2014 `lair` CR."""
    cr = m.get("cr")
    if not isinstance(cr, dict):
        return None
    if cr.get("xpLair") is not None:
        return cr["xpLair"]
    return CR_XP.get(cr["lair"]) if cr.get("lair") else None


def initiative_bonus(m):
    """2024 `initiative`: {"proficiency": n} is the dex modifier plus n times the CR's proficiency bonus."""
    ini = m.get("initiative")
    if isinstance(ini, bool):
        return None
    if isinstance(ini, int):
        return ini
    if isinstance(ini, dict) and isinstance(ini.get("proficiency"), int) and isinstance(m.get("dex"), int):
        return ability_mod(m["dex"]) + ini["proficiency"] * F.proficiency_bonus(m)
    return None


def gear_text(m, links, me, names=None):
    """The 2024 `gear` list ("item|src" strings or {item, quantity}) as one line; library items are linked."""
    out = []
    for g in m.get("gear") or []:
        ref, qty = (g.get("item"), g.get("quantity")) if isinstance(g, dict) else (g, None)
        if not isinstance(ref, str):
            continue
        name, _, src = ref.partition("|")
        note = links.find("item", name.strip(), src.strip() or None)
        if note:
            label = (names or {}).get(note) or F24C.title_name(name.strip())
            text = f"[[{note}|{label}]]"
        else:
            text = F24C.title_name(name.strip())
        out.append(text + (f" ({qty})" if qty and qty != 1 else ""))
    return ", ".join(out)


HP_FORMULA = re.compile(r"(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?")


def creature_checks(m):
    """Problem lines for a 2024 stat block whose numbers disagree with each other (run for 2024 only)."""
    out = []
    if any(not isinstance(m.get(a), int) for a in ("str", "dex", "con", "int", "wis", "cha")):
        out.append("missing ability score")
    hp = m.get("hp") or {}
    f = HP_FORMULA.fullmatch(str(hp.get("formula") or "").strip())
    if f and isinstance(hp.get("average"), int):
        n, faces, sign, k = int(f[1]), int(f[2]), f[3], int(f[4] or 0)
        if hp["average"] != n * (faces + 1) // 2 + (-k if sign == "-" else k):
            out.append(f"hit points {hp['average']} do not match {hp['formula']}")
    cr = m.get("cr")
    # a stated "no CR" only: summoned stat blocks leave the key out, and that is correct
    if "cr" in m and (cr.get("cr") if isinstance(cr, dict) else cr) in (None, "None"):
        out.append("no challenge rating")
    # CR 0 is 0 XP in the 2024 books, 10 in the table the 2014 code uses
    if isinstance(cr, dict) and cr.get("xp") is not None and cr.get("cr") in CR_XP \
            and cr["xp"] != CR_XP[cr["cr"]] and not (cr["cr"] == "0" and cr["xp"] == 0):
        out.append(f"XP {cr['xp']} does not match CR {cr['cr']}")
    return out


def _outside_copy(e, lib):
    return F24C.outside_copy_problem(e, lib)


def cr_value(cr):
    return T.cr_value(cr) if cr and re.fullmatch(r"\d+(/\d+)?", cr) else None


def mods_text(d):
    return ", ".join(f"{k.title()} {v}" for k, v in (d or {}).items()) if isinstance(d, dict) else ""


# ---------------------------------------------------------------- notes

def creature_note(m, ctx):
    links = ctx["links"]
    me = m["_note"]
    R = lambda xs, depth=3: F.render_entries(xs, links, depth, me)
    size = "/".join(F.SIZES.get(s, s) for s in m.get("size", []))
    ctype, _ = type_text(m.get("type", ""))
    align = align_text(m.get("alignment"))
    cr, xp, lair_cr = cr_of(m)
    lair = lair_xp(m)
    init = initiative_bonus(m)
    stated = ctx.get("edition") == "2024"  # a stated 0 XP stays 0 in 2024; 2014 output keeps the table fallback
    xp = xp if stated and xp is not None else (xp or (CR_XP.get(cr) if cr else None))
    if xp and m.get("_xp_mult"):  # "Reduced Threat" halves the XP
        xp = int(xp * m["_xp_mult"])
    f = {"speed": speed_text(m.get("speed", {})),
         "dv": defense_text(m.get("vulnerable"), "vulnerable"), "dr": defense_text(m.get("resist"), "resist"),
         "di": defense_text(m.get("immune"), "immune"), "ci": defense_text(m.get("conditionImmune"), "conditionImmune")}
    abil = {a: m.get(a) for a in ("str", "dex", "con", "int", "wis", "cha")}
    sections = {"traits": m.get("trait") or [], "actions": m.get("action") or [], "bonus_actions": m.get("bonus") or [],
                "reactions": m.get("reaction") or [], "legendary_actions": m.get("legendary") or [],
                "mythic_actions": m.get("mythic") or []}
    group = ctx["data"]["legendary"].get((m["legendaryGroup"]["name"].lower(), m["legendaryGroup"]["source"].lower())) \
        if m.get("legendaryGroup") else None
    if group and group.get("lairActions"):
        sections["lair_actions"] = [{"name": "lair"}]
    c = {"cr": cr, "sections": {k: [{"name": e.get("name", "") if isinstance(e, dict) else ""} for e in v]
                                for k, v in sections.items()},
         "issues": m.get("_problems", []), "source": m["source"]}
    senses = ", ".join(m.get("senses") or [])
    senses = (senses + ", " if senses else "") + f"passive Perception {m.get('passive', 10)}"
    langs = ", ".join(F.render_text(x, None) for x in m.get("languages") or []) or "—"
    hp = m.get("hp") or {}
    ac_value = ac_number(m.get("ac"))
    special_hp, special_formula = hp_special(hp)
    fm = {
        "type": "5e-creature", "schema": 1, "id": m["_id"], "name": m["name"], "source": m["source"],
        "page": m.get("page"), "size": size, "creature_type": ctype, "alignment": align,
        "ac": ac_value, "ac_note": re.sub(r"^\d+\s*", "", ac_text(m.get("ac"))) or None,
        "hp": special_hp if special_formula is not None else hp.get("average"),
        "hp_formula": special_formula if special_formula is not None else hp.get("formula"), "speed": f["speed"], "abilities": abil,
        "saves": {k: int(v) for k, v in (m.get("save") or {}).items() if re.fullmatch(r"[+-]?\d+", str(v))} or None,
        "skills": {k.replace(" ", "_"): int(v) for k, v in (m.get("skill") or {}).items()
                   if re.fullmatch(r"[+-]?\d+", str(v))} or None,
        "damage_vulnerabilities": [x for x in (m.get("vulnerable") or []) if isinstance(x, str)],
        "damage_resistances": [x for x in (m.get("resist") or []) if isinstance(x, str)],
        "damage_immunities": [x for x in (m.get("immune") or []) if isinstance(x, str)],
        "condition_immunities": [x for x in (m.get("conditionImmune") or []) if isinstance(x, str)],
        "senses": senses, "passive_perception": m.get("passive"), "languages": langs,
        "initiative": init, "cr": cr, "cr_value": cr_value(cr), "xp": xp, "environment": m.get("environment"),
        "copied_from": m.get("_copied_from"), "replaces": m.get("_replaces"),
        "tags": T.creature_tags(c, size, ctype, align, f, ANY_VOCAB),
        "needs_review": m.get("_problems") or None,
    }
    out = [frontmatter(fm), "", f"# {m['name']}", f"*{size} {ctype}, {align}*", ""]
    out += [f"**Armor Class** {ac_text(m.get('ac'))}  "]
    if init is not None:
        out.append(f"**Initiative** {init:+d} ({10 + init})  ")
    out += [f"**Hit Points** {hp_text(hp)}  ", f"**Speed** {f['speed']}  ", ""]
    cells = [f"{v} ({ability_mod(v):+d})" if isinstance(v, int) else "—" for v in abil.values()]
    out += ["| STR | DEX | CON | INT | WIS | CHA |", "|:-:|:-:|:-:|:-:|:-:|:-:|", "| " + " | ".join(cells) + " |", ""]
    for label, val in (("Saving Throws", mods_text(m.get("save"))), ("Skills", mods_text(m.get("skill"))),
                       ("Damage Vulnerabilities", f["dv"]), ("Damage Resistances", f["dr"]),
                       ("Damage Immunities", f["di"]), ("Condition Immunities", f["ci"]),
                       ("Senses", senses), ("Languages", langs), ("Gear", gear_text(m, links, me, ctx.get("item_names")))):
        if val:
            out.append(f"**{label}** {F.render_text(val, links, me)}  ")
    if cr:
        out.append(f"**Challenge** {cr}" + (f" ({xp:,} XP" + (f", or {lair:,} XP in its lair" if lair else "")
                                           + ")" if (xp is not None if stated else xp) else "") + "  ")
    if m.get("pbNote"):
        out.append(f"**Proficiency Bonus** {m['pbNote']}  ")
    sc = m.get("spellcasting") or []
    sc_traits = [s for s in sc if s.get("displayAs", "trait") == "trait"]
    sc_actions = [s for s in sc if s.get("displayAs") == "action"]
    body = R(sections["traits"]) if sections["traits"] else ""
    if sc_traits:
        body = "\n\n".join(x for x in [body] + [F._spellcasting(s, links, me) for s in sc_traits] if x)
    if body:
        out += ["", body]
    for key, title in (("actions", "Actions"), ("bonus_actions", "Bonus Actions"), ("reactions", "Reactions"),
                       ("legendary_actions", "Legendary Actions"), ("mythic_actions", "Mythic Actions")):
        entries = sections[key]
        extra = sc_actions if key == "actions" else []
        if not entries and not extra:
            continue
        out += ["", f"## {title}", ""]
        if key == "legendary_actions":
            head = m.get("legendaryHeader") or [
                f"The {m['name'].lower()} can take {m.get('legendaryActions', 3)} legendary actions, choosing from the "
                "options below. Only one legendary action option can be used at a time and only at the end of another "
                f"creature's turn. The {m['name'].lower()} regains spent legendary actions at the start of its turn."]
            out += [R(head), ""]
        if key == "mythic_actions" and m.get("mythicHeader"):
            out += [R(m["mythicHeader"]), ""]
        out.append(R(entries))
        for s in extra:
            out += ["", F._spellcasting(s, links, me)]
    if group:
        for key, title in (("lairActions", "Lair Actions"), ("regionalEffects", "Regional Effects")):
            if group.get(key):
                out += ["", f"## {title}", "", R(group[key])]
    fl = ctx["data"]["fluff"].get((m["name"].lower(), m["source"].lower()))
    if fl and fl.get("entries"):
        out += ["", "## Lore", "", R(fl["entries"])]
    out += ["", source_line(m, ctx)]
    return "\n".join(out).rstrip() + "\n"


def spell_note(s, ctx):
    links, me = ctx["links"], s["_note"]
    level = s.get("level", 0)
    school = F.SCHOOLS.get(s.get("school"), s.get("school", "")).lower()
    ritual = bool((s.get("meta") or {}).get("ritual"))
    time_of = lambda lk: "; ".join(f"{t.get('number', '')} {t.get('unit', '').replace('bonus', 'bonus action')}".strip() +
                                   (f", {F.render_text(t['condition'], lk, me)}" if t.get("condition") else "")
                                   for t in s.get("time", []))
    time, time_plain = time_of(links), time_of(None)  # properties get plain text, never links
    range_ = range_text(s.get("range", {}))
    comp = s.get("components", {})
    parts = [k.upper() for k in ("v", "s") if comp.get(k)]
    mat = comp.get("m")
    mat_text = mat if isinstance(mat, str) else (mat.get("text") if isinstance(mat, dict) else None)
    if mat:
        parts.append(f"M ({mat_text})" if mat_text else "M")
    components = ", ".join(parts)
    durs = []
    conc = False
    for d in s.get("duration", []):
        if d["type"] == "instant":
            durs.append("Instantaneous")
        elif d["type"] == "permanent":
            durs.append("Until dispelled" + (" or triggered" if "trigger" in d.get("ends", []) else ""))
        elif d["type"] == "special":
            durs.append("Special")
        else:
            dd = d.get("duration", {})
            amt, unit = dd.get("amount", 1), dd.get("type", "")
            txt = f"{amt} {unit}{'s' if amt != 1 else ''}"
            if d.get("concentration"):
                conc = True
                txt = f"Concentration, up to {txt}"
            elif dd.get("upTo"):
                txt = f"Up to {txt}"
            durs.append(txt)
    duration = " or ".join(durs)
    classes = sorted({c.lower() for src in (((ctx["data"]["spell_classes"].get(s["source"].lower()) or {})
                                             .get(s["name"].lower()) or {}).get("class") or {}).values() for c in src})
    level_line = f"{school.title()} cantrip" if level == 0 else f"{ordinal(level)}-level {school}" + (" (ritual)" if ritual else "")
    body = F.render_entries(s.get("entries"), links, 3, me)
    higher = F.render_entries(s.get("entriesHigherLevel"), links, 3, me)
    fake = {"level": level, "school": school, "ritual": ritual,
            "fields": {"Duration": duration, "Casting Time": time_plain}, "issues": [], "source": s["source"]}
    fm = {"type": "5e-spell", "schema": 1, "id": s["_id"], "name": s["name"], "source": s["source"], "page": s.get("page"),
          "level": level, "school": school, "ritual": ritual, "casting_time": time_plain, "range": range_,
          "components": components, "material": mat_text, "duration": duration, "concentration": conc,
          "classes": classes or None, "replaces": s.get("_replaces"), "tags": T.spell_tags(fake, classes, body + " " + higher)}
    out = [frontmatter(fm), "", f"# {s['name']}", f"*{level_line}*", "",
           f"**Casting Time:** {time}  ", f"**Range:** {range_}  ", f"**Components:** {components}  ",
           f"**Duration:** {duration}  ", "", body]
    if higher:
        out += ["", higher]
    if classes:
        out += ["", "**Classes:** " + ", ".join(c.title() for c in classes)]
    out += ["", source_line(s, ctx)]
    return "\n".join(out).rstrip() + "\n"


def range_text(rng):
    dist = rng.get("distance", {})
    if rng.get("type") == "special":
        return "Special"
    if rng.get("type") in ("cone", "line", "radius", "sphere", "cube", "hemisphere", "cylinder", "emanation"):
        unit = {"feet": "foot", "miles": "mile"}.get(dist.get("type"), dist.get("type"))
        return f"Self ({dist.get('amount')}-{unit} {rng['type']})"
    if dist.get("type") in ("self", "touch", "sight", "unlimited"):
        return dist["type"].title()
    return f"{dist.get('amount')} {dist.get('type')}"


def type_label(code):
    """The kind a 5e.tools item type code stands for: armor weights are Armor, S a Shield, A and AF Ammunition,
    any other code its name in F.item_type_name."""
    code = code.split("|")[0]
    return "Armor" if code in ("LA", "MA", "HA") else "Shield" if code == "S" else \
        "Ammunition" if code in ("A", "AF") else F.item_type_name(code)


def requires_type_name(requires):
    """The one kind a generic variant's `type` requirements name (Weapon when they mix a weapon with anything
    else), or None when it has no `type` requirement."""
    names = []
    for r in requires or []:
        name = type_label(r["type"]) or "Item" if isinstance(r.get("type"), str) else None
        if name and name not in names:
            names.append(name)
    return None if not names else "Weapon" if "Weapon" in names else names[0]


def item_meta(it):
    code = (it.get("type") or "").split("|")[0]
    kind = "Wondrous item" if it.get("wondrous") else F.item_type_name(it.get("type")) or "Item"
    base = it.get("baseItem", "").split("|")[0]
    if base and kind in ("Weapon", "Armor"):
        kind += f" ({base})"
    elif it.get("requires") and kind in ("Generic Variant", "Item"):
        req = [k for r in it["requires"] for k in r]
        kind = "Weapon" if any(k in ("weapon", "sword", "axe", "bow") or k.endswith("weapon") for k in req) else \
            "Armor" if any("armor" in k for k in req) else requires_type_name(it["requires"]) or "Item"
        kind += f" (any {', '.join(req)})"
    rarity = it.get("rarity") or ""
    rarity = "" if rarity in ("none", "unknown") else rarity
    att = it.get("reqAttune")
    att_text = " (requires attunement" + (f" {att}" if isinstance(att, str) else "") + ")" if att else ""
    return kind, rarity, f"{kind}{', ' + rarity if rarity else ''}{att_text}", bool(att)


PROPS = {"L": "light", "H": "heavy", "T": "thrown", "V": "versatile", "2H": "two-handed", "F": "finesse", "R": "reach",
         "A": "ammunition", "LD": "loading"}


def bonus(v):
    m = re.fullmatch(r"\s*([+-]?\d+)\s*", str(v or ""))
    return int(m.group(1)) if m else None


GROUPS = ("sword", "axe", "bow", "crossbow", "hammer", "mace", "spear", "polearm", "net", "firearm")
WEIGHTS = {"LA": "light", "MA": "medium", "HA": "heavy"}
RANGES = {"M": "melee", "R": "ranged"}
DMG_WORDS = {"B": "bludgeoning", "P": "piercing", "S": "slashing"}
PLAIN_WORDS = set(WEIGHTS.values()) | set(RANGES.values()) | set(DMG_WORDS.values())


def _spec(d):
    """One requires/excludes mapping -> (base or None, word or None, problems). Keys of one mapping all apply."""
    base, words, problems = None, [], []
    for k, val in d.items():
        code = val.split("|")[0] if isinstance(val, str) else val
        if k == "armor" and val is True:
            base = "armor"
        elif k == "weapon" and val is True:
            base = "weapon"
        elif k == "type" and code in WEIGHTS:
            base, _ = "armor", words.append(WEIGHTS[code])
        elif k == "type" and code in RANGES:
            base, _ = "weapon", words.append(RANGES[code])
        elif k == "dmgType" and code in DMG_WORDS:
            words.append(DMG_WORDS[code])
        elif k in GROUPS and val is True:
            base, _ = "weapon", words.append(k)
        elif k == "name" and isinstance(val, str):
            words.append(slug(val))
        elif k == "type" and isinstance(val, str) and type_label(val):
            problems.append(type_label(val).lower())  # the real requirement in words, not its code
        else:
            problems.append(f"{k}={val!r}")
    return base, "+".join(words) or None, problems


def variant_of(v):
    """A 5e.tools magicvariant's requires/excludes/bonuses -> (the sheet plugin's `variant` mapping, problems in words).
    Anything the plugin cannot express gives (None, problems) rather than a guess."""
    only, anys, bases, problems = [], False, set(), []
    for r in v.get("requires") or []:
        base, word, bad = _spec(r)
        problems += [f"requires {b}" for b in bad]
        if base:
            bases.add(base)
        if word:
            only.append(word)
        else:
            anys = True
    excepts = []
    ex = v.get("excludes") or {}
    for key, val in ex.items():  # excludes are OR: any matching key excludes, so one except entry per key
        base, word, bad = _spec({key: val})
        problems += [f"excludes {b}" for b in bad]
        if base:
            bases.add(base)
        if word:
            excepts.append(word)
    inh = v.get("inherits") or {}
    bonuses = {}
    for key in ("bonusAc", "bonusWeapon"):
        if inh.get(key) is not None:
            n = bonus(inh[key])
            if n is None:
                problems.append(f"{key}={inh[key]!r} is not a whole number")
            else:
                bonuses[key] = n
    if len(bases) != 1 and not problems:
        problems.append("requires names " + ("no armor or weapon" if not bases else "both armor and weapon"))
    if problems:
        words = {"armor", "shield", "ammunition"} | {n.lower() for n in F.ITEM_TYPES.values()}
        seen = set()  # a real-type line said once however many requirement entries name it; other lines stay as they are
        return None, [b for b in problems if not (b[9:] in words and (b in seen or seen.add(b)))]
    out = {"base": bases.pop()}
    if only and not anys:
        out["only"] = only
    if excepts:
        out["except"] = excepts
    out.update(bonuses)
    return out, []


def check_variant_words(variant, bases):
    """Problem lines for any only/except word that no base armor or weapon (id or group) and no plain word explains."""
    known = set(PLAIN_WORDS)
    for b in bases.values():
        known.add(slug(b["name"]))
        known.update(g for g in GROUPS if b.get(g))
    return [f"word {w!r} in {key} matches no base item"
            for key in ("only", "except") for spec in variant.get(key, []) for w in spec.split("+") if w not in known]


def ref_code(p):
    """The code of an item property: a "CODE|SRC" string, or in the 2024 data a dict with that string as `uid`."""
    return (p.get("uid", "") if isinstance(p, dict) else p).split("|")[0]


def ref_name(p):
    """The name part of a mastery reference (same two shapes as ref_code)."""
    return ref_code(p)


def unmapped_item_types(items):
    """Counter of item type codes (source suffix dropped) that F.ITEM_TYPES does not know."""
    return collections.Counter(i["type"].split("|")[0] for i in items
                               if i.get("type") and not F.item_type_name(i["type"]))


def item_native(it, bases):
    """The sheet plugin's native item fields (kind, weapon, armor, effects, charges) from the 5e.tools data, so a
    library weapon rolls its damage and armor sets AC. A magic weapon or armor takes its stats from its base item."""
    key = tuple(x.lower() for x in (it.get("baseItem") or "").split("|")[:2])
    base = bases.get(key if len(key) == 2 else (key[0], "phb")) if it.get("baseItem") else None
    src = it if (it.get("dmg1") or it.get("ac")) else (base or it)
    code = (src.get("type") or it.get("type") or "").split("|")[0]
    out, mods = {}, []
    has_mastery = bool(it.get("mastery") or src.get("mastery") or (base or {}).get("mastery"))
    if src.get("dmg1") and (code in ("M", "R") or has_mastery):  # a mastered weapon of another type code (a staff) too
        props = [PROPS[ref_code(p)] for p in src.get("property") or [] if ref_code(p) in PROPS]
        ranged = code == "R"
        w = {"dmg": src["dmg1"].replace(" ", ""), "type": damage_type(src.get("dmgType")),
             "ab": "finesse" if "finesse" in props else "dex" if ranged else "str", "range": "ranged" if ranged else "melee"}
        if src.get("weaponCategory") in ("simple", "martial"):
            w["category"] = src["weaponCategory"]
        keep = [p for p in props if p in ("light", "heavy", "thrown", "versatile", "two-handed")]
        if keep:
            w["props"] = keep
        groups = [g for g in GROUPS if src.get(g)]
        if groups:
            w["groups"] = groups
        if bonus(it.get("bonusWeapon")):
            w["bonus"] = bonus(it["bonusWeapon"])
        mastery = it.get("mastery") or src.get("mastery") or (base or {}).get("mastery")
        if mastery:
            w["mastery"] = slug(ref_name(mastery[0]))
        out.update(kind="weapon", weapon=w)
    elif code in ("LA", "MA", "HA") and src.get("ac"):
        a = {"base": src["ac"] + (bonus(it.get("bonusAc")) or 0), "dex": {"LA": "full", "MA": "max2", "HA": "none"}[code]}
        if src.get("stealth"):
            a["stealthDis"] = True
        if bonus(src.get("strength")):
            a["strReq"] = bonus(src["strength"])
        out.update(kind="armor", armor=a)
    elif code == "S":
        out["kind"] = "shield"
        mods.append({"target": "ac", "value": (src.get("ac") or 2) + (bonus(it.get("bonusAc")) or 0)})
    elif it.get("_shield"):  # a generic "any shield" item combines with the one ordinary shield
        out["kind"] = "shield"
        mods.append({"target": "ac", "value": shield_ac(bases) + (bonus(it.get("bonusAc")) or 0)})
    if out.get("kind") not in ("armor", "shield") and bonus(it.get("bonusAc")):
        mods.append({"target": "ac", "value": bonus(it["bonusAc"])})
    if bonus(it.get("bonusSavingThrow")):
        mods.append({"target": "save", "value": bonus(it["bonusSavingThrow"])})
    if mods:
        out["effects"] = {"modifiers": mods}
    if isinstance(it.get("charges"), int):
        out["charges"] = {"max": it["charges"], "reset": "dawn" if it.get("recharge") == "dawn" else "none"}
    return out


def fill_template(entries, inherits, noun):
    """Fill {=key} and {=key/mod} from the variant's inherits.

    Keys that depend on the base item the sheet picks later never print a made-up value: baseName takes the
    noun (/l lowercases, /a adds an article), dmgType a neutral phrase, any other missing key the noun.
    An unknown /modifier leaves the case alone."""
    def sub(m):
        key, mod = m.group(1), (m.group(2) or "")[1:]
        if key == "baseName":
            val = noun
        elif key == "dmgType":
            val = "of the weapon's damage type"
        elif inherits.get(key) is not None:
            val = str(inherits[key])
        else:
            val = noun
        if mod == "l":
            val = val.lower()
        elif mod == "a" and key == "baseName":
            val = ("an " if val[:1].lower() in "aeiou" else "a ") + val
        return json.dumps(val)[1:-1]
    return json.loads(re.sub(r"\{=(\w+)(/\w+)?\}", sub, json.dumps(entries)))


def item_note(it, ctx):
    links, me = ctx["links"], it["_note"]
    kind, rarity, meta, att = item_meta(it)
    magic = bool(rarity) or it.get("wondrous")
    fake = {"item_type": kind.split(" (")[0], "rarity": rarity or "mundane", "meta": meta,
            "issues": [], "source": it["source"]}
    fm = {"type": "5e-item", "schema": 1, "id": it["_id"], "name": it["name"], "source": it["source"],
          "page": it.get("page"), "item_type": kind.split(" (")[0], "rarity": rarity or "mundane",
          "attunement": att, "magic": bool(magic), "weight": it.get("weight"), "value": it.get("value"),
          "replaces": it.get("_replaces"), "tags": T.item_tags(fake)}
    fm.update(item_native(it, ctx["bases"]))
    if it.get("_variant"):
        fm["variant"] = it["_variant"]  # the bonus lives only here: the plugin adds it, so no modifier is written too
    if ctx.get("edition") == "2024" and it.get("_problems"):
        fm["needs_review"] = list(it["_problems"])  # the lines Index/Needs Review lists; 2014 variants stay page-only
    stats = []
    if it.get("dmg1"):
        stats.append(f"**Damage** {it['dmg1']} {damage_type(it.get('dmgType'))}" +
                     (f" (versatile {it['dmg2']})" if it.get("dmg2") else ""))
    if it.get("ac"):
        stats.append(f"**Armor Class** {it['ac']}")
    out = [frontmatter(fm), "", f"# {it['name']}", f"*{meta}*", ""] + [s + "  " for s in stats]
    # generic variants say "this magic {=baseName/l}": name the kind of item instead
    noun = kind.split(" (")[0].lower().replace("wondrous item", "item")
    entries = fill_template(it.get("entries") or [], it.get("_inherits") or {}, noun)
    out += ["", F.render_entries(entries, links, 3, me), "", source_line(it, ctx)]
    return "\n".join(out).rstrip() + "\n"


def damage_type(code):
    return {"A": "acid", "B": "bludgeoning", "C": "cold", "F": "fire", "O": "force", "L": "lightning", "N": "necrotic",
            "P": "piercing", "I": "poison", "Y": "psychic", "R": "radiant", "S": "slashing", "T": "thunder"}.get(code, "")


def condition_note(c, ctx):
    links, me = ctx["links"], c["_note"]
    kind = "disease" if c.get("_disease") else "condition"
    fm = {"type": "5e-condition", "schema": 1, "id": c["_id"], "name": c["name"], "source": c["source"],
          "page": c.get("page"), "condition_kind": kind, "replaces": c.get("_replaces"),
          "tags": ["5e/condition", T.tag("source", c["source"])] + (["5e/condition/disease"] if kind == "disease" else [])}
    out = [frontmatter(fm), "", f"# {c['name']}", "", F.render_entries(c.get("entries"), links, 3, me), "",
           source_line(c, ctx)]
    return "\n".join(out).rstrip() + "\n"


def mastery_note(m, ctx):
    links, me = ctx["links"], m["_note"]
    fm = {"type": "5e-mastery", "schema": 1, "id": m["_id"], "name": m["name"], "source": m["source"],
          "page": m.get("page"), "replaces": m.get("_replaces"),
          "tags": ["5e/mastery", T.tag("source", m["source"])]}
    out = [frontmatter(fm), "", f"# {m['name']}", "", F.render_entries(m.get("entries"), links, 3, me), "",
           source_line(m, ctx)]
    return "\n".join(out).rstrip() + "\n"


def source_line(e, ctx):
    title = ctx["titles"].get(e["source"], e["source"])
    book = ctx["book_notes"].get(e["source"])
    where = f"[[{book}|{title}]]" if book else title
    return f"---\n*Source: {where}" + (f", p. {e['page']}" if e.get("page") else "") + "*"


# ---------------------------------------------------------------- classes, races, feats, backgrounds
# Frontmatter carries the sheet plugin's op structure (ft_classes.py); the body carries the
# same rules text with links for reading in Obsidian.

def place(kind, ents, path_of, rank, links, out):
    """Note path and id per entity: the first source by priority keeps the plain name."""
    by_name = collections.defaultdict(list)
    for e in ents:
        by_name[e["_display"].lower()].append(e)
    for group in by_name.values():
        group.sort(key=lambda e: rank(e["source"]))
        for n, e in enumerate(group):
            label = e["_display"] if n == 0 else f"{e['_display']} ({e['source']})"
            e["_note"] = path_of(e, safe(label))
            e["_id"] = slug(e["_display"]) if n == 0 else f"{slug(e['_display'])}-{slug(e['source'])}"
            if kind in ("class", "race", "feat", "background"):
                links.add(kind, e["name"], e["source"], e["_note"])
            out.append((kind, e))


def rules_module(lib):
    """The module that reads and converts classes, species, feats and backgrounds for a library's edition."""
    return ft24 if lib.edition == WOTC_2024.edition else C


def rule_entities(data_root, links, rank, lib=WOTC_2014):
    D = rules_module(lib).load(data_root, lib.sources)
    LIB = lib.folder
    keep = (lambda es: es) if lib.sources is None else (lambda es: [e for e in es if e.get("source") in lib.sources])
    out = []
    for e in D["classes"]:
        e["_display"] = e["name"]
    place("class", D["classes"], lambda e, lab: f"{LIB}/Classes/{lab}/{lab}", rank, links, out)
    class_of = {(c["name"].lower(), c["source"].lower()): c for c in D["classes"]}
    subs, orphans = [], []
    D["orphan_subclasses"] = orphans
    for sc in D["subclasses"]:
        parent = class_of.get((sc["className"].lower(), sc["classSource"].lower()))
        if parent and not sc.get("_copy"):
            sc["_display"], sc["_parent"] = sc["name"], parent
            subs.append(sc)
        elif not parent and not sc.get("_copy") and lib.edition == WOTC_2024.edition:
            # no note can be written; the build log and Needs Review say so instead of dropping it silently
            orphans.append({"name": sc["name"], "source": sc["source"], "page": sc.get("page"),
                            "issue": f"subclass of {sc['className']} ({sc['classSource']}), a class outside this library: "
                                     "no note written"})
    place("subclass", subs, lambda e, lab: f"{LIB}/Classes/{safe(e['_parent']['_note'].rsplit('/', 1)[1])}/Subclasses/{lab}",
          rank, links, out)
    is24 = lib.edition == WOTC_2024.edition

    def resolved(key):
        """`_copy` resolved; in a 2024 library a copy of a book outside it is recorded as a problem."""
        if not is24:
            return F.resolve_copies(D[key])
        copy_problems = {}
        ents = F.resolve_copies(D[key], copy_problems)
        for orig, e in zip(D[key], ents):
            found = [ft24.common.outside_copy_problem(orig, lib)] + copy_problems.get((orig["name"], orig["source"]), [])
            found = [p for p in found if p]
            if found:
                e["_problems"] = found
        return ents

    races = [r for r in keep(resolved("races")) if r.get("name")]
    lineages = []
    for r in races:
        r["_display"] = r["name"]
        if is24:  # lineages are species `_versions`; each becomes a subrace of its species
            for v in keep(F.expand_versions(r)):
                v["_display"], v["_parent"] = v["name"], r
                lineages.append(v)
    place("race", races, lambda e, lab: f"{LIB}/Races/{lab}/{lab}", rank, links, out)
    race_of = {(r["name"].lower(), r["source"].lower()): r for r in races}
    subraces = []
    for sr in keep(D["subraces"]):
        parent = race_of.get((sr.get("raceName", "").lower(), sr.get("raceSource", "").lower()))
        if parent and sr.get("name"):
            sr["_display"], sr["_parent"] = f"{parent['name']} ({sr['name']})", parent
            subraces.append(sr)
    subraces += lineages
    place("subrace", subraces, lambda e, lab: f"{LIB}/Races/{safe(e['_parent']['_note'].rsplit('/', 1)[1])}/Subraces/{lab}",
          rank, links, out)
    for kind, key, folder in (("feat", "feats", "Feats"), ("background", "backgrounds", "Backgrounds")):
        ents = [e for e in keep(resolved(key)) if e.get("name")]
        if is24 and kind == "feat":  # a feat's named variants are feats of their own
            ents += [v for e in ents for v in keep(F.expand_versions(e))]
        for e in ents:
            e["_display"] = e["name"]
        place(kind, ents, lambda e, lab, folder=folder: f"{LIB}/{folder}/{lab}", rank, links, out)
    if is24:  # a background's feat must be one of these ids
        D["feat_ids"] = {e["_id"] for k, e in out if k == "feat"}
    return D, out


def rule_note(kind, e, D, ctx, C=C):
    """C is the converter module for the library's edition (rules_module)."""
    links, me = ctx["links"], e["_note"]
    tags = [f"5e/{kind}", T.tag("source", e["source"])]
    if kind == "class":
        _, doc = C.class_doc(D, e)
        tags.append(T.tag("class", e["_id"]))
        body = []
        for ref in e.get("classFeatures", []):
            feat = C.class_feature(D, ref, e)
            if feat:
                body.append(f"## {feat['name']} (level {feat['level']})\n\n" + F.render_entries(feat.get("entries"), links, 3, me))
    elif kind == "subclass":
        doc = C.subclass_doc(D, e, e["_parent"], e["_parent"]["_id"])
        tags.append(T.tag("class", e["_parent"]["_id"]))
        body = []
        for ref in e.get("subclassFeatures", []):
            feat = C.subclass_feature(D, ref)
            if feat:
                body.append(f"## {feat['name']} (level {feat['level']})\n\n" + F.render_entries(feat.get("entries"), links, 3, me))
    elif kind in ("race", "subrace"):
        doc = C.race_doc(e)
        if kind == "subrace":
            doc["race"] = e["_parent"]["_id"]
        body = [F.render_entries(e.get("entries"), links, 2, me)]
    elif kind == "feat":
        doc = C.feat_doc(e)
        body = [F.render_entries(e.get("entries"), links, 2, me)]
    else:
        doc = C.background_doc(e, D["feat_ids"]) if "feat_ids" in D else C.background_doc(e)
        body = [F.render_entries(e.get("entries"), links, 2, me)]
    fm = {"type": f"5e-{kind}", "schema": 1, "id": e["_id"], "name": e["_display"], "source": e["source"],
          "page": e.get("page"), "replaces": e.get("_replaces"), "tags": tags}
    problems = doc.pop("_problems", None)
    fm.update(doc)
    if problems:
        fm["needs_review"] = problems
        e["_problems"] = problems
    text = "\n\n".join(b for b in body if b.strip())
    return f"{frontmatter(fm)}\n\n# {e['_display']}\n\n{text}\n\n{source_line(e, ctx)}\n"


# ---------------------------------------------------------------- build

def only_shield(v):
    """True for a generic variant that asks for nothing but a shield (any `type` code S, no exclusions)."""
    req = v.get("requires") or []
    return bool(req) and not v.get("excludes") and all(
        isinstance(r, dict) and set(r) == {"type"} and isinstance(r["type"], str) and r["type"].split("|")[0] == "S"
        for r in req)


def shield_ac(bases):
    """The armor class of the ordinary shield among the base items (2 when the data has none)."""
    acs = [b["ac"] for _, b in sorted(bases.items()) if (b.get("type") or "").split("|")[0] == "S"
           and isinstance(b.get("ac"), int)]
    return acs[0] if acs else 2


def variants_as_items(variants, problems=None):
    """problems, when given, collects one line per variant the plugin cannot express."""
    out = []
    for v in variants:
        inh = v.get("inherits", {})
        if not inh.get("source"):
            continue
        it = {"name": v["name"], "source": inh["source"], "page": inh.get("page"), "type": v.get("type"),
              "requires": v.get("requires"), "rarity": inh.get("rarity"), "reqAttune": inh.get("reqAttune"),
              "entries": inh.get("entries") or v.get("entries")}
        it["_inherits"] = inh
        if only_shield(v):  # any shield: written as a shield in its own right, with its bonus, not as a variant
            it.update(_shield=True, bonusAc=inh.get("bonusAc"), _variant=None, _problems=[])
            out.append(it)
            continue
        it["_variant"], bad = variant_of(v)
        it["_problems"] = [f"variant: {b}" for b in bad]
        if problems is not None:
            problems += [f"variant {v['name']}: {b}" for b in bad]
        out.append(it)
    return out


def build(data_root, out_root, problems=None, lib=WOTC_2014, legacy_ids=None):
    """Write one library into out_root; the 2024 library keeps a link whole inside a formatting tag."""
    F.set_nested_links(lib.edition == "2024")
    try:
        return _build(data_root, out_root, problems, lib, legacy_ids)
    finally:
        F.set_nested_links(False)


def _build(data_root, out_root, problems=None, lib=WOTC_2014, legacy_ids=None):
    """Write one library into out_root. lib.sources, when set, limits every entity type to those books."""
    LIB = lib.folder
    data = F.load(data_root)
    titles = {b["id"]: b["name"] for b in data["books"]}
    titles.update({a["id"]: a["name"] for a in data["adventures"]})
    order = list(lib.priority) + [b["id"] for b in data["books"]] + [a["id"] for a in data["adventures"]]
    rank = lambda src: order.index(src) if src in order else len(order)
    keep = (lambda es: es) if lib.sources is None else (lambda es: [e for e in es if e["source"] in lib.sources])
    if lib.sources is not None:
        data["books"] = [b for b in data["books"] if b["id"] in lib.sources]
        data["adventures"] = [a for a in data["adventures"] if a["id"] in lib.sources]

    copy_problems = {}
    copies = {(m["name"], m["source"]): m for m in data["monsters"] if m.get("_copy")}
    monsters = keep(F.resolve_copies(data["monsters"], copy_problems, data["templates"]))
    for m in monsters:
        m["_problems"] = list(copy_problems.get((m["name"], m["source"]), []))
        if lib.edition == "2024":
            outside = _outside_copy(copies.get((m["name"], m["source"])) or {}, lib)
            m["_problems"] += ([outside] if outside else []) + creature_checks(m)
        line = special_review_line(m)
        if line:
            m["_problems"].append(line)
    variant_problems = [] if problems is None else problems
    items = keep([i for i in data["items"] if not i.get("_copy")] + variants_as_items(data["variants"], variant_problems))
    copied_items = []  # 2024: an items.json `_copy` is not converted; each one in this library is recorded, not dropped silently
    if lib.edition == "2024":
        for i in keep([i for i in data["items"] if i.get("_copy")]):
            line = f"item {i['name']} ({i['source']}) copies another item and is not converted"
            copied_items.append({"name": i["name"], "source": i["source"], "page": i.get("page"), "issue": line})
            variant_problems.append(line)
    conditions = keep(data["conditions"] + [dict(d, _disease=True) for d in data["diseases"]])
    kinds = [("creature", [m for m in monsters if m.get("hp") or m.get("ac")]),
             ("spell", keep(data["spells"])), ("item", items), ("condition", conditions)]
    if data.get("masteries"):
        kinds.append(("mastery", keep(data["masteries"])))

    root = os.path.join(out_root, *LIB.split("/"))
    shutil.rmtree(root, ignore_errors=True)
    links = F.Links()
    entities = []
    for kind, ents in kinds:
        folder = FOLDERS[kind]
        by_name = collections.defaultdict(list)
        for e in ents:
            by_name[e["name"].lower()].append(e)
        for name, group in by_name.items():
            group.sort(key=lambda e: rank(e["source"]))
            for n, e in enumerate(group):
                label = e["name"] if n == 0 else f"{e['name']} ({e['source']})"
                e["_note"] = f"{LIB}/{folder}/{safe(label)}"
                e["_id"] = slug(e["name"]) if n == 0 else f"{slug(e['name'])}-{slug(e['source'])}"
                links.add(kind, e["name"], e["source"], e["_note"])
                entities.append((kind, e))

    rules_data, rules = rule_entities(data_root, links, rank, lib)
    replaced = None
    if lib.edition == WOTC_2024.edition and legacy_ids is not None:
        raw = dict(data, **C.load(data_root, None))  # every book of the clone: the reprinted entries are older ones
        replaced_by_kind = {}
        replaced = F24R.assign(entities + rules, F24R.reprints(raw), legacy_ids, lib, replaced_by_kind)
        replaced["by_kind"] = replaced_by_kind

    book_notes = {}
    chapters = []
    for kind, lst, sub in (("book", data["books"], "book"), ("adventure", data["adventures"], "adventure")):
        for b in lst:
            path = os.path.join(data["root"], sub, f"{sub}-{b['id'].lower()}.json")
            if not os.path.exists(path):
                continue
            folder = f"{LIB}/Books/{safe(b['name'])}"
            book_notes[b["id"]] = f"{folder}/{safe(b['name'])}"
            wrapped = json.load(open(path)).get(f"{sub}Data") or [{}]  # [{"id", "source", "data": [chapters]}]
            body = wrapped[0].get("data", [])
            for i, ch in enumerate(body):
                cname = ch.get("name") or f"Part {i + 1}"
                note = f"{folder}/{i:02d} {safe(cname)}"
                links.books[(b["id"].lower(), str(i))] = note
                chapters.append((b, i, cname, note, ch))
    bases = {(i["name"].lower(), i["source"].lower()): i for i in data["items"] if i.get("dmg1") or i.get("ac")}
    for it in items:
        if it.get("_variant"):
            words = check_variant_words(it["_variant"], bases)
            variant_problems += [f"variant {it['name']}: {b}" for b in words]
            it["_problems"] = it.get("_problems", []) + [f"variant: {b}" for b in words]
    ctx = {"links": links, "data": data, "titles": titles, "book_notes": book_notes, "bases": bases,
           "edition": lib.edition, "item_names": {e["_note"]: e["name"] for k, e in entities if k == "item"}}

    render = {"creature": creature_note, "spell": spell_note, "item": item_note, "condition": condition_note, "mastery": mastery_note}
    for kind, e in entities:
        write(out_root, e["_note"], render[kind](e, ctx))
    for kind, e in rules:
        write(out_root, e["_note"], rule_note(kind, e, rules_data, ctx, rules_module(lib)))
    by_book = collections.defaultdict(list)
    for b, i, cname, note, ch in chapters:
        fm = frontmatter({"book": b["name"], "source": b["id"], "tags": ["5e/book", T.tag("source", b["id"])]})
        body = F.render_entries(ch.get("entries"), links, 2)
        write(out_root, note, f"{fm}\n\n# {cname}\n\n{body}\n")
        by_book[b["id"]].append((note, cname))
    for b in data["books"] + data["adventures"]:
        if b["id"] in by_book:
            idx = [frontmatter({"book": b["name"], "source": b["id"], "published": b.get("published"),
                                "tags": ["5e/book", T.tag("source", b["id"])]}), "", f"# {b['name']}", ""]
            idx += [f"- [[{n}|{c}]]" for n, c in by_book[b["id"]]]
            write(out_root, book_notes[b["id"]], "\n".join(idx) + "\n")

    # indexes reuse the PDF route's writer, which reads these keys
    idx_ents = []
    for kind, e in entities:
        x = {"kind": kind, "note": e["_note"], "name": e["name"], "source": e["source"], "page": e.get("page"),
             "book": titles.get(e["source"], e["source"]), "issues": e.get("_problems") or []}
        if kind == "creature":
            x["cr"] = cr_of(e)[0]
        elif kind == "spell":
            x.update(level=e.get("level", 0), school=F.SCHOOLS.get(e.get("school"), "").lower(),
                     ritual=bool((e.get("meta") or {}).get("ritual")))
        elif kind == "item":
            k, rarity, _, att = item_meta(e)
            x.update(item_type=k.split(" (")[0], rarity=rarity or "mundane", attunement=att)
        idx_ents.append(x)
    for kind, e in rules:  # a 2024 converter may record problems; the 2014 ones never do
        if e.get("_problems"):
            idx_ents.append({"kind": kind, "note": e["_note"], "name": e["_display"], "source": e["source"],
                             "page": e.get("page"), "book": titles.get(e["source"], e["source"]),
                             "issues": e["_problems"]})
    for o in rules_data.get("orphan_subclasses", []):  # no note exists for these: listed by name, no link
        idx_ents.append({"kind": "subclass", "note": None, "name": o["name"], "source": o["source"],
                         "page": o["page"], "book": titles.get(o["source"], o["source"]), "issues": [o["issue"]]})
        variant_problems.append(f"subclass {o['name']} ({o['source']}): {o['issue']}")
    for o in copied_items:  # no note exists for these either: listed by name, no link
        idx_ents.append({"kind": "item_copy", "note": None, "name": o["name"], "source": o["source"],
                         "page": o["page"], "book": titles.get(o["source"], o["source"]), "issues": [o["issue"]]})
    write_indexes(out_root, idx_ents, (), LIB, lib.review_intro)
    with open(os.path.join(root, MARKER), "w") as f:
        f.write(lib.marker_text)
    counts = collections.Counter(k for k, _ in entities + rules)
    # (kind, name, note) for every entity with its plain name, so other libraries can link here
    seed = [(k, e["name"], e["_note"]) for k, e in entities if not e["_note"].endswith(f"({e['source']})")]
    log = dict(counts, chapters=len(chapters), copy_problems=len(copy_problems), variant_problems=len(variant_problems))
    if lib.edition == "2024":  # a creature's `_versions` (variants of one stat block) are not expanded into notes
        log["creatures_with_versions"] = sum(1 for k, m in entities if k == "creature" and m.get("_versions"))
        log["creature_versions_skipped"] = sum(len(m.get("_versions") or []) for k, m in entities if k == "creature")
    if replaced is not None:
        log["replaces"] = replaced
    return log, seed
