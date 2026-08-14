import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "input:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function useFocusTrap(onEscape: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector<HTMLElement>("[data-initial-focus]")
      ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    queueMicrotask(() => initial?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      const root = dialog.getRootNode();
      const activeElement = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus();
    };
  }, [onEscape]);

  return dialogRef;
}
