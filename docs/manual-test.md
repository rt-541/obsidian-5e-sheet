# Manual test checklist (run on desktop and on Obsidian mobile)

Setup: copy `examples/` into the vault (Compendium folder to the vault root `Compendium/`), deploy, enable the plugin.

- [ ] Opening `Thalia Ironbrook.md` shows the sheet, not markdown. "Open as markdown" in the header switches back; the toggle command returns to the sheet.
- [ ] AC 19, Spell DC 14, WIS save +7, passive Perception 13. Hover AC lists Chain mail, Shield, Ring of protection.
- [ ] Click Insight: toast shows d20 + 6. Shift-click (desktop) or Adv. switch (mobile) rolls two dice.
- [ ] Damage 5 three times quickly: HP 28, and the note's frontmatter shows `current: 28` after a moment (one write).
- [ ] Conditions: add Poisoned; skill rolls show "dis: Poisoned"; remove it. Add Exhaustion 4: HP max shows halved.
- [ ] Campaign uses excursion rests: the rest button reads "Night's rest". Tick Safe haven: preview says Good Rest; apply restores HP.
- [ ] Inventory: Add from compendium shows Emberheart Warhammer marked Homebrew. Add, Equip, Attune: a +6 attack with "+ 1d6 fire" appears; Active effects lists "Resist cold".
- [ ] Edit the Emberheart note (bonus: 2): the open sheet updates without reopening.
- [ ] Copy a new item note into Compendium/Items: it appears in "Add from compendium" within a second.
- [ ] Break a note (`effects: nope`): a notice appears; "Show compendium problems" lists it; fixing the note clears it.
- [ ] Companions tab (Pets on mobile): Hoot the owl shows AC 11, Talons +3. Add a wolf; damage it; roll its bite.
- [ ] `Sister Maren.md` opens as an NPC stat block; damage persists to her note.
- [ ] Edit mode > Customize sheet: hide Death saves; it disappears and `sheet.hide` is written to the note.
- [ ] Put `hp: lots` in a character note: red banner, nothing saved, rolls still work.
- [ ] Phone: layout is the mobile one (tabs at top, bottom sheet panels), buttons are easy to hit, no horizontal scroll.
- [ ] Edit on the phone, wait for Sync, open on desktop: values match.
- [ ] Rename an open character note, tap Damage, wait a moment: the renamed note's frontmatter shows the new HP and the roll log is still there.
- [ ] Spells tab (Thalia): her spells are grouped by level with a prepared toggle; Cure Wounds shows a heal button (1d8+3). Cast it at level 2: the level-2 pips fill and the toast says "Cast Cure Wounds (level 2, slot spent)".
- [ ] Equip the Emberheart Warhammer without attuning: no "From items" entry. Attune: Burning Hands appears under it costing 1 charge. Cast: one charge pip fills. Unattune: the entry disappears.
- [ ] Cast Bless, then another concentration spell: the toast notes that concentration on Bless ends. The chip beside Conditions can be cleared with End, and survives closing and reopening the note.
- [ ] Edit mode: Add spell opens the compendium filtered to the character's class; "Show all classes" widens it; Remove drops an own spell.
- [ ] Desktop: hover an item, spell or condition name for a quarter second: a card shows rules text and numbers (+1 AC, 3d6 fire, Dex save); it closes on mouseout and on scroll. Click the name: the same card opens in a panel.
- [ ] Phone: tapping a name opens the details panel; no hover card ever appears.
- [ ] A homebrew item named `<b>x</b>` shows the literal text in the card.
