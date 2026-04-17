import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@neither/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/game/**"],
      thresholds: { lines: 85 },
    },
  },
});
