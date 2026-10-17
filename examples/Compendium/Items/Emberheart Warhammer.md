---
type: 5e-item
name: Emberheart Warhammer
rarity: rare
kind: weapon
attunement: true
weight: 2
weapon: { dmg: 1d8, type: bludgeoning, ab: str, range: melee, bonus: 1, extraDamage: 1d6 fire }
charges: { max: 3, reset: dawn }
grants:
  spells:
    - { id: burning-hands, charges: 1 }
effects:
  resist: [cold]
  note: "On a hit, spend 1 charge for an extra 2d6 fire damage."
---
Forged in the ash-vents under Ekron. While attuned you have resistance to cold damage.
