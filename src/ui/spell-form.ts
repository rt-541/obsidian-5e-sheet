import { DAMAGE_TYPES, ABIL_NAMES } from "../content/creature-note";
import { LEVEL_LABELS, SCHOOLS, validateSpellDraft, type SpellDraft } from "../content/spell-note";
import { ABILS } from "../core/types";
import { clear, h } from "./h";

export interface SpellFormOpts {
  draft: SpellDraft;
  /** Class ids and names the multi-select offers (the class registry). Classes already on the draft are always offered. */
  classOptions: { id: string; name: string }[];
  /** Lines the spell-block reader could not understand; shown above the form so the player can check them. */
  unread?: string[];
  saveLabel?: string;
  /** Called with a valid draft. A thrown error is shown under the Save button. */
  onSave(draft: SpellDraft): Promise<void> | void;
  onCancel(): void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The "Create a spell" / "Edit spell" form. Plain DOM; nothing re-renders the whole form while someone types. */
export function spellForm(o: SpellFormOpts): HTMLElement {
  const F: SpellDraft = { ...o.draft, classes: [...o.draft.classes] };
  const input = (value: string, set: (v: string) => void, label: string, extra: Record<string, string> = {}) =>
    h("input", { cls: "fe-cf-input", attrs: { type: "text", value, "aria-label": label, ...extra }, on: { input: (e: Event) => set((e.target as HTMLInputElement).value) } });
  const select = (options: { value: string; label: string }[], value: string, set: (v: string) => void, label: string) => {
    const el = h("select", { cls: "fe-cf-input", attrs: { "aria-label": label }, on: { change: (e: Event) => set((e.target as HTMLSelectElement).value) } },
      ...options.map(op => h("option", { text: op.label, attrs: { value: op.value, ...(op.value === value ? { selected: "" } : {}) } })));
    el.value = value;
    return el;
  };
  const field = (label: string, control: HTMLElement, cls = "") => h("label", { cls: `fe-cf-field ${cls}`.trim() }, h("span", { cls: "fe-cf-label", text: label }), control);
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, act: string, after?: () => void) => {
    const sw = h("button", { cls: `fe-switch ${get() ? "is-on" : ""}`, attrs: { type: "button", role: "switch", "aria-checked": String(get()), "aria-label": label }, data: { act },
      on: { click: () => { set(!get()); sw.classList.toggle("is-on", get()); sw.setAttribute("aria-checked", String(get())); after?.(); } } });
    return h("div", { cls: "fe-menu-row fe-sf-toggle" }, h("span", { cls: "fe-grow", text: label }), sw);
  };

  // Things that appear or vanish with a choice are redrawn from small boxes; typing never redraws.
  const materialBox = h("div", {}), saveBox = h("div", {}), classBox = h("div", { cls: "fe-chips", data: { classes: "" } });
  const fillMaterial = () => { clear(materialBox); if (F.m) materialBox.append(field("What material?", input(F.material, v => { F.material = v; }, "Material", { placeholder: "a pinch of ash" }))); };
  const fillSave = () => {
    clear(saveBox);
    if (!F.save) return;
    saveBox.append(h("div", { cls: "fe-cf-row" },
      field("Which saving throw?", select(ABILS.map(a => ({ value: a, label: ABIL_NAMES[a] })), F.save, v => { F.save = v as typeof F.save; }, "Saving throw ability")),
      field("On a successful save", select([{ value: "none", label: "No effect" }, { value: "half", label: "Half damage" }], F.onSuccess, v => { F.onSuccess = v as "half" | "none"; }, "On a successful save"))),
      h("div", { cls: "fe-faint", text: "The target rolls against your spell save DC." }));
  };
  const options = [...o.classOptions]; for (const k of F.classes) if (!options.some(x => x.id === k)) options.push({ id: k, name: cap(k) });
  const fillClasses = () => {
    clear(classBox);
    for (const c of options) {
      const on = F.classes.includes(c.id);
      classBox.append(h("button", { cls: `fe-btn ${on ? "is-on" : ""}`.trim(), text: c.name, attrs: { type: "button", "aria-pressed": String(on) }, data: { class: c.id },
        on: { click: () => { F.classes = on ? F.classes.filter(x => x !== c.id) : [...F.classes, c.id]; fillClasses(); } } }));
    }
  };
  fillMaterial(); fillSave(); fillClasses();

  const problems = h("div", { cls: "fe-warn fe-cf-problems", attrs: { role: "alert" } });
  problems.hidden = true;
  const showProblems = (list: string[]) => { clear(problems); problems.hidden = !list.length; for (const p of list) problems.append(h("div", { text: p })); };

  const saveBtn = h("button", { cls: "fe-btn mod-cta", text: o.saveLabel ?? "Save spell", attrs: { type: "button" }, data: { act: "save-spell" } });
  saveBtn.addEventListener("click", () => {
    const draft: SpellDraft = { ...F, classes: [...F.classes], name: F.name.trim() };
    const errs = validateSpellDraft(draft);
    showProblems(errs);
    if (errs.length) { problems.scrollIntoView?.({ block: "nearest" }); return; }
    saveBtn.disabled = true;
    void Promise.resolve().then(() => o.onSave(draft)).catch((err: unknown) => showProblems([err instanceof Error ? err.message : String(err)])).finally(() => { saveBtn.disabled = false; });
  });

  const dmgTypes = [{ value: "", label: "(none)" }, ...DAMAGE_TYPES.map(t => ({ value: t, label: cap(t) }))];
  return h("div", { cls: "fe-cform fe-spell-form", data: { form: "spell" } },
    o.unread?.length ? h("div", { cls: "fe-cf-unread", data: { unread: "" } }, h("div", { cls: "fe-card-title", text: "I could not read these lines" }),
      ...o.unread.map(l => h("div", { cls: "fe-faint", text: l })), h("div", { text: "Check the boxes below and fill in anything missing, then press Save." })) : null,
    field("Name", input(F.name, v => { F.name = v; }, "Spell name", { placeholder: "Frost Needle" })),
    h("div", { cls: "fe-cf-row" },
      field("Level", select(LEVEL_LABELS.map((l, i) => ({ value: String(i), label: l })), String(F.level), v => { F.level = Number(v); }, "Spell level"), "fe-cf-grow"),
      field("School of magic", select(SCHOOLS.map(s => ({ value: s, label: s })), F.school, v => { F.school = v; }, "School of magic"), "fe-cf-grow")),
    h("div", { cls: "fe-cf-row" },
      field("Casting time", input(F.castingTime, v => { F.castingTime = v; }, "Casting time", { placeholder: "1 action" }), "fe-cf-grow"),
      field("Range", input(F.range, v => { F.range = v; }, "Range", { placeholder: "60 feet" }), "fe-cf-grow"),
      field("Duration", input(F.duration, v => { F.duration = v; }, "Duration", { placeholder: "Instantaneous" }), "fe-cf-grow")),
    h("div", { cls: "fe-card-title", text: "Components" }),
    toggle("Verbal (you speak)", () => F.v, v => { F.v = v; }, "toggle-v"),
    toggle("Somatic (you gesture)", () => F.s, v => { F.s = v; }, "toggle-s"),
    toggle("Material (you need something)", () => F.m, v => { F.m = v; }, "toggle-m", fillMaterial), materialBox,
    toggle("Concentration", () => F.concentration, v => { F.concentration = v; }, "toggle-concentration"),
    toggle("Ritual (can be cast without a slot)", () => F.ritual, v => { F.ritual = v; }, "toggle-ritual"),
    h("div", { cls: "fe-card-title", text: "Who can learn it" }), classBox,
    h("div", { cls: "fe-card-title", text: "What it does" }),
    field("Short description", h("textarea", { cls: "fe-cf-input", attrs: { rows: "5", "aria-label": "Short description" }, text: F.description, on: { input: (e: Event) => { F.description = (e.target as HTMLTextAreaElement).value; } } })),
    field("At higher levels (optional)", h("textarea", { cls: "fe-cf-input", attrs: { rows: "2", "aria-label": "At higher levels" }, text: F.higherLevel, on: { input: (e: Event) => { F.higherLevel = (e.target as HTMLTextAreaElement).value; } } })),
    h("div", { cls: "fe-card-title", text: "Dice (optional, so the sheet can roll them)" }),
    h("div", { cls: "fe-cf-row" },
      field("Damage dice", input(F.dice, v => { F.dice = v; }, "Damage dice", { placeholder: "2d6" })),
      field("Damage type", select(dmgTypes, F.dtype, v => { F.dtype = v; }, "Damage type")),
      field("Healing dice", input(F.heal, v => { F.heal = v; }, "Healing dice", { placeholder: "1d8" }))),
    toggle("Healing adds your spellcasting modifier", () => F.healMod, v => { F.healMod = v; }, "toggle-heal-mod"),
    field("Spell attack", select([{ value: "", label: "No attack roll" }, { value: "melee", label: "Melee spell attack" }, { value: "ranged", label: "Ranged spell attack" }], F.attack, v => { F.attack = v as typeof F.attack; }, "Spell attack")),
    toggle("The target makes a saving throw (uses your spell save DC)", () => !!F.save, v => { F.save = v ? "dex" : ""; }, "toggle-save", fillSave), saveBox,
    problems,
    h("div", { cls: "fe-kv fe-cf-actions" }, h("button", { cls: "fe-btn", text: "Back", attrs: { type: "button" }, data: { act: "form-back" }, on: { click: () => o.onCancel() } }), saveBtn));
}
