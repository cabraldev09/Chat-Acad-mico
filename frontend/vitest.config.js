import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// component tests: the same build rules of the app (icons, JSX in .js), in a simulated browser
export default mergeConfig(viteConfig, defineConfig({
  test: { environment: "jsdom", include: ["src/**/*.test.js"], globals: false, testTimeout: 10000 },
}));
