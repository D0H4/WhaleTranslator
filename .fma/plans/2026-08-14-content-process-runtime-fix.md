# Content Bundle Process Runtime Fix Implementation Plan

**Goal:** Produce a self-contained Manifest V3 content bundle that never evaluates Node.js `process` in the browser.

**Architecture:** Vite replaces React's exact `process.env.NODE_ENV` guard with the production string while compiling the content IIFE. A focused post-build script scans every shipped JavaScript artifact and fails the normal build if a Node-only `process.env` access returns.

**Tech Stack:** Vite 8, TypeScript 6, Node.js ESM, React 19, Playwright CLI

---

### Task 1: Add a failing distribution guard

**Files:**
- Create: `scripts/verify-dist.mjs`
- Modify: `package.json`

- [x] **Step 1: Create the verifier**

```js
import { readFile, readdir } from "node:fs/promises";

const artifacts = (await readdir("dist"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `dist/${name}`);
const nodeEnvironmentPatterns = [
  /\bprocess\.env\b/u,
  /\bprocess\[\s*["']env["']\s*\]/u
];

for (const artifact of artifacts) {
  const source = await readFile(artifact, "utf8");
  if (nodeEnvironmentPatterns.some((pattern) => pattern.test(source))) {
    throw new Error(`Node runtime reference found in ${artifact}`);
  }
}

process.stdout.write(`Verified ${artifacts.length} JavaScript artifacts.\n`);
```

- [x] **Step 2: Wire the verifier into the production build**

Add `"verify:dist": "node scripts/verify-dist.mjs"` and append `&& npm run verify:dist` to `build` in `package.json`.

- [x] **Step 3: Run the build and prove the regression guard fails**

Run: `npm run build`

Expected: non-zero exit with `Node runtime reference found in dist/content.js`.

### Task 2: Compile React's content bundle for the browser

**Files:**
- Modify: `vite.content.config.ts`

- [x] **Step 1: Add the exact compile-time replacement**

```ts
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
```

- [x] **Step 2: Rebuild and verify the bundle**

Run: `npm run build`

Expected: exit 0 and `Verified 3 JavaScript artifacts.`

- [x] **Step 3: Confirm the output manually**

Run: `rg -n "process\\.env|process\\[" dist/*.js`

Expected: no matches.

### Task 3: Run the complete regression suite

**Files:**
- Verify: `dist/content.js`
- Verify: `dist/service-worker.js`
- Verify: `dist/popup.js`

- [x] **Step 1: Run all repository checks**

Run: `npm run check`

Expected: ESLint passes, TypeScript passes, all Vitest tests pass, production build passes, and distribution verification reports success.

- [x] **Step 2: Inject the production content bundle in a real browser page**

Start the local Vite preview, create a normal HTTP page with a minimal mocked `chrome.runtime`, inject `dist/content.js`, then dispatch `{ kind: "command", command: "translate-selection" }`.

Expected: no page error or console error containing `process is not defined`; the extension root mounts and the host receives focus after the empty translation panel opens.

- [x] **Step 3: Record the result**

Capture a screenshot under `output/playwright/process-runtime-fix.png` and report the exact check results. No Git commit step is possible because the workspace is not a Git repository.
