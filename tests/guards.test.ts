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
});
