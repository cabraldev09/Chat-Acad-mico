import { defineConfig } from "vitest/config";
import path from "node:path";

// The analysis code was brought from another project that wrote imports as "@/domain/...": the tests keep them.
const root = path.resolve(import.meta.dirname, "src/analysis");
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/analysis/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["tests/analysis/setup.ts"],
  },
  resolve: {
    alias: [
      { find: /^@\/domain\/(.*)$/, replacement: `${root}/domain/$1` },
      { find: /^@\/services\/(.*)$/, replacement: `${root}/services/$1` },
      { find: /^@\/lib\/(.*)$/, replacement: `${root}/lib/$1` },
      { find: /^@\/generated\/(.*)$/, replacement: `${root}/generated/$1` },
    ],
  },
});
