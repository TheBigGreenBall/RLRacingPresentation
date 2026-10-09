import { defineConfig } from "vite";
import { resolve } from "node:path";
const here = import.meta.dirname;

// Two pages: the reveal.js deck (index.html) and the standalone three.js scene (car3d.html) that the deck
// loads inside iframes. base './' keeps every asset path relative so dist/ works from any folder or file://.
export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(here, "index.html"),
        car3d: resolve(here, "car3d.html"),
      },
    },
  },
  server: { port: 5173 },
});
