export const thalia = {
  type: "5e-character", schema: 1, name: "Thalia Ironbrook", campaign: "[[Ekron Campaign]]", race: "hill-dwarf", background: "acolyte",
  classes: [{ class: "cleric", subclass: "life-domain", level: 5 }],
  abilities: { str: 14, dex: 10, con: 16, int: 8, wis: 17, cha: 12 },
  proficiencies: { saves: ["wis", "cha"], skills: ["insight", "medicine", "religion"], expertise: [] },
  hp: { max: 43, current: 31, temp: 0 }, hitDice: { d8: { used: 2 } }, deathSaves: { successes: 0, failures: 0 },
  spellSlots: { "1": { used: 1 }, "3": { used: 1 } }, spells: [{ id: "cure-wounds", prepared: true }],
  inventory: [{ id: "chain-mail", equipped: true }, { id: "shield", equipped: true }, { id: "warhammer", equipped: true },
    { id: "ring-of-protection", equipped: true, attuned: true }, { name: "Grandmother's locket", qty: 1 }],
  coins: { gp: 47, sp: 12, cp: 30 },
  resources: [{ name: "Channel Divinity", max: 1, used: 0, reset: "short" }],
  conditions: { poisoned: 1 }, inspiration: false, xp: 6500,
  companions: [{ creature: "owl", name: "Hoot", kind: "familiar" }],
  myOwnKey: "keep me",
};
export const maren = { type: "5e-npc", name: "Sister Maren", creature: "acolyte", hp: { max: 12, current: 12 } };
