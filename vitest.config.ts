import { defineConfig } from "vitest/config";
// whole-session UI tests drive every layout and take 4-5 s on their own; under a full parallel run the 5 s default flakes
export default defineConfig({ test: { globals: true, environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 15000 } });
