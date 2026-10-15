import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import iconMap from "./src/icons/map.js";

// Serve every `@material-ui/icons/<Name>` import (and the barrel) from Lucide.
const lucideForMaterialIcons = () => {
  const BARREL = "\0md-icons-barrel";
  return {
    name: "lucide-for-material-icons",
    enforce: "pre",
    resolveId(id) {
      if (id === "@material-ui/icons") return BARREL;
      const m = id.match(/^@material-ui\/icons\/([A-Za-z0-9]+)$/);
      if (m && iconMap[m[1]]) return `\0md-icon:${m[1]}`;
      return null;
    },
    load(id) {
      if (id.startsWith("\0md-icon:")) {
        const name = id.slice("\0md-icon:".length);
        const target = iconMap[name];
        if (target.startsWith("@brand/")) {
          return `import { ${target.slice(7)} as I } from "/src/icons/brands.js";
import wrap from "/src/icons/wrap.js";
export default wrap(I);`;
        }
        return `import { ${target} as I } from "lucide-react";
import wrap from "/src/icons/wrap.js";
export default wrap(I);`;
      }
      if (id === BARREL) {
        return [
          `import * as L from "lucide-react";`,
          `import * as B from "/src/icons/brands.js";`,
          `import wrap from "/src/icons/wrap.js";`,
          ...Object.entries(iconMap).map(([k, v]) =>
            v.startsWith("@brand/")
              ? `export const ${k} = wrap(B.${v.slice(7)});`
              : `export const ${k} = wrap(L.${v});`
          ),
        ].join("\n");
      }
      return null;
    },
  };
};

export default defineConfig({
  plugins: [
    // the screens ported from the original analysis system use its Tailwind classes (see src/styles/orig.css)
    tailwindcss(),
    lucideForMaterialIcons(),
    react({
      jsxRuntime: "classic",
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
    sourcemap: true,
    rollupOptions: {
      output: {
        // keep this split as it is: separating react / jss / clsx from material-ui creates a circular chunk and the
        // production page stays blank ("Cannot access before initialization"). Pages are already split by route.
        manualChunks: {
          "material-ui": [
            "@material-ui/core",
            "lucide-react",
            "@material-ui/lab",
          ],
        },
      },
    },
  },
  envPrefix: "VITE_",
  esbuild: {
    // real component names in the error reports of the screens (instead of one-letter names)
    keepNames: true,
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
    include: [
      "mic-recorder-to-mp3",
      "@material-ui/core",
      "lucide-react",
      "@material-ui/lab",
    ],
    exclude: [],
  },
  resolve: {
    alias: {
      "jss-plugin-globalThis": "jss-plugin-global",
    },
  },
});
