import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// `site/data/` is the publish target (CLAUDE.md); the copy serves it at /data/ in dev
// and places it under dist/data/ in the build.
export default defineConfig({
  plugins: [
    preact(),
    viteStaticCopy({ targets: [{ src: "data/**/*", dest: "." }], silent: true }),
  ],
  build: { target: "es2022" },
});
