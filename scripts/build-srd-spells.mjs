// Converts the 5e-bits/5e-database SRD 2014 spell list into src/content/srd/spells.json (SpellData shape).
// Usage:
//   gh api -H "Accept: application/vnd.github.raw" repos/5e-bits/5e-database/contents/src/2014/en/5e-SRD-Spells.json > /tmp/spells.json && node scripts/build-srd-spells.mjs /tmp/spells.json
// Source data: 5e-bits/5e-database (MIT), SRD 5.1 text under CC-BY 4.0.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) { console.error("usage: node scripts/build-srd-spells.mjs <5e-SRD-Spells.json>"); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "content", "srd", "spells.json");

const TERM = /^(?:(\d{1,2})d(\d{1,3})([+-]\d{1,3})?|(\d{1,3}))(?:\s+([a-z]+))?$/;
const normDice = s => String(s).replace(/\s*\+\s*/g, "+").replace(/\s*-\s*/g, "-").trim();
/** Same acceptance as core/dice parseDice once MOD is 0 and spaces around + are gone. */
const diceOk = s => TERM.test(normDice(s).replace(/MOD/g, "0"));

let dropped = 0;
/** Returns undefined for no table, null when any dice string is unparseable. */
const table = t => {
  if (!t || typeof t !== "object") return undefined;
  const res = {};
  for (const [k, v] of Object.entries(t)) {
    if (!diceOk(v)) return null;
    res[k] = normDice(v);
  }
  return Object.keys(res).length ? res : undefined;
};

const data = JSON.parse(readFileSync(src, "utf8"));
const spells = data.map(s => {
  const o = {
    id: s.index, name: s.name, level: s.level, school: s.school?.name ?? "", castingTime: s.casting_time, range: s.range,
    components: s.components ?? [], ...(s.material ? { material: s.material } : {}),
    duration: s.duration, concentration: !!s.concentration, ritual: !!s.ritual, classes: (s.classes ?? []).map(c => c.index),
  };
  if (s.attack_type === "melee" || s.attack_type === "ranged") o.attack = s.attack_type;
  if (s.dc?.dc_type?.index) o.save = { abil: s.dc.dc_type.index, onSuccess: s.dc.dc_success === "half" ? "half" : "none" };
  const dmg = Array.isArray(s.damage) ? s.damage[0] : undefined;
  if (dmg?.damage_type?.index && (dmg.damage_at_slot_level || dmg.damage_at_character_level)) {
    const bySlot = table(dmg.damage_at_slot_level), byCharLevel = table(dmg.damage_at_character_level);
    if (bySlot === null || byCharLevel === null) { dropped++; console.warn(`dropped damage: ${s.index}`); }
    else o.damage = { type: dmg.damage_type.index, ...(bySlot ? { bySlot } : {}), ...(byCharLevel ? { byCharLevel } : {}) };
  }
  if (s.heal_at_slot_level) {
    const bySlot = table(s.heal_at_slot_level);
    if (!bySlot) { dropped++; console.warn(`dropped heal: ${s.index}`); } else o.heal = { bySlot };
  }
  if (s.higher_level?.length) o.higherLevel = s.higher_level.join("\n\n");
  o.rules = (s.desc ?? []).join("\n\n");
  return o;
});
writeFileSync(out, JSON.stringify(spells, null, 1) + "\n");
console.log(`wrote ${spells.length} spells to ${out}; dropped ${dropped} damage/heal entries`);
