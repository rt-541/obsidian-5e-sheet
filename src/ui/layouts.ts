/** Every feature a character sheet shows. Both layouts must place each one exactly once (parity test). */
export const CHARACTER_FEATURES = [
  "identity", "inspiration", "prof", "xp", "level-up", "ac", "initiative", "speed", "passive-perception",
  "hp", "hp-controls", "coins", "hit-dice", "death-saves", "conditions", "concentration", "toggles", "active-effects",
  "abilities", "saves", "skills", "attacks", "pinned-spells", "pinned-combos", "combos", "spell-dc", "spell-slots", "spells", "resources", "rations", "traits", "rests",
  "features", "inventory", "companions", "roll-mode", "roll-log", "play-edit", "notes",
] as const;
export const NPC_FEATURES = [
  "identity", "ac", "initiative", "speed", "passive-perception", "hp", "hp-controls", "conditions",
  "active-effects", "abilities", "saves", "skills", "attacks", "traits", "roll-mode", "roll-log", "play-edit", "notes",
] as const;

export interface LayoutSpec { pinned: string[]; tabs: { id: string; label: string; columns: string[][] }[]; }

export const DESKTOP: LayoutSpec = {
  pinned: ["identity", "inspiration", "prof", "xp", "level-up", "roll-mode", "play-edit", "roll-log"],
  tabs: [
    { id: "main", label: "Main", columns: [
      ["abilities", "saves", "skills"],
      ["ac", "initiative", "speed", "passive-perception", "hp", "hp-controls", "coins", "hit-dice", "rests", "death-saves", "conditions", "concentration", "active-effects"],
      ["toggles", "attacks", "pinned-spells", "pinned-combos", "spell-dc", "spell-slots", "resources", "rations", "traits"]] },
    { id: "combos", label: "Combos", columns: [["combos"]] },
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
    { id: "combat", label: "Combat", columns: [["hp-controls", "death-saves", "attacks", "resources", "rations", "toggles", "pinned-spells", "pinned-combos", "spell-dc", "spell-slots", "coins", "traits", "hit-dice", "rests"]] },
    { id: "combos", label: "Combos", columns: [["combos"]] },
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
/**
 * The tablet layout: a header that stays put while you scroll (who you are, HP, AC, initiative, speed, conditions, roll mode, rests, level up, roll log),
 * then six big-target tabs. Main has two columns: the checks on the left, and on the right what you use in a fight.
 * The switches (Rage and the like) sit at the top of the right column rather than in the header, so their descriptions have room.
 */
export const TABLET: LayoutSpec = {
  pinned: ["identity", "hp", "ac", "initiative", "speed", "conditions", "concentration", "roll-mode", "level-up", "roll-log"],
  tabs: [
    { id: "main", label: "Main", columns: [
      ["abilities", "saves", "skills", "passive-perception", "traits"],
      ["hp-controls", "death-saves", "attacks", "resources", "rations", "toggles", "pinned-spells", "pinned-combos", "coins", "hit-dice", "rests", "active-effects"]] },
    { id: "combos", label: "Combos", columns: [["combos"]] },
    { id: "spells", label: "Spells", columns: [["spell-dc", "spell-slots", "spells"]] },
    { id: "gear", label: "Gear", columns: [["inventory"]] },
    { id: "features", label: "Features", columns: [["features"]] },
    { id: "more", label: "More", columns: [["companions"], ["inspiration", "prof", "xp", "play-edit", "notes"]] },
  ],
};

export type LayoutName = "desktop" | "tablet" | "mobile";
export type LayoutSetting = "auto" | LayoutName;
/** Panes narrower than this get the phone layout; panes up to WIDE_PX get the tablet layout. */
export const NARROW_PX = 700, WIDE_PX = 1100;
/**
 * Which layout to draw. A chosen layout is always used. On auto: a phone gets mobile; a tablet gets tablet (unless the pane is too narrow for two columns);
 * a computer gets mobile in a narrow pane, tablet in a medium one and desktop in a wide one.
 */
export function pickLayout(setting: LayoutSetting, env: { isMobile: boolean; isTablet: boolean; width: number }): LayoutName {
  if (setting !== "auto") return setting;
  if (env.isTablet) return env.width > 0 && env.width < NARROW_PX ? "mobile" : "tablet";
  if (env.isMobile) return "mobile";
  return env.width < NARROW_PX ? "mobile" : env.width <= WIDE_PX ? "tablet" : "desktop";
}
/** The layout for a sheet; true and false stand for mobile and desktop. An NPC has no tablet version of its own: it uses the desktop one. */
export function layoutFor(npc: boolean, layout: LayoutName | boolean): LayoutSpec {
  const name: LayoutName = layout === true ? "mobile" : layout === false ? "desktop" : layout;
  return npc ? (name === "mobile" ? NPC_MOBILE : NPC_DESKTOP) : name === "mobile" ? MOBILE : name === "tablet" ? TABLET : DESKTOP;
}
export const placed = (l: LayoutSpec) => [...l.pinned, ...l.tabs.flatMap(t => t.columns.flat())];
