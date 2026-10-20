import type { ItemData } from "../content/types";
import type { Character, InventoryEntry } from "../core/character";
import { entryItem } from "../core/item-entry";
import type { RestCtx, RestDef, RestOptions, RuleModule } from "./module";

const exhaustionDown = (c: Character) => { if (c.conditions.exhaustion) { c.conditions.exhaustion--; if (!c.conditions.exhaustion) delete c.conditions.exhaustion; } };
const hpMaxAfterExhaustion = (ctx: RestCtx) => (ctx.c.conditions.exhaustion ?? 0) - 1 >= 4 ? Math.floor(ctx.stats.hpFull / 2) : ctx.stats.hpFull;
const itemName = (ctx: RestCtx, e: InventoryEntry): ItemData | undefined => entryItem(e, ctx.registry);

/** Switches (Rage, stances) that end with this kind of rest; a long rest ends the short ones too. */
function endToggles(ctx: RestCtx, c: Character | null, kinds: ("short" | "long")[]): string[] {
  const out: string[] = [];
  for (const t of ctx.stats.toggles) if (t.on && t.def.endsOn !== "never" && kinds.includes(t.def.endsOn)) { out.push(`${t.name} ends`); if (c) delete c.active[t.id]; }
  return out;
}

function shortParts(ctx: RestCtx, c: Character | null): string[] {
  const out: string[] = endToggles(ctx, c, ["short"]);
  (c ?? ctx.c).resources.forEach(r => { if (r.reset === "short" && r.used) { out.push(`${r.name} recharges`); if (c) r.used = 0; } });
  ctx.c.inventory.forEach((e, i) => { const it = itemName(ctx, e); if (it?.charges?.reset === "short" && e.charges?.used) { out.push(`${it.name}: charges restored`); if (c) c.inventory[i].charges = { used: 0 }; } });
  for (const r of ctx.stats.resources) {
    if (!r.derived || !r.used) continue;
    const flag = `refill.${r.id}`;
    if (r.reset === "short") { out.push(`${r.name} recharges`); if (c) delete c.uses[r.id]; }
    else if (r.refill && !(r.refill.oncePer === "long" && ctx.c.choices[flag])) {
      const back = Math.min(r.used, r.refill.amount); if (!back) continue;
      out.push(`${r.name}: regain ${back}`);
      if (c) { if (r.used - back) c.uses[r.id] = r.used - back; else delete c.uses[r.id]; if (r.refill.oncePer === "long") c.choices[flag] = true; }
    }
  }
  // Warlock Pact Magic slots come back on a short rest.
  if (ctx.stats.slots.some(sl => sl.level === "pact" && sl.used > 0)) { out.push("Pact Magic spell slots return"); if (c) delete c.spellSlots.pact; }
  return out;
}

/** Dawn resets are on a long rest unless the holy-days rule is on, which moves them to the holy-day rest. */
const dawnOnLongRest = (ctx: RestCtx) => !ctx.rules["holy-days"];
const resetsOn = (reset: string, dawnToo: boolean) => reset === "short" || reset === "long" || (reset === "dawn" && dawnToo);

/** What a dawn on a holy day restores: resources and item charges that reset at dawn, nothing else. Pass c=null for a preview. */
function dawnParts(ctx: RestCtx, c: Character | null): string[] {
  const out: string[] = [];
  ctx.c.resources.forEach((r, i) => { if (r.reset === "dawn" && r.used) { out.push(`${r.name} recharges`); if (c) c.resources[i].used = 0; } });
  for (const r of ctx.stats.resources) if (r.derived && r.reset === "dawn" && r.used) { out.push(`${r.name} recharges`); if (c) delete c.uses[r.id]; }
  ctx.c.inventory.forEach((e, i) => { const it = itemName(ctx, e);
    if (it?.charges?.reset === "dawn" && e.charges?.used) { out.push(`${it.name}: charges restored`); if (c) c.inventory[i].charges = { used: 0 }; } });
  return out;
}

/** Long rest (allHitDice=false) and Good Rest (allHitDice=true). Pass c=null for a preview. */
function bigParts(ctx: RestCtx, c: Character | null, allHitDice: boolean): string[] {
  const out: string[] = endToggles(ctx, c, ["short", "long"]), ex = ctx.c.conditions.exhaustion ?? 0;
  if (ex) out.push(`Exhaustion ${ex} → ${ex - 1}`);
  out.push(`HP to ${hpMaxAfterExhaustion(ctx)}`);
  if (ctx.stats.slots.length) out.push("All spell slots");
  const dawn = dawnOnLongRest(ctx);
  ctx.c.resources.forEach(r => { if (r.used && r.reset !== "none" && (r.reset !== "dawn" || dawn)) out.push(`${r.name} recharges`); });
  ctx.stats.resources.forEach(r => { if (r.derived && r.used && r.reset !== "none" && (r.reset !== "dawn" || dawn)) out.push(`${r.name} recharges`); });
  const total = ctx.stats.hitDice.reduce((a, h) => a + h.max, 0), used = ctx.stats.hitDice.reduce((a, h) => a + h.used, 0);
  let regain = Math.min(used, allHitDice ? used : Math.max(1, Math.floor(total / 2)));
  if (regain) out.push(allHitDice ? "All Hit Dice" : `Regain ${regain} Hit Dice`);
  ctx.c.inventory.forEach(e => { const it = itemName(ctx, e);
    if (it && Object.values(e.spellUses ?? {}).some(n => n > 0)) out.push(`${it.name}: daily spell uses restored`); });
  ctx.c.inventory.forEach(e => { const it = itemName(ctx, e);
    if (it?.charges && e.charges?.used && (it.charges.reset === "long" || it.charges.reset === "short" || (it.charges.reset === "dawn" && !ctx.rules["holy-days"]))) out.push(`${it.name}: charges restored`); });
  if (c) {
    exhaustionDown(c);
    c.hp = { max: c.hp.max, current: hpMaxAfterExhaustion(ctx), temp: 0 };
    c.deathSaves = { successes: 0, failures: 0 }; c.spellSlots = {};
    c.resources.forEach(r => { if (resetsOn(r.reset, dawn)) r.used = 0; });
    for (const r of ctx.stats.resources) if (r.derived && resetsOn(r.reset, dawn)) delete c.uses[r.id];
    for (const k of Object.keys(c.choices)) if (k.startsWith("refill.")) delete c.choices[k];
    for (const h of [...ctx.stats.hitDice].sort((a, b) => +b.die.slice(1) - +a.die.slice(1))) {
      const back = Math.min(h.used, regain); regain -= back; c.hitDice[h.die] = { used: h.used - back };
    }
    c.inventory.forEach(e => { delete e.spellUses; });   // per-day item spells come back on any long rest
    c.inventory.forEach((e, i) => { const it = itemName(ctx, e);
      if (it?.charges && e.charges && (it.charges.reset === "long" || it.charges.reset === "short" || (it.charges.reset === "dawn" && !ctx.rules["holy-days"]))) c.inventory[i].charges = { used: 0 }; });
  }
  return out;
}

const short: RestDef = {
  id: "short", label: "Short rest",
  preview: ctx => [...shortParts(ctx, null), "Spend Hit Dice to heal"],
  apply: ctx => { const c = structuredClone(ctx.c); return { value: c, summary: shortParts(ctx, c) }; },
};
const long: RestDef = {
  id: "long", label: "Long rest",
  preview: ctx => bigParts(ctx, null, false),
  apply: ctx => { const c = structuredClone(ctx.c); return { value: c, summary: bigParts(ctx, c, false) }; },
};
export const isGood = (ctx: RestCtx, o: RestOptions = {}) => {
  const nights = (o.samePlace === false ? 0 : ctx.c.rest.nightsInPlace) + 1;
  return { good: !!o.safeHaven || nights >= 3, nights, why: o.safeHaven ? "safe haven" : `${nights} nights in place` };
};
const night: RestDef = {
  id: "night", label: "Night's rest",
  preview: (ctx, o) => { const g = isGood(ctx, o); return g.good ? [`Good Rest (${g.why})`, ...bigParts(ctx, null, true)] : [`Night ${g.nights} in this place`, ...shortParts(ctx, null), "Spend Hit Dice to heal"]; },
  apply: (ctx, o) => {
    const g = isGood(ctx, o), c = structuredClone(ctx.c);
    if (g.good) { const summary = [`Good Rest (${g.why})`, ...bigParts(ctx, c, true)]; c.rest.nightsInPlace = 0; return { value: c, summary }; }
    const summary = [`Night ${g.nights} in this place`, ...shortParts(ctx, c)]; c.rest.nightsInPlace = g.nights; return { value: c, summary };
  },
};

/** Only offered when the holy-days rule is on: a dawn on a holy day is the one time dawn-reset magic comes back. */
export const holyDay: RestDef = {
  id: "holy-day", label: "Holy day dawn",
  preview: ctx => { const p = dawnParts(ctx, null); return p.length ? p : ["Nothing that resets at dawn is spent"]; },
  apply: ctx => { const c = structuredClone(ctx.c); return { value: c, summary: dawnParts(ctx, c) }; },
};
export const restStandard: RuleModule = { id: "rest-standard", title: "Normal rests (short and long)", defaultOn: true, excludes: ["rest-excursion"], rests: [short, long], sections: [] };
export const restExcursion: RuleModule = { id: "rest-excursion", title: "Hexploration (night's rest and Good Rest)", defaultOn: false, excludes: ["rest-standard"], rests: [night], sections: [] };
