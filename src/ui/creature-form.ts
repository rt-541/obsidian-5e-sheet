import { ABILS, type Abil } from "../core/types";
import { ABIL_NAMES, blankDraft, DAMAGE_TYPES, joinDamage, normalizeDice, SIZES, splitDamage, validateDraft, type Draft, type DraftAttack } from "../content/creature-note";
import { clear, h } from "./h";

export interface CreatureFormOpts {
  draft: Draft;
  /** Lines the stat-block reader could not understand; shown above the form so the player can check them. */
  unread?: string[];
  saveLabel?: string;
  /** Called with a valid draft. A thrown error is shown under the Save button. */
  onSave(draft: Draft): Promise<void> | void;
  onCancel(): void;
}

interface AttackRow { name: string; toHit: string; dice: string; dtype: string; note: string; save?: DraftAttack["save"] }

/** A whole number from a box: empty is "not given" (undefined), anything that is not a whole number is NaN so validation names the problem. */
const toNum = (s: string): number | undefined => { const t = s.trim().replace(/^\+/, ""); return t === "" ? undefined : /^-?\d+$/.test(t) ? parseInt(t, 10) : NaN; };
const text = (s: string | undefined) => s ?? "";
const numText = (n: number | undefined) => (n === undefined ? "" : String(n));

/** Average of a dice expression such as 2d8+2, used when only the dice are filled in. */
function averageOf(formula: string): number | undefined {
  const m = /^(\d{1,2})d(\d{1,3})\s*(?:([+-])\s*(\d{1,3}))?$/.exec(formula.trim());
  return m ? Math.floor(+m[1] * (+m[2] + 1) / 2) + (m[3] ? (m[3] === "-" ? -1 : 1) * +m[4] : 0) : undefined;
}

/** The "Add custom creature" form. Plain DOM; nothing re-renders the whole form while someone types. */
export function creatureForm(o: CreatureFormOpts): HTMLElement {
  const base = o.draft;
  const F = {
    name: base.name, size: base.size, ctype: base.ctype, ac: numText(base.ac), hpAvg: numText(base.hpAvg), hpFormula: text(base.hpFormula),
    walk: numText(base.speed.walk), climb: numText(base.speed.climb), fly: numText(base.speed.fly), swim: numText(base.speed.swim),
    abil: Object.fromEntries(ABILS.map(a => [a, String(base.abilities[a])])) as Record<Abil, string>,
    cr: text(base.cr), senses: text(base.senses),
    attacks: base.attacks.map((a): AttackRow => { const d = splitDamage(a.damage); return { name: a.name, toHit: numText(a.toHit), dice: d.dice, dtype: d.type, note: text(a.note), ...(a.save ? { save: a.save } : {}) }; }),
    traits: base.traits.map(t => ({ ...t })),
  };

  const input = (value: string, set: (v: string) => void, label: string, extra: Record<string, string> = {}) =>
    h("input", { cls: "fe-cf-input", attrs: { type: "text", value, "aria-label": label, ...extra }, on: { input: (e: Event) => set((e.target as HTMLInputElement).value) } });
  const select = (options: { value: string; label: string }[], value: string, set: (v: string) => void, label: string) =>
    h("select", { cls: "fe-cf-input", attrs: { "aria-label": label }, on: { change: (e: Event) => set((e.target as HTMLSelectElement).value) } },
      ...options.map(op => h("option", { text: op.label, attrs: { value: op.value, ...(op.value === value ? { selected: "" } : {}) } })));
  const field = (label: string, control: HTMLElement, cls = "") => h("label", { cls: `fe-cf-field ${cls}`.trim() }, h("span", { cls: "fe-cf-label", text: label }), control);
  const num = (label: string, key: "ac" | "hpAvg" | "walk" | "climb" | "fly" | "swim", ph = "") =>
    field(label, input(F[key], v => { F[key] = v; }, label, { inputmode: "numeric", placeholder: ph }));

  const attackBox = h("div", { cls: "fe-cf-rows", data: { rows: "attacks" } }), traitBox = h("div", { cls: "fe-cf-rows", data: { rows: "traits" } });
  const fillAttacks = () => {
    clear(attackBox);
    F.attacks.forEach((a, i) => attackBox.append(h("div", { cls: "fe-cf-card", data: { attack: String(i) } },
      h("div", { cls: "fe-cf-row" },
        field("Attack name", input(a.name, v => { a.name = v; }, `Attack ${i + 1} name`, { placeholder: "Bite" }), "fe-cf-grow"),
        field("To hit", input(a.toHit, v => { a.toHit = v; }, `Attack ${i + 1} to-hit bonus`, { inputmode: "numeric", placeholder: "+3" })),
        field("Damage dice", input(a.dice, v => { a.dice = v; }, `Attack ${i + 1} damage dice`, { placeholder: "1d6+1" })),
        field("Damage type", select([{ value: "", label: "(none)" }, ...DAMAGE_TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))], a.dtype, v => { a.dtype = v; }, `Attack ${i + 1} damage type`))),
      field("Note (optional)", input(a.note, v => { a.note = v; }, `Attack ${i + 1} note`, { placeholder: "Target must make a DC 11 Constitution save or take 2d8 poison damage" })),
      h("button", { cls: "fe-btn", text: "Remove attack", attrs: { type: "button" }, data: { act: "remove-attack" }, on: { click: () => { F.attacks.splice(i, 1); fillAttacks(); } } }))));
  };
  const fillTraits = () => {
    clear(traitBox);
    F.traits.forEach((t, i) => traitBox.append(h("div", { cls: "fe-cf-card", data: { trait: String(i) } },
      field("Trait name", input(t.name, v => { t.name = v; }, `Trait ${i + 1} name`, { placeholder: "Spider Climb" })),
      field("What it does", h("textarea", { cls: "fe-cf-input", attrs: { rows: "2", "aria-label": `Trait ${i + 1} text` }, text: t.text, on: { input: (e: Event) => { t.text = (e.target as HTMLTextAreaElement).value; } } })),
      h("button", { cls: "fe-btn", text: "Remove trait", attrs: { type: "button" }, data: { act: "remove-trait" }, on: { click: () => { F.traits.splice(i, 1); fillTraits(); } } }))));
  };
  fillAttacks(); fillTraits();

  const problems = h("div", { cls: "fe-warn fe-cf-problems", attrs: { role: "alert" } });
  problems.hidden = true;
  const showProblems = (list: string[]) => { clear(problems); problems.hidden = !list.length; for (const p of list) problems.append(h("div", { text: p })); };

  const collect = (): Draft => {
    const hpFormula = normalizeDice(F.hpFormula), hpAvg = toNum(F.hpAvg) ?? (hpFormula ? averageOf(hpFormula) : undefined);
    const speed: Draft["speed"] = {};
    for (const k of ["walk", "climb", "fly", "swim"] as const) { const v = toNum(F[k]); if (v !== undefined) speed[k] = v; }
    return { ...blankDraft(), alignment: base.alignment, acNote: base.acNote, saves: base.saves, skills: base.skills, languages: base.languages,
      resist: base.resist, immune: base.immune, vulnerable: base.vulnerable, conditionImmune: base.conditionImmune, extras: base.extras,
      name: F.name.trim(), size: F.size, ctype: F.ctype.trim(), ...(toNum(F.ac) !== undefined ? { ac: toNum(F.ac) } : {}), ...(hpAvg !== undefined ? { hpAvg } : {}), hpFormula, speed,
      abilities: Object.fromEntries(ABILS.map(a => [a, toNum(F.abil[a]) ?? NaN])) as Record<Abil, number>,
      ...(F.cr.trim() ? { cr: F.cr.trim() } : {}), ...(F.senses.trim() ? { senses: F.senses.trim() } : {}),
      attacks: F.attacks.filter(a => a.name.trim() || a.dice.trim() || a.toHit.trim() || a.note.trim()).map((a): DraftAttack => {
        const damage = joinDamage(a.dice, a.dtype), hit = toNum(a.toHit), note = a.note.trim();
        return { name: a.name.trim(), ...(hit !== undefined ? { toHit: hit } : {}), ...(a.save ? { save: a.save } : {}), ...(damage ? { damage } : {}), ...(note ? { note } : {}) };
      }),
      traits: F.traits.filter(t => t.name.trim() || t.text.trim()).map(t => ({ name: t.name.trim(), text: t.text.trim() })) };
  };

  const saveBtn = h("button", { cls: "fe-btn mod-cta", text: o.saveLabel ?? "Save creature", attrs: { type: "button" }, data: { act: "save-creature" } });
  saveBtn.addEventListener("click", () => {
    const draft = collect(), errs = validateDraft(draft);
    showProblems(errs);
    if (errs.length) { problems.scrollIntoView?.({ block: "nearest" }); return; }
    saveBtn.disabled = true;
    void Promise.resolve().then(() => o.onSave(draft)).catch((err: unknown) => showProblems([err instanceof Error ? err.message : String(err)])).finally(() => { saveBtn.disabled = false; });
  });

  const sizeOpts = SIZES.map(s => ({ value: s, label: s }));
  if (!SIZES.includes(F.size)) sizeOpts.push({ value: F.size, label: F.size });
  return h("div", { cls: "fe-cform", data: { form: "creature" } },
    o.unread?.length ? h("div", { cls: "fe-cf-unread", data: { unread: "" } }, h("div", { cls: "fe-card-title", text: "I could not read these lines" }),
      ...o.unread.map(l => h("div", { cls: "fe-faint", text: l })), h("div", { text: "Check the boxes below and fill in anything missing, then press Save." })) : null,
    h("div", { cls: "fe-cf-row" }, field("Name", input(F.name, v => { F.name = v; }, "Creature name", { placeholder: "Giant Spider" }), "fe-cf-grow"),
      field("Size", select(sizeOpts, F.size, v => { F.size = v; }, "Size")), field("Type", input(F.ctype, v => { F.ctype = v; }, "Creature type", { placeholder: "beast" }))),
    h("div", { cls: "fe-cf-row" }, num("Armor Class", "ac", "12"), num("Hit Points (average)", "hpAvg", "9"),
      field("Hit Point dice (optional)", input(F.hpFormula, v => { F.hpFormula = v; }, "Hit point dice", { placeholder: "2d8+2" }))),
    h("div", { cls: "fe-card-title", text: "Speed (feet)" }),
    h("div", { cls: "fe-cf-row" }, num("Walk", "walk", "30"), num("Climb", "climb"), num("Fly", "fly"), num("Swim", "swim")),
    h("div", { cls: "fe-card-title", text: "Ability scores" }),
    h("div", { cls: "fe-cf-row" }, ...ABILS.map(a => field(ABIL_NAMES[a].slice(0, 3).toUpperCase(), input(F.abil[a], v => { F.abil[a] = v; }, ABIL_NAMES[a], { inputmode: "numeric" })))),
    h("div", { cls: "fe-cf-row" }, field("Challenge (optional)", input(F.cr, v => { F.cr = v; }, "Challenge", { placeholder: "1/4" })),
      field("Senses (optional)", input(F.senses, v => { F.senses = v; }, "Senses", { placeholder: "darkvision 60 ft." }), "fe-cf-grow")),
    h("div", { cls: "fe-card-title", text: "Attacks" }), attackBox,
    h("button", { cls: "fe-btn", text: "Add attack", attrs: { type: "button" }, data: { act: "add-attack" }, on: { click: () => { F.attacks.push({ name: "", toHit: "", dice: "", dtype: "", note: "" }); fillAttacks(); } } }),
    h("div", { cls: "fe-card-title", text: "Traits" }), traitBox,
    h("button", { cls: "fe-btn", text: "Add trait", attrs: { type: "button" }, data: { act: "add-trait" }, on: { click: () => { F.traits.push({ name: "", text: "" }); fillTraits(); } } }),
    problems,
    h("div", { cls: "fe-kv fe-cf-actions" }, h("button", { cls: "fe-btn", text: "Back", attrs: { type: "button" }, data: { act: "form-back" }, on: { click: () => o.onCancel() } }), saveBtn));
}
