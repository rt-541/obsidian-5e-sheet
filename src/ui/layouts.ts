/** Every feature a character sheet shows. Both layouts must place each one exactly once (parity test). */
export const CHARACTER_FEATURES = [
  "identity", "inspiration", "prof", "xp", "level-up", "ac", "initiative", "speed", "passive-perception",
  "hp", "hp-controls", "hit-dice", "death-saves", "conditions", "concentration", "active-effects",
  "abilities", "saves", "skills", "attacks", "pinned-spells", "spell-dc", "spell-slots", "spells", "resources", "traits", "rests",
  "features", "inventory", "companions", "roll-mode", "roll-log", "play-edit", "notes",
] as const;
export const NPC_FEATURES = [
  "identity", "ac", "initiative", "speed", "passive-perception", "hp", "hp-controls", "conditions",
  "active-effects", "abilities", "saves", "skills", "attacks", "traits", "roll-mode", "roll-log", "play-edit", "notes",
] as const;

export interface LayoutSpec { pinned: string[]; tabs: { id: string; label: string; columns: string[][] }[]; }

export const DESKTOP: LayoutSpec = {
  pinned: ["identity", "inspiration", "prof", "xp", "level-up", "roll-mode", "play-edit", "roll-log", "rests"],
  tabs: [
    { id: "main", label: "Main", columns: [
      ["abilities", "saves", "skills"],
      ["ac", "initiative", "speed", "passive-perception", "hp", "hp-controls", "hit-dice", "death-saves", "conditions", "concentration", "active-effects"],
      ["attacks", "pinned-spells", "spell-dc", "spell-slots", "resources", "traits"]] },
    { id: "spells", label: "Spells", columns: [["spells"]] },
    { id: "features", label: "Features", columns: [["features"]] },
    { id: "inventory", label: "Inventory", columns: [["inventory"]] },
    { id: "companions", label: "Companions", columns: [["companions"]] },
    { id: "notes", label: "Notes", columns: [["notes"]] },
  ],
};
export const MOBILE: LayoutSpec = {
  pinned: ["identity", "hp", "ac", "initiative", "speed", "level-up", "roll-mode", "conditions", "concentration", "roll-log"],
  tabs: [
    { id: "combat", label: "Combat", columns: [["hp-controls", "attacks", "pinned-spells", "spell-dc", "spell-slots", "resources", "traits", "hit-dice", "death-saves", "rests"]] },
    { id: "checks", label: "Checks", columns: [["abilities", "saves", "skills", "passive-perception"]] },
    { id: "spells", label: "Spells", columns: [["spells"]] },
    { id: "gear", label: "Gear", columns: [["inventory"]] },
    { id: "pets", label: "Pets", columns: [["companions"]] },
    { id: "more", label: "More", columns: [["inspiration", "prof", "xp", "features", "active-effects", "play-edit", "notes"]] },
  ],
};
export const NPC_DESKTOP: LayoutSpec = {
  pinned: ["identity", "roll-mode", "play-edit", "roll-log"],
  tabs: [
    { id: "main", label: "Stat block", columns: [["abilities", "saves", "skills"], ["ac", "initiative", "speed", "passive-perception", "hp", "hp-controls", "conditions", "active-effects"], ["attacks", "traits"]] },
    { id: "notes", label: "Notes", columns: [["notes"]] },
  ],
};
export const NPC_MOBILE: LayoutSpec = {
  pinned: ["identity", "hp", "ac", "initiative", "speed", "roll-mode", "conditions", "roll-log"],
  tabs: [
    { id: "combat", label: "Combat", columns: [["hp-controls", "attacks", "traits"]] },
    { id: "checks", label: "Checks", columns: [["abilities", "saves", "skills", "passive-perception"]] },
    { id: "more", label: "More", columns: [["active-effects", "play-edit", "notes"]] },
  ],
};
export const layoutFor = (npc: boolean, mobile: boolean) => npc ? (mobile ? NPC_MOBILE : NPC_DESKTOP) : (mobile ? MOBILE : DESKTOP);
export const placed = (l: LayoutSpec) => [...l.pinned, ...l.tabs.flatMap(t => t.columns.flat())];
