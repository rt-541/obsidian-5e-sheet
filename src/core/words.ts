/** Plain-word helpers shared by the core and the UI. */

const SMALL = new Set(["of", "and", "the", "a", "an", "in", "on", "to", "for", "with", "or", "at", "by"]);

/** "sleight-of-hand" -> "Sleight of Hand". Never capitalises after an apostrophe. */
export function titleCase(s: string): string {
  const words = s.replace(/-/g, " ").split(" ");
  let first = true;
  return words.map(w => {
    if (w === "") return w;
    const lead = first; first = false;
    if (!lead && SMALL.has(w.toLowerCase())) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

const singular = (w: string) => (/s$/i.test(w) && !/ss$/i.test(w) ? w.slice(0, -1) : w);
const pluralOf = (w: string) => (/s$/i.test(w) ? w : w + "s");

function inflect(n: number, word: string): string {
  const i = word.search(/\S+$/);
  const head = word.slice(0, i), last = word.slice(i);
  return head + (n === 1 ? singular(last) : pluralOf(last));
}

/** plural(1, "cantrips") -> "1 cantrip"; plural(2, "Ki Point") -> "2 Ki Points". */
export function plural(n: number, word: string): string {
  return `${n} ${inflect(n, word)}`;
}

const COUNT_NOUNS: Record<string, [string, string]> = {
  point: ["Point", "Points"], points: ["Point", "Points"],
  die: ["Die", "Dice"], dice: ["Die", "Dice"],
  charge: ["Charge", "Charges"], charges: ["Charge", "Charges"],
  use: ["Use", "Uses"], uses: ["Use", "Uses"],
  slot: ["Slot", "Slots"], slots: ["Slot", "Slots"],
};

/** Free-form resource names stay as written; only a trailing count noun (Points, Dice, Charges, Uses, Slots) agrees with n. */
export function resourceCount(n: number, name: string): string {
  const m = name.match(/^(.*?)(\S+)$/s);
  const noun = m ? COUNT_NOUNS[m[2].toLowerCase()] : undefined;
  if (!m || !noun) return `${n} ${name}`;
  return `${n} ${m[1]}${n === 1 ? noun[0] : noun[1]}`;
}

/** "fighter:fighter-fighting-style" -> "Choose a fighting style". */
export function optionListLabel(list: string, count: number, classId?: string): string {
  let name = list, cls = classId;
  const colon = name.indexOf(":");
  if (colon >= 0) { cls = cls ?? name.slice(0, colon); name = name.slice(colon + 1); }
  if (cls && name.startsWith(cls + "-")) name = name.slice(cls.length + 1);
  name = name.replace(/-\d+$/, "").replace(/-/g, " ").trim() || "option";
  if (count === 1) {
    const one = inflect(1, name);
    return `Choose ${/^[aeiou]/i.test(one) ? "an" : "a"} ${one}`;
  }
  return `Choose ${plural(count, name)}`;
}

const ABIL_FULL: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

/** A formula as a player would say it: "total" reads "your level", "plan_count" reads "your plan count", anything with operators "an amount that grows with your level". */
export function formulaWords(f: string): string {
  const s = f.trim();
  if (/^[a-z_][a-z0-9_]*$/i.test(s)) {
    const k = s.toLowerCase();
    if (k === "total" || k === "level") return "your level";
    if (k === "prof") return "your proficiency bonus";
    if (ABIL_FULL[k]) return `your ${ABIL_FULL[k]} modifier`;
    return `your ${k.replace(/_+/g, " ").trim()}`;
  }
  if (/^[\d.]+$/.test(s)) return s;
  return "an amount that grows with your level";
}
