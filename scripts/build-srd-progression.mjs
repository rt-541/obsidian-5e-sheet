// Converts the 5e-bits/5e-database SRD 2014 JSON (Classes, Levels, Features, Subclasses, Races, Subraces, Traits,
// Backgrounds, Feats) into op-format content under src/content/srd/: classes.json, subclasses.json, races.json,
// subraces.json, backgrounds.json and feats.json. Output is deterministic; rerun it after changing this file.
// Usage:
//   node scripts/build-srd-progression.mjs <dir with the 5e-bits json files>
// Source data: 5e-bits/5e-database (MIT), SRD 5.1 text under CC-BY 4.0.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-srd-progression.mjs <srd json dir>"); process.exit(1); }
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "content", "srd");
const read = f => JSON.parse(readFileSync(join(dir, f), "utf8"));
const CLASSES = read("Classes.json"), LEVELS = read("Levels.json"), FEATURES = read("Features.json"), SUBCLASSES = read("Subclasses.json");
const RACES = read("Races.json"), SUBRACES = read("Subraces.json"), TRAITS = read("Traits.json"), BACKGROUNDS = read("Backgrounds.json"), FEATS = read("Feats.json");
const SPELL_IDS = new Set(JSON.parse(readFileSync(join(outDir, "spells.json"), "utf8")).map(s => s.id));
const CANTRIPS = new Set(JSON.parse(readFileSync(join(outDir, "spells.json"), "utf8")).filter(s => s.level === 0).map(s => s.id));

const warnings = [];
const warn = m => warnings.push(m);
const featureBy = new Map(FEATURES.map(f => [f.index, f]));
const text = desc => (Array.isArray(desc) ? desc : [desc]).join("\n\n");
const skillId = idx => idx.replace(/^skill-/, "");
const SKILLS = new Set(["acrobatics", "animal-handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival"]);
const stripPrefix = (name, parent) => (parent && name.startsWith(`${parent}: `) ? name.slice(parent.length + 2) : name);
const dieName = n => `d${n}`;
const CR = v => (v === 0.125 ? "1/8" : v === 0.25 ? "1/4" : v === 0.5 ? "1/2" : String(v));

// ------------------------------------------------------------------ generic builders
/** An op list per level; ops are appended in call order. */
class Levels {
  constructor() { this.map = {}; }
  add(level, op) { (this.map[level] ??= []).push(op); }
  /** Emit only the ids that are unique within the level. */
  out() {
    const res = {};
    for (const [lvl, ops] of Object.entries(this.map).sort((a, b) => a[0] - b[0])) {
      const seen = new Set();
      res[lvl] = ops.map(op => {
        let id = op.id, n = 2; while (seen.has(id)) id = `${op.id}-${n++}`;
        seen.add(id); return { ...op, id };
      });
    }
    return res;
  }
}
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A named per-level value from a class_specific accessor; emitted once, at the first level it has a value, with change points only. */
function scale(L, rows, name, get) {
  const values = {}; let prev; let first;
  for (const r of rows) {
    const v = get(r); if (v === undefined || v === null) continue;
    first ??= r.level;
    if (v !== prev) { values[r.level] = v; prev = v; }
  }
  if (first !== undefined) L.add(first, { id: `scale-${slug(name)}`, op: "scale", name, values });
}
/** A resource whose max follows a per-level number: `resource` at the first level, `modify` at each change. */
function counter(L, rows, name, reset, get, extra = {}) {
  let prev; let first = true;
  for (const r of rows) {
    const v = get(r); if (v === undefined || v === null || v === 0 && first) continue;
    if (v === prev) continue;
    if (first) L.add(r.level, { id: `res-${slug(name)}`, op: "resource", name, max: v, reset, ...extra });
    else L.add(r.level, { id: `mod-${slug(name)}`, op: "modify", resource: name, set: v });
    first = false; prev = v;
  }
}
/** A resource whose max is one formula from a level on. */
const fixed = (L, level, name, reset, max, extra = {}) => L.add(level, { id: `res-${slug(name)}`, op: "resource", name, max, reset, ...extra });

// ------------------------------------------------------------------ per-class numbers from class_specific
const CLASS_NUMBERS = {
  barbarian: (L, r) => {
    scale(L, r, "Rage Damage", x => x.class_specific?.rage_damage_bonus);
    counter(L, r, "Rage", "long", x => (x.class_specific?.rage_count >= 9999 ? 99 : x.class_specific?.rage_count));
    scale(L, r, "Brutal Critical Dice", x => (x.class_specific?.brutal_critical_dice > 0 ? x.class_specific.brutal_critical_dice : undefined));
  },
  bard: (L, r) => {
    scale(L, r, "Bardic Inspiration Die", x => (x.class_specific?.bardic_inspiration_die ? dieName(x.class_specific.bardic_inspiration_die) : undefined));
    scale(L, r, "Song of Rest Die", x => (x.class_specific?.song_of_rest_die ? dieName(x.class_specific.song_of_rest_die) : undefined));
    fixed(L, 1, "Bardic Inspiration", "long", "max(1, cha)");
    fixed(L, 5, "Bardic Inspiration", "short", "max(1, cha)");
  },
  cleric: (L, r) => {
    counter(L, r, "Channel Divinity", "short", x => x.class_specific?.channel_divinity_charges);
    scale(L, r, "Destroy Undead CR", x => (x.class_specific?.destroy_undead_cr > 0 ? CR(x.class_specific.destroy_undead_cr) : undefined));
  },
  druid: (L, r) => {
    fixed(L, 2, "Wild Shape", "short", 2);
    scale(L, r, "Wild Shape Max CR", x => (x.class_specific?.wild_shape_max_cr > 0 ? CR(x.class_specific.wild_shape_max_cr) : undefined));
  },
  fighter: (L, r) => {
    fixed(L, 1, "Second Wind", "short", 1);
    counter(L, r, "Action Surge", "short", x => x.class_specific?.action_surges);
    counter(L, r, "Indomitable", "long", x => x.class_specific?.indomitable_uses);
    scale(L, r, "Attacks per Action", x => (x.class_specific?.extra_attacks !== undefined ? 1 + x.class_specific.extra_attacks : undefined));
  },
  monk: (L, r) => {
    scale(L, r, "Martial Arts Die", x => (x.class_specific?.martial_arts ? `${x.class_specific.martial_arts.dice_count}d${x.class_specific.martial_arts.dice_value}` : undefined));
    for (const row of r) if (row.class_specific?.ki_points > 0 && row.class_specific.ki_points !== row.level) warn(`monk ki points differ from level at ${row.level}`);
    fixed(L, 2, "Ki Points", "short", "level");
    L.add(2, { id: "dc-ki", op: "dc", name: "Ki", abil: "wis" });
    scale(L, r, "Unarmored Movement", x => (x.class_specific?.unarmored_movement > 0 ? x.class_specific.unarmored_movement : undefined));
  },
  paladin: (L, r) => {
    fixed(L, 1, "Lay on Hands", "long", "level * 5");
    fixed(L, 1, "Divine Sense", "long", "max(1, 1 + cha)");
    fixed(L, 14, "Cleansing Touch", "long", "max(1, cha)");
    scale(L, r, "Aura Range", x => (x.class_specific?.aura_range > 0 ? x.class_specific.aura_range : undefined));
  },
  ranger: (L, r) => {
    scale(L, r, "Favored Enemies", x => (x.class_specific?.favored_enemies > 0 ? x.class_specific.favored_enemies : undefined));
    scale(L, r, "Favored Terrain", x => (x.class_specific?.favored_terrain > 0 ? x.class_specific.favored_terrain : undefined));
  },
  rogue: (L, r) => {
    scale(L, r, "Sneak Attack", x => (x.class_specific?.sneak_attack ? `${x.class_specific.sneak_attack.dice_count}d${x.class_specific.sneak_attack.dice_value}` : undefined));
    fixed(L, 20, "Stroke of Luck", "short", 1);
  },
  sorcerer: (L, r) => {
    for (const row of r) if (row.class_specific?.sorcery_points > 0 && row.class_specific.sorcery_points !== row.level) warn(`sorcery points differ from level at ${row.level}`);
    fixed(L, 2, "Sorcery Points", "long", "level");
  },
  warlock: (L) => {
    L.add(11, { id: "res-mystic-arcanum-6", op: "resource", name: "Mystic Arcanum (6th level)", max: 1, reset: "long" });
    L.add(13, { id: "res-mystic-arcanum-7", op: "resource", name: "Mystic Arcanum (7th level)", max: 1, reset: "long" });
    L.add(15, { id: "res-mystic-arcanum-8", op: "resource", name: "Mystic Arcanum (8th level)", max: 1, reset: "long" });
    L.add(17, { id: "res-mystic-arcanum-9", op: "resource", name: "Mystic Arcanum (9th level)", max: 1, reset: "long" });
  },
  wizard: (L, r) => {
    scale(L, r, "Arcane Recovery Levels", x => x.class_specific?.arcane_recovery_levels);
    fixed(L, 1, "Arcane Recovery", "long", 1);
  },
};

const CASTER = {
  bard: ["cha", "full"], cleric: ["wis", "full"], druid: ["wis", "full"], sorcerer: ["cha", "full"], wizard: ["int", "full"],
  paladin: ["cha", "half"], ranger: ["wis", "half"], warlock: ["cha", "pact"],
};
/** "known": learn spells per level from the Levels table; "prepared": cantrips only (the spell list is prepared, not learned). */
const SPELL_MODE = { bard: "known", ranger: "known", sorcerer: "known", warlock: "known", wizard: "book", cleric: "prepared", druid: "prepared", paladin: "none" };
const GOLD = { barbarian: "2d4*10", bard: "5d4*10", cleric: "5d4*10", druid: "2d4*10", fighter: "5d4*10", monk: "5d4", paladin: "5d4*10", ranger: "5d4*10", rogue: "4d4*10", sorcerer: "3d4*10", warlock: "4d4*10", wizard: "4d4*10" };

// ------------------------------------------------------------------ features
/** Option lists: a feature that makes the player pick among other features. */
function optionsFor(feature) {
  const fs = feature.feature_specific ?? {};
  const refs = fs.subfeature_options?.from?.options?.map(o => o.item?.index) ?? fs.invocations?.map(i => i.index);
  if (!refs) return undefined;
  const opts = refs.map(i => featureBy.get(i)).filter(Boolean).map(f => {
    const o = { id: f.index, name: stripPrefix(f.name, feature.name), text: text(f.desc) };
    const lv = (f.prerequisites ?? []).find(p => p.type === "level");
    if (lv && lv.level > 1) o.minLevel = lv.level;
    return o;
  });
  return { choose: fs.subfeature_options?.choose ?? 1, options: opts };
}
const FEATURE_EFFECTS = { "improved-critical": { critRange: 19 }, "superior-critical": { critRange: 18 } };
const COUNT_OVERRIDE = { "rogue-expertise-1": 2 };

/** Ops for one SRD feature. `lists` collects option lists for the owning class or subclass. */
function featureOps(f, lists, ctx) {
  if (f.parent) return [];
  if (f.name === "Ability Score Improvement") return [{ id: "asi", op: "asi" }];
  // "<Subclass> feature" rows only mark that the subclass gives something at this level; the subclass's own features carry it.
  if (f.name === "Domain Spells" || /-improvement-\d+$/.test(f.index) || / feature$/.test(f.name)) return [];
  const ops = [];
  const effects = FEATURE_EFFECTS[f.index];
  ops.push({ id: f.index, op: "feature", name: f.name, text: text(f.desc), ...(effects ? { effects } : {}) });
  const opt = optionsFor(f);
  if (opt && opt.options.length) {
    const list = f.index;
    lists[list] = opt.options;
    ops.push({ id: `${f.index}-pick`, op: "choose", what: "option", list, count: Math.min(opt.choose, opt.options.length), swap: false });
  }
  const ex = f.feature_specific?.expertise_options;
  if (ex) ops.push({ id: `${f.index}-expertise`, op: "choose", what: "expertise", count: COUNT_OVERRIDE[f.index] ?? ex.choose });
  if (ctx.subclassFeature === f.index) ops.push({ id: "subclass", op: "subclass" });
  return ops;
}

// ------------------------------------------------------------------ classes and subclasses
const flavorOf = new Map(SUBCLASSES.map(s => [s.class.index, s.subclass_flavor]));
const abilIdx = a => a.index;

function multiclass(c) {
  const mc = c.multi_classing, out = {};
  const req = {};
  if (mc.prerequisites?.length) req.all = Object.fromEntries(mc.prerequisites.map(p => [abilIdx(p.ability_score), p.minimum_score]));
  if (mc.prerequisite_options) req.any = mc.prerequisite_options.from.options.map(o => ({ [abilIdx(o.ability_score)]: o.minimum_score }));
  if (req.all || req.any) out.requires = req;
  out.proficiencies = mc.proficiencies.map(p => p.name);
  if (mc.proficiency_choices?.length) warn(`${c.index}: multiclass skill/tool choices are not modelled`);
  return out;
}

function resolveItems(opt) {
  if (opt.option_type === "counted_reference") return Array.from({ length: Math.min(opt.count, 20) }, () => opt.of.index);
  if (opt.option_type === "multiple") {
    const parts = opt.items.map(resolveItems);
    return parts.some(p => p === null) ? null : parts.flat();
  }
  return null; // category choices (any martial weapon) cannot be a fixed list
}
function equipment(c) {
  const fixedItems = c.starting_equipment.flatMap(e => Array.from({ length: e.quantity }, () => e.equipment.index));
  const picks = c.starting_equipment_options.map(o => o.from?.options?.map(resolveItems).filter(Boolean) ?? []);
  const a = [...fixedItems, ...picks.flatMap(p => p[0] ?? [])];
  const b = [...fixedItems, ...picks.flatMap(p => p[1] ?? p[0] ?? [])];
  return JSON.stringify(a) === JSON.stringify(b) ? [a] : [a, b];
}

const subclassLevelOf = {};
function buildClass(c) {
  const id = c.index, rows = LEVELS.filter(l => l.class.index === id && !l.subclass).sort((x, y) => x.level - y.level);
  const L = new Levels(), lists = {};
  const flavor = flavorOf.get(id);
  const subFeature = FEATURES.find(f => f.class.index === id && !f.subclass && f.name === flavor)?.index;
  if (!subFeature) warn(`${id}: no subclass-selection feature named "${flavor}"`);
  let prevCantrips = 0, prevKnown = 0;
  for (const row of rows) {
    for (const fi of row.features) {
      const f = featureBy.get(fi.index);
      if (!f) { warn(`${id}: missing feature ${fi.index}`); continue; }
      for (const op of featureOps(f, lists, { subclassFeature: subFeature })) L.add(row.level, op);
    }
    if (subFeature && row.features.some(f => f.index === subFeature)) subclassLevelOf[id] = row.level;
    const asiNow = row.ability_score_bonuses - (rows[row.level - 2]?.ability_score_bonuses ?? 0);
    if (asiNow > 0 && !row.features.some(f => featureBy.get(f.index)?.name === "Ability Score Improvement")) warn(`${id} ${row.level}: ability score bonus without an ASI feature`);
    const sc = row.spellcasting, mode = SPELL_MODE[id];
    if (sc && mode && mode !== "none") {
      const cantrips = (sc.cantrips_known ?? 0) - prevCantrips, known = mode === "known" ? (sc.spells_known ?? 0) - prevKnown : mode === "book" ? (row.level === 1 ? 6 : 2) : 0;
      if (cantrips > 0 || known > 0) {
        L.add(row.level, { id: "spells", op: "spells", count: known, ...(cantrips > 0 ? { cantrips } : {}), from: id,
          ...(mode === "known" && row.level > 1 && known > 0 ? { swap: 1 } : {}) });
      }
      prevCantrips = sc.cantrips_known ?? prevCantrips; prevKnown = sc.spells_known ?? prevKnown;
    }
  }
  CLASS_NUMBERS[id]?.(L, rows);
  const prof = c.proficiencies.filter(p => !p.index.startsWith("saving-throw-")).map(p => p.name);
  const skillsChoice = c.proficiency_choices.find(p => p.from.options.every(o => o.item?.index?.startsWith("skill-")));
  const out = { id, name: c.name, hitDie: c.hit_die, saves: c.saving_throws.map(s => s.index) };
  if (CASTER[id]) out.spellcasting = { abil: CASTER[id][0], progression: CASTER[id][1] };
  if (prof.length) out.proficiencies = prof;
  if (skillsChoice) out.skills = { count: skillsChoice.choose, from: skillsChoice.from.options.map(o => skillId(o.item.index)).filter(s => SKILLS.has(s)) };
  out.multiclass = multiclass(c);
  out.gold = GOLD[id];
  out.equipment = equipment(c);
  if (Object.keys(lists).length) out.options = lists;
  if (subclassLevelOf[id]) out.subclassLevel = subclassLevelOf[id];
  out.levels = L.out();
  return out;
}

// Hand additions where the SRD has the rule only as prose: bonus proficiencies, once-a-day uses, domain/oath/patron spells.
const SUB_EXTRA = {
  life: L => L.add(1, { id: "grant-heavy-armor", op: "grant", proficiencies: ["Heavy Armor"] }),
  lore: L => L.add(3, { id: "bonus-skills", op: "choose", what: "skills", count: 3 }),
  devotion: L => fixed(L, 3, "Channel Divinity", "short", 1),
  "open-hand": L => fixed(L, 6, "Wholeness of Body", "long", 1),
  fiend: L => fixed(L, 6, "Dark One's Own Luck", "long", "max(1, cha)"),
  champion: () => {},
};
function buildSubclass(s) {
  const id = s.index, cls = s.class.index;
  const rows = LEVELS.filter(l => l.subclass?.index === id).sort((x, y) => x.level - y.level);
  const L = new Levels(), lists = {};
  for (const row of rows) for (const fi of row.features) {
    const f = featureBy.get(fi.index);
    if (!f) { warn(`${id}: missing feature ${fi.index}`); continue; }
    for (const op of featureOps(f, lists, {})) L.add(row.level, op);
  }
  // Spells the subclass always has prepared, granted at the class level the SRD names.
  const byLevel = {};
  for (const sp of s.spells ?? []) {
    const need = sp.prerequisites?.find(p => p.type === "level");
    const feat = sp.prerequisites?.find(p => p.type === "feature");
    if (feat) continue; // terrain-dependent circle spells stay in the feature text
    const lvl = need ? Number(need.index.split("-").pop()) : 1;
    if (!SPELL_IDS.has(sp.spell.index)) { warn(`${id}: spell ${sp.spell.index} is not in spells.json`); continue; }
    (byLevel[lvl] ??= []).push(sp.spell.index);
  }
  for (const [lvl, spells] of Object.entries(byLevel)) L.add(Number(lvl), { id: `grant-spells-${lvl}`, op: "grant", spells });
  SUB_EXTRA[id]?.(L);
  const out = { id, name: s.name, class: cls };
  if (Object.keys(lists).length) out.options = lists;
  out.levels = L.out();
  return out;
}

// ------------------------------------------------------------------ races, subraces, background, feat
const LANG = { common: "Common" };
const ABIL_NAME = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
function abilityFeature(bonuses, extra) {
  const parts = bonuses.map(b => `your ${ABIL_NAME[b.ability_score.index]} score increases by ${b.bonus}`);
  if (extra) parts.push(extra);
  return { id: "ability-score-increase", op: "feature", name: "Ability Score Increase", text: `${parts.join(", ")}.`.replace(/^./, c => c.toUpperCase()) };
}
function traitOps(traitRefs, owner) {
  const ops = [], grant = { proficiencies: [], languages: [], spells: [], items: [] };
  for (const ref of traitRefs) {
    const t = TRAITS.find(x => x.index === ref.index);
    if (!t) { warn(`${owner}: missing trait ${ref.index}`); continue; }
    if (t.parent) continue;
    if (t.index === "darkvision") grant.darkvision = 60;
    for (const p of t.proficiencies ?? []) {
      if (p.index.startsWith("skill-")) grant.proficiencies.push(`skill:${skillId(p.index)}`); else grant.proficiencies.push(p.name);
    }
    ops.push({ id: t.index, op: "feature", name: t.name, text: text(t.desc) });
    const pc = t.proficiency_choices;
    if (pc) {
      const opts = pc.from.options.map(o => o.item?.index).filter(Boolean);
      if (opts.every(o => o.startsWith("skill-"))) ops.push({ id: `${t.index}-pick`, op: "choose", what: "skills", count: pc.choose });
      else ops.push({ id: `${t.index}-pick`, op: "choose", what: "tools", count: pc.choose, from: pc.from.options.map(o => o.item.name) });
    }
    if (t.language_options) ops.push({ id: `${t.index}-pick`, op: "choose", what: "languages", count: t.language_options.choose });
    const sp = t.trait_specific?.spell_options;
    if (sp) {
      const from = sp.from.options.map(o => o.item.index).filter(i => CANTRIPS.has(i));
      if (from.length) ops.push({ id: `${t.index}-cantrip`, op: "spells", count: 0, cantrips: sp.choose, from });
      else warn(`${owner}: no cantrips from ${t.index}`);
    }
    if (t.index === "draconic-ancestry") ops[ops.length - 1].text += `\n\nAncestries: ${t.trait_specific.subtrait_options.from.options.map(o => o.item.name.replace(/^Draconic Ancestry \(|\)$/g, "")).join(", ")}.`;
  }
  return { ops, grant };
}
const cleanGrant = g => { const o = { id: "grant", op: "grant" }; for (const [k, v] of Object.entries(g)) if (Array.isArray(v) ? v.length : v !== undefined) o[k] = v; return o; };

function buildRace(r) {
  const { ops, grant } = traitOps(r.traits, r.index);
  grant.languages = r.languages.map(l => l.name);
  grant.speed = r.speed;
  const lang = r.language_options;
  const all = [cleanGrant(grant), abilityFeature(r.ability_bonuses), ...ops];
  if (lang) all.push({ id: "extra-language-pick", op: "choose", what: "languages", count: lang.choose });
  return { id: r.index, name: r.name, grants: dedupe(all) };
}
function buildSubrace(s) {
  const { ops, grant } = traitOps(s.racial_traits, s.index);
  const all = [abilityFeature(s.ability_bonuses), ...ops];
  if (Object.values(grant).some(v => (Array.isArray(v) ? v.length : v !== undefined))) all.unshift(cleanGrant(grant));
  return { id: s.index, name: s.name, race: s.race.index, grants: dedupe(all) };
}
function dedupe(ops) {
  const seen = new Set();
  return ops.map(op => { let id = op.id, n = 2; while (seen.has(id)) id = `${op.id}-${n++}`; seen.add(id); return { ...op, id }; });
}
function buildBackground(b) {
  const skills = b.starting_proficiencies.map(p => `skill:${skillId(p.index)}`);
  const ops = [{ id: "grant", op: "grant", proficiencies: skills, items: b.starting_equipment.map(e => e.equipment.index) }];
  if (b.language_options) ops.push({ id: "languages-pick", op: "choose", what: "languages", count: b.language_options.choose });
  ops.push({ id: slug(b.feature.name), op: "feature", name: b.feature.name, text: text(b.feature.desc) });
  return { id: b.index, name: b.name, grants: ops };
}
function buildFeat(f) {
  const pre = f.prerequisites.map(p => `${ABIL_NAME[p.ability_score.index]} ${p.minimum_score}`).join(", ");
  return { id: f.index, name: f.name, ...(pre ? { prerequisite: pre } : {}), grants: [{ id: f.index, op: "feature", name: f.name, text: text(f.desc) }] };
}

// ------------------------------------------------------------------ write
const write = (file, data) => writeFileSync(join(outDir, file), `${JSON.stringify(data, null, 1)}\n`);
const classes = CLASSES.map(buildClass);
write("classes.json", classes);
write("subclasses.json", SUBCLASSES.map(buildSubclass));
write("races.json", RACES.map(buildRace));
write("subraces.json", SUBRACES.map(buildSubrace));
write("backgrounds.json", BACKGROUNDS.map(buildBackground));
write("feats.json", FEATS.map(buildFeat));
console.log(`wrote ${classes.length} classes, ${SUBCLASSES.length} subclasses, ${RACES.length} races, ${SUBRACES.length} subraces, ${BACKGROUNDS.length} backgrounds, ${FEATS.length} feats`);
for (const w of warnings) console.warn(`warning: ${w}`);
