import { str, type Raw } from "../check";
import type { TypeDef } from "../registry";
import { validateLevels, validateOps, validateOptions, type Op, type OptionDef } from "./ops";

/** Subclass: picked inside a class; its `levels` are keyed by the CLASS level at which they apply. */
export interface SubclassData { name: string; class: string; options?: Record<string, OptionDef[]>; levels: Record<number, Op[]>; }
/** Race, subrace, background and feat: a flat list of grants. */
export interface GrantsData { name: string; grants: Op[]; }
export interface SubraceData extends GrantsData { race: string; }
export interface FeatData extends GrantsData { prerequisite?: string; }

const sizes = (o: Record<string, OptionDef[]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length]));

export const subclassType: TypeDef<SubclassData> = {
  type: "subclass",
  validate(raw: Raw) {
    const e: string[] = [];
    const name = str(raw.name, "name", e), cls = str(raw.class, "class", e);
    const options = validateOptions(raw.options, "options", e);
    const levels = validateLevels(raw.levels, "levels", { kind: "subclass", options: sizes(options) }, e);
    if (e.length || !name || !cls) return { errors: e };
    return { errors: e, value: { name, class: cls, levels, ...(Object.keys(options).length ? { options } : {}) } };
  },
};

function grantsType<T extends GrantsData>(type: string, more: (raw: Raw, e: string[]) => Partial<T>): TypeDef<T> {
  return {
    type,
    validate(raw: Raw) {
      const e: string[] = [];
      const name = str(raw.name, "name", e), extra = more(raw, e);
      const grants = validateOps(raw.grants, "grants", { kind: "grants", options: {} }, e);
      if (e.length || !name) return { errors: e };
      return { errors: e, value: { name, grants, ...extra } as T };
    },
  };
}

export const raceType = grantsType<GrantsData>("race", () => ({}));
export const backgroundType = grantsType<GrantsData>("background", () => ({}));
export const subraceType = grantsType<SubraceData>("subrace", (raw, e) => ({ race: str(raw.race, "race", e) ?? "" }));
export const featType = grantsType<FeatData>("feat", (raw, e) => {
  const p = str(raw.prerequisite, "prerequisite", e, true);
  return p ? { prerequisite: p } : {};
});
