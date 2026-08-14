import { cp, copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/icons", { recursive: true });
await copyFile("static/manifest.json", "dist/manifest.json");
await cp("static/icons", "dist/icons", { recursive: true });
