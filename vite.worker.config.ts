import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/background/service-worker.ts"),
      name: "WhaleTranslatorWorker",
      formats: ["iife"],
      fileName: () => "service-worker.js"
    }
  }
});
