"""OCR word repair with the local model (qwen3-14b on devastator, thinking off).

The model only repairs words inside numbered lines. It never decides
structure: tested on stat blocks it moved immunities to resistances,
shifted ability scores and copied example values. Every returned line must
keep its number and digits (a digit may only replace a letter the OCR
confuses with one) and stay close to the original, or the original is kept.
Structure is parsed deterministically from the repaired lines.

Calls go straight to the vLLM endpoint rather than through llm-jobs: a book
is hundreds of chunks and the agent wrapper adds overhead per call. When the
gpu-arbiter has lent the card to an image job the endpoint refuses
connections, so connection errors back off and retry for up to an hour.
"""
import difflib
import json
import os
import re
import time
import urllib.error
import urllib.request

URL = os.environ.get("DNDC_LLM_URL", "http://devastator.rt-541.io:8000/v1/chat/completions")
MODEL = os.environ.get("DNDC_LLM_MODEL", "qwen3-14b")

PROMPT = """You repair OCR errors in numbered lines of text from a Dungeons & Dragons 5th edition book.

Return every line, in order, as "NNNN| text" with the same number. For each line fix only OCR damage to words:
- words split by stray spaces: "Whi le" -> "While", "s uccessful" -> "successful", "anti magic field" -> "antimagic field"
- words run together: "theankheg" -> "the ankheg"
- wrong or garbled letters inside a word: "Armo.r" -> "Armor", "lgnan" -> "Ignan", "gro~nds" -> "grounds"
- stray symbols that are not part of the text (·, ~, =, a lone ' or | at the line end)
Never merge, split, reorder, add or drop lines. Never reword, never change a number, keep * and ** marks and " | " cell separators, keep the line's # prefix. A line that is pure garbage from decorative art (like "'t..~~!, '(~7/ ~") becomes "NNNN| " with nothing after it. If a line needs no change, return it unchanged.
Output only the numbered lines.

"""


class Unavailable(Exception):
    pass


def chat(text, max_tokens, temperature=0.0, deadline_s=3600):
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": PROMPT + text}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "chat_template_kwargs": {"enable_thinking": False},
    }).encode()
    start, wait = time.time(), 15
    while True:
        req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=1500) as r:
                data = json.load(r)
            ch = data["choices"][0]
            return ch["message"]["content"], ch.get("finish_reason"), data.get("usage", {})
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code < 500:
                raise
            if time.time() - start > deadline_s:
                raise Unavailable(str(e))
            time.sleep(wait)
            wait = min(wait * 2, 300)


LINE = re.compile(r"^(\d{4})\| ?(.*)$")
DIGITS = re.compile(r"\d+")
# letters the OCR prints for digits; a repair may turn these into digits, nothing else
CONFUSABLE = str.maketrans({"l": "1", "I": "1", "O": "0", "o": "0", "S": "5", "B": "8", "Z": "2"})


# short words made only of confusable letters that are words, not numbers
NOT_NUMBERS = {"i", "a", "so", "is", "os", "io", "oil", "bo", "boo", "zoo", "oz", "sob", "bob", "lob", "boil", "solo", "silo", "loss", "boss"}
# rules words a repair must never swap for another ("slashing" -> "piercing")
PROTECTED = set("""acid bludgeoning cold fire force lightning necrotic piercing poison psychic radiant slashing thunder
strength dexterity constitution intelligence wisdom charisma str dex con int wis cha
blinded charmed deafened exhaustion frightened grappled incapacitated invisible paralyzed petrified poisoned prone
restrained stunned unconscious tiny small medium large huge gargantuan advantage disadvantage
resistance immunity vulnerability""".split())


def _protected_ok(orig, new):
    words = lambda t: [w for w in re.findall(r"[a-z]+", t.lower()) if w in PROTECTED]
    before, after = words(orig), words(new)
    flat = re.sub(r"[^a-z]", "", orig.lower())
    for w in before:
        if w in after:
            after.remove(w)
        else:
            return False  # a rules word disappeared
    # new rules words only where the OCR had split or garbled that same word
    return all(w in flat for w in after)


def _letters_for_digits(text):
    """Drop digits that sit inside a word ("0athbow", "1t") so a repair to letters can pass."""
    # not after "d": the 8 in "1d8" is a number
    return re.sub(r"(?<=[A-Za-ce-z])[0158](?=[A-Za-z]*\b)|\b[0158](?=[A-Za-z]+\b)", "", text)


def _as_digits(text):
    """Read confusable letters as digits where a number is plausible: tokens that
    already hold a digit, tokens made only of confusables ("l", "lO"), and area
    labels ("El" for E1). Never after an apostrophe ("BILDRATH'S")."""
    def tok(m):
        t = m.group(0)
        if re.search(r"\d", t) or (re.fullmatch(r"[lIOoSBZ]+", t) and t.lower() not in NOT_NUMBERS) \
                or re.fullmatch(r"[A-Z][lIO]{1,2}", t):
            return t.translate(CONFUSABLE)
        return t
    return re.sub(r"(?<!['’])[A-Za-z0-9]+", tok, text)


def digits_ok(orig, new):
    got = DIGITS.findall(new)
    return got in (DIGITS.findall(orig), DIGITS.findall(_as_digits(orig)),
                   DIGITS.findall(_letters_for_digits(orig)))


def accept(orig, new):
    """The repaired line if it passes the checks, else the original."""
    if new is None:
        return orig
    if not new.strip():
        # decorative garbage: blank only lines with no word and no number
        core = orig.strip()
        noise = not re.search(r"[A-Za-z]{3}|\d", core) or sum(ch.isalnum() for ch in core) < 0.3 * len(core)
        return "" if noise else orig
    if new == orig:
        return orig
    if digits_ok(orig, new) and _protected_ok(orig, new) and \
            difflib.SequenceMatcher(None, orig.lower(), new.lower()).ratio() >= 0.8:
        return new
    return orig


def repair_lines(lines, temperature=0.0):
    """Model-repair a list of lines; return (fixed lines, model proposals, stats)."""
    numbered = "\n".join(f"{i:04d}| {t}" for i, t in enumerate(lines))
    out, fin, usage = chat(numbered, max_tokens=int(len(numbered) / 2.6) + 600, temperature=temperature)
    out = re.sub(r"^\s*<think>.*?</think>\s*", "", out, flags=re.S)
    got = {}
    for ln in out.splitlines():
        m = LINE.match(ln.strip())
        if m:
            got[int(m.group(1))] = m.group(2).rstrip()
    fixed, proposals = [], []
    st = {"accepted": 0, "unchanged": 0, "rejected": 0, "blanked": 0}
    for i, orig in enumerate(lines):
        new = got.get(i)
        res = accept(orig, new)
        fixed.append(res)
        proposals.append(new)
        if res == "" and orig:
            st["blanked"] += 1
        elif res != orig:
            st["accepted"] += 1
        elif new is None or new != orig:
            st["rejected"] += 1
        else:
            st["unchanged"] += 1
    st.update(finish=fin, out_tokens=usage.get("completion_tokens"))
    return fixed, proposals, st
