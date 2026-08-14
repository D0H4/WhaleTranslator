# Modeless floating translation panel

Date: 2026-08-14

## Intent

Replace the blocking centered modal with a movable, resizable translation window that stays above the current page without preventing normal page interaction. When text is selected, the window opens beside that reading context instead of at the viewport center.

## Opening and placement

- `Alt+T` continues to capture the current selection and open a fresh translation panel.
- The default size is 760 by 560 CSS pixels, reduced to the available viewport width or height when necessary.
- For a non-empty selection, use the last visible selection rectangle as the anchor. Place the panel 8 CSS pixels below it and align the panel's left edge to the rectangle's left edge.
- If the full default panel does not fit below the selection and the space above is larger, place it 8 CSS pixels above the selection. If neither side fits, choose the side with more space and clamp the result.
- Clamp the final rectangle to a 12 CSS pixel viewport margin so the entire panel and its resize handle remain reachable.
- When no text is selected or the selection has no usable client rectangle, open the panel 16 CSS pixels from the viewport's top-right corner.
- Every `Alt+T` opening starts from the default size and a newly calculated position. Position and size are not persisted after close, reload, or navigation.

## Modeless interaction

- Remove the visual backdrop and any full-viewport hit target.
- Keep a fixed, viewport-sized positioning layer with `pointer-events: none`; the panel itself uses `pointer-events: auto`.
- Clicks, scrolling, text selection, and keyboard focus remain available to the underlying web page everywhere outside the panel.
- Clicking outside does not close the panel.
- The close button and Escape close the panel. Escape is handled while the panel is open, without trapping Tab focus.
- The panel uses `role="dialog"` with its existing accessible name but does not set `aria-modal="true"`.
- The source field receives initial focus. Tab is allowed to leave the panel and reach page controls in normal document order.

## Dragging

- The header is the drag surface and shows `grab`/`grabbing` cursors.
- Header buttons and other interactive descendants do not initiate dragging.
- Pointer Events and pointer capture drive mouse, pen, and touch movement.
- Dragging disables text selection on the header and sets `touch-action: none`.
- Clamp every movement so the full panel remains inside the 12 pixel viewport margin.

## Resizing

- A dedicated accessible resize handle sits at the bottom-right corner and uses the southeast-resize cursor.
- Pointer Events resize width and height from the bottom-right corner.
- Desktop minimum size is 360 by 360 CSS pixels. On a viewport smaller than that plus margins, the minimum becomes the available viewport size so the panel never forces page overflow.
- Maximum width and height are the available viewport dimensions inside the 12 pixel margins.
- Resizing preserves the current top-left position and clamps the size to the remaining viewport space.
- The internal workspace stretches with the panel. Text areas and translation output scroll internally when content exceeds the available height.

## Viewport changes

On browser resize or device rotation, clamp the current position and size back into the visible viewport. No values are written to extension storage.

## Component boundaries

- `TranslatorShell` captures the selection text and a serializable viewport-coordinate anchor `{ left, top, right, bottom }` before settings are refreshed, then passes both to `TranslatorPanel`.
- A focused floating-panel hook owns position, dimensions, pointer sessions, and viewport clamping. It does not know about translation or camelAI.
- `TranslatorPanel` retains translation, speech, copy, language, error, and streaming behavior and consumes the hook's panel style and interaction props.
- The existing modal-only focus trap is removed from the translation panel path.

## Testing

- Unit-test anchor selection, below/above placement, fallback placement, boundary clamping, dragging, resizing, and viewport resize correction.
- Component-test that `aria-modal` and the blocking backdrop are absent, the source field initially receives focus, and outside-page controls remain clickable and keyboard reachable.
- Re-run lint, typecheck, all tests, production build, and distribution verification.
- Render the panel over a real interactive page at 320, 375, 414, 768, and 1280 by 800 CSS pixels.
- In browser QA, verify selection anchoring, above-edge fallback, mouse drag, resize limits, outside click, page scrolling, Escape close, reduced motion, and coarse-pointer targets.

## Unchanged behavior

camelAI requests, API-key isolation, language choices, translation streaming, copy, speech, page translation, shortcuts, settings, permissions, and page-restore behavior remain unchanged.
