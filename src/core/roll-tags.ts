import { ABILS, SKILLS, type RollTarget } from "./types";

/** Roll tags: which rolls, attack rows and passives a rule aims at. `+` joins tags and all must match. */
const KINDS = ["attack", "check", "skill", "save", "initiative", "death-save", "march", "navigation"];
export const WEAPON_TAGS = ["thrown", "light", "heavy", "two-handed", "versatile", "one-handed", "monk", "unarmed", "offhand", "pact", "magic"];

/** Split `attack:melee+str` into whole tags: a short part after `+` ("str", "melee", "ranged") continues the previous tag's kind. */
export function tagParts(tag: string): string[] {
  const out: string[] = [];
  for (const raw of tag.split("+")) {
    const p = raw.trim();
    const prev = out[out.length - 1]?.split(":")[0];
    if (p && !p.includes(":") && prev && (ABILS.includes(p.replace(/^!/, "") as never) || p === "melee" || p === "ranged")) out.push(`${prev}:${p}`);
    else out.push(p);
  }
  return out;
}

function validPart(t: string): boolean {
  const [kind, q] = t.split(":");
  if (kind === "concentration") return q === undefined;
  if (kind === "weapon") return q === undefined || /^[a-z0-9-]+$/.test(q);
  if (kind === "passive") return q !== undefined && q in SKILLS;
  if (!KINDS.includes(kind)) return false;
  if (q === undefined) return kind !== "skill";
  if (kind === "skill") return q in SKILLS;
  if (kind === "attack") return ABILS.includes(q.replace(/^!/, "") as never) || q === "melee" || q === "ranged" || q === "weapon";
  if (kind === "check" || kind === "save") return ABILS.includes(q as never);
  return false;
}
export function validRollTarget(tag: string): boolean {
  if (typeof tag !== "string" || !tag) return false;
  const parts = tagParts(tag);
  return parts.length > 0 && parts.every(validPart);
}

function matchPart(tag: string, t: RollTarget): boolean {
  const [k, q] = tag.split(":");
  switch (k) {
    case "attack":
      if (t.kind !== "attack") return false;
      if (!q) return true;
      if (q === "melee" || q === "ranged") return t.range === q;
      if (q === "weapon") return !!t.tags;
      return q.startsWith("!") ? t.abil !== q.slice(1) : t.abil === q;
    case "check":
      if (!(t.kind === "check" || t.kind === "skill" || t.kind === "initiative")) return false;
      return !q || t.abil === q;
    case "skill": return t.kind === "skill" && t.skill === q;
    case "save": return t.kind === "save" && (!q || t.abil === q);
    case "concentration": return t.kind === "save" && t.concentration === true;
    case "weapon": return t.kind === "attack" && !!t.tags && (!q || t.tags.includes(q));
    case "passive": return t.kind === "passive" && t.skill === q;
    default: return t.kind === k;
  }
}
export function matchesTag(tag: string, t: RollTarget): boolean {
  return tagParts(tag).every(p => matchPart(p, t));
}
