# WhaleTranslator Extension Implementation Plan

**Goal:** Build a production-ready Whale/Chromium Manifest V3 extension that translates selected, entered, or visible page text through camelAI `deepseek-v4-flash` using accessible keyboard-first UI.

**Architecture:** A service worker owns commands, settings, secrets, and camelAI streaming. An on-demand content runtime renders a React panel inside a Shadow DOM and owns reversible page mutations. A separate React toolbar popup manages settings; shared pure modules define messages, prompts, languages, batching, and errors.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Manifest V3, Chrome Extensions APIs, Vitest, Testing Library, jsdom, ESLint, CSS custom properties.

---

## Execution constraints

- Never read an `.env` file. This extension does not use one.
- Do not edit `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`.
- The current managed workspace prevents creation of `.git`; the commit commands below document the intended checkpoints for a normal writable checkout and will be skipped in this session if that restriction remains.
- Preserve the approved design in `.fma/specs/2026-08-13-whale-translator-design.md`.
- Do not request persistent `<all_urls>` access. Page code is injected only after a toolbar action or Commands API shortcut grants `activeTab`.

## File map

### Project and build

- `package.json` — scripts and pinned runtime/development dependencies.
- `tsconfig.json` — strict browser and extension TypeScript configuration.
- `src/vite-env.d.ts` — Vite inline-CSS module typing.
- `eslint.config.js` — TypeScript and React Hooks lint rules.
- `vite.config.ts` — Vitest/jsdom configuration.
- `vite.content.config.ts` — self-contained IIFE content-runtime build.
- `vite.worker.config.ts` — self-contained IIFE service-worker build.
- `vite.popup.config.ts` — popup HTML/React build.
- `scripts/copy-static.mjs` — copies manifest and raster icons into `dist`.
- `popup.html` — toolbar popup HTML entry.
- `static/manifest.json` — Manifest V3 contract.
- `static/icon-source.svg` — editable source for the original WhaleTranslator mark.
- `static/icons/icon-{16,32,48,128}.png` — raster manifest icons.

### Shared domain

- `src/shared/languages.ts` — fixed target-language catalog and lookup.
- `src/shared/settings.ts` — default settings and validation.
- `src/shared/messages.ts` — discriminated extension message/port protocol.
- `src/shared/prompts.ts` — plain-text and structured page-translation prompts.
- `src/shared/errors.ts` — normalized user-facing error types.

### Background

- `src/background/sse.ts` — byte-safe SSE parsing.
- `src/background/camel-client.ts` — authenticated camelAI streaming client.
- `src/background/storage.ts` — trusted-context settings persistence.
- `src/background/service-worker.ts` — commands, injection, settings RPC, ports, cancellation.

### Content runtime

- `src/content/index.tsx` — idempotent Shadow DOM bootstrap and command listener.
- `src/content/translation-gateway.ts` — typed long-lived port client.
- `src/content/page-text.ts` — eligible text collection and deterministic batching.
- `src/content/page-translator.ts` — two-worker page translation, retry, progress, restore.
- `src/content/TranslatorShell.tsx` — panel/page-status orchestration.
- `src/content/panel/TranslatorPanel.tsx` — accessible dialog markup and states.
- `src/content/panel/useSpeech.ts` — mutually exclusive Web Speech playback.
- `src/content/panel/useFocusTrap.ts` — focus containment and restoration.
- `src/content/panel/icons.tsx` — small packaged SVG icon components.
- `src/content/panel/panel.css` — isolated semantic tokens and responsive UI.

### Popup and preview

- `src/popup/main.tsx` — popup React entry.
- `src/popup/SettingsApp.tsx` — settings, connection test, privacy and shortcut guidance.
- `src/popup/popup.css` — compact settings styling using the same visual tokens.
- `preview.html` and `src/preview/main.tsx` — development-only rendered state fixture.

### Tests and documentation

- `src/test/setup.ts` — DOM matcher and browser API test setup.
- `tests/manifest.test.ts` — permission, command, and build contract.
- `tests/shared/settings.test.ts` — settings normalization.
- `tests/background/sse.test.ts` — streaming boundaries and malformed events.
- `tests/background/camel-client.test.ts` — request and HTTP error behavior.
- `tests/content/page-text.test.ts` — extraction and batching.
- `tests/content/page-translator.test.ts` — concurrency, retry, cancel, restore.
- `tests/content/TranslatorPanel.test.tsx` — interaction and accessibility states.
- `tests/popup/SettingsApp.test.tsx` — popup settings and connection states.
- `README.md` — build, load, configure, use, privacy, limitations.

## Task 1: Scaffold a deterministic extension build

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/vite-env.d.ts`
- Create: `eslint.config.js`
- Create: `vite.config.ts`
- Create: `vite.content.config.ts`
- Create: `vite.worker.config.ts`
- Create: `vite.popup.config.ts`
- Create: `scripts/copy-static.mjs`
- Create: `popup.html`
- Create: `static/manifest.json`
- Create: `src/test/setup.ts`
- Test: `tests/manifest.test.ts`

- [ ] **Step 1: Write the manifest contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("static/manifest.json", "utf8"));

describe("extension manifest", () => {
  it("uses temporary page access and only the camelAI host", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.host_permissions).toEqual(["https://stream.camelai.com/*"]);
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });

  it("declares the requested shortcuts and build entries", () => {
    expect(manifest.commands["translate-selection"].suggested_key.default).toBe("Alt+T");
    expect(manifest.commands["toggle-page-translation"].suggested_key.default).toBe("Alt+Shift+T");
    expect(manifest.background.service_worker).toBe("service-worker.js");
    expect(manifest.action.default_popup).toBe("popup.html");
  });
});
```

- [ ] **Step 2: Create the package and strict compiler configuration**

Use Node `>=22.13` and these scripts: `build`, `test`, `test:watch`, `typecheck`, `lint`, and `check` where `check` runs lint, typecheck, tests, then build. Pin React `19.2.8`, React DOM `19.2.8`, Vite `8.2.0`, TypeScript `6.0.3`, Vitest `4.1.10`, `@vitejs/plugin-react` `6.0.4`, Testing Library React `16.3.2`, Testing Library DOM `10.4.1`, Testing Library user-event `14.6.1`, jest-dom `7.0.0`, jsdom `29.0.1`, `@types/chrome` `0.2.2`, `@types/node` `24.0.10`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, ESLint `9.39.5`, `@eslint/js` `9.39.5`, typescript-eslint `8.65.0`, React Hooks ESLint plugin `7.1.1`, and globals `17.7.0`. Commit the resulting `package-lock.json`.

The compiler contract is:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "types": ["node", "chrome", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

- [ ] **Step 3: Create the three production build entries**

Build `src/content/index.tsx` as `dist/content.js` and `src/background/service-worker.ts` as `dist/service-worker.js`, each as a self-contained IIFE with `emptyOutDir` enabled only for the first build. Build `popup.html` last and emit `dist/popup.html`, `dist/popup.js`, and `dist/popup.css`. Then run `scripts/copy-static.mjs`:

```js
import { cp, copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/icons", { recursive: true });
await copyFile("static/manifest.json", "dist/manifest.json");
await cp("static/icons", "dist/icons", { recursive: true });
```

- [ ] **Step 4: Write the exact Manifest V3 file**

```json
{
  "manifest_version": 3,
  "name": "WhaleTranslator",
  "version": "0.1.0",
  "description": "Translate selected text or the current page with camelAI.",
  "minimum_chrome_version": "114",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["https://stream.camelai.com/*"],
  "background": { "service_worker": "service-worker.js" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  "action": {
    "default_title": "WhaleTranslator settings",
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "commands": {
    "translate-selection": {
      "suggested_key": { "default": "Alt+T" },
      "description": "Open WhaleTranslator"
    },
    "toggle-page-translation": {
      "suggested_key": { "default": "Alt+Shift+T" },
      "description": "Translate or restore this page"
    }
  }
}
```

- [ ] **Step 5: Install dependencies and run the contract test**

Run: `npm install`

Run: `npm test -- tests/manifest.test.ts`

Expected: both manifest tests pass; build is still expected to fail because entry modules are not created until later tasks.

- [ ] **Step 6: Commit the scaffold checkpoint**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js vite*.config.ts scripts popup.html static src/test tests/manifest.test.ts
git commit -m "chore: scaffold WhaleTranslator extension"
```

## Task 2: Define the shared language, settings, and message contracts

**Files:**
- Create: `src/shared/languages.ts`
- Create: `src/shared/settings.ts`
- Create: `src/shared/messages.ts`
- Create: `src/shared/errors.ts`
- Create: `src/shared/prompts.ts`
- Test: `tests/shared/settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/shared/settings";

describe("normalizeSettings", () => {
  it("defaults to Korean and an empty key", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("trims a key and rejects an unsupported target", () => {
    expect(normalizeSettings({ apiKey: " key ", targetLanguage: "xx" })).toEqual({
      apiKey: "key",
      targetLanguage: "ko"
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- tests/shared/settings.test.ts`

Expected: FAIL because `src/shared/settings.ts` does not exist.

- [ ] **Step 3: Implement the target-language catalog and settings normalization**

Export this exact catalog and derive `LanguageCode` from it:

```ts
export const LANGUAGES = [
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "zh-CN", label: "Simplified Chinese", nativeLabel: "简体中文" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" }
] as const;
```

Define `ExtensionSettings`, `PublicSettings`, `DEFAULT_SETTINGS`, `normalizeSettings`, and `toPublicSettings`. `PublicSettings` exposes only `hasApiKey` and `targetLanguage`, never the key.

- [ ] **Step 4: Define one typed protocol for commands, RPC, and translation ports**

Use discriminated unions with these message kinds:

```ts
export type PageCommand = "translate-selection" | "toggle-page-translation";
export type RuntimeCommand = { kind: "command"; command: PageCommand };
export type SettingsRequest =
  | { kind: "settings:get" }
  | { kind: "settings:save"; apiKey?: string; targetLanguage: LanguageCode }
  | { kind: "settings:test"; apiKey?: string };
export type TranslationInput =
  | { mode: "text"; text: string; targetLanguage: LanguageCode }
  | { mode: "page"; items: ReadonlyArray<{ id: string; text: string }>; targetLanguage: LanguageCode }
  | { mode: "connection-test" };
export type TranslationPortInput =
  | { kind: "start"; requestId: string; input: TranslationInput }
  | { kind: "cancel"; requestId: string };
export type TranslationPortOutput =
  | { kind: "started"; requestId: string }
  | { kind: "delta"; requestId: string; text: string }
  | { kind: "complete"; requestId: string; text: string }
  | { kind: "error"; requestId: string; error: PublicError };
```

- [ ] **Step 5: Implement prompts and public errors**

`buildTextMessages` must request translation only, auto-detect the source, preserve paragraphs/names/URLs/punctuation, and name the target language. `buildPageMessages` must demand strict JSON shaped as `{"items":[{"id":"...","text":"..."}]}` with exactly the input IDs. Define error codes `missing-key`, `unauthorized`, `rate-limited`, `network`, `service`, `invalid-response`, `restricted-page`, and `unknown`, each mapped to Korean title/action copy.

- [ ] **Step 6: Run tests, typecheck, and commit**

Run: `npm test -- tests/shared/settings.test.ts && npm run typecheck`

Expected: settings tests pass and TypeScript reports no errors.

```bash
git add src/shared tests/shared
git commit -m "feat: define translation domain contracts"
```

## Task 3: Parse SSE and call camelAI safely

**Files:**
- Create: `src/background/sse.ts`
- Create: `src/background/camel-client.ts`
- Test: `tests/background/sse.test.ts`
- Test: `tests/background/camel-client.test.ts`

- [ ] **Step 1: Write the SSE boundary tests**

Cover one event split across byte chunks, a Korean UTF-8 character split across chunks, two events in one chunk, ignored comments/blank data, malformed JSON, `[DONE]`, and an empty completion. Use a helper that creates a `ReadableStream<Uint8Array>` from byte slices and assert emitted assistant deltas in order.

Core assertion:

```ts
const chunks = splitBytes('data: {"choices":[{"delta":{"content":"안녕"}}]}\n\ndata: [DONE]\n\n', [9, 31]);
await expect(collectAssistantDeltas(streamFrom(chunks))).resolves.toEqual(["안녕"]);
```

- [ ] **Step 2: Verify the SSE tests fail**

Run: `npm test -- tests/background/sse.test.ts`

Expected: FAIL because `collectAssistantDeltas` is missing.

- [ ] **Step 3: Implement a byte-safe parser**

Export `collectAssistantDeltas(stream, onDelta?)`. Use `new TextDecoder("utf-8")` with `{ stream: true }`, retain the unfinished line buffer between reads, join consecutive `data:` lines for one SSE event, stop on `[DONE]`, and throw `CamelClientError("invalid-response")` when an event cannot be decoded or no assistant text was received.

- [ ] **Step 4: Write client request/error tests**

Mock `globalThis.fetch` and assert:

- URL is exactly `https://stream.camelai.com/v1/chat/completions`.
- Authorization is `Bearer secret` and the body contains model `deepseek-v4-flash`, `stream: true`, and the supplied messages.
- `401`, `403`, `429`, `5xx`, missing response bodies, fetch rejection, and abort map to their intended codes.
- Delta callbacks receive chunks and the resolved value is their concatenation.

- [ ] **Step 5: Implement the camel client**

```ts
export async function streamCamelCompletion(options: {
  apiKey: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<string>
```

Use no retries in this low-level function. Read short error response bodies only for diagnostics, never include keys or full source text in thrown/logged errors, and never call `console.log` with the request.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/background/sse.test.ts tests/background/camel-client.test.ts`

Expected: all SSE and camel client tests pass.

```bash
git add src/background/sse.ts src/background/camel-client.ts tests/background
git commit -m "feat: add camelAI streaming client"
```

## Task 4: Implement trusted settings storage and the service worker

**Files:**
- Create: `src/background/storage.ts`
- Create: `src/background/service-worker.ts`
- Test: `tests/background/storage.test.ts`
- Test: `tests/background/service-worker.test.ts`

- [ ] **Step 1: Write storage tests with a fake `chrome.storage.local`**

Assert that initialization calls `setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` when available, missing values normalize to defaults, saving trims the key, omitting `apiKey` preserves the existing key, and all getters sent to UI return only `PublicSettings`.

- [ ] **Step 2: Implement storage behind a small adapter**

Export `lockStorageAccess`, `readSettings`, and `saveSettings`. Use the single storage key `whaleTranslator.settings`. Catch only the absence/failure of `setAccessLevel`; allow read/write failures to surface as normalized errors.

- [ ] **Step 3: Write service-worker command and port tests**

Inject fake `tabs`, `scripting`, `runtime`, and fetch adapters. Assert that a command:

1. queries `{ active: true, lastFocusedWindow: true }`,
2. rejects missing IDs and `chrome:`, `whale:`, `edge:`, `about:`, and extension URLs,
3. injects `content.js`,
4. sends `{ kind: "command", command }` only after injection resolves.

Assert that a translation port loads the key inside the worker, emits `started`, ordered `delta`, and `complete`, maps missing keys before fetch, and aborts on `cancel` or disconnect.

- [ ] **Step 4: Implement service-worker event registration**

At module evaluation, register `runtime.onInstalled`, `commands.onCommand`, `runtime.onMessage`, and `runtime.onConnect` listeners. Keep testable logic in exported factories so tests do not rely on global `chrome`. Store active `AbortController`s by request ID and remove them in `finally`.

For translation inputs:

- text → `buildTextMessages`;
- page → `buildPageMessages` and return accumulated JSON text unchanged;
- connection test → request `Return exactly OK` and require trimmed output `OK`.

- [ ] **Step 5: Run background tests and commit**

Run: `npm test -- tests/background && npm run typecheck`

Expected: all background tests pass and no key is present in any outgoing tab message assertion.

```bash
git add src/background tests/background
git commit -m "feat: coordinate secure translation requests"
```

## Task 5: Collect and batch reversible page text

**Files:**
- Create: `src/content/page-text.ts`
- Test: `tests/content/page-text.test.ts`

- [ ] **Step 1: Write eligibility tests**

Build a jsdom fixture containing normal paragraphs, nested inline text, punctuation, a URL, hidden content, `aria-hidden`, `translate="no"`, `contenteditable`, form controls, `script`, `style`, `code`, `pre`, `svg`, and an element marked `data-whale-translator-root`. Assert only ordinary rendered prose is captured and whitespace around captured strings is preserved separately.

- [ ] **Step 2: Write batching tests**

Assert `createBatches(entries)` produces batches with at most 24 entries and at most 6,000 Unicode code points, treats a single longer node as its own batch, and uses deterministic IDs `wt-0`, `wt-1`, and onward.

- [ ] **Step 3: Verify the page-text tests fail**

Run: `npm test -- tests/content/page-text.test.ts`

Expected: FAIL because `collectPageText` and `createBatches` do not exist.

- [ ] **Step 4: Implement collection without element replacement**

Export:

```ts
export interface PageTextEntry {
  id: string;
  node: Text;
  originalText: string;
  leadingWhitespace: string;
  trailingWhitespace: string;
  translatableText: string;
}
export function collectPageText(root: HTMLElement): PageTextEntry[];
export function createBatches(entries: readonly PageTextEntry[]): PageTextEntry[][];
```

Use a `TreeWalker` over text nodes, inspect ancestors with `closest`, check computed `display`, `visibility`, and opacity, and reject strings that contain no Unicode letters. Do not mutate the DOM in this module.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/content/page-text.test.ts`

Expected: eligibility and boundary tests pass.

```bash
git add src/content/page-text.ts tests/content/page-text.test.ts
git commit -m "feat: collect translatable page text"
```

## Task 6: Translate, validate, retry, and restore page batches

**Files:**
- Create: `src/content/page-translator.ts`
- Test: `tests/content/page-translator.test.ts`

- [ ] **Step 1: Write controller tests**

Use detached and connected `Text` nodes plus a fake batch gateway. Assert:

- no more than two batch promises are active simultaneously;
- a valid response applies text while retaining captured leading/trailing whitespace;
- duplicate, missing, or unknown IDs cause one retry and no partial mutation;
- a second invalid result pauses with the first failed batch index;
- retry continues from failures without retranslating completed batches;
- cancel stops queued work;
- restore aborts work and restores every still-connected node exactly;
- host-replaced/disconnected nodes are skipped.

- [ ] **Step 2: Verify the controller tests fail**

Run: `npm test -- tests/content/page-translator.test.ts`

Expected: FAIL because `PageTranslator` is missing.

- [ ] **Step 3: Implement strict page-response parsing**

Export `parsePageResponse(raw, expectedIds)`. Strip one optional Markdown code fence, parse JSON, require a top-level `items` array, require each item to have only usable string `id` and `text` values, and require the ID set to match exactly. Return a `Map<string,string>` or throw `invalid-response`.

- [ ] **Step 4: Implement the two-worker state machine**

Expose this public contract:

```ts
export type PageTranslationState =
  | { status: "idle" }
  | { status: "running"; completed: number; total: number }
  | { status: "paused"; completed: number; total: number; failedBatch: number; error: PublicError }
  | { status: "complete"; completed: number; total: number };

export class PageTranslator {
  start(root: HTMLElement, targetLanguage: LanguageCode): Promise<void>;
  retry(): Promise<void>;
  cancel(): void;
  restore(): void;
  subscribe(listener: (state: PageTranslationState) => void): () => void;
}
```

The constructor accepts a batch gateway and concurrency defaults to two. Each batch gets one strict-repair retry. `restore()` is idempotent.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/content/page-translator.test.ts`

Expected: concurrency, retry, cancellation, and restoration tests pass.

```bash
git add src/content/page-translator.ts tests/content/page-translator.test.ts
git commit -m "feat: add reversible page translation"
```

## Task 7: Build the content translation gateway and accessible panel behavior

**Files:**
- Create: `src/content/translation-gateway.ts`
- Create: `src/content/panel/useSpeech.ts`
- Create: `src/content/panel/useFocusTrap.ts`
- Create: `src/content/panel/icons.tsx`
- Create: `src/content/panel/TranslatorPanel.tsx`
- Test: `tests/content/TranslatorPanel.test.tsx`

- [ ] **Step 1: Write panel interaction tests**

Render with a fake gateway and verify:

- selected text is submitted once on open;
- empty input receives focus and does not submit;
- `Ctrl+Enter` and `Meta+Enter` submit non-empty edited text;
- target changes affect the next request;
- deltas appear in order, stop cancels, retry reuses the source, and stale request IDs are ignored;
- `Escape` closes and returns focus;
- focus wraps from the last to first control and back;
- copy exposes success/failure status;
- source speech and translation speech stop each other and stop on close;
- idle, streaming, success, missing-key, unauthorized, rate-limit, network, and service states have accessible names and announcements.

- [ ] **Step 2: Verify the component tests fail**

Run: `npm test -- tests/content/TranslatorPanel.test.tsx`

Expected: FAIL because the panel modules do not exist.

- [ ] **Step 3: Implement a request-scoped port gateway**

`translate(input, handlers)` opens `chrome.runtime.connect({ name: "whale-translator" })`, posts one `start`, filters all outputs by its generated request ID, exposes `cancel`, and disconnects after complete/error. The API key is absent from the input type and every port message.

- [ ] **Step 4: Implement focus, speech, copy, and panel state**

`TranslatorPanel` receives `initialText`, `defaultTarget`, `gateway`, and `onClose`. Use native `<button>`, `<textarea>`, and `<select>` controls, `role="dialog"`, `aria-modal="true"`, a polite status region, and an assertive error region. Use `Intl.Segmenter` when available for displayed character count and `Array.from(text).length` as fallback. Use `speechSynthesis.cancel()` before every new utterance and on unmount.

- [ ] **Step 5: Run component tests and commit**

Run: `npm test -- tests/content/TranslatorPanel.test.tsx`

Expected: all keyboard, request-state, utility, and announcement tests pass.

```bash
git add src/content/translation-gateway.ts src/content/panel tests/content/TranslatorPanel.test.tsx
git commit -m "feat: build accessible translation panel"
```

## Task 8: Integrate the Shadow DOM runtime and page-status controls

**Files:**
- Create: `src/content/index.tsx`
- Create: `src/content/TranslatorShell.tsx`
- Test: `tests/content/runtime.test.tsx`

- [ ] **Step 1: Write runtime tests**

Assert repeated injection creates one host with `data-whale-translator-root`, one React root, and one message listener. Assert `translate-selection` captures selection before focus changes, reopens or refreshes the existing single panel without duplicating it, and `toggle-page-translation` starts/restores one `PageTranslator`. Verify page status exposes progress, cancel, retry, and restore buttons.

- [ ] **Step 2: Implement an idempotent bootstrap**

Store runtime state on `globalThis` under `Symbol.for("whale-translator.runtime")`. Create a fixed host, attach `shadowRoot({ mode: "closed" })`, append a `<style>` containing the imported `panel.css?inline`, append a React mount node, and tag the host for page-text exclusion. Register the `chrome.runtime.onMessage` listener once.

- [ ] **Step 3: Implement `TranslatorShell` orchestration**

Load only `PublicSettings`. For `translate-selection`, normalize `window.getSelection()?.toString()` before rendering, open the dialog, and pass selected text for automatic submission. For page mode, show a compact bottom-right status surface and map its controls to `PageTranslator.cancel`, `retry`, and `restore`. Missing settings opens the panel in its missing-key state rather than failing silently.

- [ ] **Step 4: Run runtime tests and commit**

Run: `npm test -- tests/content/runtime.test.tsx tests/content/TranslatorPanel.test.tsx`

Expected: the runtime remains singleton and both command flows pass.

```bash
git add src/content/index.tsx src/content/TranslatorShell.tsx tests/content/runtime.test.tsx
git commit -m "feat: integrate on-demand page runtime"
```

## Task 9: Apply the approved visual system

**Files:**
- Create: `src/content/panel/panel.css`
- Modify: `src/content/panel/TranslatorPanel.tsx`
- Modify: `src/content/TranslatorShell.tsx`
- Create: `preview.html`
- Create: `src/preview/main.tsx`

- [ ] **Step 1: Create semantic tokens inside the Shadow DOM**

Define tokens for canvas `#101214`, surface `#171a1e`, elevated surface `#1d2126`, border `#343a42`, primary text `#f4f7f8`, muted text `#9ca6ad`, accent `#40d6c2`, accent-strong `#18bda9`, danger `#ff6b74`, warning `#f2b84b`, success `#55d68b`, 8/12/16/24/32 spacing, 10/14/20 radii, and 120/180 ms motion. Use a platform sans stack; use a monospace stack only for counts and shortcut labels.

- [ ] **Step 2: Implement the responsive modal and state styling**

The overlay uses 16 px safe margins and a subtle neutral backdrop. The panel is `min(760px, calc(100vw - 32px))`, constrained to `calc(100vh - 32px)`, and never changes host `body` styles. On widths below 520 px, language controls wrap without reordering, footer groups wrap, and textarea/output heights reduce. At coarse pointers interactive controls are at least 44 px. At `prefers-reduced-motion: reduce`, remove transforms and transitions.

Use one horizontal streaming track, not a generic spinner. Error messages use the danger token but retain readable neutral body copy. Every icon button has hover, active, `:focus-visible`, disabled, and pressed states.

- [ ] **Step 3: Create a deterministic preview fixture**

`preview.html` renders a realistic article background and `src/preview/main.tsx` mounts the same `TranslatorPanel` with a fake streaming gateway. Query parameters select `idle`, `streaming`, `success`, `error`, and `page` states so screenshots can cover states without real API traffic.

- [ ] **Step 4: Run source tests and the UI scanner**

Run: `npm test -- tests/content && python3 /Users/doha/.codex/skills/craft-distinct-ui/scripts/scan_ui.py src --format json`

Expected: component tests pass; every scanner finding is either fixed or documented as a legitimate extension convention before continuing.

- [ ] **Step 5: Commit the visual implementation**

```bash
git add src/content src/preview preview.html tests/content
git commit -m "feat: apply WhaleTranslator visual system"
```

## Task 10: Build the settings popup

**Files:**
- Create: `src/popup/main.tsx`
- Create: `src/popup/SettingsApp.tsx`
- Create: `src/popup/popup.css`
- Test: `tests/popup/SettingsApp.test.tsx`

- [ ] **Step 1: Write popup tests**

Mock typed settings RPC and assert initial loading, masked saved-key state, reveal/hide, target-language selection, key trimming, save success, save failure, connection-test progress/success/failure, omitted key preserving a saved value, privacy disclosure, and shortcut-button tab creation.

- [ ] **Step 2: Verify popup tests fail**

Run: `npm test -- tests/popup/SettingsApp.test.tsx`

Expected: FAIL because `SettingsApp` is missing.

- [ ] **Step 3: Implement the popup UI and messages**

Use a 360 px compact layout with the original mark, status chip, password input, native language select, `Test connection`, and primary `Save` button. Do not render the stored key back into the input. Blank input means preserve the saved key; a separate `Remove key` button sends an explicit empty string after confirmation within the popup. State that translated text is sent to camelAI and local extension storage is not an OS keychain.

The shortcuts button calls:

```ts
await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
```

- [ ] **Step 4: Run popup tests and commit**

Run: `npm test -- tests/popup/SettingsApp.test.tsx`

Expected: all settings and connection states pass.

```bash
git add popup.html src/popup tests/popup
git commit -m "feat: add secure settings popup"
```

## Task 11: Create original icon assets and production documentation

**Files:**
- Create: `static/icon-source.svg`
- Create: `static/icons/icon-16.png`
- Create: `static/icons/icon-32.png`
- Create: `static/icons/icon-48.png`
- Create: `static/icons/icon-128.png`
- Create: `README.md`
- Modify: `static/manifest.json`

- [ ] **Step 1: Create and rasterize an original mark**

Draw a square teal field with a high-contrast dark whale-tail/speech-wave mark that remains legible at 16 px and does not reuse Whale Browser or Kagi assets. Rasterize a 512 px source thumbnail with macOS Quick Look, then resize it:

```bash
qlmanage -t -s 512 -o /private/tmp static/icon-source.svg
sips -z 16 16 /private/tmp/icon-source.svg.png --out static/icons/icon-16.png
sips -z 32 32 /private/tmp/icon-source.svg.png --out static/icons/icon-32.png
sips -z 48 48 /private/tmp/icon-source.svg.png --out static/icons/icon-48.png
sips -z 128 128 /private/tmp/icon-source.svg.png --out static/icons/icon-128.png
```

Open the 16 px and 128 px outputs and verify transparency, edge clarity, and recognizable silhouette.

- [ ] **Step 2: Write operating documentation**

Document prerequisites, `npm install`, `npm run build`, loading `dist` through Whale's unpacked-extension page, entering a camelAI key, both shortcuts, shortcut conflict handling, permissions, text sent to camelAI, local-key storage caveat, unsupported internal/PDF/frame content, whole-page restoration, and troubleshooting for every public error family.

- [ ] **Step 3: Validate manifest icons and documentation claims**

Run: `npm test -- tests/manifest.test.ts && file static/icons/*.png`

Expected: the manifest contract passes and all four assets report PNG with their declared square dimensions.

- [ ] **Step 4: Commit assets and documentation**

```bash
git add static README.md tests/manifest.test.ts
git commit -m "docs: package WhaleTranslator for local installation"
```

## Task 12: Complete integration, security, and rendered QA

**Files:**
- Modify only files implicated by failed checks.
- Create: `.design-taste/history.json` after all visual gates pass.

- [ ] **Step 1: Run the complete mechanical suite**

Run: `npm run check`

Expected: ESLint, TypeScript, all Vitest suites, and all three Vite builds pass; `dist` contains `manifest.json`, `content.js`, `service-worker.js`, `popup.html`, popup assets, and four icons.

- [ ] **Step 2: Inspect the packaged security boundary**

Run:

```bash
rg -n "CAMEL_API_KEY|Bearer [A-Za-z0-9]|<all_urls>|console\.(log|debug)" dist src static
rg -n "apiKey" src/content dist/content.js
```

Expected: no embedded credentials, persistent page permission, request logging, or content-runtime API-key access. Legitimate `Authorization: Bearer ${apiKey}` construction appears only in the bundled service worker.

- [ ] **Step 3: Render every required viewport and state**

Serve the preview fixture locally, then inspect 320, 375, 414, 768, and 1280-by-800 CSS-pixel viewports. Capture idle, streaming, success, each error family, page progress, paused page error, and completion. Repeat with reduced motion and keyboard-only traversal. Repair clipping, off-screen controls, broken focus, illegible contrast, host-style leakage, or accidental horizontal scrolling and re-run all viewports.

- [ ] **Step 4: Load the unpacked extension in Whale/Chromium**

Verify on one static article, one dynamic page, one form-heavy page, and one code-heavy page:

- `Alt + T` selected-text auto-submit;
- `Alt + T` empty manual entry;
- streamed output and cancellation;
- target-language changes;
- copy and both speech toggles;
- `Escape` focus return;
- `Alt + Shift + T` progressive replacement and exact second-press restore;
- cancel, malformed-batch retry, partial failure, retry, and restore;
- restricted internal page notice;
- toolbar settings save, remove, connection test, and shortcut guidance.

- [ ] **Step 5: Run the complete distinct-UI repair loop**

Run the source scanner again, execute every applicable gate in `slop-test.md`, score the six critique axes, fix all in-scope failures, re-run the entire mechanical suite, and re-render every viewport/state. Once all gates pass, add a history entry with the final dials (`5/3/6`), centered utility-modal structure, dark charcoal/teal theme, generated vector mark strategy, and translation-track motion primitive.

- [ ] **Step 6: Create the final checkpoint**

```bash
git add .
git commit -m "feat: complete WhaleTranslator extension"
```

Run: `git status --short`

Expected: empty output in a writable Git checkout. In the current managed workspace, report the `.git` restriction and list all verified files instead.
