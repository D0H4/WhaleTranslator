# Modeless Floating Panel Implementation Plan

**Goal:** Replace the blocking translation modal with a selection-anchored window that users can drag and resize while continuing to interact with the web page.

**Architecture:** `TranslatorShell` captures a viewport-coordinate selection anchor before its asynchronous settings refresh. Pure geometry functions calculate placement and bounds, while a dedicated React hook owns pointer sessions, size, position, initial focus, Escape handling, and viewport correction; `TranslatorPanel` only connects those capabilities to its existing translation UI.

**Tech Stack:** React 19, TypeScript 6, Pointer Events, Shadow DOM, Vitest, Testing Library, Playwright CLI

---

### Task 1: Selection anchor and panel geometry

**Files:**
- Create: `src/content/panel/floating-panel.ts`
- Create: `tests/content/floating-panel.test.ts`

- [x] **Step 1: Write failing geometry tests**

Test these exact cases with an `1280×800` viewport: an anchor at `{ left: 100, top: 100, right: 180, bottom: 120 }` produces `{ x: 100, y: 128, width: 760, height: 560 }`; an anchor near the bottom flips above; `null` anchors at top-right; drag and resize results remain inside a 12 pixel margin; a `320×640` viewport reduces the size to the available area.

```ts
expect(getInitialPanelRect({ left: 100, top: 100, right: 180, bottom: 120 }, { width: 1280, height: 800 }))
  .toEqual({ x: 100, y: 128, width: 760, height: 560 });
expect(getInitialPanelRect(null, { width: 1280, height: 800 }))
  .toEqual({ x: 504, y: 16, width: 760, height: 560 });
```

- [x] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/content/floating-panel.test.ts`

Expected: FAIL because `src/content/panel/floating-panel.ts` does not exist.

- [x] **Step 3: Implement the geometry boundary**

Export these types and functions:

```ts
export interface SelectionAnchor { left: number; top: number; right: number; bottom: number }
export interface ViewportSize { width: number; height: number }
export interface PanelRect { x: number; y: number; width: number; height: number }

export function captureSelectionAnchor(selection: Selection | null = window.getSelection()): SelectionAnchor | null;
export function getInitialPanelRect(anchor: SelectionAnchor | null, viewport: ViewportSize): PanelRect;
export function clampPanelRect(rect: PanelRect, viewport: ViewportSize): PanelRect;
export function movePanel(start: PanelRect, deltaX: number, deltaY: number, viewport: ViewportSize): PanelRect;
export function resizePanel(start: PanelRect, deltaX: number, deltaY: number, viewport: ViewportSize): PanelRect;
```

Use constants `MARGIN = 12`, `ANCHOR_GAP = 8`, `FALLBACK_OFFSET = 16`, `DEFAULT_WIDTH = 760`, `DEFAULT_HEIGHT = 560`, and `MIN_SIZE = 360`. `captureSelectionAnchor` returns the last client rectangle with a positive width or height as plain numeric coordinates.

- [x] **Step 4: Run the focused test and confirm success**

Run: `npm test -- tests/content/floating-panel.test.ts`

Expected: all geometry and selection-anchor tests pass.

### Task 2: Floating interaction hook

**Files:**
- Create: `src/content/panel/useFloatingPanel.ts`
- Create: `tests/content/useFloatingPanel.test.tsx`
- Retain but disconnect: `src/content/panel/useFocusTrap.ts` (deletion was excluded by the approved preflight)

- [x] **Step 1: Write failing hook behavior tests**

Render a harness using the hook and verify: initial focus reaches `[data-initial-focus]`; Escape invokes `onClose`; Tab from the final panel control reaches a following page button; dragging by `40,30` changes `left` and `top`; resizing by `100,80` changes `width` and `height`; a window resize clamps the rectangle.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/content/useFloatingPanel.test.tsx`

Expected: FAIL because `useFloatingPanel` does not exist.

- [x] **Step 3: Implement `useFloatingPanel`**

Use a `PanelRect` state initialized by `getInitialPanelRect(anchor, { width: innerWidth, height: innerHeight })`. Return:

```ts
{
  panelRef,
  panelStyle: { left, top, width, height },
  dragHandleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  resizeHandleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown },
  dragging,
  resizing
}
```

Keep pointer session data in a ref and call `setPointerCapture`/`releasePointerCapture` when available. Ignore non-primary mouse buttons and interactive descendants during header drag. Resize-handle arrow keys change one axis by 16 pixels, or 48 pixels with Shift. Add a `resize` listener that applies `clampPanelRect`. Focus the initial field in a microtask, restore the previous focus on unmount, close on Escape, and never intercept Tab.

- [x] **Step 4: Disconnect the modal-only hook and run tests**

Leave `src/content/panel/useFocusTrap.ts` unused after `TranslatorPanel` no longer imports it, because the approved UI preflight explicitly listed no file deletions. The production bundle tree-shakes it.

Run: `npm test -- tests/content/useFloatingPanel.test.tsx`

Expected: all hook interaction tests pass.

### Task 3: Connect selection anchoring to the translation panel

**Files:**
- Modify: `src/content/TranslatorShell.tsx`
- Modify: `src/content/panel/TranslatorPanel.tsx`
- Modify: `tests/content/TranslatorPanel.test.tsx`

- [x] **Step 1: Write failing component assertions**

Add assertions that the panel has `role="dialog"` without `aria-modal`, the outer layer has class `wt-floating-layer`, the header exposes the drag surface, a button named `번역 창 크기 조절` exists, clicking an outside-page button works, and Tab from the resize button reaches that outside button.

- [x] **Step 2: Run the component test and confirm failure**

Run: `npm test -- tests/content/TranslatorPanel.test.tsx`

Expected: FAIL because the panel still renders `.wt-backdrop`, sets `aria-modal`, and has no resize handle.

- [x] **Step 3: Pass the captured anchor from `TranslatorShell`**

Change panel state to:

```ts
{ key: number; text: string; anchor: SelectionAnchor | null }
```

Capture `text` and `captureSelectionAnchor()` synchronously before `refreshSettings()`, then pass `anchor={panel.anchor}` into `TranslatorPanel`.

- [x] **Step 4: Convert `TranslatorPanel` to modeless floating behavior**

Add optional `anchor?: SelectionAnchor | null`, call `useFloatingPanel({ anchor: anchor ?? null, onClose: close })`, render `.wt-floating-layer` without a backdrop click handler, apply `panelStyle` to `.wt-panel`, remove `aria-modal`, apply drag props to the header, and append:

```tsx
<button
  className="wt-resize-handle"
  type="button"
  aria-label="번역 창 크기 조절"
  {...resizeHandleProps}
/>
```

- [x] **Step 5: Run the component and full unit suites**

Run: `npm test -- tests/content/TranslatorPanel.test.tsx tests/content/floating-panel.test.ts tests/content/useFloatingPanel.test.tsx`

Expected: all focused tests pass without changing translation, speech, copy, error, or streaming expectations.

### Task 4: Modeless and resizable styling

**Files:**
- Modify: `src/content/panel/panel.css`
- Modify: `src/preview/main.tsx`
- Modify: `README.md`

- [x] **Step 1: Replace blocking backdrop styles**

Create `.wt-floating-layer` as a fixed inset positioning layer with the extension z-index and `pointer-events: none`. Make `.wt-panel` `position: absolute`, `pointer-events: auto`, `display: flex`, `flex-direction: column`, `overflow: hidden`, and remove centered-grid, backdrop color, and viewport-entry positioning assumptions.

- [x] **Step 2: Make the internal workspace size-aware**

Give the header, language bar, streaming track, and message slot fixed flex behavior. Give `.wt-workspace` `flex: 1; min-height: 0`; give text panes and their scrollable text surfaces `min-height: 0`; retain the existing two-column desktop and stacked narrow layout.

- [x] **Step 3: Style pointer affordances**

Give `.wt-header` `cursor: grab`, `user-select: none`, and `touch-action: none`; use `cursor: grabbing` while dragging. Add a bottom-right `.wt-resize-handle` with `cursor: se-resize`, a visible focus ring, `touch-action: none`, and at least a `44×44` hit target for coarse pointers.

- [x] **Step 4: Update preview and usage documentation**

Pass a stable sample anchor to the preview and document that the panel appears beside selected text, can move/resize, does not block the page, and resets on every opening.

- [x] **Step 5: Run static checks and production build**

Run: `npm run check`

Expected: lint, TypeScript, all Vitest tests, all three extension builds, and `verify:dist` pass.

### Task 5: Browser interaction and visual QA

**Files:**
- Create: `output/playwright/modeless-floating-panel.md`
- Create: `output/playwright/modeless-floating-panel-*.png`
- Modify: `.design-taste/history.json`

- [x] **Step 1: Run the UI static scanner**

Run: `python3 /Users/doha/.codex/skills/craft-distinct-ui/scripts/scan_ui.py src --format json`

Expected: zero unresolved findings.

- [x] **Step 2: Test selection anchoring and page interaction in Chromium**

Inject the production content bundle into a local page with selectable text, a clickable counter button, and enough vertical content to scroll. Select text, dispatch `translate-selection`, and verify the panel opens below the final selection rectangle. Click the page button and scroll outside the panel while it remains open.

- [x] **Step 3: Test drag, resize, bounds, keyboard, and states**

At 320, 375, 414, 768, and 1280×800 CSS pixels, verify no page overflow. Exercise pointer drag, pointer resize, minimum and maximum bounds, viewport resize correction, fallback above the selection, no-selection top-right placement, source-field initial focus, Tab leaving the panel, Escape close, reduced motion, streaming, error, missing-key, and coarse-pointer hit targets.

- [x] **Step 4: Record and inspect screenshots**

Save screenshots and a concise evidence table under `output/playwright/`. Inspect the 320, 414, and 1280 renders visually for clipping, overlap, reachable controls, and clear drag/resize affordances.

- [x] **Step 5: Complete the release gate**

Re-run all 56 applicable slop-test gates and the six self-critique axes. Repair every resolvable failure, repeat the full regression pass, and only then prepend the new valid build record to `.design-taste/history.json`, retaining at most twenty records.

Git commit steps are omitted because this workspace is not a Git repository.
