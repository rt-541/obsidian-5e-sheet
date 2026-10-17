import type { ItemData } from "../content/types";
import type { Character } from "../core/character";
import type { RestCtx, RestDef, RestOptions, RuleModule } from "./module";

const exhaustionDown = (c: Character) => { if (c.conditions.exhaustion) { c.conditions.exhaustion--; if (!c.conditions.exhaustion) delete c.conditions.exhaustion; } };
const hpMaxAfterExhaustion = (ctx: RestCtx) => (ctx.c.conditions.exhaustion ?? 0) - 1 >= 4 ? Math.floor(ctx.c.hp.max / 2) : ctx.c.hp.max;
const itemName = (ctx: RestCtx, id?: string) => (id && ctx.registry.get<ItemData>("item", id)?.data) || undefined;

function shortParts(ctx: RestCtx, c: Character | null): string[] {
  const out: string[] = [];
  (c ?? ctx.c).resources.forEach(r => { if (r.reset === "short" && r.used) { out.push(`${r.name} recharges`); if (c) r.used = 0; } });
  ctx.c.inventory.forEach((e, i) => { const it = itemName(ctx, e.id); if (it?.charges?.reset === "short" && e.charges?.used) { out.push(`${it.name}: charges restored`); if (c) c.inventory[i].charges = { used: 0 }; } });
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
  return out;
}

/** Long rest (allHitDice=false) and Good Rest (allHitDice=true). Pass c=null for a preview. */
function bigParts(ctx: RestCtx, c: Character | null, allHitDice: boolean): string[] {
  const out: string[] = [], ex = ctx.c.conditions.exhaustion ?? 0;
  if (ex) out.push(`Exhaustion ${ex} -> ${ex - 1}`);
  out.push(`HP to ${hpMaxAfterExhaustion(ctx)}`, "All spell slots");
  ctx.c.resources.forEach(r => { if (r.used && r.reset !== "none" && r.reset !== "dawn") out.push(`${r.name} recharges`); });
  ctx.stats.resources.forEach(r => { if (r.derived && r.used && r.reset !== "none" && r.reset !== "dawn") out.push(`${r.name} recharges`); });
  const total = ctx.stats.hitDice.reduce((a, h) => a + h.max, 0), used = ctx.stats.hitDice.reduce((a, h) => a + h.used, 0);
  let regain = Math.min(used, allHitDice ? used : Math.max(1, Math.floor(total / 2)));
  if (regain) out.push(allHitDice ? "All Hit Dice" : `Regain ${regain} Hit Dice`);
  ctx.c.inventory.forEach(e => { const it = itemName(ctx, e.id);
    if (it && Object.values(e.spellUses ?? {}).some(n => n > 0)) out.push(`${it.name}: daily spell uses restored`); });
  ctx.c.inventory.forEach(e => { const it = itemName(ctx, e.id);
    if (it?.charges && e.charges?.used && (it.charges.reset === "long" || it.charges.reset === "short" || (it.charges.reset === "dawn" && !ctx.rules["holy-days"]))) out.push(`${it.name}: charges restored`); });
  if (c) {
    exhaustionDown(c);
    c.hp = { max: c.hp.max, current: hpMaxAfterExhaustion(ctx), temp: 0 };
    c.deathSaves = { successes: 0, failures: 0 }; c.spellSlots = {};
    c.resources.forEach(r => { if (r.reset === "short" || r.reset === "long") r.used = 0; });
    for (const r of ctx.stats.resources) if (r.derived && (r.reset === "short" || r.reset === "long")) delete c.uses[r.id];
    for (const k of Object.keys(c.choices)) if (k.startsWith("refill.")) delete c.choices[k];
    for (const h of [...ctx.stats.hitDice].sort((a, b) => +b.die.slice(1) - +a.die.slice(1))) {
      const back = Math.min(h.used, regain); regain -= back; c.hitDice[h.die] = { used: h.used - back };
    }
    c.inventory.forEach(e => { delete e.spellUses; });   // per-day item spells come back on any long rest
    c.inventory.forEach((e, i) => { const it = itemName(ctx, e.id);
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
const isGood = (ctx: RestCtx, o: RestOptions = {}) => {
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

export const restStandard: RuleModule = { id: "rest-standard", title: "Standard rests (short and long)", defaultOn: true, excludes: ["rest-excursion"], rests: [short, long], sections: [] };
export const restExcursion: RuleModule = { id: "rest-excursion", title: "Excursion resting (night's rest and good rest)", defaultOn: false, excludes: ["rest-standard"], rests: [night], sections: [] };
