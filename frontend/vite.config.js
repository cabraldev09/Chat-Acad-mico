import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import iconMap from "./src/icons/map.js";

// Every `lucide-react` import (named, or one icon file) is served by the Phosphor duotone shim (src/icons/phosphor-shim.js): one place changes all the icons.
const phosphorForLucide = () => {
  const SHIM = fileURLToPath(new URL("./src/icons/phosphor-shim.js", import.meta.url));
  return {
    name: "phosphor-for-lucide",
    enforce: "pre",
    resolveId(id) {
      if (id === "lucide-react") return SHIM;
      const m = id.match(/^lucide-react\/dist\/esm\/icons\/([a-z0-9-]+)$/);
      if (m) return `\0lucide-one:${m[1].split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
      return null;
    },
    load(id) {
      if (id.startsWith("\0lucide-one:")) {
        const name = id.slice("\0lucide-one:".length);
        return `import { ${name} } from "${SHIM.replace(/\\/g, "/")}";\nexport default ${name};`;
      }
      return null;
    },
  };
};

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

// which version of the code this build is: the browser compares it with /version.json to know when it is out of date
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 8) || Date.now().toString(36);
const versionFile = () => ({
  name: "version-file",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [
    phosphorForLucide(),
    versionFile(),
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
    sourcemap: false,  // the maps would publish the source of the whole screen (about 17 MB)
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
    __BUILD_ID__: JSON.stringify(BUILD_ID),
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
