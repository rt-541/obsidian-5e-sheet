import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; })
    .filter(p => p.endsWith(".ts"));
}
const exists = (d: string) => { try { return statSync(d).isDirectory(); } catch { return false; } };

describe("architecture guards", () => {
  it("pure layers never import obsidian", () => {
    for (const d of ["src/core", "src/content", "src/rules"].filter(exists))
      for (const f of files(d)) expect(readFileSync(f, "utf8"), f).not.toMatch(/from\s+["']obsidian["']/);
  });
  it("no Node built-ins under src (mobile)", () => {
    for (const f of files("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/from\s+["'](node:|fs|path|child_process|os)["']|require\(|\bprocess\.|\bBuffer\b/);
  });
  it("no HTML string injection in UI code", () => {
    for (const d of ["src/ui", "src/obsidian"].filter(exists))
      for (const f of files(d)) expect(readFileSync(f, "utf8"), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
  it("inventory items are read through the resolver, not straight from the registry", () => {
    const ok = ["src/core/item-entry.ts", "src/ui/details.ts", "src/obsidian/save-item.ts"];
    for (const f of files("src")) if (!ok.includes(f.replace(/\\/g, "/"))) expect(readFileSync(f, "utf8"), f).not.toContain('get<ItemData>("item"');
  });
  it("every text box has a type, so Obsidian styles it", () => {
    for (const f of files("src/ui")) for (const call of readFileSync(f, "utf8").split('h("input"').slice(1))
      expect(call.slice(0, Math.max(0, call.indexOf("on:")) || 300), f).toMatch(/type:/);
  });
  it("only the edition table names an edition", () => {
    const ok = ["src/core/edition.ts", "src/content/edition.ts"];
    for (const f of files("src")) if (!ok.includes(f.replace(/\\/g, "/")))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/[=!]==?\s*["']20(14|24)["']|case\s+["']20(14|24)["']/);
  });
});
