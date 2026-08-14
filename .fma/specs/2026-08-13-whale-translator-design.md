# WhaleTranslator Browser Extension Design

Date: 2026-08-13
Status: Approved in conversation; awaiting written-spec review

## 1. Purpose

WhaleTranslator is a Chromium Manifest V3 extension for Whale Browser. It opens a focused translation panel over the active page and translates selected or manually entered text with camelAI's `deepseek-v4-flash` model. It can also translate the visible text of the current page in place and restore the original text.

## 2. Goals

- Open the translation panel with `Alt + T`.
- Pre-fill and immediately translate the current text selection; otherwise focus an empty source editor.
- Detect the source language automatically and translate to Korean by default.
- Allow the user to choose another common target language.
- Replace visible page text with translations using `Alt + Shift + T`; pressing the shortcut again restores the exact original text without another API request.
- Stream ordinary translation output into the panel.
- Provide source and translated-text speech, character counts, and copy.
- Configure the camelAI API key and default target language from the extension toolbar popup.
- Keep the API key outside page and content-script contexts.

## 3. Non-goals

- Translating images, canvas content, PDF viewer internals, browser-internal pages, or cross-origin frame contents.
- Preserving a translated page across navigation or reload.
- Translation memory, accounts, cloud synchronization, history, or analytics.
- Publishing to an extension store as part of the initial implementation.
- Reproducing Kagi branding, assets, or pixel-identical styling.

## 4. Visual Direction

### Design read

A quiet, dark utility surface that feels native above a Whale Browser page. The supplied reference informs the spacious modal structure and restrained controls, while WhaleTranslator uses its own name, icon treatment, typography, and blue-green accent.

- `DESIGN_INTENSITY: 5/10` — distinct but restrained productivity UI.
- `MOTION_INTENSITY: 3/10` — short panel, dropdown, and progress transitions only.
- `VISUAL_DENSITY: 6/10` — one large work surface with compact controls.

### Panel

- A centered responsive overlay, isolated in a Shadow DOM so host-page CSS cannot alter it.
- Dark charcoal surface, fine neutral border, shallow shadow, rounded corners, and a single blue-green accent family.
- Header: WhaleTranslator mark and name, close control.
- Language row: source `Auto detect`, directional arrow, target-language dropdown.
- Body: distinct source editor and translated-output regions. The source editor collapses to a compact preview after translation but remains editable.
- Footer: source speech and count, translated speech and count, and copy.
- No gradients, decorative glass effects, oversized hero typography, fabricated metrics, or unrelated ornament.

### Responsive behavior

- Desktop: maximum width near 760 CSS px and maximum height constrained to the viewport.
- Narrow pages: 16 px viewport margins, single-column body, touch-sized controls, and scroll within the body rather than behind the overlay.
- Panel dimensions never depend on the host page's typography or box model.

## 5. User Flows

### 5.1 Ordinary translation

1. The user presses `Alt + T` on a normal web page.
2. The service worker receives the extension command and injects or activates the content runtime in the active tab.
3. The content runtime reads the current selection before moving focus.
4. The panel opens and traps keyboard focus.
5. If non-empty text was selected, translation begins immediately. Otherwise the empty source editor receives focus.
6. The service worker calls camelAI and forwards parsed SSE text deltas to the panel.
7. The translated region updates incrementally.
8. `Ctrl + Enter` or `Command + Enter` submits edited text. `Escape` closes the panel and returns focus to the element that was active before opening.

### 5.2 Whole-page translation

1. The user presses `Alt + Shift + T`.
2. The content runtime takes a snapshot of eligible rendered text nodes and begins batched translation.
3. A compact fixed status control shows progress, cancel, retry, and restore actions.
4. Each successfully translated batch replaces its corresponding text nodes without replacing their containing elements.
5. Pressing `Alt + Shift + T` again cancels unfinished work, restores all captured source strings immediately, and clears the snapshot.
6. Navigation or reload naturally discards the in-memory translation snapshot.

### 5.3 Settings

1. Clicking the extension icon opens a small settings popup.
2. The user enters a camelAI API key and chooses a default target language.
3. The popup saves the values locally and can run a deliberately small connection test.
4. The popup links to the browser's extension-shortcut management page and explains shortcut conflicts.
5. The popup discloses that selected or page text is sent to camelAI when translation is requested.

The initial target-language list is Korean, English, Japanese, Simplified Chinese, Spanish, French, German, Portuguese, Italian, Russian, Arabic, Vietnamese, Thai, and Indonesian. Korean is the initial default.

## 6. Architecture

The implementation uses React, TypeScript, Vite, and Manifest V3. It has four bounded areas.

### Service worker

- Registers handlers for `translate-selection` and `toggle-page-translation` commands.
- Uses `activeTab` plus `chrome.scripting` to inject the packaged content runtime only after a user command. This avoids persistent access to every website.
- Reads the API key from extension storage and never sends it to the tab.
- Owns camelAI requests, `AbortController` instances, response-status mapping, and SSE parsing.
- Sends translation lifecycle messages over a long-lived extension port while a request is active.

### Content runtime

- Creates one idempotent Shadow DOM host per page.
- Owns the React panel, focus behavior, current source/target text, speech state, and page-translation snapshot.
- Sends translation input and a generated request ID to the service worker.
- Rejects messages whose request ID is no longer active.
- Never reads or receives the API key.

### Settings popup

- Owns API-key entry, masked saved-key state, default target language, connection testing, privacy copy, and shortcut guidance.
- Sends settings changes through a typed extension message rather than exposing them to a tab.

### Shared modules

- Message and state types.
- Supported-language metadata.
- Translation prompt builders.
- SSE event decoding and OpenAI-compatible delta extraction.
- Error normalization.
- Page-text eligibility and batching rules that can be tested without the UI.

## 7. Permissions and Security

Manifest permissions are limited to:

- `activeTab` — temporary access after the toolbar action or keyboard shortcut.
- `scripting` — programmatic injection into the active page.
- `storage` — local settings.
- Host permission for `https://stream.camelai.com/*` — API access from the service worker.

The manifest's top-level `commands` declaration registers the two shortcuts; it is not an entry in the permissions array. There is no `<all_urls>` persistent host permission and no declarative all-page content script. Chromium treats a Commands API keyboard shortcut as an explicit gesture that grants `activeTab`, so both requested shortcuts can activate the page runtime without constant browsing access.

The API key is stored in `chrome.storage.local`. Before saving, the extension restricts storage access to trusted extension contexts where the browser implementation supports `chrome.storage.local.setAccessLevel`. The key is not placed in source files, DOM, content messages, telemetry, or logs. The UI explains that local extension storage is not equivalent to an operating-system keychain.

The content security policy permits only packaged scripts. No remote executable code is loaded.

## 8. camelAI Contract

- Endpoint: `POST https://stream.camelai.com/v1/chat/completions`
- Authorization: `Bearer {stored API key}`
- Content type: `application/json`
- Model: `deepseek-v4-flash`
- Messages: a translation-only system instruction followed by user content.
- Ordinary requests: `stream: true`.
- Whole-page batches: `stream: true`; deltas are accumulated and validated as structured JSON before a batch changes the DOM.

The SSE parser:

- Decodes UTF-8 across arbitrary network chunk boundaries.
- Buffers incomplete lines.
- Handles multiple `data:` events in one network chunk.
- Stops on `[DONE]`.
- Extracts only assistant content deltas.
- Converts non-2xx responses, malformed events, and empty completions into typed errors.

The system prompt requires only the translation, preservation of meaning, paragraph breaks, names, URLs, and inline punctuation, with no commentary or Markdown wrapper unless the source contains Markdown.

## 9. Whole-page Translation Rules

The content runtime walks rendered text nodes rooted at `document.body` and excludes nodes that are:

- Empty or whitespace-only.
- Inside the extension's own Shadow DOM.
- Inside `script`, `style`, `noscript`, `template`, `code`, `pre`, `textarea`, `input`, `select`, `option`, `svg`, or `canvas`.
- Inside an element with `contenteditable`, `translate="no"`, `hidden`, `aria-hidden="true"`, or an inert subtree.
- Not rendered according to the nearest element's computed visibility/display state.
- Primarily punctuation, symbols, or a URL without translatable prose.

Eligible nodes are assigned stable in-memory IDs and captured as `{ node, originalText }`. A batch contains at most 24 text nodes and at most 6,000 Unicode code points; a single longer node is sent alone. Each batch is sent as a structured list of IDs and strings; the model is required to return the same IDs with translated strings. The parser validates exact ID coverage before mutating the DOM. Invalid batches are retried once with a stricter repair prompt, then surfaced as a recoverable failure.

Batches run with a maximum concurrency of two and update the page only after a complete batch validates. Restoration writes each captured `originalText` back to its still-connected node. Nodes replaced by the host application after capture are skipped rather than guessing at a new location. Dynamic content added after the snapshot is not translated in the initial release.

## 10. State and Error Handling

### Panel states

- `idle`: editable empty or populated source.
- `streaming`: progress treatment, partial output, and stop action.
- `success`: completed output and enabled utilities.
- `error`: retained source/partial output, concise explanation, and recovery action.

### Error mapping

- Missing key: open-settings action.
- `401`/`403`: invalid or unauthorized-key guidance.
- `408`/network interruption: offline/timeout guidance with retry.
- `429`: rate-limit guidance; no aggressive automatic retry.
- `5xx`: service-unavailable guidance with retry.
- Malformed or empty stream: response-format guidance with retry.
- Restricted URL or missing tab access: concise unsupported-page notice.

Closing the panel, replacing a request, cancelling page translation, or restoring the page aborts the relevant fetch. Late deltas are ignored by request ID.

For page translation, completed batches remain translated after a later batch fails. The status control offers retry from the first failed batch or full restore. No batch mutates the page unless its entire response passes validation.

## 11. Accessibility and Interaction

- All controls have accessible names, visible focus indicators, and at least 44-by-44 CSS px coarse-pointer targets where layout permits.
- Opening the dialog moves focus inside; closing restores prior focus.
- The modal uses appropriate dialog semantics and prevents focus from escaping while open.
- Translation status uses a polite `aria-live` region; errors use an assertive announcement without repeatedly announcing stream tokens.
- Text and controls meet WCAG AA contrast.
- Reduced-motion preference removes transform-based entrances and animated progress movement.
- Source and translation speech use the Web Speech API with play/stop toggles. Starting one side stops the other, and closing the panel cancels speech.
- Copy uses the Clipboard API with a visible and announced success/failure state.

## 12. Verification

### Automated

- Type checking, linting, production build, and unit tests.
- SSE tests for split UTF-8, split lines, multiple events, `[DONE]`, malformed JSON, HTTP errors, cancellation, and empty output.
- Prompt and response-shape tests.
- Page-node eligibility tests for excluded tags, hidden/edited content, punctuation, extension UI, and normal inline text.
- Batch tests for size limits, ID validation, retry, partial failure, cancellation, and exact restoration.
- Component tests for keyboard submission, close/focus restoration, language selection, copy, speech toggles, settings validation, and all panel states.

### Rendered and manual

- Load the unpacked extension in a Chromium-based test browser and verify both shortcuts.
- Verify on representative static, dynamic, long-form, form-heavy, and code-heavy pages.
- Inspect the panel at 320, 375, 414, 768, and 1280-by-800 CSS-pixel viewports.
- Inspect keyboard-only, reduced-motion, coarse-pointer, loading, success, each error family, partial page failure, retry, cancel, and restore states.
- Confirm host-page styles do not enter the Shadow DOM and extension styles do not leak out.
- Confirm the API key never appears in page DOM, content-script messages, console output, or built source maps.
- Run the UI source scanner and complete the craft-distinct-ui slop gates; repair and re-run until all applicable gates pass.

## 13. Acceptance Criteria

- `Alt + T` reliably opens one panel instance and translates a selection or accepts manual input.
- Default translation is auto-detected source to Korean, and changing the target language affects subsequent requests.
- camelAI output streams visibly and can be cancelled without stale updates.
- `Alt + Shift + T` progressively replaces eligible page text; pressing it again restores captured originals exactly.
- Copy, both speech controls, and both character counts work and expose accessible status.
- The settings popup saves and masks the key, changes the default language, tests connectivity, and explains privacy and shortcut management.
- Restricted pages and all defined API failures show actionable, non-technical messages.
- The production extension builds successfully and passes automated and rendered verification.
