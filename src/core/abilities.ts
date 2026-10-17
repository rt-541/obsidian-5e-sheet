export const abilityMod = (s: number) => Math.floor((s - 10) / 2);
export const profBonus = (level: number) => Math.ceil(Math.max(level, 1) / 4) + 1;
