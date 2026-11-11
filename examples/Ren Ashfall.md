---
type: 5e-character
schema: 1
name: Ren Ashfall
race: human
background: acolyte
classes: [{ class: monk, subclass: open-hand, level: 5 }]
abilities: { str: 10, dex: 18, con: 14, int: 10, wis: 16, cha: 8 }
proficiencies: { saves: [str, dex], skills: [acrobatics, insight, stealth, religion], expertise: [] }
hp: { max: 38, current: 31, temp: 0 }
hitDice: { d8: { used: 1 } }
inventory:
  - { id: quarterstaff, equipped: true }
  - { id: potion-of-healing, qty: 2 }
  - { id: rations, qty: 5 }
coins: { gp: 23, sp: 8 }
combos:
  - name: Stun Lock
    when: A dangerous single target in reach (casters, brutes)
    steps:
      - { action: Action, text: "Attack with the quarterstaff (Extra Attack: two attacks).", use: { attack: Quarterstaff } }
      - { action: Free, text: "On a hit, Stunning Strike: the target makes a Con save or is stunned until the end of your next turn.", use: { resource: Ki Points, cost: 1, dc: Ki } }
      - { action: Bonus action, text: "Flurry of Blows: two unarmed strikes (martial arts die + Dex).", use: { attack: Unarmed Strike, resource: Ki Points, cost: 1 } }
      - { action: Free, text: "If the target is still standing, try Stunning Strike again on a Flurry hit. Attacks against a stunned target have advantage.", use: { resource: Ki Points, cost: 1 } }
    notes: Up to 3 ki in one turn. Stop spending once the target is stunned.
  - name: Open Hand Topple
    when: Enemies grouped up, or one you want away from an ally
    steps:
      - { action: Action, text: "Attack twice with the quarterstaff.", use: { attack: Quarterstaff } }
      - { action: Bonus action, text: "Flurry of Blows. On each hit choose an Open Hand Technique: Dex save or prone, Str save or pushed 15 ft, or no reactions until the end of your next turn.", use: { resource: Ki Points, cost: 1, dc: Ki } }
    notes: Prone plus your allies' melee attacks means advantage. Push enemies off ledges or out of your casters' faces.
  - name: Hit and Fade
    when: You are surrounded, or need to reach a back-line target
    steps:
      - { action: Move, text: "Run in (speed 40 ft with Unarmored Movement)." }
      - { action: Action, text: "Attack twice.", use: { attack: Quarterstaff } }
      - { action: Bonus action, text: "Step of the Wind: Disengage (or Dash), and your jump distance doubles. Leave without opportunity attacks.", use: { resource: Ki Points, cost: 1 } }
  - name: Turtle Up
    when: Low on hit points, or holding a chokepoint
    steps:
      - { action: Action, text: "Attack (or Dodge if you cannot reach anyone).", use: { attack: Quarterstaff } }
      - { action: Bonus action, text: "Patient Defense: take the Dodge action.", use: { resource: Ki Points, cost: 1 } }
      - { action: Reaction, text: "Deflect Missiles against a ranged hit: reduce the damage by 1d10 + Dex + monk level. If it drops to 0, spend 1 ki to throw it back.", use: { dice: "1d10+9" } }
---
# Backstory

Raised by the Order of the Ashen Bell. (Invented sample character: SRD content only.)
