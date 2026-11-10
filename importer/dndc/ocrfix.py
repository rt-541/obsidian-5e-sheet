"""Deterministic OCR repair for numbers in rules text.

The WotC PDFs are scans with an OCR layer that reads 5 as S, 0 as O, 1 as l.
The cleanup model cannot be trusted with digits (asked to fix "Sd6" it
guessed "3d6"), so digits are repaired here, only inside contexts where a
number is certain: dice, to-hit, DC, XP, feet, ability scores, saves, skills.
"""
import re

CONF = "0-9SsOoDlIi|BZzG"
BASE = {"O": "0", "o": "0", "D": "0", "l": "1", "I": "1", "i": "1", "|": "1", "B": "8",
        "Z": "2", "z": "2", "G": "6"}
MAPS = {d: str.maketrans(dict(BASE, S=d, s=d)) for d in ("5", "8")}
DIE_SIZES = ("4", "6", "8", "10", "12", "20", "100")
M = r"\**"  # bold/italic marks the PDF fonts left between a label and its number
N = f"[{CONF}]"
# uppercase-only confusables for weak contexts, so "is", "so" and "lift" stay words
U = "[0-9SODlIBZG|]"
DASH = "[-–—−~]"

SKILLS = ("Acrobatics|Animal Handling|Arcana|Athletics|Deception|History|Insight|Intimidation|"
          "Investigation|Medicine|Nature|Perception|Performance|Persuasion|Religion|"
          "Sleight of Hand|Stealth|Survival|Str|Dex|Con|Int|Wis|Cha")


HEADER = re.compile(r"^\s*(Armor Class|Hit Points|Speed|Senses|Challenge|AC|hp:|XP)\b")


def num(tok, s_digit="5"):
    """Map a confusable token to digits; return None unless the result is all digits."""
    t = tok.replace(" ", "").translate(MAPS[s_digit])
    return t if t.isdigit() else None


def _sub(pattern, fn, text, flags=0):
    return re.sub(pattern, fn, text, flags=flags)


def fix(text, s_digit="5"):
    """Repair numbers; s_digit is what this book's OCR means by S (5 or 8)."""
    alt = "8" if s_digit == "5" else "5"

    def num(tok):  # noqa: F811 - the book's S mapping
        return globals()["num"](tok, s_digit)

    # OCR splits digits with spaces inside stat header lines: "Armor Class 1 2", "1 5 (+2)"
    if HEADER.match(re.sub(r"\*+", "", text)) or len(re.findall(r"\(\s*[+\-\u2013\u2212]", text)) >= 3:
        text = re.sub(r"(?<=[0-9])\s(?=[0-9])", "", text)
        text = re.sub(r"\s{2,}", " ", text)

    def dice(m):
        a, b = num(m.group(1)), num(m.group(2))
        if b not in DIE_SIZES:
            b = globals()["num"](m.group(2), alt)  # S as a die size can only be 8
        if a is None or b is None or b not in DIE_SIZES:
            return m.group(0)
        return f"{a}d{b}"
    text = _sub(rf"(?<![A-Za-z])({N}{{1,3}})\s?d\s?({N}{{1,3}})(?![A-Za-z])", dice, text)

    def keep_prefix(group_idx):
        def f(m):
            n = num(m.group(group_idx))
            if n is None:
                return m.group(0)
            s, e = m.span(group_idx)
            base = m.start(0)
            g = m.group(0)
            return g[: s - base] + n + g[e - base:]
        return f

    # dice expression modifiers: (1d8 + l) -> (1d8 + 1)
    text = _sub(rf"(\d+d\d+ ?[+\-−] ?)({N}{{1,3}})(?=\s*\))", keep_prefix(2), text)
    # average before a dice expression: S (1d8 + 1)
    text = _sub(rf"(?<![A-Za-z])({U}{{1,3}})(?={M} \(\d+d\d+)", keep_prefix(1), text)
    # to hit: +S to hit
    text = _sub(rf"([+\-−] ?)({N}{{1,2}})(?= to hit)", keep_prefix(2), text)
    # DC 1S
    text = _sub(rf"\bDC ({N}{{1,2}})\b", keep_prefix(1), text)
    # (4SO XP), (1,1OO XP)
    def xp(m):
        n = num(m.group(1).replace(",", ""))
        return f"({int(n):,} XP)" if n else m.group(0)
    text = _sub(rf"\(([{CONF}, ]{{1,8}}?) ?XP\)", xp, text)
    # SO ft., S ft.
    feet = lambda m: num(m.group(1)) + " " if num(m.group(1)) else m.group(0)
    text = _sub(rf"(?<![A-Za-z'])(\d{U}{{0,3}}|{U}{{1,3}}\d) ?(?=ft\b)", feet, text)
    text = _sub(rf"(?<![A-Za-z'])({U}{{1,4}}) (?=ft\.)", feet, text)
    # ability score cells: 1S (+2), 1 (- S)
    def ability(m):
        a, b = num(m.group(1)), num(m.group(3))
        if a is None or b is None:
            return m.group(0)
        sign = "+" if m.group(2) == "+" else "-"
        return f"{a} ({sign}{b})"
    text = _sub(rf"(?<![A-Za-z])({N}{{1,2}}) ?[({{\[]({DASH}|\+) ?({N}{{1,2}}) ?[)}}\]J]", ability, text)
    # saves and skills: Dex +S, Perception +l1
    text = _sub(rf"\b((?:{SKILLS}){M} ?)([+\-−] ?)({N}{{1,2}})\b",
                lambda m: m.group(1) + m.group(2).strip() + num(m.group(3)) if num(m.group(3)) else m.group(0), text)
    # Hit Points 1S, passive Perception 1O, Armor Class 1S
    text = _sub(rf"\b(Hit Points|passive Perception|Armor Class|hp:|AC){M} {M}({N}{{1,3}})\b", keep_prefix(2), text)
    return text


HP_LINE = re.compile(r"(\d+)\s*\((\d+)d(\d+)\s*(?:([+\-\u2013\u2212])\s*(\d+))?\s*\)")


def hp_ok(text):
    m = HP_LINE.search(re.sub(r"\*+", "", text))
    if not m:
        return None
    hp, n, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    b = int(m.group(5) or 0) * (-1 if m.group(4) in ("-", "\u2013", "\u2212") else 1)
    return (n * (d + 1)) // 2 + b == hp


def choose_s_digit(texts):
    """Pick 5 or 8 for S by which makes more hit point lines add up."""
    hp_lines = [t for t in texts if re.search(r"Hit Points|hp:", t)]
    score = {d: sum(1 for t in hp_lines if hp_ok(fix(t, d))) for d in ("5", "8")}
    return ("8" if score["8"] > score["5"] else "5"), score


def ability_mod(score):
    return (score - 10) // 2


CR_XP = {"0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
         "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
         "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
         "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000,
         "28": 120000, "29": 135000, "30": 155000}
