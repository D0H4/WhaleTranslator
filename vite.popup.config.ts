import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "popup.html"),
      output: {
        entryFileNames: "popup.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css") ? "popup.css" : "assets/[name]-[hash][extname]"
      }
    }
  }
});
