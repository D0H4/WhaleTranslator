# Content bundle `process` runtime fix

Date: 2026-08-14

## Problem

The Manifest V3 content-script IIFE currently contains React CommonJS guards such as `process.env.NODE_ENV`. Browser page contexts do not provide Node.js `process`, so the injected script throws `ReferenceError: process is not defined` before WhaleTranslator can register its message listener. The service worker then reports `WhaleTranslator command failed` because the command cannot reach a working content runtime.

## Selected approach

Define `process.env.NODE_ENV` as the compile-time string `"production"` in the content-script Vite configuration. Vite/Rollup can then remove React's development branch while producing a self-contained browser IIFE. Do not add a `window.process` shim and do not expose a new global on the host page.

## Verification contract

Add a post-build verifier that reads the generated JavaScript artifacts and fails when a Node-only `process.env` reference remains. Run it from the normal production build so the defect cannot silently return after dependency or bundler upgrades.

Verification must cover:

- ESLint and TypeScript checks.
- Existing unit and component tests.
- Production build plus the new artifact verifier.
- Direct browser injection of `dist/content.js` into a normal HTTP page with a minimal mocked extension runtime.
- Confirmation that the content runtime mounts and accepts `translate-selection` without any `process is not defined` console or page error.

## Scope

Only build-time environment replacement and distribution verification change. Translation behavior, shortcuts, permissions, API-key handling, camelAI requests, and UI design remain unchanged.

## Failure handling

If a future build emits `process.env`, the build exits non-zero with the offending artifact path. The verifier must not inspect or require secrets.
