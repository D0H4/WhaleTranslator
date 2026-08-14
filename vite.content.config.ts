import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/content/index.tsx"),
      name: "WhaleTranslatorContent",
      formats: ["iife"],
      fileName: () => "content.js"
    }
  }
});
